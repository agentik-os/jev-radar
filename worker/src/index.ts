// AGK Radar Worker: the site, its data and API routes, the cron triggers and the admin/import endpoints.
import { Env, Mode, PassParams, chunks, now as nowS } from "./env";
import { renderPage, sitemap, llms, robots, SECTIONS } from "./site";
import { checkIdea, moneyNow } from "./api";
import { upsertPosts } from "./crawl";
import { DATA_FILES } from "./build";
import { getJson } from "./fx";
import { AiClient } from "./ai";
import { transcribeOne } from "./transcribe";

export { RadarPass } from "./workflow";

const CRONS: Record<string, Mode> = { "7 * * * *": "full", "22,37,52 * * * *": "fast" };
const PUBLIC_DATA = new Set([...DATA_FILES]);

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d, null, 1), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** A full pass is owed when its cron firing was skipped by a running fast pass (a "skipped" full row newer than the last started full pass)
 *  or when no full pass has started for FULL_OWED_AFTER seconds. The next idle fast firing then runs the full pass. */
export const FULL_OWED_AFTER = 65 * 60;

async function fullOwed(env: Env, t: number): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT
      (SELECT MAX(started) FROM runs WHERE mode = 'full' AND status != 'skipped') AS last_full,
      (SELECT MAX(started) FROM runs WHERE mode = 'full' AND status = 'skipped' AND error NOT LIKE 'covered by%') AS last_skip`).first<{ last_full: number | null; last_skip: number | null }>();
  const lastFull = row?.last_full ?? 0, lastSkip = row?.last_skip ?? 0;
  if (lastSkip > lastFull) return `full firing skipped at ${new Date(lastSkip * 1000).toISOString().slice(11, 16)} UTC`;
  if (t - lastFull >= FULL_OWED_AFTER) return `no full pass for ${Math.round((t - lastFull) / 60)} min`;
  return null;
}

const passId = (mode: string, t: number, suffix = "") => `${mode}-${new Date(t * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${crypto.randomUUID().slice(0, 4)}${suffix}`;

/** Starts a pass unless one is still running. A skipped firing is written to the run log; a skipped full pass is then
 *  owed and runs at the next idle fast firing. */
export async function startPass(env: Env, mode: Mode, trigger: string): Promise<{ id?: string; mode?: Mode; skipped?: string }> {
  const t = nowS();
  // one pass at a time: the Workflow status of every pass still marked running is authoritative
  const open = (await env.DB.prepare("SELECT id, mode FROM runs WHERE status = 'running' AND mode IN ('full', 'fast') AND started > ? ORDER BY started DESC")
    .bind(t - 24 * 3600).all<{ id: string; mode: string }>()).results;
  for (const busy of open) {
    const inst = await env.RADAR_PASS.get(busy.id).catch(() => null);
    const st = inst ? (await inst.status().catch(() => ({ status: "unknown" }))).status : "unknown";
    if (["queued", "running", "waiting", "paused", "waitingForPause"].includes(st)) {
      // a firing skipped while a full pass runs is covered by that pass; one skipped by a fast pass makes the full pass owed
      const reason = busy.mode === "full" ? `covered by full pass ${busy.id} (${st})` : `pass ${busy.id} is ${st}`;
      if (trigger !== "manual") await env.DB.prepare("INSERT OR IGNORE INTO runs(id, mode, trigger, started, finished, status, error) VALUES (?,?,?,?,?, 'skipped', ?)")
        .bind(passId(mode, t, "-skip"), mode, trigger, t, t, reason).run();
      return { skipped: reason };
    }
    await env.DB.prepare("UPDATE runs SET status = ? WHERE id = ? AND status = 'running'").bind(st === "complete" ? "complete" : "failed", busy.id).run();
  }
  if (mode === "fast" && trigger !== "manual") {
    const owed = await fullOwed(env, t);
    if (owed) { mode = "full"; trigger = `${trigger} (full owed: ${owed})`; }
  }
  const id = passId(mode, t);
  // the run row is written before the instance exists, so a cron firing a moment later already sees this pass
  await env.DB.prepare("INSERT OR IGNORE INTO runs(id, mode, trigger, started, status) VALUES (?,?,?,?, 'running')").bind(id, mode, trigger, t).run();
  try {
    await env.RADAR_PASS.create({ id, params: { mode, trigger } satisfies PassParams });
  } catch (e: any) {
    await env.DB.prepare("UPDATE runs SET status = 'failed', finished = ?, error = ? WHERE id = ?").bind(nowS(), `create: ${String(e?.message || e).slice(0, 400)}`, id).run();
    throw e;
  }
  return { id, mode };
}

async function admin(env: Env, req: Request, url: URL): Promise<Response> {
  const auth = req.headers.get("authorization") || "";
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
  const [, , what, arg] = url.pathname.split("/");
  const db = env.DB;
  if (what === "run" && req.method === "POST") {
    const mode = (url.searchParams.get("mode") === "fast" ? "fast" : "full") as Mode;
    return json(await startPass(env, mode, "manual"));
  }
  if (what === "run" && arg) {
    const inst = await env.RADAR_PASS.get(arg);
    const row = await db.prepare("SELECT * FROM runs WHERE id = ?").bind(arg).first();
    return json({ workflow: await inst.status(), run: row });
  }
  if (what === "runs") return json((await db.prepare("SELECT id, mode, trigger, started, finished, status, error FROM runs ORDER BY started DESC LIMIT 30").all()).results);
  if (what === "stats") {
    const q = (s: string) => db.prepare(s).first<{ n: number }>().then(r => r?.n ?? 0);
    const [posts, cls, classified, accounts, transcripts, videos, seen, history, ideas, replied] = await Promise.all([
      q("SELECT COUNT(*) n FROM posts"), q("SELECT COUNT(*) n FROM cls_cache"),
      q("SELECT COUNT(*) n FROM posts p JOIN cls_cache c ON c.key = p.cls_key"), q("SELECT COUNT(*) n FROM accounts"),
      q("SELECT COUNT(*) n FROM transcripts"), q("SELECT COUNT(*) n FROM videos"), q("SELECT COUNT(*) n FROM seen_ids"),
      q("SELECT COUNT(*) n FROM niche_history"), q("SELECT COUNT(*) n FROM ideas_eval"), q("SELECT COUNT(*) n FROM replied")]);
    const meta = await env.BUCKET.get("data/meta.json");
    return json({ posts, cls_cache: cls, classified, accounts, transcripts, videos, seen_ids: seen, niche_history: history, ideas_eval: ideas, replied,
      r2_meta: meta ? JSON.parse(await meta.text()) : null });
  }
  if (what === "ai-calls") {
    const run = url.searchParams.get("run");
    const rows = await db.prepare(`SELECT run_id, purpose, status, COUNT(*) calls, MAX(inflight) max_inflight, SUM(attempts - 1) retries, SUM(tokens) tokens, MIN(ts) first, MAX(ts) last
      FROM ai_calls ${run ? "WHERE run_id = ?" : ""} GROUP BY run_id, purpose, status ORDER BY last DESC LIMIT 50`).bind(...(run ? [run] : [])).all();
    return json(rows.results);
  }
  if (what === "probe") {
    // reachability of the three upstreams, with the Worker's own bindings and secrets
    const t0 = Date.now();
    const fx = await getJson("https://api.fxtwitter.com/2/profile/typesafeai/statuses");
    const out: Record<string, unknown> = { fxtwitter: { ok: !!fx?.results, results: fx?.results?.length ?? 0, ms: Date.now() - t0 } };
    const t1 = Date.now();
    try {
      const r = await new AiClient(env).ask({ post: "I built a browser agent that picks each click with a typed decision model." },
        { build: { type: "noul", instructions: "Does the post show something the author built?" } }, "probe");
      out.agk_intelligence = { ok: true, build: r.answers.build?.noul, ms: Date.now() - t1 };
    } catch (e: any) { out.agk_intelligence = { ok: false, error: String(e?.message || e).slice(0, 200), status: e?.status }; }
    const v = url.searchParams.get("video");
    if (v) {
      const t2 = Date.now(); const text = await transcribeOne(env, { video_id: "probe", url: v });
      out.whisper = { model: env.WHISPER_MODEL, text: text.slice(0, 300), words: text.split(" ").filter(Boolean).length, ms: Date.now() - t2 };
      if (url.searchParams.get("raw")) { // the model's own answer or error, for diagnosing empty transcripts
        try { const b = new Uint8Array(await (await fetch(v, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer());
          let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
          const r: any = await env.AI.run(env.WHISPER_MODEL as any, { audio: btoa(s), vad_filter: true } as any);
          out.raw = { text: String(r?.text ?? "").slice(0, 200), info: r?.transcription_info ?? null, segments: (r?.segments || []).length };
        } catch (e: any) { out.raw = { error: String(e?.message || e).slice(0, 300) }; }
      }
    }
    return json(out);
  }
  if (what === "import" && req.method === "POST") return importRows(env, arg, await req.json());
  if (what === "r2" && req.method === "PUT" && arg && (PUBLIC_DATA.has(arg) || arg === "ranks.json")) {
    const body = await req.text();
    await env.BUCKET.put(`data/${arg}`, body, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=30" } });
    await env.BUCKET.put(`import/${arg}`, body, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return json({ ok: true, key: `data/${arg}`, bytes: body.length });
  }
  return json({ error: "unknown admin route" }, 404);
}

/** One-off import (read-only copy of the Vercel-era data). Idempotent: rows are upserted. */
async function importRows(env: Env, table: string, rows: any[]): Promise<Response> {
  const db = env.DB;
  const ts = nowS();
  let stmts: D1PreparedStatement[] = [];
  switch (table) {
    case "posts": {
      await upsertPosts(db, rows.map(r => r.raw));
      stmts = rows.map(r => db.prepare("UPDATE posts SET cls_key = ?, updated_at = 0 WHERE id = ?").bind(r.cls_key, String(r.raw.id)));
      break;
    }
    case "cls_cache": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO cls_cache(key, answers, created_at) VALUES (?,?,?)").bind(r.key, JSON.stringify(r.answers), ts)); break;
    case "accounts": stmts = rows.map(r => db.prepare(`INSERT INTO accounts(k, handle, last_checked, posts, failed) VALUES (?,?,?,?,?)
      ON CONFLICT(k) DO UPDATE SET handle=excluded.handle, last_checked=excluded.last_checked, posts=excluded.posts, failed=excluded.failed`)
      .bind(r.k, r.handle, Math.floor(r.last_checked || 0), r.posts || 0, r.failed ? 1 : 0)); break;
    case "transcripts": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO transcripts(video_id, text, created_at) VALUES (?,?,?)").bind(r.video_id, r.text, 0)); break;
    case "niche_history": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO niche_history(ts, ranks, scores) VALUES (?,?,?)").bind(r.ts, JSON.stringify(r.ranks), JSON.stringify(r.scores))); break;
    case "ideas_eval": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO ideas_eval(k, data) VALUES (?,?)").bind(r.k, JSON.stringify(r.data))); break;
    case "replied": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO replied(target, data) VALUES (?,?)").bind(r.target, JSON.stringify(r.data))); break;
    case "seen_ids": stmts = rows.map(r => db.prepare("INSERT OR IGNORE INTO seen_ids(id, ts) VALUES (?,?)").bind(String(r), 0)); break;
    case "kv": stmts = rows.map(r => db.prepare("INSERT OR REPLACE INTO kv(k, v) VALUES (?,?)").bind(r.k, String(r.v))); break;
    case "run": stmts = [db.prepare("INSERT OR REPLACE INTO runs(id, mode, trigger, started, finished, status, stats) VALUES (?,?,?,?,?,?,?)")
      .bind(rows[0].id, "import", "import", rows[0].started, ts, "complete", JSON.stringify(rows[0].stats))]; break;
    default: return json({ error: `unknown table ${table}` }, 400);
  }
  for (const c of chunks(stmts, 80)) await db.batch(c);
  return json({ ok: true, table, rows: rows.length });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // after the DNS move the old hostname answers a permanent redirect to the same path on the new one
    if (url.hostname === "jev.agentik-os.com") return Response.redirect(`https://radar.agentik-os.com${url.pathname}${url.search}`, 301);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/admin/")) return admin(env, req, url);
    if (path.startsWith("/data/")) {
      const name = path.slice(6);
      if (!PUBLIC_DATA.has(name)) return new Response("Not found", { status: 404 });
      const obj = await env.BUCKET.get(`data/${name}`);
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, { headers: {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30", ETag: obj.httpEtag,
        "Access-Control-Allow-Origin": "*", "Last-Modified": obj.uploaded.toUTCString() } });
    }
    if (path === "/api/check-idea") return checkIdea(env, req);
    if (path === "/api/money-now") return moneyNow(env, req);
    if (path === "/sitemap.xml") return sitemap(env, url.origin);
    if (path === "/llms.txt") return llms(env, url.origin);
    if (path === "/robots.txt") return robots(env, url.origin);
    if (path === "/post") {
      const r = await env.ASSETS.fetch(new Request(url.origin + "/post.html"));
      const h = new Headers(r.headers); h.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(r.body, { status: r.status, headers: h });
    }
    const first = path.split("/")[1] || "";
    const isPage = path === "/" || (first === "p" && path.split("/").length === 3) || first in SECTIONS
      || /^\/opportunities\/(niches|ideas|check)$/.test(path);
    if (isPage) return renderPage(env, req, path);
    const asset = await env.ASSETS.fetch(req);
    if (asset.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(path)) return renderPage(env, req, path); // branded 404 page
    return asset;
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const mode = CRONS[event.cron] ?? "fast";
    const r = await startPass(env, mode, event.cron);
    console.log(JSON.stringify({ cron: event.cron, mode, ...r })); // r.mode is "full" when an owed full pass replaced the fast one
  },
} satisfies ExportedHandler<Env>;
