-- Per-track cover art. Previously a track's cover came only from its album,
-- so album-less tracks (loose files, downloads) could not store one. A
-- track-level cover_path takes precedence over the album cover when set.
ALTER TABLE track ADD COLUMN cover_path TEXT;
