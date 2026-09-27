// One pass per mode at a time (round 3 of the false-404 fix, 2026-09-27; same code as radar-ops). Before this, startPass checked the
// runs table and then wrote its run row, so two cron firings of the same minute could both find no running pass and both
// start one: marketing 16:47:56 ran two full passes, from '47 * * * *' and from a '2-59/5' firing that found a full pass
// owed. A pass now starts only after it takes the radar's lease row in one atomic D1 statement (migration 0004); the
// pass deletes the row when it ends (workflow.ts), and a row can be taken over when its pass has ended by Workflow status
// (a pass killed without cleaning up) or when it has expired (the timeout).

/** Lease timeouts: longer than any pass seen (full passes ran up to about 70 min plus up to 30 min of publishing). */
export const LEASE_TTL = { full: 4 * 3600, fast: 45 * 60 } as const;
/** A lease younger than this is never taken over on an unknown Workflow status: its pass may not be created yet. */
export const LEASE_GRACE = 5 * 60;
const ENDED = ["complete", "errored", "terminated"];

export type Lease = { slug: string; mode: string; run_id: string; acquired: number; expires: number };

/** Takes the lease of (slug, mode) for run `id` when it is free or expired, in one statement. true: taken. */
export async function takeLease(db: D1Database, slug: string, mode: "full" | "fast", id: string, t: number): Promise<boolean> {
  const r = await db.prepare(`INSERT INTO pass_lease(slug, mode, run_id, acquired, expires) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(slug, mode) DO UPDATE SET run_id = excluded.run_id, acquired = excluded.acquired, expires = excluded.expires
    WHERE pass_lease.expires <= excluded.acquired`).bind(slug, mode, id, t, t + LEASE_TTL[mode]).run();
  return (r?.meta?.changes ?? 0) > 0;
}

/** Takes over the lease from `holder` (compare-and-swap on its run id). true: taken. */
export async function stealLease(db: D1Database, slug: string, mode: "full" | "fast", holder: string, id: string, t: number): Promise<boolean> {
  const r = await db.prepare("UPDATE pass_lease SET run_id = ?, acquired = ?, expires = ? WHERE slug = ? AND mode = ? AND run_id = ?")
    .bind(id, t, t + LEASE_TTL[mode], slug, mode, holder).run();
  return (r?.meta?.changes ?? 0) > 0;
}

export function releaseLease(db: D1Database, slug: string, mode: string, id: string) {
  return db.prepare("DELETE FROM pass_lease WHERE slug = ? AND mode = ? AND run_id = ?").bind(slug, mode, id);
}

/** Acquires the lease for a new pass `id`. `status` returns the Workflow status of a run id ("unknown" when there is no
 *  instance). Returns null when acquired, or the reason the pass must not start ("pass running: <holder> (<status>)"). */
export async function acquire(db: D1Database, slug: string, mode: "full" | "fast", id: string, t: number, status: (runId: string) => Promise<string>): Promise<string | null> {
  if (await takeLease(db, slug, mode, id, t)) return null;
  const cur = await db.prepare("SELECT * FROM pass_lease WHERE slug = ? AND mode = ?").bind(slug, mode).first<Lease>();
  if (!cur) return (await takeLease(db, slug, mode, id, t)) ? null : "pass running: lease taken meanwhile";
  const st = await status(cur.run_id);
  const ended = ENDED.includes(st) || (st === "unknown" && t - cur.acquired >= LEASE_GRACE);
  if (ended && await stealLease(db, slug, mode, cur.run_id, id, t)) return null;
  return `pass running: ${cur.run_id} (${ended ? "taken over meanwhile" : st})`;
}
