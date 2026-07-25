use crate::db::Db;
use crate::error::AppResult;
use rusqlite::Connection;
use tauri::State;

/// Rebuild the FTS index from the current library (F5). Cheap for typical libraries;
/// for very large ones, switch to per-row triggers.
pub(crate) fn reindex(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM track_fts", [])?;
    conn.execute(
        "INSERT INTO track_fts(rowid, title, album, artist, genre)
         SELECT t.id, t.title, IFNULL(al.title,''), IFNULL(ar.name,''), IFNULL(t.genre,'')
         FROM track t
         LEFT JOIN album al ON al.id = t.album_id
         LEFT JOIN artist ar ON ar.id = al.artist_id",
        [],
    )?;
    Ok(())
}

#[tauri::command]
pub fn rebuild_search_index(db: State<Db>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    reindex(&conn)?;
    Ok(())
}
