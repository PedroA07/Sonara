//! Export tracks to any folder — a USB stick, a phone, a card for the car.
//!
//! The library keeps files wherever they were downloaded/imported, which is not
//! where people want them when moving music to another device. This copies the
//! selected tracks (originals stay put), optionally re-encoding to MP3 for
//! maximum compatibility, and lays them out in a folder structure the target
//! device understands.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{ExportOptions, ExportResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize)]
struct ExportProgress {
    index: usize,
    total: usize,
    name: String,
    status: String, // "copying" | "converting" | "ok" | "skipped" | "error"
}

/// One track's worth of what the export needs to know.
struct Row {
    title: String,
    file_path: String,
    artist: String,
    album: String,
    track_no: Option<i64>,
    duration: Option<f64>,
    /// LRC bruto guardado para esta faixa, quando existe. Só é gravado no
    /// destino se a pessoa marcar a opção.
    lyrics: Option<String>,
}

/// Strip everything Windows, FAT32 and exFAT refuse, so the copy does not fail
/// halfway through with a cryptic OS error on a USB stick.
pub fn sanitize(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if (c as u32) < 0x20 => ' ',
            c => c,
        })
        .collect();
    out = out.trim().trim_end_matches('.').trim().to_string();
    // Reserved DOS device names still bite on Windows.
    let upper = out.to_ascii_uppercase();
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.contains(&upper.as_str()) {
        out.push('_');
    }
    if out.chars().count() > 120 {
        out = out.chars().take(120).collect::<String>().trim_end().to_string();
    }
    if out.is_empty() { "Sem título".to_string() } else { out }
}

/// Folder for one track, relative to the destination root.
pub fn relative_dir(organize: &str, artist: &str, album: &str) -> PathBuf {
    let artist = if artist.trim().is_empty() { "Artista desconhecido" } else { artist };
    let album = if album.trim().is_empty() { "Sem álbum" } else { album };
    match organize {
        "artist" => PathBuf::from(sanitize(artist)),
        "artist_album" => PathBuf::from(sanitize(artist)).join(sanitize(album)),
        _ => PathBuf::new(), // "flat"
    }
}

/// File name (without extension) for one track.
pub fn file_stem(naming: &str, artist: &str, title: &str, track_no: Option<i64>) -> String {
    let title = if title.trim().is_empty() { "Sem título" } else { title };
    let stem = match naming {
        "artist_title" => {
            if artist.trim().is_empty() { title.to_string() } else { format!("{artist} - {title}") }
        }
        "track_title" => match track_no {
            Some(n) if n > 0 => format!("{n:02} - {title}"),
            _ => title.to_string(),
        },
        _ => title.to_string(),
    };
    sanitize(&stem)
}

/// Where the `.lrc` goes for an exported audio file: same folder, same name.
///
/// Safe here because the caller always built the name as `{stem}.{ext}`, so the
/// last dot really is the extension — a title like "Song vol. 2" keeps its tail.
/// The tests below pin that down; a future change to the naming rules that
/// dropped the extension would break them instead of silently truncating names
/// on someone's USB stick.
pub fn lrc_sidecar_path(audio: &Path) -> PathBuf {
    audio.with_extension("lrc")
}

/// Append " (2)", " (3)"… when the name is taken and overwrite is off.
fn unique_path(dir: &Path, stem: &str, ext: &str, overwrite: bool) -> (PathBuf, bool) {
    let first = dir.join(format!("{stem}.{ext}"));
    if overwrite || !first.exists() {
        return (first, false);
    }
    for n in 2..1000 {
        let p = dir.join(format!("{stem} ({n}).{ext}"));
        if !p.exists() {
            return (p, false);
        }
    }
    (first, true) // give up and report it as a skip
}

fn load_rows(app: &AppHandle, ids: &[i64]) -> AppResult<Vec<Row>> {
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    let mut out = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT t.title, t.file_path, t.track_no, t.duration,
                COALESCE(
                  (SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
                    WHERE ta.track_id = t.id ORDER BY ar.name LIMIT 1),
                  (SELECT ar2.name FROM album al2 JOIN artist ar2 ON ar2.id = al2.artist_id
                    WHERE al2.id = t.album_id), '') AS artist,
                COALESCE((SELECT al.title FROM album al WHERE al.id = t.album_id), '') AS album,
                (SELECT l.content FROM lyrics l WHERE l.track_id = t.id) AS lyrics
           FROM track t WHERE t.id = ?1",
    )?;
    for id in ids {
        if let Ok(r) = stmt.query_row([id], |r| {
            Ok(Row {
                title: r.get(0)?,
                file_path: r.get(1)?,
                track_no: r.get(2)?,
                duration: r.get(3)?,
                artist: r.get(4)?,
                album: r.get(5)?,
                lyrics: r.get(6)?,
            })
        }) {
            out.push(r);
        }
    }
    Ok(out)
}

