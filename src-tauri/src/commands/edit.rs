use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::TrackEdit;
use crate::services::metadata;
use base64::Engine;
use rusqlite::Transaction;
use std::path::Path;
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
            tx.execute("INSERT OR IGNORE INTO track_artist (track_id, artist_id) VALUES (?1, ?2)",
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

/// RF-05: save a cropped cover (PNG bytes, base64) to the app's covers folder
/// and set it as the track's cover. Returns the stored path.
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
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("covers");
    std::fs::create_dir_all(&dir)?;
    // Timestamped name so the webview doesn't serve a stale cached image.
    let name = format!("{track_id}-{}.png", chrono_now_millis());
    let path = dir.join(name);
    std::fs::write(&path, &bytes)?;
    let path_str = path.to_string_lossy().to_string();

    let conn = db.0.lock().unwrap();
    apply_cover(&conn, track_id, &path_str, write_file)?;
    Ok(path_str)
}

/// Milliseconds since the Unix epoch (avoids an extra date crate dependency).
fn chrono_now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
