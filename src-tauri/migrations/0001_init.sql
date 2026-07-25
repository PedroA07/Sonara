-- Sonara initial schema (F0). Mirrors the data model in the PRD (section 4).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artist (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_name  TEXT,
  image_path TEXT,
  bio        TEXT
);

CREATE TABLE IF NOT EXISTS album (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  year       INTEGER,
  cover_path TEXT,
  artist_id  INTEGER REFERENCES artist(id) ON DELETE SET NULL,
  genre      TEXT,
  disc_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS track (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  file_path  TEXT NOT NULL UNIQUE,
  duration   REAL,
  track_no   INTEGER,
  disc_no    INTEGER,
  year       INTEGER,
  genre      TEXT,
  album_id   INTEGER REFERENCES album(id) ON DELETE SET NULL,
  bitrate    INTEGER,
  format     TEXT,
  date_added TEXT DEFAULT (datetime('now'))
);

-- many-to-many: track <-> artist
CREATE TABLE IF NOT EXISTS track_artist (
  track_id  INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, artist_id)
);

CREATE TABLE IF NOT EXISTS playlist (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  cover_path      TEXT,
  description     TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  sort_mode       TEXT DEFAULT 'custom',
  is_custom_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS playlist_item (
  id          INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_item (
  id       INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source   TEXT,
  played   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS download_job (
  id         INTEGER PRIMARY KEY,
  url        TEXT,           -- link or search query
  type       TEXT NOT NULL,  -- 'video' | 'playlist' | 'search'
  status     TEXT NOT NULL DEFAULT 'pending',
  progress   REAL DEFAULT 0,
  dest_kind  TEXT,           -- 'library' | 'playlist' | 'album' | 'queue'
  dest_id    INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Full text search over the library (RF-03 / NFR search)
CREATE VIRTUAL TABLE IF NOT EXISTS track_fts USING fts5(
  title, album, artist, genre, content=''
);

CREATE INDEX IF NOT EXISTS idx_track_album ON track(album_id);
CREATE INDEX IF NOT EXISTS idx_album_artist ON album(artist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item ON playlist_item(playlist_id, position);