/// Re-encode to MP3 with the bundled ffmpeg, keeping tags and cover art.
async fn convert_to_mp3(app: &AppHandle, src: &Path, dst: &Path) -> Result<(), String> {
    let run = |args: Vec<String>| {
        let app = app.clone();
        async move {
            let cmd = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
            let out = cmd.args(args).output().await.map_err(|e| e.to_string())?;
            if out.status.success() {
                Ok(())
            } else {
                let err = String::from_utf8_lossy(&out.stderr);
                Err(err.lines().rev().take(3).collect::<Vec<_>>().join(" ").trim().to_string())
            }
        }
    };

    let s = src.to_string_lossy().to_string();
    let d = dst.to_string_lossy().to_string();
    // First try keeping the embedded cover (an attached picture stream).
    let with_cover = vec![
        "-y".into(), "-i".into(), s.clone(),
        "-map".into(), "0".into(),
        "-c:v".into(), "copy".into(),
        "-c:a".into(), "libmp3lame".into(),
        "-q:a".into(), "2".into(),
        "-map_metadata".into(), "0".into(),
        "-id3v2_version".into(), "3".into(),
        "-loglevel".into(), "error".into(),
        d.clone(),
    ];
    if run(with_cover).await.is_ok() {
        return Ok(());
    }
    // Some containers carry covers ffmpeg refuses to copy into MP3 — drop it
    // rather than losing the track.
    let audio_only = vec![
        "-y".into(), "-i".into(), s,
        "-vn".into(),
        "-c:a".into(), "libmp3lame".into(),
        "-q:a".into(), "2".into(),
        "-map_metadata".into(), "0".into(),
        "-id3v2_version".into(), "3".into(),
        "-loglevel".into(), "error".into(),
        d,
    ];
    run(audio_only).await
}

/// Copy (and optionally convert) the chosen tracks into `dest_dir`.
#[tauri::command]
pub async fn export_tracks(
    app: AppHandle,
    track_ids: Vec<i64>,
    options: ExportOptions,
) -> AppResult<ExportResult> {
    let dest_root = PathBuf::from(&options.dest_dir);
    if options.dest_dir.trim().is_empty() {
        return Err(AppError::Other("Escolha a pasta de destino.".into()));
    }
    std::fs::create_dir_all(&dest_root).map_err(|e| {
        AppError::Other(format!("Não foi possível gravar em {}: {e}", dest_root.display()))
    })?;

    let rows = load_rows(&app, &track_ids)?;
    let total = rows.len();
    if total == 0 {
        return Err(AppError::Other("Nenhuma faixa selecionada.".into()));
    }

    let mut result = ExportResult {
        copied: 0,
        skipped: 0,
        failed: 0,
        dest_dir: dest_root.to_string_lossy().to_string(),
        errors: Vec::new(),
    };
    let mut m3u: Vec<String> = vec!["#EXTM3U".into()];

    for (i, row) in rows.iter().enumerate() {
        let src = PathBuf::from(&row.file_path);
        let name = if row.title.trim().is_empty() { row.file_path.clone() } else { row.title.clone() };

        if !src.is_file() {
            result.failed += 1;
            result.errors.push(format!("{name}: arquivo não encontrado no disco"));
            let _ = app.emit("export-progress", ExportProgress { index: i + 1, total, name, status: "error".into() });
            continue;
        }

        let src_ext = src.extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_ascii_lowercase();
        let convert = options.convert_mp3 && src_ext != "mp3";
        let ext = if convert { "mp3".to_string() } else { src_ext };

        let dir = dest_root.join(relative_dir(&options.organize, &row.artist, &row.album));
        if let Err(e) = std::fs::create_dir_all(&dir) {
            result.failed += 1;
            result.errors.push(format!("{name}: {e}"));
            let _ = app.emit("export-progress", ExportProgress { index: i + 1, total, name, status: "error".into() });
            continue;
        }

        let stem = file_stem(&options.naming, &row.artist, &row.title, row.track_no);
        let (dst, exhausted) = unique_path(&dir, &stem, &ext, options.overwrite);

        if exhausted || (dst.exists() && !options.overwrite) {
            result.skipped += 1;
            let _ = app.emit("export-progress", ExportProgress { index: i + 1, total, name, status: "skipped".into() });
            continue;
        }

        let _ = app.emit("export-progress", ExportProgress {
            index: i + 1, total, name: name.clone(),
            status: if convert { "converting".into() } else { "copying".into() },
        });

        let outcome = if convert {
            convert_to_mp3(&app, &src, &dst).await.map_err(|e| {
                format!("{e} (o ffmpeg acompanha o app; se persistir, exporte sem converter)")
            })
        } else {
            // Blocking copy off the async worker so the UI keeps responding.
            let (s, d) = (src.clone(), dst.clone());
            tauri::async_runtime::spawn_blocking(move || std::fs::copy(&s, &d).map(|_| ()))
                .await
                .map_err(|e| e.to_string())
                .and_then(|r| r.map_err(|e| e.to_string()))
        };

        match outcome {
            Ok(()) => {
                result.copied += 1;
                if options.include_lrc {
                    if let Some(lrc) = row.lyrics.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                        let side = lrc_sidecar_path(&dst);
                        if let Err(e) = std::fs::write(&side, lrc) {
                            // A música já foi copiada; a letra é um extra, e
                            // perdê-la não torna a exportação um fracasso.
                            result.errors.push(format!("{name}: letra não copiada ({e})"));
                        }
                    }
                }
                if options.playlist_file {
                    let rel = dst.strip_prefix(&dest_root).unwrap_or(&dst);
                    let secs = row.duration.unwrap_or(0.0).round() as i64;
                    let who = if row.artist.is_empty() { row.title.clone() } else { format!("{} - {}", row.artist, row.title) };
                    m3u.push(format!("#EXTINF:{secs},{who}"));
                    m3u.push(rel.to_string_lossy().replace('\\', "/"));
                }
                let _ = app.emit("export-progress", ExportProgress { index: i + 1, total, name, status: "ok".into() });
            }
            Err(e) => {
                let _ = std::fs::remove_file(&dst); // no half-written files
                result.failed += 1;
                result.errors.push(format!("{name}: {e}"));
                let _ = app.emit("export-progress", ExportProgress { index: i + 1, total, name, status: "error".into() });
            }
        }
    }

    if options.playlist_file && result.copied > 0 {
        let stem = sanitize(options.playlist_name.as_deref().unwrap_or("Sonara"));
        let path = dest_root.join(format!("{stem}.m3u8"));
        if let Err(e) = std::fs::write(&path, m3u.join("\n")) {
            result.errors.push(format!("playlist .m3u8: {e}"));
        }
    }

    Ok(result)
}

