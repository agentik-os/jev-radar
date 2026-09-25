// Incremental crawl of the tracked X posts, ported from pipeline/crawl.py and pipeline/replies.py.
// State lives in D1; each function below is one Workflow step and is safe to retry (upserts only).
import { Env, Mode, chunks, now as nowS, pool } from "./env";
import { getJson } from "./fx";
import { LAUNCH, Raw, isTracked, links, smallMp4 } from "./radar";
import SEEDS from "./config/seeds.json";

export const FX_PARALLEL = 6;
const STATUS_RE = /(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{15,20})/;
const IDLE_RECHECK = 6 * 3600;   // accounts without tracked posts: re-read every 6 h
const OVERLAP = 2 * 86400;       // re-read 2 days back to refresh metrics
const MAX_PAGES_NEW = 12;
const MAX_PAGES_KNOWN = 4;
const REFRESH_TOP = 250;
const REFRESH_EVERY = 6 * 3600;
export const NEW_BUDGET: Record<Mode, number> = { full: 400, fast: 60 };
export const MAX_ROUNDS: Record<Mode, number> = { full: 8, fast: 3 };
const FAST_ACTIVE_DAYS = 4;
const FAST_ALWAYS = new Set(["typesafeai", "completeskeptic", "openrouter", "vercel"]);
const SELF = "Agentik_os";

export type Pair = [string, string]; // [handle, status id]
export type Job = [string, number, number]; // [handle, since, max pages]

// ------------------------------------------------------------------ D1 helpers
async function batchRun(db: D1Database, stmts: D1PreparedStatement[], size = 80) {
  for (const c of chunks(stmts, size)) if (c.length) await db.batch(c);
}

export async function addAccounts(db: D1Database, handles: string[]) {
  const uniq = new Map<string, string>();
  for (const h of handles) if (h) uniq.set(h.toLowerCase(), h);
  await batchRun(db, [...uniq].map(([k, h]) => db.prepare("INSERT OR IGNORE INTO accounts(k, handle) VALUES (?, ?)").bind(k, h)));
}

/** Upserts tracked posts; returns how many were new. Also records their videos for transcription. */
export async function upsertPosts(db: D1Database, posts: Raw[]): Promise<number> {
  if (!posts.length) return 0;
  const ids = [...new Set(posts.map(t => String(t.id)))];
  const known = new Set<string>();
  for (const c of chunks(ids, 90)) {
    const r = await db.prepare(`SELECT id FROM posts WHERE id IN (${c.map(() => "?").join(",")})`).bind(...c).all<{ id: string }>();
    for (const row of r.results) known.add(row.id);
  }
  const ts = nowS();
  const stmts: D1PreparedStatement[] = [];
  for (const t of posts) {
    const author = (((t.author || {}).screen_name) || "").toLowerCase();
    stmts.push(db.prepare(`INSERT INTO posts(id, author, created, views, raw, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET author=excluded.author, created=excluded.created, views=excluded.views, raw=excluded.raw, updated_at=excluded.updated_at`)
      .bind(String(t.id), author, t.created_timestamp || 0, t.views || 0, JSON.stringify(t), ts));
    for (const v of ((t.media || {}).videos || []) as any[]) {
      if (v.type === "video" && v.id) stmts.push(db.prepare("INSERT OR IGNORE INTO videos(video_id, post_id, url, duration) VALUES (?,?,?,?)")
        .bind(String(v.id), String(t.id), smallMp4(v) || "", v.duration || 0));
    }
  }
  await batchRun(db, stmts, 40);
  return ids.filter(i => !known.has(i)).length;
}

async function filterUnseen(db: D1Database, pairs: Pair[]): Promise<Pair[]> {
  const byId = new Map(pairs.map(p => [p[1], p]));
  const ids = [...byId.keys()];
  const drop = new Set<string>();
  for (const c of chunks(ids, 45)) { // two IN lists: stay under D1's 100 bound parameters
    const q = c.map(() => "?").join(",");
    const r = await db.prepare(`SELECT id FROM posts WHERE id IN (${q}) UNION SELECT id FROM seen_ids WHERE id IN (${q})`).bind(...c, ...c).all<{ id: string }>();
    for (const row of r.results) drop.add(row.id);
  }
  return ids.filter(i => !drop.has(i)).map(i => byId.get(i)!);
}

