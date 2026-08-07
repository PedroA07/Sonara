use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{DownloadJob, SearchResult, ToolStatus};
use crate::services::downloader::{
    build_ytdlp_args, classify_input, friendly_error, parse_file_line, parse_progress, sidecar_path,
    AudioFormat, JobKind,
};
use crate::services::metadata;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Live processes, so a running download can be cancelled from the UI.
#[derive(Default)]
pub struct Downloads(pub Mutex<HashMap<i64, CommandChild>>);

/// Live progress payload emitted to the front-end ("download-progress").
#[derive(Clone, Serialize, Default)]
struct Progress {
    job_id: i64,
    status: String, // "running" | "done" | "error" | "canceled"
    progress: f64,  // 0..100
    message: String,
    title: String,
    speed: String,
    eta: String,
    #[serde(rename = "trackId")]
    track_id: Option<i64>,
    #[serde(rename = "filePath")]
    file_path: Option<String>,
}

fn emit(app: &AppHandle, p: Progress) {
    let _ = app.emit("download-progress", p);
}

/// Tell every screen that the library changed, so lists refresh on their own
/// instead of the user having to click around to see a finished download.
fn emit_library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

// ── settings-backed paths ────────────────────────────────────────────────────

fn setting(app: &AppHandle, key: &str) -> Option<String> {
    let db = app.state::<Db>();
    let conn = db.0.lock().ok()?;
    conn.query_row("SELECT value FROM setting WHERE key = ?1", [key], |r| r.get::<_, String>(0))
        .ok()
        .filter(|v| !v.trim().is_empty())
}

/// Where downloads go by default: `<Música>/Sonara`, which is a folder people
/// can actually find, unlike the hidden app-data directory used before.
pub fn default_download_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .audio_dir()
        .or_else(|_| app.path().home_dir())
        .map(|d| d.join("Sonara"))
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// The folder the user picked in Settings, falling back to the default.
pub fn download_dir(app: &AppHandle) -> PathBuf {
    setting(app, "download_dir").map(PathBuf::from).unwrap_or_else(|| default_download_dir(app))
}

fn audio_format(app: &AppHandle) -> AudioFormat {
    setting(app, "audio_format").map(|s| AudioFormat::parse(&s)).unwrap_or(AudioFormat::M4a)
}

