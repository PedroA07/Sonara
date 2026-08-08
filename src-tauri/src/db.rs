use crate::error::AppResult;
use rusqlite::Connection;
use std::sync::Mutex;

/// Managed database handle shared across Tauri commands.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &std::path::Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        Ok(Db(Mutex::new(conn)))
    }

    /// Versioned migration runner using PRAGMA user_version.
    pub fn migrate(&self) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        let mut version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

        if version < 1 {
            conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
            conn.pragma_update(None, "user_version", 1)?;
            version = 1;
        }
        if version < 2 {
            conn.execute_batch(include_str!("../migrations/0002_add_gain.sql"))?;
            conn.pragma_update(None, "user_version", 2)?;
        }
        if version < 3 {
            conn.execute_batch(include_str!("../migrations/0003_fts.sql"))?;
            conn.pragma_update(None, "user_version", 3)?;
        }
        if version < 4 {
            conn.execute_batch(include_str!("../migrations/0004_track_cover.sql"))?;
            conn.pragma_update(None, "user_version", 4)?;
        }
        if version < 5 {
            conn.execute_batch(include_str!("../migrations/0005_download_details.sql"))?;
            conn.pragma_update(None, "user_version", 5)?;
        }
        if version < 6 {
            conn.execute_batch(include_str!("../migrations/0006_lyrics.sql"))?;
            conn.pragma_update(None, "user_version", 6)?;
        }
        Ok(())
    }
}
