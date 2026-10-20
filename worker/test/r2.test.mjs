// R2 writes of the published JSON are retried object by object (2026-09-27, R2 internal errors on PutObject).
// Run: node --test test/r2.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const r2 = await import("data:text/javascript;base64," + Buffer.from((await build({ entryPoints: [path.join(root, "src/r2.ts")], bundle: true, format: "esm",
  platform: "neutral", write: false, logLevel: "silent" })).outputFiles[0].text).toString("base64"));

/** R2 fake: `fail` answers (errors) are thrown by the first puts, then puts succeed. */
function bucket(fail = []) {
  const objects = new Map(), calls = [];
  return { objects, calls,
    async head(key) { const o = objects.get(key); return o ? { customMetadata: o.meta } : null; },
    async put(key, body, opts) { calls.push(key); const e = fail.shift(); if (e) throw new Error(e); objects.set(key, { body, meta: opts.customMetadata }); return {}; } };
}
const noWait = async () => {};

test("an R2 internal error on one object is retried for that object only, with growing jittered delays", async () => {
  const b = bucket(["put: We encountered an internal error. Please try again. (10001)", "put: Unspecified error (0)"]);
  const st = r2.putStats(), waits = [];
  assert.equal(await r2.putJson(b, "data/posts.json", "[1]", st, Date.now(), async ms => { waits.push(ms); }), "written");
  assert.deepEqual(b.calls, ["data/posts.json", "data/posts.json", "data/posts.json"]);
  assert.equal(st.written, 1); assert.equal(st.retries, 2); assert.equal(st.errors.length, 2);
  assert.equal(waits.length, 2); assert.ok(waits[0] >= 1000 && waits[0] <= 3000 && waits[1] >= 2000 && waits[1] <= 6000);
  assert.ok(r2.backoff(10, 0.999) <= 45000, "the delay is capped");
});

test("an object already stored with the same content is not written again (a retried step writes only what is missing)", async () => {
  const b = bucket();
  const st = r2.putStats();
  await r2.putJson(b, "data/ranks.json", "[2]", st, Date.now(), noWait);
  assert.equal(await r2.putJson(b, "data/ranks.json", "[2]", st, Date.now(), noWait), "unchanged");
  assert.equal(await r2.putJson(b, "data/ranks.json", "[3]", st, Date.now(), noWait), "written");
  assert.deepEqual([st.written, st.unchanged, b.calls.length], [2, 1, 2]);
});

test("after PUT_TRIES failures the error goes up to the step, which the Workflow retries", async () => {
  const b = bucket(Array(r2.PUT_TRIES).fill("put: We encountered an internal error. Please try again. (10001)"));
  await assert.rejects(r2.putJson(b, "data/ideas.json", "[4]", r2.putStats(), Date.now(), noWait), /data\/ideas\.json.*\(6 tries\)/);
  assert.equal(b.calls.length, r2.PUT_TRIES);
});

test("no retry starts once the publish budget is spent", async () => {
  const b = bucket(["put: We encountered an internal error. Please try again. (10001)"]);
  await assert.rejects(r2.putJson(b, "data/plays.json", "[5]", r2.putStats(), Date.now() - r2.PUBLISH_BUDGET_MS - 1, noWait), /1 tries/);
});
