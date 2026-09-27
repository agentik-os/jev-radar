// Round 4 of the false-404 fix (2026-09-27): a Workflow status that cannot be read is not an ended pass.
// Before, status() answered "unknown" both for a missing instance and for a failed wf.get()/inst.status(); acquire() took an
// "unknown" lease over after LEASE_GRACE and the runs fallback marked the live pass failed, so one Workflows API error during
// a full pass started a second one. Each test below fails on that code.
// Run: node --test test/lease-status.test.mjs   (esbuild bundles the sources; D1 is node:sqlite with the real migrations)
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stub = { name: "cf-stub", setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: path.join(root, "test/stubs/cloudflare-workers.mjs") })); } };
const load = async f => import("data:text/javascript;base64," + Buffer.from((await build({ entryPoints: [path.join(root, f)], bundle: true, format: "esm",
  platform: "neutral", write: false, logLevel: "silent", plugins: [stub], loader: { ".json": "json", ".txt": "text", ".html": "text", ".css": "text", ".md": "text" } })).outputFiles[0].text).toString("base64"));
const index = await load("src/index.ts");
const lease = await load("src/lease.ts");
console.warn = () => {}; // passStatus logs unreadable statuses

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(path.join(root, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(path.join(root, "migrations", f), "utf8"));
  }
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null, run: async () => { const r = db.prepare(sql).run(...args); await null; return { meta: { changes: Number(r.changes) } }; } });
  return { raw: db, DB: { prepare: sql => stmt(sql), batch: async l => { const o = []; for (const s of l) o.push(await s.run()); return o; } } };
}

// Workflows' real answer for a missing instance, read from the production Worker on 2026-09-27 (wrangler tail).
const NOT_FOUND = () => new Error("(instance.not_found) Instance not found");
/** Workflow binding fake. b[id]: a status string, an Error thrown by get(), or { statusThrows: Error } thrown by status().
 *  An id with no entry exists when this fake created it ("running"), and is not found otherwise. */
function workflows(b = {}) {
  const created = [], terminated = [];
  return { created, terminated, b, binding: {
    async create({ id }) { created.push(id); },
    async get(id) {
      const x = id in b ? b[id] : created.includes(id) ? "running" : NOT_FOUND();
      if (x instanceof Error) throw x;
      return { status: async () => { if (x && typeof x === "object") throw x.statusThrows; return { status: x }; }, terminate: async () => { terminated.push(id); } };
    } } };
}
const now = () => Math.floor(Date.now() / 1000);
/** A pass `id` of `mode` that started `age` seconds ago: its run row and, unless noLease, the lease row it took then. */
function pass(raw, id, age, { mode = "full", noLease = false } = {}) {
  const t = now() - age;
  raw.prepare("INSERT INTO runs(id, mode, trigger, started, status) VALUES (?, ?, 'cron', ?, 'running')").run(id, mode, t);
  if (!noLease) raw.prepare("INSERT INTO pass_lease(slug, mode, run_id, acquired, expires) VALUES (?, ?, ?, ?, ?)").run("agk", mode, id, t, t + lease.LEASE_TTL[mode]);
}
const run = (raw, id) => raw.prepare("SELECT status, error FROM runs WHERE id = ?").get(id);
const holder = (raw, mode = "full") => raw.prepare("SELECT run_id FROM pass_lease WHERE slug = ? AND mode = ?").get("agk", mode)?.run_id;
const start = (env, mode = "full", trigger = "cron") => index.startPass(env, mode, trigger);

test("passStatus tells a missing instance ('not-found') from a failed read ('error')", async () => {
  const wf = workflows({ a: "running", b: NOT_FOUND(), c: new Error("internal workflows error"), d: { statusThrows: new Error("Network connection lost.") },
    e: { statusThrows: NOT_FOUND() }, f: "unknown" });
  assert.deepEqual(await Promise.all(["a", "b", "c", "d", "e", "f"].map(id => lease.passStatus(wf.binding, id))), ["running", "not-found", "error", "error", "not-found", "unknown"]);
});

test("a Workflow read error keeps the lease held: the firing is skipped, the live pass untouched, and the next firing retries", async () => {
  for (const err of [new Error("internal workflows error"), { statusThrows: new Error("Network connection lost.") }]) {
    const { raw, DB } = d1();
    pass(raw, "P-live", 30 * 60); // 30 min into a full pass: past LEASE_GRACE, far from its timeout
    const wf = workflows({ "P-live": err });
    const env = { DB, RADAR_PASS: wf.binding };
    const r = await start(env);
    assert.equal(r.skipped, "pass running: P-live (error)");
    assert.equal(wf.created.length, 0, "no second pass");
    assert.equal(holder(raw), "P-live");
    assert.deepEqual({ ...run(raw, "P-live") }, { status: "running", error: null });
    // next firing: the read works again and the pass still runs, then it has completed
    wf.b["P-live"] = "running";
    assert.equal((await start(env)).skipped, "pass running: P-live (running)");
    wf.b["P-live"] = "complete";
    assert.ok((await start(env)).id);
    assert.equal(wf.created.length, 1);
    assert.deepEqual({ ...run(raw, "P-live") }, { status: "complete", error: null });
  }
});

