// Public hostname rules (2026-10-19 move to radar.agentik-os.com): jev.agentik-os.com answers a 301 to the same path on
// radar; radar is HTTPS only (308 + HSTS) and indexable; the workers.dev copy keeps noindex and robots Disallow.
// Run: node --test test/host.test.mjs   (esbuild bundles src/index.ts; ASSETS, BUCKET and DB are faked)
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stub = { name: "cf-stub", setup(b) { b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: path.join(root, "test/stubs/cloudflare-workers.mjs") })); } };
const index = await import("data:text/javascript;base64," + Buffer.from((await build({ entryPoints: [path.join(root, "src/index.ts")], bundle: true, format: "esm",
  platform: "neutral", write: false, logLevel: "silent", plugins: [stub], loader: { ".json": "json", ".txt": "text", ".html": "text", ".css": "text", ".md": "text" } })).outputFiles[0].text).toString("base64"));
const worker = index.default;

const SHELL = "<!doctype html><html><head><!--META--><title>x</title><!--/META--></head><body>AGK Radar</body></html>";
const env = (over = {}) => ({
  SITE_URL: "https://radar.agentik-os.com", INDEXABLE: "true",
  ASSETS: { fetch: async () => new Response(SHELL, { headers: { "Content-Type": "text/html" } }) },
  BUCKET: { get: async () => null },
  DB: { prepare: () => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }) }) },
  ...over,
});
const get = (u, e = env()) => worker.fetch(new Request(u, { redirect: "manual" }), e, {});

test("jev.agentik-os.com answers a 301 to the same path and query on radar.agentik-os.com", async () => {
  for (const u of ["https://jev.agentik-os.com/p/2099925682726002904", "http://jev.agentik-os.com/opportunities?focus=x"]) {
    const r = await get(u);
    assert.equal(r.status, 301);
    const want = new URL(u); want.protocol = "https:"; want.hostname = "radar.agentik-os.com";
    assert.equal(r.headers.get("Location"), want.toString());
  }
});

test("plain HTTP on radar.agentik-os.com gets a 308 to HTTPS, HTTPS answers carry HSTS and are indexable", async () => {
  const r = await get("http://radar.agentik-os.com/top?x=1");
  assert.equal(r.status, 308);
  assert.equal(r.headers.get("Location"), "https://radar.agentik-os.com/top?x=1");
  const page = await get("https://radar.agentik-os.com/");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(page.headers.get("X-Robots-Tag"), null);
  const html = await page.text();
  assert.ok(!html.includes('name="robots"'), "no robots meta on the public host");
  assert.ok(html.includes('<link rel="canonical" href="https://radar.agentik-os.com/">'));
  const robots = await (await get("https://radar.agentik-os.com/robots.txt")).text();
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.match(robots, /Sitemap: https:\/\/radar\.agentik-os\.com\/sitemap\.xml/);
});

test("the workers.dev copy stays noindex with INDEXABLE true, without HSTS or redirect", async () => {
  const page = await get("https://agk-radar.x-18a.workers.dev/");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(page.headers.get("Strict-Transport-Security"), null);
  const html = await page.text();
  assert.ok(html.includes('<meta name="robots" content="noindex,nofollow">'));
  assert.ok(html.includes('<link rel="canonical" href="https://radar.agentik-os.com/">'), "canonical points to the public host");
  const robots = await (await get("https://agk-radar.x-18a.workers.dev/robots.txt")).text();
  assert.match(robots, /Disallow: \/\n/);
  assert.match(robots, /the public site is https:\/\/radar\.agentik-os\.com/);
});

test("with INDEXABLE false the public host is noindex too", async () => {
  const page = await get("https://radar.agentik-os.com/", env({ INDEXABLE: "false" }));
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(await (await get("https://radar.agentik-os.com/robots.txt", env({ INDEXABLE: "false" }))).text(), /Disallow: \/\n/);
});
