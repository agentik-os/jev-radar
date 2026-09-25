-- AGK Radar on D1. Raw fxtwitter posts, crawl state, AGK Intelligence classifications and the run log.
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,              -- X status id
  author TEXT NOT NULL DEFAULT '',  -- lower-case screen name
  created INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  cls_key TEXT,                     -- classification cache key of the current content (see radar.stateKey)
  raw TEXT NOT NULL,                -- the fxtwitter status object, JSON
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created);
CREATE INDEX IF NOT EXISTS posts_views ON posts(views);
CREATE INDEX IF NOT EXISTS posts_cls ON posts(cls_key);

-- AGK Intelligence answers, keyed by content (identical content is classified once)
CREATE TABLE IF NOT EXISTS cls_cache (
  key TEXT PRIMARY KEY,
  answers TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  k TEXT PRIMARY KEY,               -- lower-case handle
  handle TEXT NOT NULL,
  last_checked INTEGER NOT NULL DEFAULT 0,
  posts INTEGER NOT NULL DEFAULT 0, -- tracked posts by this account
  failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS accounts_checked ON accounts(last_checked);

CREATE TABLE IF NOT EXISTS seen_ids (id TEXT PRIMARY KEY, ts INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS transcripts (video_id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS niche_history (ts REAL PRIMARY KEY, ranks TEXT NOT NULL, scores TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS ideas_eval (k TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS replied (target TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

-- one row per pass (Workflow instance)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  trigger TEXT NOT NULL,            -- cron expression, 'manual' or 'import'
  started INTEGER NOT NULL,
  finished INTEGER,
  status TEXT NOT NULL,             -- running | complete | skipped | failed
  stats TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS runs_started ON runs(started);

-- every AGK Intelligence call: parallelism and provider status evidence
CREATE TABLE IF NOT EXISTS ai_calls (
  run_id TEXT, ts INTEGER, purpose TEXT, status INTEGER, attempts INTEGER, inflight INTEGER, ms INTEGER, tokens INTEGER
);
CREATE INDEX IF NOT EXISTS ai_calls_run ON ai_calls(run_id);

-- videos found in tracked posts (for transcription)
CREATE TABLE IF NOT EXISTS videos (
  video_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  url TEXT NOT NULL,                -- smallest mp4 rendition
  duration REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_post ON videos(post_id);