fn exe_dir(app: &AppHandle) -> PathBuf {
    let _ = app;
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Folder that holds the bundled ffmpeg, passed to yt-dlp via
/// `--ffmpeg-location`. Empty when it cannot be found, so yt-dlp falls back to
/// a system-wide install instead of failing on a bogus path.
pub fn ffmpeg_location(app: &AppHandle) -> String {
    sidecar_path(&exe_dir(app), "ffmpeg")
        .and_then(|p| p.parent().map(|d| d.to_string_lossy().to_string()))
        .unwrap_or_default()
}

// ── job bookkeeping ──────────────────────────────────────────────────────────

fn set_job_progress(app: &AppHandle, job_id: i64, status: &str, progress: f64) {
    let db = app.state::<Db>();
    let conn = match db.0.lock() { Ok(c) => c, Err(_) => return };
    let _ = conn.execute(
        "UPDATE download_job SET status = ?2, progress = ?3 WHERE id = ?1",
        rusqlite::params![job_id, status, progress],
    );
}

fn set_job_title(app: &AppHandle, job_id: i64, title: &str) {
    let db = app.state::<Db>();
    let conn = match db.0.lock() { Ok(c) => c, Err(_) => return };
    let _ = conn.execute(
        "UPDATE download_job SET title = ?2 WHERE id = ?1 AND IFNULL(title,'') = ''",
        rusqlite::params![job_id, title],
    );
}

fn finish_job(app: &AppHandle, job_id: i64, status: &str, error: Option<&str>, file: Option<&str>, track_id: Option<i64>) {
    let db = app.state::<Db>();
    let conn = match db.0.lock() { Ok(c) => c, Err(_) => return };
    let progress = if status == "done" { 100.0 } else { 0.0 };
    let _ = conn.execute(
        "UPDATE download_job
            SET status = ?2, progress = ?3, error = ?4, file_path = ?5, track_id = ?6,
                finished_at = datetime('now')
          WHERE id = ?1",
        rusqlite::params![job_id, status, progress, error, file, track_id],
    );
}

// ── import + routing of the finished file ────────────────────────────────────

fn get_or_create_artist(tx: &rusqlite::Transaction, name: &str) -> Option<i64> {
    if let Ok(id) = tx.query_row("SELECT id FROM artist WHERE name = ?1", [name], |r| r.get::<_, i64>(0)) {
        return Some(id);
    }
    tx.execute("INSERT INTO artist (name) VALUES (?1)", [name]).ok()?;
    Some(tx.last_insert_rowid())
}

fn get_or_create_album(tx: &rusqlite::Transaction, title: &str, artist_id: Option<i64>, year: Option<i64>) -> Option<i64> {
    if let Ok(id) = tx.query_row(
        "SELECT id FROM album WHERE title = ?1 AND IFNULL(artist_id,0) = IFNULL(?2,0)",
        rusqlite::params![title, artist_id],
        |r| r.get::<_, i64>(0),
    ) {
        return Some(id);
    }
    tx.execute(
        "INSERT INTO album (title, artist_id, year) VALUES (?1, ?2, ?3)",
        rusqlite::params![title, artist_id, year],
    )
    .ok()?;
    Some(tx.last_insert_rowid())
}

/// Import each downloaded file and route it to the chosen destination (RF-09/10).
///
/// Unlike the previous version this also links artist/album (so downloads show
/// up under Artistas/Álbuns, not just in a flat track list), extracts the
/// embedded cover, and updates a row that already points at the same file
/// instead of silently doing nothing.
/// Separate "Artist - Song" titles so the artist lands in the artist field.
/// Returns the cleaned title and the artist to use.
///  - With a known artist, only strips a leading "Artist - " from the title.
///  - Without one, splits on the first " - " and uses the left side as artist.
fn split_artist_title(raw: &str, artist: Option<&str>) -> (String, Option<String>) {
    let title = raw.trim();
    const SEPS: [&str; 4] = [" - ", " – ", " — ", " − "];

    if let Some(a) = artist.map(str::trim).filter(|s| !s.is_empty()) {
        for sep in SEPS {
            let prefix = format!("{a}{sep}");
            if title.to_lowercase().starts_with(&prefix.to_lowercase()) {
                if let Some(rest) = title.get(prefix.len()..) {
                    let rest = rest.trim();
                    if !rest.is_empty() {
                        return (rest.to_string(), Some(a.to_string()));
                    }
                }
            }
        }
        return (title.to_string(), Some(a.to_string()));
    }

    for sep in SEPS {
        if let Some(idx) = title.find(sep) {
            let left = title[..idx].trim();
            let right = title[idx + sep.len()..].trim();
            // Guard against splitting song names that merely contain a dash.
            if !left.is_empty() && !right.is_empty() && left.chars().count() <= 60 {
                return (right.to_string(), Some(left.to_string()));
            }
        }
    }
    (title.to_string(), None)
}

fn finalize(app: &AppHandle, files: &[String], dest_kind: Option<&str>, dest_id: Option<i64>) -> (usize, Option<i64>) {
    let covers_dir = app.path().app_data_dir().ok().map(|d| d.join("covers"));
    let db = app.state::<Db>();
    let mut conn = match db.0.lock() { Ok(c) => c, Err(_) => return (0, None) };
    let tx = match conn.transaction() { Ok(t) => t, Err(_) => return (0, None) };
    let mut count = 0usize;
    let mut first_id: Option<i64> = None;

    for f in files {
        let parsed = match metadata::parse_file(Path::new(f)) { Ok(p) => p, Err(_) => continue };
        let raw_title = parsed.title.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| {
            Path::new(f).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Download".into())
        });

        // YouTube titles are usually "Artist - Song", and the channel ends up in
        // the artist tag. Split so the artist lands in the artist field and the
        // song name (without the "Artist - " prefix) becomes the title.
        let existing_artist = parsed.album_artist.clone().or_else(|| parsed.artist.clone());
        let (title, artist_name) = split_artist_title(&raw_title, existing_artist.as_deref());
        let artist_id = artist_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .and_then(|n| get_or_create_artist(&tx, n));
        let album_id = parsed
            .album
            .clone()
            .filter(|s| !s.trim().is_empty())
            .and_then(|n| get_or_create_album(&tx, n.trim(), artist_id, parsed.year));

        let existing: Option<i64> = tx
            .query_row("SELECT id FROM track WHERE file_path = ?1", [&parsed.file_path], |r| r.get(0))
            .ok();

        let track_id = match existing {
            Some(id) => {
                let _ = tx.execute(
                    "UPDATE track SET title = ?2, duration = ?3, genre = ?4, year = ?5,
                                      bitrate = ?6, format = ?7, gain = ?8,
                                      album_id = COALESCE(?9, album_id)
                     WHERE id = ?1",
                    rusqlite::params![
                        id, title, parsed.duration, parsed.genre, parsed.year,
                        parsed.bitrate, parsed.format, parsed.gain, album_id
                    ],
                );
                id
            }
            None => {
                let res = tx.execute(
                    "INSERT INTO track (title, file_path, duration, genre, year, bitrate, format, gain, album_id)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    rusqlite::params![
                        title, parsed.file_path, parsed.duration, parsed.genre, parsed.year,
                        parsed.bitrate, parsed.format, parsed.gain, album_id
                    ],
                );
                if res.is_err() { continue }
                count += 1;
                tx.last_insert_rowid()
            }
        };
        first_id.get_or_insert(track_id);

        if let Some(aid) = artist_id {
            let _ = tx.execute(
                "INSERT OR IGNORE INTO track_artist (track_id, artist_id) VALUES (?1, ?2)",
                rusqlite::params![track_id, aid],
            );
        }

        // The thumbnail yt-dlp embedded becomes the track's cover in the UI.
        if parsed.has_cover {
            if let Some(dir) = covers_dir.as_ref() {
                if let Some(cover) = metadata::extract_cover_to(Path::new(f), dir, &format!("track_{track_id}")) {
                    let _ = tx.execute("UPDATE track SET cover_path = ?1 WHERE id = ?2", rusqlite::params![cover, track_id]);
                    if let Some(aid) = album_id {
                        let _ = tx.execute(
                            "UPDATE album SET cover_path = ?1 WHERE id = ?2 AND cover_path IS NULL",
                            rusqlite::params![cover, aid],
                        );
                    }
                }
            }
        }

        match dest_kind {
            Some("playlist") => if let Some(pid) = dest_id {
                let pos: i64 = tx
                    .query_row("SELECT IFNULL(MAX(position),-1) FROM playlist_item WHERE playlist_id = ?1", [pid], |r| r.get(0))
                    .unwrap_or(-1);
                let _ = tx.execute(
                    "INSERT INTO playlist_item (playlist_id, track_id, position) VALUES (?1,?2,?3)",
                    rusqlite::params![pid, track_id, pos + 1],
                );
            },
            Some("album") => if let Some(aid) = dest_id {
                let _ = tx.execute("UPDATE track SET album_id = ?2 WHERE id = ?1", rusqlite::params![track_id, aid]);
            },
            Some("queue") => {
                let pos: i64 = tx
                    .query_row("SELECT IFNULL(MAX(position),-1) FROM queue_item", [], |r| r.get(0))
                    .unwrap_or(-1);
                let _ = tx.execute(
                    "INSERT INTO queue_item (track_id, position, source) VALUES (?1,?2,'download')",
                    rusqlite::params![track_id, pos + 1],
                );
            }
            _ => {} // "library": already in the library
        }
    }

    let _ = tx.commit();
    let _ = crate::commands::search::reindex(&conn);
    (count, first_id)
}

