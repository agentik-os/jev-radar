// Parity test: the Worker's TypeScript port against the Python pipeline's outputs.
// usage: node scripts/parity.mjs <dir with posts.jsonl, transcripts.json, classified.json> <golden_keys.json> [published posts.json]
import { build } from "esbuild";
import fs from "node:fs";
import readline from "node:readline";

const [src, goldenPath, publishedPath] = process.argv.slice(2);
await build({ entryPoints: ["src/radar.ts"], bundle: true, format: "esm", platform: "node", outfile: "dist/radar.mjs", logLevel: "error" });
const R = await import(new URL("../dist/radar.mjs", import.meta.url));
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
const transcripts = JSON.parse(fs.readFileSync(`${src}/transcripts.json`, "utf8"));
const cls = JSON.parse(fs.readFileSync(`${src}/classified.json`, "utf8"));
const systems = JSON.parse(fs.readFileSync("src/config/systems.json", "utf8"));
let n = 0, bad = 0;
const compacts = [];
for await (const line of readline.createInterface({ input: fs.createReadStream(`${src}/posts.jsonl`) })) {
  const t = JSON.parse(line);
  const k = await R.stateKey(R.classifyState(t, transcripts));
  n++;
  if (k !== golden[t.id]) { if (bad++ < 5) console.log("KEY MISMATCH", t.id, k, golden[t.id]); }
  const j = cls[t.id];
  if (!j || (j.about_jev >= 0.5 && j.category !== "unrelated")) compacts.push(R.compact(t, j || R.PENDING, transcripts, systems));
}
console.log(`cache keys: ${n - bad}/${n} identical to Python`);
if (publishedPath) {
  const pub = JSON.parse(fs.readFileSync(publishedPath, "utf8"));
  compacts.sort((a, b) => b.m[4] - a.m[4]);
  const ranked = compacts.filter(p => !p.r).sort((a, b) => R.radarScore(b) - R.radarScore(a));
  ranked.forEach((p, i) => { p.rs = R.radarScore(p); p.rk = i + 1; });
  const byId = new Map(pub.map(p => [p.id, p]));
  let same = 0, diff = 0, missing = 0;
  const strip = p => { const { sys, ...rest } = p; return JSON.stringify(rest); }; // system blurbs are renamed on purpose
  for (const p of compacts) {
    const q = byId.get(p.id);
    if (!q) { missing++; continue; }
    if (strip(p) === strip(q)) same++; else if (diff++ < 3) {
      for (const k of Object.keys(q)) if (JSON.stringify(p[k]) !== JSON.stringify(q[k])) console.log("FIELD DIFF", p.id, k, JSON.stringify(p[k]).slice(0, 160), "|", JSON.stringify(q[k]).slice(0, 160));
    }
  }
  console.log(`published posts: ours ${compacts.length}, python ${pub.length}; identical ${same}, different ${diff}, missing ${missing}`);
}
