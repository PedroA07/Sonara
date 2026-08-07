use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{CoverCandidate, TrackEdit};
use crate::services::metadata;
use base64::Engine;
use rusqlite::Transaction;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

fn get_or_create_artist(tx: &Transaction, name: &str) -> AppResult<i64> {
    if let Ok(id) = tx.query_row("SELECT id FROM artist WHERE name = ?1", [name], |r| r.get::<_, i64>(0)) {
        return Ok(id);
    }
    tx.execute("INSERT INTO artist (name) VALUES (?1)", [name])?;
    Ok(tx.last_insert_rowid())
}

fn get_or_create_album(tx: &Transaction, title: &str, artist_id: Option<i64>) -> AppResult<i64> {
    if let Ok(id) = tx.query_row(
        "SELECT id FROM album WHERE title = ?1 AND IFNULL(artist_id,0) = IFNULL(?2,0)",
        rusqlite::params![title, artist_id], |r| r.get::<_, i64>(0),
    ) {
        return Ok(id);
    }
    tx.execute("INSERT INTO album (title, artist_id) VALUES (?1, ?2)", rusqlite::params![title, artist_id])?;
    Ok(tx.last_insert_rowid())
}

/// RF-05: apply an edit to one or more tracks (batch). Optionally writes the
/// tags (and requested fields) back into each audio file.
#[tauri::command]
pub fn update_track_metadata(
    db: State<Db>,
    track_ids: Vec<i64>,
    edit: TrackEdit,
    write_file: bool,
) -> AppResult<usize> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;

    // Resolve artist/album once if they were provided (shared across the batch).
    let artist_id = match edit.artist.as_deref() {
        Some(n) if !n.is_empty() => Some(get_or_create_artist(&tx, n)?),
        _ => None,
    };
    let album_id = match edit.album.as_deref() {
        Some(n) if !n.is_empty() => Some(get_or_create_album(&tx, n, artist_id)?),
        _ => None,
    };

    let mut updated = 0usize;
    for id in &track_ids {
        // COALESCE keeps existing values when a field is not provided.
        tx.execute(
            "UPDATE track SET
               title    = COALESCE(?2, title),
               genre    = COALESCE(?3, genre),
               year     = COALESCE(?4, year),
               track_no = COALESCE(?5, track_no),
               disc_no  = COALESCE(?6, disc_no),
               album_id = COALESCE(?7, album_id)
             WHERE id = ?1",
            rusqlite::params![id, edit.title, edit.genre, edit.year, edit.track_no, edit.disc_no, album_id],
        )?;
        if let Some(aid) = artist_id {
            // Replace the track's artist(s), don't just add. The library shows the
            // first track_artist alphabetically, so merely inserting a new link
            // left the old (often alphabetically-earlier) artist on display —
            // which looked like "editing the artist does nothing".
            tx.execute("DELETE FROM track_artist WHERE track_id = ?1", [id])?;
            tx.execute("INSERT INTO track_artist (track_id, artist_id) VALUES (?1, ?2)",
                rusqlite::params![id, aid])?;
        }

        if write_file {
            let path: String = tx.query_row("SELECT file_path FROM track WHERE id = ?1", [id], |r| r.get(0))?;
            // Best-effort: don't fail the whole batch if one file is read-only.
            let _ = metadata::write_tags(Path::new(&path), &edit);
        }
        updated += 1;
    }
    tx.commit()?;
    let _ = crate::commands::search::reindex(&conn);
    Ok(updated)
}