// ------------------------------------------------------------------ steps
/** Step: add the seeds and every known author to the account list; return the links of recent posts. */
export async function crawlInit(env: Env, now: number): Promise<{ pending: Pair[] }> {
  const db = env.DB;
  const seedHandles = (SEEDS as string[]).map(l => { const m = STATUS_RE.exec(l); return m ? m[1] : l.replace(/^@/, ""); });
  await addAccounts(db, seedHandles);
  await db.prepare("INSERT OR IGNORE INTO accounts(k, handle) SELECT DISTINCT author, json_extract(raw, '$.author.screen_name') FROM posts WHERE author != ''").run();
  const recent = await db.prepare("SELECT raw FROM posts WHERE created >= ?").bind(now - OVERLAP).all<{ raw: string }>();
  const pend = new Map<string, Pair>();
  for (const row of recent.results) for (const p of links(JSON.parse(row.raw), row.raw).ids) pend.set(p[1], p);
  return { pending: [...pend.values()] };
}

/** Step: fetch linked statuses that are neither known nor already seen; keep the tracked ones. */
export async function fetchLinked(env: Env, pending: Pair[]): Promise<{ fetched: number; added: number }> {
  const db = env.DB;
  const todo = await filterUnseen(db, pending);
  if (!todo.length) return { fetched: 0, added: 0 };
  const ts = nowS();
  await batchRun(db, todo.map(p => db.prepare("INSERT OR IGNORE INTO seen_ids(id, ts) VALUES (?, ?)").bind(p[1], ts)));
  const got = await pool(todo, FX_PARALLEL, async ([h, i]) => (await getJson(`https://api.fxtwitter.com/${h || "i"}/status/${i}`))?.tweet);
  const keep = got.filter(t => t && t.id && isTracked(t));
  const added = await upsertPosts(db, keep);
  await addAccounts(db, keep.map(t => (t.author || {}).screen_name || ""));
  return { fetched: todo.length, added };
}

/** Step: decide which accounts to read in this round (crawl.py main loop). */
export async function planRound(env: Env, mode: Mode, rnd: number, budget: number, now: number): Promise<{ jobs: Job[]; budget: number }> {
  const db = env.DB;
  const jobs: Job[] = [];
  const fresh = await db.prepare("SELECT handle FROM accounts WHERE last_checked = 0 ORDER BY rowid LIMIT ?").bind(Math.max(budget, 0)).all<{ handle: string }>();
  for (const a of fresh.results) jobs.push([a.handle, LAUNCH, MAX_PAGES_NEW]);
  budget -= fresh.results.length;
  if (rnd === 1) {
    if (mode === "fast") {
      const r = await db.prepare(`SELECT a.k, a.handle FROM accounts a WHERE a.last_checked > 0 AND (a.k IN (${[...FAST_ALWAYS].map(() => "?").join(",")})
        OR EXISTS (SELECT 1 FROM posts p WHERE p.author = a.k AND p.created > ?))`).bind(...FAST_ALWAYS, now - FAST_ACTIVE_DAYS * 86400).all<{ k: string; handle: string }>();
      for (const a of r.results) jobs.push([a.handle, now - OVERLAP, 1]);
    } else {
      const r = await db.prepare("SELECT handle, last_checked FROM accounts WHERE last_checked > 0 AND (posts > 0 OR ? - last_checked > ?)")
        .bind(now, IDLE_RECHECK).all<{ handle: string; last_checked: number }>();
      for (const a of r.results) jobs.push([a.handle, Math.max(LAUNCH, a.last_checked - OVERLAP), MAX_PAGES_KNOWN]);
    }
  }
  return { jobs, budget };
}

async function timeline([handle, since, maxPages]: Job): Promise<{ handle: string; found: Raw[]; ok: boolean }> {
  const base = `https://api.fxtwitter.com/2/profile/${handle}/statuses`;
  let cursor: string | null = null, ok = false;
  const found: Raw[] = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await getJson(base + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
    if (!d || !d.results || !d.results.length) break;
    ok = true;
    for (const t of d.results) if (isTracked(t)) found.push(t);
    cursor = (d.cursor || {}).bottom || null;
    // the first result can be an old pinned post
    if (!cursor || d.results.slice(1).every((t: Raw) => (t.created_timestamp || 0) < since)) break;
  }
  return { handle, found, ok };
}

