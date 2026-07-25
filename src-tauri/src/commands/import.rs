use crate::db::Db;
use crate::error::AppResult;
use crate::models::{ImportSuggestion, ParsedTrack};
use crate::services::metadata;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use walkdir::WalkDir;

/// RF-02: scan a dropped/pasted folder and suggest how to import it.
#[tauri::command]
pub fn scan_folder(path: String) -> AppResult<ImportSuggestion> {
    let root = PathBuf::from(&path);
    let mut count = 0usize;
    let mut max_depth = 0u32;
    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() && metadata::is_audio_file(entry.path()) {
            max_depth = max_depth.max(entry.depth() as u32);
            count += 1;
        }
    }
    let (pattern, message) = classify_pattern(max_depth, count);
    Ok(ImportSuggestion { root_path: path, pattern: pattern.into(), depth: max_depth, track_count: count, message })
}

fn classify_pattern(max_depth: u32, count: usize) -> (&'static str, String) {
    match max_depth {
        0 | 1 => ("album", format!("{count} faixas em um nível: sugerir a pasta como Álbum.")),
        2 => ("artist_album", format!("{count} faixas em 2 níveis: pasta-mãe = Artista, subpastas = Álbuns.")),
        _ => ("artist_album_disc", format!("{count} faixas em 3+ níveis: níveis extras como discos (CD1/CD2).")),
    }
}

/// List all audio file paths under a folder (used after the user confirms).
#[tauri::command]
pub fn list_audio_files(path: String) -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() && metadata::is_audio_file(entry.path()) {
            out.push(entry.path().to_string_lossy().to_string());
        }
    }
    Ok(out)
}

/// RF-01: parse a batch of files into tag structs.
#[tauri::command]
pub fn parse_files(paths: Vec<String>) -> AppResult<Vec<ParsedTrack>> {
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        if let Ok(parsed) = metadata::parse_file(Path::new(&p)) {
            out.push(parsed);
        }
    }
    Ok(out)
}

fn folder_name(p: &Path, up: usize) -> Option<String> {
    let mut cur = p.parent()?;
    for _ in 0..up {
        cur = cur.parent()?;
    }
    cur.file_name().map(|s| s.to_string_lossy().to_string())
}

/// Decide (artist, album) for a track given the chosen strategy (RF-02).
/// strategy: "follow" | "ignore_parent" | "tracks_only"
fn resolve_names(t: &ParsedTrack, strategy: &str) -> (Option<String>, Option<String>) {
    let path = Path::new(&t.file_path);
    let parent = folder_name(path, 0); // immediate folder
    let grandparent = folder_name(path, 1);
    let tag_artist = t.album_artist.clone().or_else(|| t.artist.clone());
    match strategy {
        "follow" => (grandparent.or(tag_artist), parent.or_else(|| t.album.clone())),
        "ignore_parent" => (tag_artist, parent.or_else(|| t.album.clone())),
        _ /* tracks_only */ => (tag_artist, t.album.clone()),
    }
}

fn get_or_create_artist(tx: &rusqlite::Transaction, name: &str) -> AppResult<i64> {
    if let Ok(id) = tx.query_row("SELECT id FROM artist WHERE name = ?1", [name], |r| r.get::<_, i64>(0)) {
        return Ok(id);
    }
    tx.execute("INSERT INTO artist (name) VALUES (?1)", [name])?;
    Ok(tx.last_insert_rowid())
}

fn get_or_create_album(
    tx: &rusqlite::Transaction, title: &str, artist_id: Option<i64>, year: Option<i64>, genre: Option<&str>,
) -> AppResult<i64> {
    if let Ok(id) = tx.query_row(
        "SELECT id FROM album WHERE title = ?1 AND IFNULL(artist_id,0) = IFNULL(?2,0)",
        rusqlite::params![title, artist_id], |r| r.get::<_, i64>(0),
    ) {
        return Ok(id);
    }
    tx.execute(
        "INSERT INTO album (title, artist_id, year, genre) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![title, artist_id, year, genre],
    )?;
    Ok(tx.last_insert_rowid())
}

/// RF-01/RF-02: persist parsed tracks, linking artist + album per the strategy.
#[tauri::command]
pub fn import_with_strategy(app: tauri::AppHandle, db: State<Db>, tracks: Vec<ParsedTrack>, strategy: String) -> AppResult<usize> {
    let covers_dir = app.path().app_data_dir().ok().map(|d| d.join("covers"));

    let mut conn = db.0.lock().unwrap();
    let tx = conn.transaction()?;
    let mut inserted = 0usize;

    for t in &tracks {
        let (artist_name, album_name) = resolve_names(t, &strategy);
        let artist_id = match &artist_name {
            Some(n) if !n.is_empty() => Some(get_or_create_artist(&tx, n)?),
            _ => None,
        };
        let album_id = match &album_name {
            Some(n) if !n.is_empty() => Some(get_or_create_album(&tx, n, artist_id, t.year, t.genre.as_deref())?),
            _ => None,
        };

        // Extract embedded cover once per album (RF-05 display).
        if let (Some(aid), Some(dir), true) = (album_id, covers_dir.as_ref(), t.has_cover) {
            let existing: Option<String> =
                tx.query_row("SELECT cover_path FROM album WHERE id = ?1", [aid], |r| r.get(0)).ok().flatten();
            if existing.is_none() {
                if let Some(cover) = metadata::extract_cover_to(Path::new(&t.file_path), dir, &format!("album_{aid}")) {
                    tx.execute("UPDATE album SET cover_path = ?1 WHERE id = ?2", rusqlite::params![cover, aid])?;
                }
            }
        }

        let n = tx.execute(
            "INSERT OR IGNORE INTO track
             (title, file_path, duration, track_no, disc_no, year, genre, album_id, bitrate, format, gain)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![
                t.title.clone().unwrap_or_else(|| "Sem título".into()),
                t.file_path, t.duration, t.track_no, t.disc_no, t.year, t.genre, album_id, t.bitrate, t.format, t.gain
            ],
        )?;
        if n > 0 {
            let track_id = tx.last_insert_rowid();
            if let Some(aid) = artist_id {
                tx.execute("INSERT OR IGNORE INTO track_artist (track_id, artist_id) VALUES (?1, ?2)",
                    rusqlite::params![track_id, aid])?;
            }
            inserted += 1;
        }
    }
    tx.commit()?;
    let _ = crate::commands::search::reindex(&conn);
    Ok(inserted)
}
