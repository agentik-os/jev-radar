// One pass per mode at a time (round 3 of the false-404 fix, 2026-09-27; same code as radar-ops). Before this, startPass checked the
// runs table and then wrote its run row, so two cron firings of the same minute could both find no running pass and both
// start one: marketing 16:47:56 ran two full passes, from '47 * * * *' and from a '2-59/5' firing that found a full pass
// owed. A pass now starts only after it takes the radar's lease row in one atomic D1 statement (migration 0004); the
// pass deletes the row when it ends (workflow.ts), and a row can be taken over when its pass has ended by Workflow status
// (a pass killed without cleaning up) or when it has expired (the timeout).
// Round 4 (2026-09-27): a Workflow status that cannot be read is not an ended pass. status() used to answer "unknown"
// both when the instance did not exist and when wf.get() or inst.status() threw, and acquire() took an "unknown" lease over
// after 5 minutes: one Workflows API error during a 60-70 min full pass started a second one, and the runs fallback marked
// the live pass failed. Now only a confirmed "not-found" or a terminal status frees a lease before its timeout; a read error
// ("error") or the Workflow's own "unknown" keeps it held, and the firing is skipped and retried at the next one.

/** Lease timeouts: longer than any pass seen (full passes ran up to about 70 min plus up to 30 min of publishing). */
export const LEASE_TTL = { full: 4 * 3600, fast: 45 * 60 } as const;
/** A lease younger than this is never taken over on a missing instance: its pass may not be created yet. */
export const LEASE_GRACE = 5 * 60;
/** Workflow statuses of a pass that has ended. */
export const TERMINAL = ["complete", "errored", "terminated"];
/** passStatus() answers: the instance does not exist / its status could not be read. */
export const NOT_FOUND = "not-found";
export const READ_ERROR = "error";

export type Lease = { slug: string; mode: string; run_id: string; acquired: number; expires: number };

/** The Workflow status of pass `runId`, or NOT_FOUND when Workflows says the instance does not exist
 *  ("(instance.not_found) Instance not found", seen in production 2026-09-27), or READ_ERROR when wf.get() or
 *  inst.status() failed any other way (an API error or a lost connection proves nothing about the pass). */
export async function passStatus(wf: Pick<Workflow, "get">, runId: string): Promise<string> {
  try {
    return String((await (await wf.get(runId)).status()).status);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/instance\.not_found/i.test(msg)) return NOT_FOUND;
    console.warn(`Workflow status of ${runId} unreadable: ${msg.slice(0, 200)}`);
    return READ_ERROR;
  }
}

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

/** Acquires the lease for a new pass `id`. `status` is passStatus() for a run id. Before its timeout, a lease is taken
 *  over only when its pass has ended: a terminal status, or NOT_FOUND once LEASE_GRACE has passed. READ_ERROR and the
 *  Workflow's own "unknown" keep it held. Returns null when acquired, or the reason the pass must not start
 *  ("pass running: <holder> (<status>)"). */
export async function acquire(db: D1Database, slug: string, mode: "full" | "fast", id: string, t: number, status: (runId: string) => Promise<string>): Promise<string | null> {
  if (await takeLease(db, slug, mode, id, t)) return null;
  const cur = await db.prepare("SELECT * FROM pass_lease WHERE slug = ? AND mode = ?").bind(slug, mode).first<Lease>();
  if (!cur) return (await takeLease(db, slug, mode, id, t)) ? null : "pass running: lease taken meanwhile";
  const st = await status(cur.run_id);
  const ended = TERMINAL.includes(st) || (st === NOT_FOUND && t - cur.acquired >= LEASE_GRACE);
  if (ended && await stealLease(db, slug, mode, cur.run_id, id, t)) return null;
  return `pass running: ${cur.run_id} (${ended ? "taken over meanwhile" : st})`;
}

/** What startPass does with a run row still 'running' once it holds the lease (a pass whose lease it took over, or one
 *  started before leases existed). null: the pass may still be running, so the firing is skipped. Otherwise the row is
 *  closed with `close` and `error`, and `terminate` asks Workflows to stop an instance that ran past its timeout (so two
 *  passes never overlap). A read error or "unknown" never closes a run younger than its lease timeout. */
export function openRunVerdict(st: string, age: number, mode: "full" | "fast"): { close: "complete" | "failed"; error: string | null; terminate: boolean } | null {
  if (st === "complete") return { close: "complete", error: null, terminate: false };
  if (TERMINAL.includes(st)) return { close: "failed", error: `ended: Workflow status ${st}`, terminate: false };
  if (age >= LEASE_TTL[mode]) return { close: "failed", error: `timed out: no end after ${Math.round(LEASE_TTL[mode] / 60)} min (Workflow status ${st})`, terminate: st !== NOT_FOUND };
  if (st === NOT_FOUND && age >= LEASE_GRACE) return { close: "failed", error: "ended: Workflow instance not found", terminate: false };
  return null;
}
