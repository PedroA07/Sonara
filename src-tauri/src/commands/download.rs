use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{DownloadJob, SearchResult};
use crate::services::downloader::{build_ytdlp_args, classify_input, JobKind};
use crate::services::metadata;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Live progress payload emitted to the front-end ("download-progress").
#[derive(Clone, Serialize)]
struct Progress {
    job_id: i64,
    status: String,   // "running" | "done" | "error"
    progress: f64,    // 0..100 (-1 = indeterminate / log line)
    message: String,
}

fn emit(app: &AppHandle, p: Progress) {
    let _ = app.emit("download-progress", p);
}

/// Parse a yt-dlp "[download]  12.3% of ..." line into a percentage.
fn parse_percent(line: &str) -> Option<f64> {
    let idx = line.find('%')?;
    let head = &line[..idx];
    let rev: String = head.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let num: String = rev.chars().rev().collect();
    num.trim().parse().ok()
}

fn set_job_status(app: &AppHandle, job_id: i64, status: &str, progress: f64) {
    let db = app.state::<Db>();
    let conn = match db.0.lock() { Ok(c) => c, Err(_) => return };
    let _ = conn.execute(
        "UPDATE download_job SET status = ?2, progress = ?3 WHERE id = ?1",
        rusqlite::params![job_id, status, progress],
    );
}

/// Import each downloaded file and route it to the chosen destination (RF-09/10).
fn finalize(app: &AppHandle, files: &[String], dest_kind: Option<&str>, dest_id: Option<i64>) -> usize {
    let db = app.state::<Db>();
    let mut conn = match db.0.lock() { Ok(c) => c, Err(_) => return 0 };
    let tx = match conn.transaction() { Ok(t) => t, Err(_) => return 0 };
    let mut count = 0usize;

    for f in files {
        let parsed = match metadata::parse_file(Path::new(f)) { Ok(p) => p, Err(_) => continue };
        let title = parsed.title.clone().unwrap_or_else(|| {
            Path::new(f).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Download".into())
        });
        let res = tx.execute(
            "INSERT OR IGNORE INTO track (title, file_path, duration, genre, year, bitrate, format, gain)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![title, parsed.file_path, parsed.duration, parsed.genre, parsed.year, parsed.bitrate, parsed.format, parsed.gain],
        );
        if res.map(|n| n > 0).unwrap_or(false) {
            let track_id = tx.last_insert_rowid();
            match dest_kind {
                Some("playlist") => if let Some(pid) = dest_id {
                    let pos: i64 = tx.query_row(
                        "SELECT IFNULL(MAX(position),-1) FROM playlist_item WHERE playlist_id = ?1", [pid], |r| r.get(0),
                    ).unwrap_or(-1);
                    let _ = tx.execute("INSERT INTO playlist_item (playlist_id, track_id, position) VALUES (?1,?2,?3)",
                        rusqlite::params![pid, track_id, pos + 1]);
                },
                Some("album") => if let Some(aid) = dest_id {
                    let _ = tx.execute("UPDATE track SET album_id = ?2 WHERE id = ?1", rusqlite::params![track_id, aid]);
                },
                Some("queue") => {
                    let pos: i64 = tx.query_row("SELECT IFNULL(MAX(position),-1) FROM queue_item", [], |r| r.get(0)).unwrap_or(-1);
                    let _ = tx.execute("INSERT INTO queue_item (track_id, position, source) VALUES (?1,?2,'download')",
                        rusqlite::params![track_id, pos + 1]);
                },
                _ => {} // "library": already in the library
            }
            count += 1;
        }
    }
    let _ = tx.commit();
    let _ = crate::commands::search::reindex(&conn);
    count
}