// ── commands ─────────────────────────────────────────────────────────────────

/// RF-09 / RF-10: start a real download. Emits "download-progress" events and,
/// on success, imports + routes the file(s) to the destination.
#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    input: String,
    dest_kind: Option<String>,
    dest_id: Option<i64>,
) -> AppResult<i64> {
    let input = input.trim().to_string();
    if input.is_empty() {
        return Err(AppError::Download("Informe um link ou o nome da música.".into()));
    }
    let kind = classify_input(&input);
    let type_str = match kind {
        JobKind::Video => "video",
        JobKind::Playlist => "playlist",
        JobKind::Search => "search",
    };

    // Fail early with a clear message instead of a silent no-op download.
    let out_dir = download_dir(&app);
    std::fs::create_dir_all(&out_dir).map_err(|e| {
        AppError::Download(format!(
            "Não foi possível usar a pasta de downloads ({}): {e}. Escolha outra em Configurações.",
            out_dir.display()
        ))
    })?;

    let job_id = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        conn.execute(
            "INSERT INTO download_job (url, type, status, progress, dest_kind, dest_id)
             VALUES (?1,?2,'running',0,?3,?4)",
            rusqlite::params![input, type_str, dest_kind, dest_id],
        )?;
        conn.last_insert_rowid()
    };

    let fmt = audio_format(&app);
    let args = build_ytdlp_args(&input, kind, &out_dir.to_string_lossy(), &ffmpeg_location(&app), fmt);

    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| {
        AppError::Download(format!("yt-dlp não encontrado no app ({e}). Reinstale o Sonara."))
    })?;
    let (mut rx, child) = sidecar.args(args).spawn().map_err(|e| {
        AppError::Download(format!("Não foi possível iniciar o yt-dlp: {e}"))
    })?;

    if let Ok(mut map) = app.state::<Downloads>().0.lock() {
        map.insert(job_id, child);
    }

    let app2 = app.clone();
    let dk = dest_kind.clone();
    tauri::async_runtime::spawn(async move {
        let mut files: Vec<String> = Vec::new();
        let mut last_err = String::new();
        let mut title = String::new();
        let mut last_pct = 0.0f64;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    for raw in line.lines() {
                        if let Some(p) = parse_progress(raw) {
                            last_pct = p.percent;
                            if title.is_empty() && !p.title.is_empty() {
                                title = p.title.clone();
                                set_job_title(&app2, job_id, &title);
                            }
                            set_job_progress(&app2, job_id, "running", p.percent);
                            emit(&app2, Progress {
                                job_id,
                                status: "running".into(),
                                progress: p.percent,
                                title: if p.title.is_empty() { title.clone() } else { p.title },
                                speed: p.speed,
                                eta: p.eta,
                                ..Default::default()
                            });
                        } else if let Some(path) = parse_file_line(raw) {
                            files.push(path);
                            // The download is done; ffmpeg post-processing is next.
                            emit(&app2, Progress {
                                job_id,
                                status: "running".into(),
                                progress: last_pct.max(99.0),
                                message: "Convertendo e gravando as tags…".into(),
                                title: title.clone(),
                                ..Default::default()
                            });
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    for raw in line.lines() {
                        let t = raw.trim();
                        if t.is_empty() { continue }
                        if t.starts_with("ERROR") || t.contains("Unable to") || t.contains("not available") {
                            last_err = t.to_string();
                        }
                    }
                }
                CommandEvent::Error(e) => {
                    last_err = format!("falha ao executar o yt-dlp: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    let canceled = app2
                        .state::<Downloads>()
                        .0
                        .lock()
                        .map(|mut m| m.remove(&job_id).is_none())
                        .unwrap_or(false);
                    let code = payload.code.unwrap_or(-1);

                    if canceled {
                        finish_job(&app2, job_id, "canceled", Some("Cancelado"), None, None);
                        emit(&app2, Progress {
                            job_id, status: "canceled".into(), progress: 0.0,
                            message: "Download cancelado".into(), title: title.clone(), ..Default::default()
                        });
                    } else if !files.is_empty() {
                        let (n, track_id) = finalize(&app2, &files, dk.as_deref(), dest_id);
                        let file = files.first().cloned();
                        finish_job(&app2, job_id, "done", None, file.as_deref(), track_id);
                        let msg = if n <= 1 {
                            "Pronto! Já está na sua biblioteca.".to_string()
                        } else {
                            format!("Pronto! {n} faixas na sua biblioteca.")
                        };
                        emit(&app2, Progress {
                            job_id, status: "done".into(), progress: 100.0, message: msg,
                            title: title.clone(), track_id, file_path: file, ..Default::default()
                        });
                        emit_library_changed(&app2);
                        // Best-effort: swap the 16:9 thumbnail for proper square
                        // album art. Runs after the job is already "done", so a
                        // miss or a network hiccup never affects the download.
                        if let Some(tid) = track_id {
                            if crate::commands::edit::auto_cover_for_track(&app2, tid).is_ok() {
                                emit_library_changed(&app2);
                            }
                        }
                    } else {
                        let msg = if last_err.is_empty() && code == 0 {
                            "Nada foi baixado. Confira o link e tente de novo.".to_string()
                        } else {
                            friendly_error(&last_err, code)
                        };
                        finish_job(&app2, job_id, "error", Some(&msg), None, None);
                        emit(&app2, Progress {
                            job_id, status: "error".into(), progress: 0.0, message: msg,
                            title: title.clone(), ..Default::default()
                        });
                    }
                }
                _ => {}
            }
        }
    });

    Ok(job_id)
}

