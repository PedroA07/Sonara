use crate::db::Db;
use crate::error::AppResult;
use std::collections::HashMap;
use tauri::{AppHandle, State};

/// Read all app settings as a key/value map (theme, crossfade, replaygain…).
#[tauri::command]
pub fn get_settings(db: State<Db>) -> AppResult<HashMap<String, String>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT key, value FROM setting")?;
    let mut map = HashMap::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

/// Paths the Settings screen shows before the user has picked anything, so
/// "Pasta de downloads" is never an empty field.
#[tauri::command]
pub fn default_paths(app: AppHandle) -> AppResult<HashMap<String, String>> {
    let mut map = HashMap::new();
    map.insert(
        "download_dir".to_string(),
        crate::commands::download::default_download_dir(&app).to_string_lossy().to_string(),
    );
    Ok(map)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO setting (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}