/// Resolve the yt-dlp sidecar command (binary bundled in src-tauri/binaries).
fn ffmpeg_location(app: &AppHandle) -> String {
    app.path().resource_dir().ok()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// RF-09 / RF-10: start a real download. Emits "download-progress" events and,
/// on success, imports + routes the file(s) to the destination.
#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    input: String,
    dest_kind: Option<String>,
    dest_id: Option<i64>,
) -> AppResult<i64> {
    let kind = classify_input(&input);
    let type_str = match kind { JobKind::Video => "video", JobKind::Playlist => "playlist", JobKind::Search => "search" };

    // Create the job row.
    let job_id = {
        let db = app.state::<Db>();
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT INTO download_job (url, type, status, progress, dest_kind, dest_id) VALUES (?1,?2,'running',0,?3,?4)",
            rusqlite::params![input, type_str, dest_kind, dest_id],
        )?;
        conn.last_insert_rowid()
    };

    // Output directory + args.
    let base = app.path().app_data_dir().map_err(|e| AppError::Other(e.to_string()))?;
    let out_dir = base.join("downloads");
    std::fs::create_dir_all(&out_dir)?;
    let ffmpeg_dir = ffmpeg_location(&app);
    let mut args = build_ytdlp_args(&input, kind, &out_dir.to_string_lossy(), &ffmpeg_dir);
    // Print the final file path(s) after post-processing so we know what to import.
    args.push("--no-simulate".into());
    args.push("--print".into());
    args.push("after_move:filepath".into());

    // Spawn the bundled yt-dlp sidecar.
    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| AppError::Download(e.to_string()))?;
    let (mut rx, _child) = sidecar.args(args).spawn().map_err(|e| AppError::Download(e.to_string()))?;

    let app2 = app.clone();
    let dk = dest_kind.clone();
    tauri::async_runtime::spawn(async move {
        let mut files: Vec<String> = Vec::new();
        let mut last_err = String::new(); // remember the most useful stderr line
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let t = line.trim();
                    if let Some(pct) = parse_percent(t) {
                        set_job_status(&app2, job_id, "running", pct);
                        emit(&app2, Progress { job_id, status: "running".into(), progress: pct, message: String::new() });
                    } else if Path::new(t).exists() {
                        files.push(t.to_string());
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let t = line.trim();
                    // yt-dlp prints real errors on lines starting with "ERROR:".
                    if t.starts_with("ERROR") || t.contains("Unable to") || t.contains("not available") {
                        last_err = t.to_string();
                    }
                    emit(&app2, Progress { job_id, status: "running".into(), progress: -1.0, message: t.to_string() });
                }
                CommandEvent::Error(e) => {
                    last_err = format!("falha ao iniciar o yt-dlp: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    let code = payload.code.unwrap_or(-1);
                    if code == 0 && !files.is_empty() {
                        let n = finalize(&app2, &files, dk.as_deref(), dest_id);
                        set_job_status(&app2, job_id, "done", 100.0);
                        emit(&app2, Progress { job_id, status: "done".into(), progress: 100.0, message: format!("{n} faixa(s) importada(s)") });
                    } else {
                        set_job_status(&app2, job_id, "error", 0.0);
                        let msg = if !last_err.is_empty() {
                            last_err.clone()
                        } else if code == 0 {
                            "nenhum arquivo foi baixado (verifique o link)".into()
                        } else {
                            format!("yt-dlp falhou (código {code})")
                        };
                        emit(&app2, Progress { job_id, status: "error".into(), progress: 0.0, message: msg });
                    }
                }
                _ => {}
            }
        }
    });

    Ok(job_id)
}

/// Preview the exact yt-dlp arguments (UI / debugging).
#[tauri::command]
pub fn preview_download_args(input: String, out_dir: String, ffmpeg_dir: String) -> AppResult<Vec<String>> {
    let kind = classify_input(&input);
    Ok(build_ytdlp_args(&input, kind, &out_dir, &ffmpeg_dir))
}

/// RF-09/10: list download jobs for the Downloads screen.
#[tauri::command]
pub fn list_download_jobs(db: State<Db>) -> AppResult<Vec<DownloadJob>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, url, type, status, progress, dest_kind, dest_id FROM download_job ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(DownloadJob {
            id: r.get(0)?, url: r.get(1)?, job_type: r.get(2)?, status: r.get(3)?,
            progress: r.get(4)?, dest_kind: r.get(5)?, dest_id: r.get(6)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// RF-10: search YouTube and return pickable results (no download). Uses
/// `yt-dlp --dump-json --flat-playlist ytsearchN:` and parses each JSON line.
#[tauri::command]
pub async fn youtube_search(app: AppHandle, query: String, limit: Option<u32>) -> AppResult<Vec<SearchResult>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let n = limit.unwrap_or(8).clamp(1, 20);
    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| AppError::Download(e.to_string()))?;
    let out = sidecar
        .args(["--dump-json", "--flat-playlist", "--no-warnings", &format!("ytsearch{n}:{q}")])
        .output()
        .await
        .map_err(|e| AppError::Download(e.to_string()))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("busca falhou").to_string();
        return Err(AppError::Download(msg));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut results = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if id.is_empty() {
                continue;
            }
            results.push(SearchResult {
                title: v.get("title").and_then(|x| x.as_str()).unwrap_or("(sem título)").to_string(),
                uploader: v
                    .get("uploader")
                    .or_else(|| v.get("channel"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                duration: v.get("duration").and_then(|x| x.as_f64()),
                thumbnail: format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"),
                id,
            });
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_percent() {
        assert_eq!(parse_percent("[download]  12.3% of 4.5MiB"), Some(12.3));
        assert_eq!(parse_percent("[download] 100% of 1.0MiB"), Some(100.0));
        assert_eq!(parse_percent("nothing here"), None);
    }
}
