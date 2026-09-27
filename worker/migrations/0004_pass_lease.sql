-- One pass per mode at a time (round 3 of the false-404 fix, 2026-09-27). startPass read the runs table and wrote its run
-- row afterwards, so two cron firings of the same minute (the ':07' full cron and a fast firing that finds a full pass
-- owed) could both start a full pass, as the radar-ops Worker did (marketing 16:47:56). A pass now starts only after it
-- takes this row in one atomic statement; the pass deletes it when it ends, and a row whose pass has ended (Workflow
-- status) or whose `expires` is past can be taken over (src/lease.ts). `slug` is always 'agk' here.
CREATE TABLE IF NOT EXISTS pass_lease (
  slug TEXT NOT NULL, mode TEXT NOT NULL, run_id TEXT NOT NULL, acquired INTEGER NOT NULL, expires INTEGER NOT NULL,
  PRIMARY KEY (slug, mode)
);
