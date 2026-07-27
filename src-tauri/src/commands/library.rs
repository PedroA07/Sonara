use crate::db::Db;
use crate::error::AppResult;
use crate::models::{AlbumCard, Artist, Track};
use tauri::State;

pub(crate) fn map_track(r: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: r.get(0)?, title: r.get(1)?, file_path: r.get(2)?, duration: r.get(3)?,
        track_no: r.get(4)?, disc_no: r.get(5)?, year: r.get(6)?, genre: r.get(7)?,
        album_id: r.get(8)?, bitrate: r.get(9)?, format: r.get(10)?, gain: r.get(11)?,
        cover_path: r.get(12)?,
    })
}

// The track's cover comes from its album (tracks have no cover column of their
// own). A correlated subquery keeps every `FROM track` query working unchanged.
pub(crate) const TRACK_COLS: &str =
    "id, title, file_path, duration, track_no, disc_no, year, genre, album_id, bitrate, format, gain, \
     COALESCE(track.cover_path, (SELECT cover_path FROM album WHERE album.id = track.album_id)) AS cover_path";

/// RF-03: list all tracks.
#[tauri::command]
pub fn list_tracks(db: State<Db>) -> AppResult<Vec<Track>> {
    let conn = db.0.lock().unwrap();
    let sql = format!("SELECT {TRACK_COLS} FROM track ORDER BY date_added DESC");
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
            "SELECT {TRACK_COLS} FROM track              WHERE id IN (SELECT rowid FROM track_fts WHERE track_fts MATCH ?1) ORDER BY title"
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
    let sql = format!("SELECT {TRACK_COLS} FROM track WHERE title LIKE ?1 OR genre LIKE ?1 ORDER BY title");
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
        "SELECT {TRACK_COLS} FROM track WHERE album_id = ?1
         ORDER BY IFNULL(disc_no,1), IFNULL(track_no,9999), title"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([album_id], map_track)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
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
