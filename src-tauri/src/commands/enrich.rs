use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::services::enrich;
use tauri::{AppHandle, Manager, State};

/// F5: fetch a cover (and confirm the release) from MusicBrainz / Cover Art Archive
/// for an album that has no cover yet. Returns the saved cover path, if any.
#[tauri::command]
pub fn enrich_album(app: AppHandle, db: State<Db>, album_id: i64) -> AppResult<Option<String>> {
    let (title, artist): (String, Option<String>) = {
        let conn = db.0.lock().unwrap();
        conn.query_row(
            "SELECT al.title, ar.name FROM album al
             LEFT JOIN artist ar ON ar.id = al.artist_id WHERE al.id = ?1",
            [album_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?
    };

    let mbid = match enrich::find_release_mbid(&title, artist.as_deref())? {
        Some(id) => id,
        None => return Ok(None),
    };

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("covers");
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("album_{album_id}.jpg"));
    enrich::download_cover(&mbid, &dest)?;

    let path = dest.to_string_lossy().to_string();
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE album SET cover_path = ?1 WHERE id = ?2",
        rusqlite::params![path, album_id],
    )?;
    Ok(Some(path))
}
