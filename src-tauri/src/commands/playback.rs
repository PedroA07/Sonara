use crate::db::Db;
use crate::error::AppResult;
use crate::models::Track;
use tauri::State;

/// RF-06: replace the queue with a list of track ids.
#[tauri::command]
pub fn set_queue(db: State<Db>, track_ids: Vec<i64>) -> AppResult<()> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM queue_item", [])?;
    for (i, id) in track_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO queue_item (track_id, position, source) VALUES (?1, ?2, 'user')",
            rusqlite::params![id, i as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// RF-06: read the persisted queue (joined with track info).
#[tauri::command]
pub fn get_queue(db: State<Db>) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, t.file_path, t.duration, t.track_no, t.disc_no, t.year, t.genre, t.album_id, t.bitrate, t.format, t.gain, COALESCE(t.cover_path, al.cover_path)
         FROM queue_item q JOIN track t ON t.id = q.track_id
         LEFT JOIN album al ON al.id = t.album_id ORDER BY q.position",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Track {
                id: r.get(0)?, title: r.get(1)?, file_path: r.get(2)?, duration: r.get(3)?,
                track_no: r.get(4)?, disc_no: r.get(5)?, year: r.get(6)?, genre: r.get(7)?,
                album_id: r.get(8)?, bitrate: r.get(9)?, format: r.get(10)?, gain: r.get(11)?,
                cover_path: r.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
