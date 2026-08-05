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
    let sql = format!(
        "SELECT {} FROM queue_item q JOIN track t ON t.id = q.track_id ORDER BY q.position",
        crate::commands::library::track_cols("t")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], crate::commands::library::map_track)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
