// Failure accounting after fxtwitter's false 404s (2026-09-27): a 404 or an empty timeline sets the failure flag (and moves
// last_checked) only when a second look confirms it; unconfirmed, it writes nothing, like throttling.
// Run: node --test test/confirm.test.mjs   (bundles src/crawl.ts with esbuild; fetch and D1 are faked, timers run at once)
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const load = async f => import("data:text/javascript;base64," + Buffer.from((await build({ entryPoints: [path.join(root, f)], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" })).outputFiles[0].text).toString("base64"));
const crawl = await load("src/crawl.ts");
const fx = await load("src/fx.ts");

globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0; };
function fakeFx(script, calls = []) {
  globalThis.fetch = async (url) => {
    calls.push(url);
    const q = script[url] || [[404, { code: 404 }]];
    const [status, body] = q.length > 1 ? q.shift() : q[0];
    return new Response(JSON.stringify(body), { status });
  };
}
function fakeDb() {
  const writes = [];
  const stmt = (sql) => ({ sql, args: [], bind(...a) { return { ...this, args: a }; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { writes.push(this); return {}; } });
  return { writes, prepare: stmt, async batch(list) { writes.push(...list); return []; } };
}
const TL = h => `https://api.fxtwitter.com/2/profile/${h}/statuses`;
const PR = h => `https://api.fxtwitter.com/2/profile/${h}`;
const V1 = h => `https://api.fxtwitter.com/${h}`;
const NF = { code: 404, message: "User not found" };
const w = (db, k) => db.writes.filter(s => s.args.includes(k)).map(s => ({ sql: s.sql.replace(/\s+/g, " "), args: s.args }));

test("verdict is the radars' rule", () => {
  assert.equal(fx.verdict({ tl: "404", pr: ["user"] }), "live");
  assert.equal(fx.verdict({ tl: "404", pr: ["404", "404", "404"] }), "gone");
  assert.equal(fx.verdict({ tl: "empty", pr: ["404", "404", "404"] }), "gone");
  assert.equal(fx.verdict({ tl: "404", pr: ["404", "404"] }), "unsure");
  assert.equal(fx.verdict({ tl: "404", pr: ["404", "other"] }), "unsure");
});

test("the look reads /2/profile, then /<handle>, then /2/profile, and stops at the first answer", async () => {
  const calls = [];
  fakeFx({ [TL("renamed")]: [[404, { code: 404 }]] }, calls);
  assert.deepEqual(await fx.lookAgain("renamed", undefined, 0), { tl: "404", pr: ["404", "404", "404"] });
  assert.deepEqual(calls, [TL("renamed"), PR("renamed"), V1("renamed"), PR("renamed")]);
  const c2 = [];
  fakeFx({ [TL("makerio_io")]: [[200, { code: 200, results: [] }]], [PR("makerio_io")]: [[404, NF]], [V1("makerio_io")]: [[200, { code: 200, user: { screen_name: "makerio_io" } }]] }, c2);
  assert.deepEqual(await fx.lookAgain("makerio_io", undefined, 0), { tl: "empty", pr: ["404", "user"] });
  assert.equal(c2.length, 3);
});

for (const mode of ["full", "fast"]) {
  test(`${mode}: a false 404 writes nothing (the account stays due, or new)`, async () => {
    fakeFx({ [TL("karpathy")]: [[404, { code: 404, results: [] }], [404, { code: 404, results: [] }], [404, { code: 404, results: [] }]], [PR("karpathy")]: [[200, { code: 200, user: { screen_name: "karpathy" } }]] });
    const db = fakeDb();
    const r = await crawl.readTimelines({ DB: db }, mode, [["karpathy", 0, 1]], 1000);
    assert.deepEqual(w(db, "karpathy"), []);
    assert.equal(r.confirm.live, 1); assert.equal(r.confirm.suspects, 1);
  });
  test(`${mode}: a confirmed 404 sets the failure flag`, async () => {
    fakeFx({ [TL("gone1")]: [[404, { code: 404, results: [] }]], [PR("gone1")]: [[404, NF]] });
    const db = fakeDb();
    const r = await crawl.readTimelines({ DB: db }, mode, [["gone1", 0, 1]], 1000);
    const x = w(db, "gone1");
    assert.equal(x.length, 1); assert.match(x[0].sql, /SET failed = /); assert.equal(x[0].args[0], 1);
    assert.equal(r.confirm.gone, 1);
  });
  test(`${mode}: an existing account with an empty timeline is a read with nothing in it`, async () => {
    fakeFx({ [TL("quiet")]: [[200, { code: 200, results: [] }]], [PR("quiet")]: [[200, { code: 200, user: { screen_name: "quiet" } }]] });
    const db = fakeDb();
    await crawl.readTimelines({ DB: db }, mode, [["quiet", 0, 1]], 1000);
    const x = w(db, "quiet");
    assert.equal(x.length, 1); assert.equal(x[0].args[0], 0);
  });
  test(`${mode}: unsure writes nothing`, async () => {
    fakeFx({ [TL("u1")]: [[404, { code: 404, results: [] }]], [PR("u1")]: [[404, NF], [503, {}]] });
    const db = fakeDb();
    const r = await crawl.readTimelines({ DB: db }, mode, [["u1", 0, 1]], 1000);
    assert.deepEqual(w(db, "u1"), []); assert.equal(r.confirm.unsure, 1);
  });
}
