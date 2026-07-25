use crate::commands::library::{map_track, TRACK_COLS};
use crate::commands::search::reindex;
use crate::db::Db;
use crate::error::AppResult;
use crate::models::Track;
use tauri::State;

/// F5: find likely duplicate tracks (same title + rounded duration across files).
#[tauri::command]
pub fn find_duplicates(db: State<Db>) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let key = "LOWER(title) || '|' || CAST(IFNULL(ROUND(duration),0) AS INT)";
    let sql = format!(
        "SELECT {TRACK_COLS} FROM track WHERE {key} IN \
         (SELECT {key} FROM track GROUP BY 1 HAVING COUNT(*) > 1) \
         ORDER BY LOWER(title), duration"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_track)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// F5: delete tracks by id (used by the duplicate resolver). Reindexes afterwards.
#[tauri::command]
pub fn delete_tracks(db: State<Db>, ids: Vec<i64>) -> AppResult<usize> {
    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let mut n = 0usize;
    for id in &ids {
        n += tx.execute("DELETE FROM track WHERE id = ?1", [id])?;
    }
    tx.commit()?;
    let _ = reindex(&conn);
    Ok(n)
}
