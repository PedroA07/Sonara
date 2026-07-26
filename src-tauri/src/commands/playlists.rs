use crate::db::Db;
use crate::error::AppResult;
use crate::models::{PlaylistCard, Track};
use tauri::State;

/// RF-04: list playlists with track counts.
#[tauri::command]
pub fn list_playlists(db: State<Db>) -> AppResult<Vec<PlaylistCard>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.cover_path, p.description, p.sort_mode, COUNT(pi.id)
         FROM playlist p LEFT JOIN playlist_item pi ON pi.playlist_id = p.id
         GROUP BY p.id ORDER BY p.created_at DESC",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(PlaylistCard {
            id: r.get(0)?, name: r.get(1)?, cover_path: r.get(2)?,
            description: r.get(3)?, sort_mode: r.get(4)?, track_count: r.get(5)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_playlist(db: State<Db>, name: String) -> AppResult<i64> {
    let conn = db.0.lock().unwrap();
    conn.execute("INSERT INTO playlist (name) VALUES (?1)", [name])?;
    Ok(conn.last_insert_rowid())
}

/// RF-04: edit name / description / cover / sort mode.
#[tauri::command]
pub fn update_playlist(
    db: State<Db>, id: i64,
    name: Option<String>, description: Option<String>,
    cover_path: Option<String>, sort_mode: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let custom = matches!(sort_mode.as_deref(), Some("custom") | None);
    conn.execute(
        "UPDATE playlist SET
           name = COALESCE(?2, name),
           description = COALESCE(?3, description),
           cover_path = COALESCE(?4, cover_path),
           sort_mode = COALESCE(?5, sort_mode),
           is_custom_order = ?6
         WHERE id = ?1",
        rusqlite::params![id, name, description, cover_path, sort_mode, custom as i64],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_playlist(db: State<Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM playlist WHERE id = ?1", [id])?;
    Ok(())
}

/// RF-04: append tracks at the end of the playlist.
#[tauri::command]
pub fn add_to_playlist(db: State<Db>, playlist_id: i64, track_ids: Vec<i64>) -> AppResult<()> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let mut pos: i64 = tx.query_row(
        "SELECT IFNULL(MAX(position), -1) FROM playlist_item WHERE playlist_id = ?1",
        [playlist_id], |r| r.get(0),
    )?;
    for tid in track_ids {
        pos += 1;
        tx.execute(
            "INSERT INTO playlist_item (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            rusqlite::params![playlist_id, tid, pos],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn remove_from_playlist(db: State<Db>, playlist_id: i64, track_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM playlist_item WHERE playlist_id = ?1 AND track_id = ?2",
        rusqlite::params![playlist_id, track_id],
    )?;
    Ok(())
}

/// RF-04: persist a custom order (list of track ids in the new order).
#[tauri::command]
pub fn reorder_playlist(db: State<Db>, playlist_id: i64, ordered_track_ids: Vec<i64>) -> AppResult<()> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    for (i, tid) in ordered_track_ids.iter().enumerate() {
        tx.execute(
            "UPDATE playlist_item SET position = ?3 WHERE playlist_id = ?1 AND track_id = ?2",
            rusqlite::params![playlist_id, tid, i as i64],
        )?;
    }
    tx.execute("UPDATE playlist SET sort_mode = 'custom', is_custom_order = 1 WHERE id = ?1", [playlist_id])?;
    tx.commit()?;
    Ok(())
}

/// RF-04: playlist tracks ordered by the current sort mode.
#[tauri::command]
pub fn playlist_tracks(db: State<Db>, playlist_id: i64) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let sort_mode: String = conn
        .query_row("SELECT sort_mode FROM playlist WHERE id = ?1", [playlist_id], |r| r.get(0))
        .unwrap_or_else(|_| "custom".into());

    let order = match sort_mode.as_str() {
        "alpha" => "t.title COLLATE NOCASE",
        "artist" => "ar.name COLLATE NOCASE, t.title",
        "year" => "al.year, t.title",
        "recent" => "t.date_added DESC",
        _ => "pi.position", // custom
    };

    let sql = format!(
        "SELECT t.id, t.title, t.file_path, t.duration, t.track_no, t.disc_no, t.year, t.genre, t.album_id, t.bitrate, t.format, t.gain, al.cover_path
         FROM playlist_item pi
         JOIN track t ON t.id = pi.track_id
         LEFT JOIN album al ON al.id = t.album_id
         LEFT JOIN artist ar ON ar.id = al.artist_id
         WHERE pi.playlist_id = ?1 ORDER BY {order}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([playlist_id], |r| Ok(Track {
            id: r.get(0)?, title: r.get(1)?, file_path: r.get(2)?, duration: r.get(3)?,
            track_no: r.get(4)?, disc_no: r.get(5)?, year: r.get(6)?, genre: r.get(7)?,
            album_id: r.get(8)?, bitrate: r.get(9)?, format: r.get(10)?, gain: r.get(11)?,
            cover_path: r.get(12)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
