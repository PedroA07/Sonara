-- Downloads used to store only url/status/progress, so the Downloads screen
-- could not show *what* was downloaded, why a job failed, or where the file
-- landed. These columns back the new Downloads screen (play, open folder,
-- retry, and a readable error message).
ALTER TABLE download_job ADD COLUMN title      TEXT;
ALTER TABLE download_job ADD COLUMN file_path  TEXT;
ALTER TABLE download_job ADD COLUMN error      TEXT;
ALTER TABLE download_job ADD COLUMN track_id   INTEGER;
ALTER TABLE download_job ADD COLUMN finished_at TEXT;

CREATE INDEX IF NOT EXISTS idx_download_job_created ON download_job(created_at DESC);

-- Jobs still marked "running" belong to a previous session whose process died
-- with the app; nothing is watching them any more.
UPDATE download_job
   SET status = 'error',
       error  = 'Interrompido ao fechar o app'
 WHERE status IN ('running', 'pending');
