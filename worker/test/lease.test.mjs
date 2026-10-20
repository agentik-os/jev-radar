// Round 3 of the false-404 fix (2026-09-27): one pass per mode at a time. Two firings of the same minute (the ':07' full
// cron and a fast firing that finds a full pass owed) must start one full pass; the other is logged "pass running".
// Run: node --test test/lease.test.mjs   (esbuild bundles src/index.ts; D1 is node:sqlite with the real migrations)
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

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(path.join(root, "migrations")).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(path.join(root, "migrations", f), "utf8"));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null, run: async () => { const r = db.prepare(sql).run(...args); await null; return { meta: { changes: Number(r.changes) } }; } });
  return { raw: db, DB: { prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); return []; } } };
}
function workflows(st = {}) {
  const created = [];
  return { created, binding: { async create({ id }) { created.push(id); }, async get(id) { if (!created.includes(id) && !(id in st)) throw new Error("(instance.not_found) Instance not found");
    return { status: async () => ({ status: st[id] ?? "running" }) }; } } };
}

test("two firings of the same minute start one full pass; the other is logged 'pass running'", async () => {
  const { raw, DB } = d1();
  const wf = workflows();
  const env = { DB, RADAR_PASS: wf.binding };
  const [a, b] = await Promise.all([index.startPass(env, "full", "7 * * * *"), index.startPass(env, "full", "2-59/10 * * * * (full owed: no full pass for 60 min)")]);
  assert.equal(wf.created.length, 1);
  assert.match([a, b].find(x => x.skipped).skipped, /^pass running: full-/);
  assert.deepEqual(raw.prepare("SELECT status FROM runs ORDER BY status").all().map(r => r.status), ["running", "skipped"]);
  assert.ok((await index.startPass(env, "fast", "2-59/10 * * * *")).id, "the fast lease is separate");
});

test("a released, ended or expired lease is free; a young one with no instance yet is not", async () => {
  const { raw, DB } = d1();
  const st = {};
  const wf = workflows(st);
  const env = { DB, RADAR_PASS: wf.binding };
  const first = await index.startPass(env, "full", "7 * * * *");
  await lease.releaseLease(DB, "agk", "full", first.id).run();
  raw.prepare("UPDATE runs SET status = 'complete' WHERE id = ?").run(first.id);
  const second = await index.startPass(env, "full", "7 * * * *");
  assert.ok(second.id);
  st[second.id] = "terminated";
  assert.ok((await index.startPass(env, "full", "manual")).id);
  const T = 1790600000;
  raw.prepare("DELETE FROM pass_lease").run();
  assert.equal(await lease.acquire(DB, "agk", "full", "a", T, async () => "not-found"), null);
  assert.equal(await lease.acquire(DB, "agk", "full", "b", T + 60, async () => "not-found"), "pass running: a (not-found)");
  assert.equal(await lease.acquire(DB, "agk", "full", "c", T + lease.LEASE_TTL.full, async () => "running"), null, "expired");
});
