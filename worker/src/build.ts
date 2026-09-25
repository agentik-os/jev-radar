// Builds the published JSON (pipeline/build.py) and writes it to R2 under data/, meta.json last.
import { Env } from "./env";
import SYSTEMS from "./config/systems.json";
import { IDEA_WEIGHTS, PENDING, WEIGHTS, buildIdeas, buildPlays, compact, nicheBoard, radarScore } from "./radar";

export const DATA_FILES = ["posts.json", "niches.json", "ideas.json", "plays.json", "replied.json", "meta.json"];
const PAGE = 1500;

export async function buildAndPublish(env: Env, now: number, runId: string) {
  const db = env.DB;
  const transcripts: Record<string, string> = {};
  for (const r of (await db.prepare("SELECT video_id, text FROM transcripts").all<{ video_id: string; text: string }>()).results) transcripts[r.video_id] = r.text;

  // posts in id order (the order of posts.jsonl), then stably sorted by views like build.py
  const posts: any[] = [];
  let last = "";
  for (;;) {
    const rows = (await db.prepare(`SELECT p.id, p.raw, c.answers FROM posts p LEFT JOIN cls_cache c ON c.key = p.cls_key
      WHERE p.id > ? ORDER BY p.id LIMIT ?`).bind(last, PAGE).all<{ id: string; raw: string; answers: string | null }>()).results;
    if (!rows.length) break;
    for (const row of rows) {
      const j = row.answers ? JSON.parse(row.answers) : null;
      if (j && !(j.about_jev >= 0.5 && j.category !== "unrelated")) continue;
      posts.push(compact(JSON.parse(row.raw), j || PENDING, transcripts, SYSTEMS as any));
    }
    last = rows[rows.length - 1].id;
  }
  posts.sort((a, b) => b.m[4] - a.m[4]);

  const board = nicheBoard(posts, now);
  const ranked = posts.filter(p => !p.r).sort((a, b) => radarScore(b) - radarScore(a));
  ranked.forEach((p, i) => { p.rs = radarScore(p); p.rk = i + 1; });

  // rank ~24 h ago (or the oldest available) for the trend arrow
  const ref = await db.prepare("SELECT ranks FROM niche_history WHERE ts <= ? ORDER BY ts DESC LIMIT 1").bind(now - 20 * 3600).first<{ ranks: string }>()
    ?? await db.prepare("SELECT ranks FROM niche_history ORDER BY ts ASC LIMIT 1").first<{ ranks: string }>();
  const refRanks = ref ? JSON.parse(ref.ranks) : null;
  for (const b of board) b.prev_rank = refRanks ? (refRanks[b.id] ?? null) : null;
  const ranks = Object.fromEntries(board.map(b => [b.id, b.rank])), scores = Object.fromEntries(board.map(b => [b.id, b.score]));
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO niche_history(ts, ranks, scores) VALUES (?,?,?)").bind(now, JSON.stringify(ranks), JSON.stringify(scores)),
    db.prepare("DELETE FROM niche_history WHERE ts NOT IN (SELECT ts FROM niche_history ORDER BY ts DESC LIMIT 500)"),
  ]);
  const trend = (await db.prepare("SELECT ts, scores FROM niche_history ORDER BY ts DESC LIMIT 60").all<{ ts: number; scores: string }>()).results
    .reverse().map(h => ({ ts: h.ts, scores: JSON.parse(h.scores) }));

  const evals: Record<string, any> = {};
  for (const r of (await db.prepare("SELECT k, data FROM ideas_eval").all<{ k: string; data: string }>()).results) evals[r.k] = JSON.parse(r.data);
  const ideas = buildIdeas(evals, board);
  const plays = buildPlays(ideas, board);
  const replied: Record<string, unknown> = {};
  for (const r of (await db.prepare("SELECT target, data FROM replied").all<{ target: string; data: string }>()).results) replied[r.target] = JSON.parse(r.data);
  const tracked = (await db.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>())?.n || 0;

  const main = posts.filter(p => !p.r);
  const meta = {
    updated: now, checked: now, posts: posts.length, main: main.length,
    authors: new Set(posts.map(p => p.a.h)).size,
    views: main.reduce((a, p) => a + p.m[4], 0), likes: main.reduce((a, p) => a + p.m[0], 0),
    first: posts.length ? Math.min(...posts.map(p => p.c)) : now, tracked_accounts: tracked,
    weights: WEIGHTS, idea_weights: IDEA_WEIGHTS, niche_trend: trend,
    source: "cloudflare", run: runId,
  };
  const files: Record<string, string> = {
    "posts.json": JSON.stringify(posts), "niches.json": JSON.stringify(board), "ideas.json": JSON.stringify(ideas),
    "plays.json": JSON.stringify(plays), "replied.json": JSON.stringify(replied),
    // small index for server-rendered post pages: rank per post id
    "ranks.json": JSON.stringify(Object.fromEntries(ranked.map(p => [p.id, p.rk]))),
  };
  let bytes = 0;
  for (const [name, body] of Object.entries(files)) { bytes += body.length; await put(env, name, body); }
  const metaBody = JSON.stringify(meta);
  await put(env, "meta.json", metaBody);
  const back = await env.BUCKET.get("data/meta.json");
  const readBack = back ? (JSON.parse(await back.text()) as any).updated : null;
  return {
    posts: posts.length, main: main.length, authors: meta.authors, niches: board.length, ideas: ideas.length,
    top_niche: board[0]?.id ?? null, bytes: bytes + metaBody.length, meta_updated: now, meta_read_back: readBack, published: readBack === now,
  };
}

async function put(env: Env, name: string, body: string) {
  await env.BUCKET.put(`data/${name}`, body, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=30" } });
}

/** Fast pass without new posts: only the "checked" heartbeat changes. */
export async function heartbeat(env: Env, now: number) {
  const obj = await env.BUCKET.get("data/meta.json");
  if (!obj) return { checked: null };
  const meta: any = JSON.parse(await obj.text());
  meta.checked = now;
  await put(env, "meta.json", JSON.stringify(meta));
  return { checked: now, updated: meta.updated };
}