/// Persist `cover_path` on the track (and its album, if any). Optionally embeds
/// the image into the audio file.
fn apply_cover(conn: &rusqlite::Connection, track_id: i64, image_path: &str, write_file: bool) -> AppResult<()> {
    let (file_path, album_id): (String, Option<i64>) = conn.query_row(
        "SELECT file_path, album_id FROM track WHERE id = ?1", [track_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    conn.execute("UPDATE track SET cover_path = ?1 WHERE id = ?2", rusqlite::params![image_path, track_id])?;
    if let Some(aid) = album_id {
        conn.execute("UPDATE album SET cover_path = ?1 WHERE id = ?2", rusqlite::params![image_path, aid])?;
    }
    if write_file {
        // Best-effort: a read-only or unsupported file shouldn't fail the cover set.
        let _ = metadata::embed_cover(Path::new(&file_path), Path::new(image_path));
    }
    Ok(())
}

/// RF-05: set a track's cover from an existing image file on disk.
#[tauri::command]
pub fn set_track_cover(db: State<Db>, track_id: i64, image_path: String, write_file: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    apply_cover(&conn, track_id, &image_path, write_file)
}

/// Read an image file and return it base64-encoded (used by the cover cropper
/// to load a picked image into a canvas without asset-protocol canvas taint).
#[tauri::command]
pub fn read_image_base64(path: String) -> AppResult<String> {
    let bytes = std::fs::read(&path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// The covers folder inside app-data (created on demand).
fn covers_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::Other(e.to_string()))?.join("covers");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Save cover bytes with a timestamped name (so the webview never serves a stale
/// cached image) and return the stored path.
fn save_cover_bytes(app: &AppHandle, track_id: i64, bytes: &[u8], ext: &str) -> AppResult<String> {
    let path = covers_dir(app)?.join(format!("{track_id}-{}.{ext}", chrono_now_millis()));
    std::fs::write(&path, bytes)?;
    Ok(path.to_string_lossy().to_string())
}

/// RF-05: save a cropped cover (PNG bytes, base64) as the track's cover.
#[tauri::command]
pub fn set_cover_from_bytes(
    app: AppHandle,
    db: State<Db>,
    track_id: i64,
    png_base64: String,
    write_file: bool,
) -> AppResult<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| AppError::Other(e.to_string()))?;
    let path = save_cover_bytes(&app, track_id, &bytes, "png")?;
    let conn = db.0.lock().unwrap();
    apply_cover(&conn, track_id, &path, write_file)?;
    Ok(path)
}

/// RF-05: search album artwork on the iTunes Search API (no key required) and
/// return candidate images the user can preview and pick.
#[tauri::command]
pub fn search_cover_art(query: String, limit: Option<u32>) -> AppResult<Vec<CoverCandidate>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let n = limit.unwrap_or(12).clamp(1, 25);
    let body = ureq::get("https://itunes.apple.com/search")
        .query("term", q)
        .query("media", "music")
        .query("entity", "album")
        .query("limit", &n.to_string())
        .call()
        .map_err(|e| AppError::Other(format!("busca de capa: {e}")))?
        .into_string()
        .map_err(AppError::Io)?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| AppError::Other(format!("busca de capa (json): {e}")))?;

    let mut out = Vec::new();
    if let Some(results) = v["results"].as_array() {
        for r in results {
            let art = match r["artworkUrl100"].as_str() {
                Some(a) if !a.is_empty() => a,
                _ => continue,
            };
            let artist = r["artistName"].as_str().unwrap_or("");
            let album = r["collectionName"].as_str().unwrap_or("");
            out.push(CoverCandidate {
                thumb: art.to_string(),
                // iTunes serves a larger image if you rewrite the size segment.
                full: art.replace("100x100bb", "600x600bb"),
                label: format!("{artist} — {album}").trim_matches(|c: char| c == ' ' || c == '—').to_string(),
            });
        }
    }
    Ok(out)
}

/// RF-05: download an image by URL and set it as the track's cover.
#[tauri::command]
pub fn set_cover_from_url(
    app: AppHandle,
    db: State<Db>,
    track_id: i64,
    url: String,
    write_file: bool,
) -> AppResult<String> {
    let bytes = fetch_image(url.trim())?;
    let path = save_cover_bytes(&app, track_id, &bytes, "jpg")?;
    let conn = db.0.lock().unwrap();
    apply_cover(&conn, track_id, &path, write_file)?;
    Ok(path)
}

/// Download an image over HTTP into memory.
pub(crate) fn fetch_image(url: &str) -> AppResult<Vec<u8>> {
    let resp = ureq::get(url).call().map_err(|e| AppError::Download(format!("baixar capa: {e}")))?;
    let mut bytes = Vec::new();
    resp.into_reader().read_to_end(&mut bytes).map_err(AppError::Io)?;
    if bytes.is_empty() {
        return Err(AppError::Other("imagem vazia".into()));
    }
    Ok(bytes)
}

/// Best-effort: look up proper album art for a just-downloaded track and set it
/// as the cover, replacing the 16:9 video thumbnail with square artwork. Called
/// after a download finishes; the caller ignores errors (no match, offline…).
pub(crate) fn auto_cover_for_track(app: &AppHandle, track_id: i64) -> AppResult<()> {
    let (title, artist): (String, Option<String>) = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
        conn.query_row(
            "SELECT t.title,
                    COALESCE(
                      (SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id WHERE ta.track_id = t.id LIMIT 1),
                      (SELECT ar.name FROM album al JOIN artist ar ON ar.id = al.artist_id WHERE al.id = t.album_id))
             FROM track t WHERE t.id = ?1",
            [track_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?
    };
    let query = match artist.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(a) => format!("{a} {title}"),
        None => title,
    };
    let first = search_cover_art(query, Some(1))?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("sem capa".into()))?;
    let bytes = fetch_image(&first.full)?;
    let path = save_cover_bytes(app, track_id, &bytes, "jpg")?;
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|_| AppError::Other("db lock".into()))?;
    apply_cover(&conn, track_id, &path, false)?; // DB/library only; don't rewrite the file
    Ok(())
}

/// Milliseconds since the Unix epoch (avoids an extra date crate dependency).
fn chrono_now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