/// Open a file or folder in the system's file manager / default app. Used by
/// "Abrir pasta" after an export or download.
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    // For a file, reveal the folder that contains it.
    let target = if p.is_file() { p.parent().map(|d| d.to_path_buf()).unwrap_or(p.clone()) } else { p };
    if !target.exists() {
        return Err(AppError::Other(format!("A pasta não existe mais: {}", target.display())));
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_path(target.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_names_for_usb_sticks() {
        assert_eq!(sanitize("AC/DC: Back?"), "AC-DC- Back-");
        assert_eq!(sanitize("  trailing.  "), "trailing");
        assert_eq!(sanitize(""), "Sem título");
        assert_eq!(sanitize("CON"), "CON_");
        assert!(sanitize(&"a".repeat(300)).chars().count() <= 120);
    }

    #[test]
    fn builds_folder_layouts() {
        assert_eq!(relative_dir("flat", "A", "B"), PathBuf::new());
        assert_eq!(relative_dir("artist", "Racionais", "Sobrevivendo"), PathBuf::from("Racionais"));
        assert_eq!(
            relative_dir("artist_album", "Racionais", "Sobrevivendo"),
            PathBuf::from("Racionais").join("Sobrevivendo")
        );
        assert_eq!(relative_dir("artist", "", ""), PathBuf::from("Artista desconhecido"));
    }

    #[test]
    fn builds_file_names() {
        assert_eq!(file_stem("title", "A", "Song", Some(3)), "Song");
        assert_eq!(file_stem("artist_title", "A", "Song", None), "A - Song");
        assert_eq!(file_stem("track_title", "A", "Song", Some(3)), "03 - Song");
        // No track number recorded → don't emit a bogus "00 -" prefix.
        assert_eq!(file_stem("track_title", "A", "Song", None), "Song");
        assert_eq!(file_stem("artist_title", "", "Song", None), "Song");
    }

    #[test]
    fn puts_the_lrc_next_to_the_audio() {
        let dir = Path::new("/pen/Artista/Album");
        assert_eq!(
            lrc_sidecar_path(&dir.join("Artista - Song.mp3")),
            dir.join("Artista - Song.lrc")
        );
        // Título com ponto no meio: só a extensão é trocada.
        assert_eq!(
            lrc_sidecar_path(&dir.join("Song vol. 2.m4a")),
            dir.join("Song vol. 2.lrc")
        );
        // O sufixo de desambiguação de `unique_path` sobrevive.
        assert_eq!(
            lrc_sidecar_path(&dir.join("Song (2).opus")),
            dir.join("Song (2).lrc")
        );
    }
}
