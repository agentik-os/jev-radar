-- The failure flag holds confirmed failures only (2026-09-27, round 2 of the false-404 fix). The confirmation rule went
-- live at 12:05:08 UTC (agk-radar version be1c3636, epoch 1790510708); before it every 404 set the flag, and fxtwitter
-- answered 404 for live accounts on up to a third of its reads. A full pass writes last_checked with the flag, so a flag
-- whose last_checked is before the rule was set by the old rule and is cleared. (A fast pass sets the flag without moving
-- last_checked, so a flag it confirmed after the rule on an account last read before it is cleared too; the next confirmed
-- look sets it again. The flag is informational: AGK Radar reads every account either way.)
UPDATE accounts SET failed = 0 WHERE failed != 0 AND last_checked < 1790510708;