/// Stop a running download. The partial file is left for yt-dlp to resume.
#[tauri::command]
pub fn cancel_download(app: AppHandle, job_id: i64) -> AppResult<()> {
    let child = app
        .state::<Downloads>()
        .0
        .lock()
        .map_err(|_| AppError::Other("lock".into()))?
        .remove(&job_id);
    match child {
        Some(c) => c.kill().map_err(|e| AppError::Download(e.to_string())),
        None => Ok(()), // already finished
    }
}

/// Preview the exact yt-dlp arguments (UI / debugging).
#[tauri::command]
pub fn preview_download_args(input: String, out_dir: String, ffmpeg_dir: String) -> AppResult<Vec<String>> {
    let kind = classify_input(&input);
    Ok(build_ytdlp_args(&input, kind, &out_dir, &ffmpeg_dir, AudioFormat::M4a))
}

/// RF-09/10: list download jobs for the Downloads screen.
#[tauri::command]
pub fn list_download_jobs(db: State<Db>) -> AppResult<Vec<DownloadJob>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, url, type, status, progress, dest_kind, dest_id, title, file_path, error,
                track_id, created_at
           FROM download_job ORDER BY id DESC LIMIT 200",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(DownloadJob {
            id: r.get(0)?, url: r.get(1)?, job_type: r.get(2)?, status: r.get(3)?,
            progress: r.get(4)?, dest_kind: r.get(5)?, dest_id: r.get(6)?,
            title: r.get(7)?, file_path: r.get(8)?, error: r.get(9)?,
            track_id: r.get(10)?, created_at: r.get(11)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Drop finished/failed jobs from the history (the files stay on disk).
