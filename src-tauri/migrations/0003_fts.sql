-- F5: rebuildable full-text search over the library.
-- Recreate as a standard FTS5 table (supports DELETE and explicit rowid = track.id).
DROP TABLE IF EXISTS track_fts;
CREATE VIRTUAL TABLE track_fts USING fts5(title, album, artist, genre);
