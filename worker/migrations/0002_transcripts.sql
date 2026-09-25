-- Transcription outcomes (fix round 2): an empty transcript must be proven, errors are retried across passes.
ALTER TABLE transcripts ADD COLUMN status TEXT;             -- ok | no_audio | no_speech | failed; NULL = stored before this rule
ALTER TABLE videos ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;  -- passes that failed to transcribe it
ALTER TABLE videos ADD COLUMN last_error TEXT;