test("a missing instance frees the lease once LEASE_GRACE has passed, not before", async () => {
  const { raw, DB } = d1();
  pass(raw, "P-gone", 60); // its instance may not be created yet
  const wf = workflows();
  const env = { DB, RADAR_PASS: wf.binding };
  assert.equal((await start(env)).skipped, "pass running: P-gone (not-found)");
  raw.prepare("UPDATE pass_lease SET acquired = acquired - ?").run(lease.LEASE_GRACE);
  raw.prepare("UPDATE runs SET started = started - ? WHERE id = 'P-gone'").run(lease.LEASE_GRACE);
  const r = await start(env);
  assert.ok(r.id);
  assert.equal(holder(raw), r.id);
  assert.deepEqual({ ...run(raw, "P-gone") }, { status: "failed", error: "ended: Workflow instance not found" });
});

test("a terminal Workflow status frees the lease at once; the Workflow's own 'unknown' does not", async () => {
  {
    const { raw, DB } = d1();
    pass(raw, "P-unk", 30 * 60);
    const wf = workflows({ "P-unk": "unknown" });
    assert.equal((await start({ DB, RADAR_PASS: wf.binding })).skipped, "pass running: P-unk (unknown)");
    assert.equal(wf.created.length, 0);
    assert.deepEqual({ ...run(raw, "P-unk") }, { status: "running", error: null });
  }
  for (const st of ["complete", "errored", "terminated"]) {
    const { raw, DB } = d1();
    pass(raw, "P-end", 60);
    const wf = workflows({ "P-end": st });
    const r = await start({ DB, RADAR_PASS: wf.binding });
    assert.ok(r.id, st);
    assert.equal(holder(raw), r.id);
    assert.deepEqual({ ...run(raw, "P-end") }, st === "complete" ? { status: "complete", error: null } : { status: "failed", error: `ended: Workflow status ${st}` });
  }
});

test("after the timeout the lease is free even when the status cannot be read, and a pass stuck in 'running' is terminated", async () => {
  for (const [st, terminated] of [["running", ["P-old"]], ["waiting", ["P-old"]], [new Error("internal workflows error"), []]]) {
    const { raw, DB } = d1();
    pass(raw, "P-old", lease.LEASE_TTL.full + 60);
    const wf = workflows({ "P-old": st });
    const r = await start({ DB, RADAR_PASS: wf.binding });
    assert.ok(r.id, String(st));
    assert.equal(holder(raw), r.id);
    assert.deepEqual(wf.terminated, terminated, "a stuck pass is stopped so two never overlap");
    const shown = st instanceof Error ? "error" : st;
    assert.deepEqual({ ...run(raw, "P-old") }, { status: "failed", error: `timed out: no end after 240 min (Workflow status ${shown})` });
  }
  // a fast pass times out after 45 min
  const { raw, DB } = d1();
  pass(raw, "F-old", lease.LEASE_TTL.fast + 60, { mode: "fast" });
  const wf = workflows({ "F-old": "running" });
  assert.ok((await start({ DB, RADAR_PASS: wf.binding }, "fast")).id);
  assert.deepEqual(wf.terminated, ["F-old"]);
});

test("the runs fallback never marks a run failed on a read error or 'unknown' while its lease is valid", async () => {
  for (const st of [new Error("internal workflows error"), { statusThrows: new Error("Network connection lost.") }, "unknown"]) {
    const { raw, DB } = d1();
    pass(raw, "P-nolease", 30 * 60, { noLease: true }); // a pass whose lease row is gone (or one started before leases existed)
    const wf = workflows({ "P-nolease": st });
    const r = await start({ DB, RADAR_PASS: wf.binding });
    assert.match(r.skipped, /^pass running: P-nolease \((error|unknown)\)$/);
    assert.equal(wf.created.length, 0);
    assert.deepEqual({ ...run(raw, "P-nolease") }, { status: "running", error: null });
    assert.equal(holder(raw), undefined, "the firing gives back the lease it took");
  }
  assert.equal(lease.openRunVerdict("error", lease.LEASE_TTL.full - 1, "full"), null);
  assert.equal(lease.openRunVerdict("unknown", lease.LEASE_TTL.full - 1, "full"), null);
  assert.equal(lease.openRunVerdict("running", lease.LEASE_TTL.full - 1, "full"), null);
  assert.equal(lease.openRunVerdict("not-found", lease.LEASE_GRACE - 1, "full"), null);
  assert.equal(lease.openRunVerdict("error", lease.LEASE_TTL.full, "full").close, "failed");
});
