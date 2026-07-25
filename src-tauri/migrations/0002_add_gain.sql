-- F3: per-track ReplayGain (linear multiplier) parsed from tags.
ALTER TABLE track ADD COLUMN gain REAL;