/** Step: read a slice of the round's timelines. Returns the statuses they link to (next round). */
export async function readTimelines(env: Env, mode: Mode, jobs: Job[], now: number): Promise<{ added: number; pending: Pair[]; failed: number }> {
  const db = env.DB;
  const res = await pool(jobs, FX_PARALLEL, timeline);
  const found: Raw[] = [];
  const handles: string[] = [];
  const pend = new Map<string, Pair>();
  const stmts: D1PreparedStatement[] = [];
  let failed = 0;
  for (const r of res) {
    const k = r.handle.toLowerCase();
    // a fast pass does not push back the next full read of a known account
    stmts.push(mode === "fast"
      ? db.prepare("UPDATE accounts SET failed = ?, last_checked = CASE WHEN last_checked = 0 THEN ? ELSE last_checked END WHERE k = ?").bind(r.ok ? 0 : 1, now, k)
      : db.prepare("UPDATE accounts SET failed = ?, last_checked = ? WHERE k = ?").bind(r.ok ? 0 : 1, now, k));
    if (!r.ok) failed++;
    for (const t of r.found) {
      found.push(t);
      const l = links(t);
      for (const p of l.ids) pend.set(p[1], p);
      handles.push(...l.handles);
    }
  }
  await batchRun(db, stmts);
  const added = await upsertPosts(db, found);
  await addAccounts(db, handles);
  return { added, pending: [...pend.values()].slice(0, 15000), failed };
}

/** Step (full pass, every 6 h): refresh the metrics of the most viewed posts. */
export async function refreshTop(env: Env, now: number): Promise<{ refreshed: number } | null> {
  const db = env.DB;
  const last = Number((await db.prepare("SELECT v FROM kv WHERE k = 'last_refresh'").first<{ v: string }>())?.v || 0);
  if (now - last <= REFRESH_EVERY) return null;
  const top = await db.prepare("SELECT id, json_extract(raw, '$.author.screen_name') AS h FROM posts ORDER BY views DESC LIMIT ?").bind(REFRESH_TOP).all<{ id: string; h: string }>();
  const got = await pool(top.results, FX_PARALLEL, async r => (await getJson(`https://api.fxtwitter.com/${r.h || "i"}/status/${r.id}`))?.tweet);
  const ok = got.filter(t => t && t.id && isTracked(t));
  // only replace posts we already track (same rule as crawl.py)
  const ids = new Set(top.results.map(r => r.id));
  await upsertPosts(db, ok.filter(t => ids.has(String(t.id))));
  await db.prepare("INSERT OR REPLACE INTO kv(k, v) VALUES ('last_refresh', ?)").bind(String(now)).run();
  return { refreshed: ok.length };
}

/** Step: recount tracked posts per account, trim the seen list, record crawl totals. */
export async function crawlFinish(env: Env, mode: Mode, added: number, now: number) {
  const db = env.DB;
  await db.batch([
    db.prepare("UPDATE accounts SET posts = (SELECT COUNT(*) FROM posts p WHERE p.author = accounts.k)"),
    db.prepare("DELETE FROM seen_ids WHERE id NOT IN (SELECT id FROM seen_ids ORDER BY id DESC LIMIT 20000)"),
    db.prepare("INSERT OR REPLACE INTO kv(k, v) VALUES (?, ?)").bind(mode === "fast" ? "last_fast" : "last_run", String(now)),
    db.prepare("INSERT OR REPLACE INTO kv(k, v) VALUES ('last_crawl_new', ?)").bind(String(added)),
  ]);
  const c = await db.prepare("SELECT (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM accounts) AS accounts").first<{ posts: number; accounts: number }>();
  return { posts: c?.posts || 0, accounts: c?.accounts || 0, added };
}

/** Step: replies and quotes published by @Agentik_os on tracked posts (validates the private /post page). */
export async function replies(env: Env): Promise<{ total: number; found: number }> {
  const db = env.DB;
  const known = new Set((await db.prepare("SELECT target FROM replied").all<{ target: string }>()).results.map(r => r.target));
  const base = `https://api.fxtwitter.com/2/profile/${SELF}/statuses?with_replies=true`;
  let cursor: string | null = null, found = 0;
  const stmts: D1PreparedStatement[] = [];
  for (let page = 0; page < 10; page++) {
    const d = await getJson(base + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!d || !d.results || !d.results.length) break;
    let knownPage = true;
    for (const t of d.results) {
      if (((t.author || {}).screen_name || "").toLowerCase() !== SELF.toLowerCase()) continue;
      const target = ((t.replying_to || {}).status) || ((t.quote || {}).id);
      if (!target) continue;
      if (!known.has(target)) { knownPage = false; found++; known.add(target); }
      stmts.push(db.prepare("INSERT OR REPLACE INTO replied(target, data) VALUES (?, ?)").bind(String(target), JSON.stringify({
        reply: t.id, url: t.url ?? null, ts: t.created_timestamp ?? null, kind: t.replying_to ? "reply" : "quote" })));
    }
    cursor = (d.cursor || {}).bottom || null;
    if (!cursor || knownPage) break;
  }
  await batchRun(db, stmts);
  return { total: known.size, found };
}
