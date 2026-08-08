use crate::commands::search::reindex;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{AlbumCard, Artist, Track};
use tauri::State;

pub(crate) fn map_track(r: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: r.get(0)?, title: r.get(1)?, file_path: r.get(2)?, duration: r.get(3)?,
        track_no: r.get(4)?, disc_no: r.get(5)?, year: r.get(6)?, genre: r.get(7)?,
        album_id: r.get(8)?, bitrate: r.get(9)?, format: r.get(10)?, gain: r.get(11)?,
        cover_path: r.get(12)?, artist_name: r.get(13)?, album_title: r.get(14)?,
        video_path: r.get(15)?, video_offset_ms: r.get(16)?,
    })
}

/// Column list for [`map_track`], parameterised by the table alias so the queue
/// and playlist joins produce exactly the same shape as a plain `FROM track`.
///
/// Correlated subqueries resolve the cover, the artist name and the album title:
/// a track's own cover wins over its album's, and its own artist link wins over
/// the album artist.
pub(crate) fn track_cols(t: &str) -> String {
    format!(
        "{t}.id, {t}.title, {t}.file_path, {t}.duration, {t}.track_no, {t}.disc_no, {t}.year, \
         {t}.genre, {t}.album_id, {t}.bitrate, {t}.format, {t}.gain, \
         COALESCE({t}.cover_path, (SELECT cover_path FROM album WHERE album.id = {t}.album_id)) AS cover_path, \
         COALESCE( \
           (SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id \
             WHERE ta.track_id = {t}.id ORDER BY ar.name LIMIT 1), \
           (SELECT ar2.name FROM album al2 JOIN artist ar2 ON ar2.id = al2.artist_id \
             WHERE al2.id = {t}.album_id) \
         ) AS artist_name, \
         (SELECT title FROM album WHERE album.id = {t}.album_id) AS album_title, \
         {t}.video_path, {t}.video_offset_ms"
    )
}

/// RF-03: list all tracks.
#[tauri::command]
pub fn list_tracks(db: State<Db>) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let sql = format!("SELECT {} FROM track ORDER BY date_added DESC", track_cols("track"));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_track)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Build an FTS5 MATCH expression from a free-text query (prefix tokens).
fn fts_query(q: &str) -> String {
    q.split_whitespace()
        .map(|t| t.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|t| !t.is_empty())
        .map(|t| format!("{t}*"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// RF-03 / F5: full-text search via FTS5, falling back to LIKE.
#[tauri::command]
pub fn search_library(db: State<Db>, query: String) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let q = query.trim();
    let match_expr = fts_query(q);

    if !match_expr.is_empty() {
        let sql = format!(
            "SELECT {} FROM track WHERE id IN (SELECT rowid FROM track_fts WHERE track_fts MATCH ?1) ORDER BY title",
            track_cols("track")
        );
        let fts: rusqlite::Result<Vec<Track>> = (|| {
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([match_expr.as_str()], map_track)?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })();
        if let Ok(rows) = fts {
            if !rows.is_empty() {
                return Ok(rows);
            }
        }
    }

    // Fallback: LIKE (also covers punctuation-only queries and empty FTS index).
    let like = format!("%{q}%");
    let sql = format!(
        "SELECT {} FROM track WHERE title LIKE ?1 OR genre LIKE ?1 ORDER BY title",
        track_cols("track")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([like], map_track)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// RF-03: albums grid.
#[tauri::command]
pub fn list_albums(db: State<Db>) -> AppResult<Vec<AlbumCard>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT al.id, al.title, al.year, al.cover_path, ar.name, COUNT(t.id)
         FROM album al
         LEFT JOIN artist ar ON ar.id = al.artist_id
         LEFT JOIN track t ON t.album_id = al.id
         GROUP BY al.id ORDER BY al.title",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(AlbumCard {
            id: r.get(0)?, title: r.get(1)?, year: r.get(2)?, cover_path: r.get(3)?,
            artist_name: r.get(4)?, track_count: r.get(5)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// RF-03: tracks of one album (ordered by disc/track number).
#[tauri::command]
pub fn album_tracks(db: State<Db>, album_id: i64) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let sql = format!(
        "SELECT {} FROM track WHERE album_id = ?1
         ORDER BY IFNULL(disc_no,1), IFNULL(track_no,9999), title",
        track_cols("track")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([album_id], map_track)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Find or create an artist by name, returning its id.
fn artist_id_for(conn: &rusqlite::Connection, name: &str) -> AppResult<i64> {
    if let Ok(id) = conn.query_row("SELECT id FROM artist WHERE name = ?1", [name], |r| r.get::<_, i64>(0)) {
        return Ok(id);
    }
    conn.execute("INSERT INTO artist (name) VALUES (?1)", [name])?;
    Ok(conn.last_insert_rowid())
}

/// RF-05: edit an album — title, year and/or its artist (by name). Blank fields
/// are left unchanged.
#[tauri::command]
pub fn update_album(
    db: State<Db>,
    album_id: i64,
    title: Option<String>,
    year: Option<i64>,
    artist: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let title = title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    let artist_id = match artist.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => Some(artist_id_for(&conn, name)?),
        None => None,
    };
    conn.execute(
        "UPDATE album SET
           title     = COALESCE(?2, title),
           year      = COALESCE(?3, year),
           artist_id = COALESCE(?4, artist_id)
         WHERE id = ?1",
        rusqlite::params![album_id, title, year, artist_id],
    )?;
    let _ = reindex(&conn);
    Ok(())
}

/// RF-05: delete an album the user created by mistake. The tracks stay in the
/// library (their `album_id` is cleared by the ON DELETE SET NULL foreign key).
#[tauri::command]
pub fn delete_album(db: State<Db>, album_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM album WHERE id = ?1", [album_id])?;
    let _ = reindex(&conn);
    Ok(())
}

/// RF-05: rename an artist.
#[tauri::command]
pub fn rename_artist(db: State<Db>, artist_id: i64, name: String) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Other("O nome do artista não pode ficar vazio.".into()));
    }
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE artist SET name = ?2 WHERE id = ?1", rusqlite::params![artist_id, name])?;
    let _ = reindex(&conn);
    Ok(())
}

/// RF-05: delete an artist. Albums/tracks stay (their link is cleared); the
/// track↔artist links cascade away.
#[tauri::command]
pub fn delete_artist(db: State<Db>, artist_id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM artist WHERE id = ?1", [artist_id])?;
    let _ = reindex(&conn);
    Ok(())
}

/// RF-03: artists list.
#[tauri::command]
pub fn list_artists(db: State<Db>) -> AppResult<Vec<Artist>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT ar.id, ar.name, COUNT(DISTINCT al.id)
         FROM artist ar LEFT JOIN album al ON al.artist_id = ar.id
         GROUP BY ar.id ORDER BY ar.name",
    )?;
    let rows = stmt
        .query_map([], |r| Ok(Artist { id: r.get(0)?, name: r.get(1)?, album_count: r.get(2)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