#[tauri::command]
pub fn clear_download_history(db: State<Db>) -> AppResult<usize> {
    let conn = db.0.lock().unwrap();
    Ok(conn.execute("DELETE FROM download_job WHERE status <> 'running'", [])?)
}

/// Diagnostics for the Settings screen: are the bundled tools actually there?
/// This is what turns "nothing happens when I click download" into a message
/// that says which piece is missing.
#[tauri::command]
pub async fn check_download_tools(app: AppHandle) -> AppResult<ToolStatus> {
    let dir = download_dir(&app);
    let ffmpeg = sidecar_path(&exe_dir(&app), "ffmpeg").map(|p| p.to_string_lossy().to_string());

    let ytdlp_version = match app.shell().sidecar("yt-dlp") {
        Ok(cmd) => match cmd.args(["--version"]).output().await {
            Ok(out) if out.status.success() => {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
            }
            _ => None,
        },
        Err(_) => None,
    };

    let writable = std::fs::create_dir_all(&dir).is_ok();
    Ok(ToolStatus {
        ytdlp_version,
        ffmpeg_path: ffmpeg,
        download_dir: dir.to_string_lossy().to_string(),
        download_dir_writable: writable,
        audio_format: audio_format(&app).as_str().to_string(),
    })
}

/// RF-10: search YouTube and return pickable results (no download). Uses
/// `yt-dlp --dump-json --flat-playlist ytsearchN:` and parses each JSON line.
#[tauri::command]
pub async fn youtube_search(app: AppHandle, query: String, limit: Option<u32>) -> AppResult<Vec<SearchResult>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let n = limit.unwrap_or(12).clamp(1, 25);
    let sidecar = app.shell().sidecar("yt-dlp").map_err(|e| {
        AppError::Download(format!("yt-dlp não encontrado no app ({e}). Reinstale o Sonara."))
    })?;
    let out = sidecar
        .args([
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--no-color",
            "--socket-timeout",
            "30",
            &format!("ytsearch{n}:{q}"),
        ])
        .output()
        .await
        .map_err(|e| AppError::Download(format!("Não foi possível executar a busca: {e}")))?;

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

    // yt-dlp exits non-zero when *some* entries fail; only treat it as an error
    // when there is nothing at all to show.
    if results.is_empty() && !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let raw = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").to_string();
        return Err(AppError::Download(friendly_error(&raw, out.status.code().unwrap_or(-1))));
    }
    Ok(results)
}
