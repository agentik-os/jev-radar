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
const FAST_HOT_MAX = 240;
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
const articleBlocks = (a: any): number => (((a || {}).content || {}).blocks || []).length;

/** A timeline copy of an X article carries its title but no body (content.blocks = []), while the status endpoint
 *  returns the full body. A later copy must never replace a stored body with an empty one: the body feeds the
 *  classification state, so losing it changes the cache key and demotes the post. Mutates `posts` in place. */
async function keepArticleBodies(db: D1Database, posts: Raw[]): Promise<number> {
  const bare = [...new Set(posts.filter(t => t.article && Object.keys(t.article).length && !articleBlocks(t.article)).map(t => String(t.id)))];
  if (!bare.length) return 0;
  const stored = new Map<string, any>();
  for (const c of chunks(bare, 90)) {
    const r = await db.prepare(`SELECT id, json_extract(raw, '$.article') AS article FROM posts WHERE id IN (${c.map(() => "?").join(",")})
      AND json_array_length(json_extract(raw, '$.article.content.blocks')) > 0`).bind(...c).all<{ id: string; article: string }>();
    for (const row of r.results) stored.set(row.id, JSON.parse(row.article));
  }
  let kept = 0;
  for (const t of posts) {
    const a = stored.get(String(t.id));
    if (a && !articleBlocks(t.article)) { t.article = a; kept++; }
  }
  return kept;
}

/** Writes the posts that are new or changed, and nothing else: a post read again with the same content and metrics
 *  costs no D1 write. Indexed columns (author, created) are written only when they change, since every index entry a
 *  write touches is billed as one more row. Returns how many were new. Also records their videos for transcription. */
export async function upsertPosts(db: D1Database, posts: Raw[]): Promise<number> {
  if (!posts.length) return 0;
  const byId = new Map<string, Raw>();
  for (const t of posts) byId.set(String(t.id), t); // the last copy read wins, as with sequential upserts
  await keepArticleBodies(db, [...byId.values()]);
  const stored = new Map<string, { raw: string; author: string; created: number }>();
  for (const c of chunks([...byId.keys()], 90)) {
    const r = await db.prepare(`SELECT id, raw, author, created FROM posts WHERE id IN (${c.map(() => "?").join(",")})`).bind(...c).all<{ id: string; raw: string; author: string; created: number }>();
    for (const row of r.results) stored.set(row.id, row);
  }
  const ts = nowS();
  const stmts: D1PreparedStatement[] = [];
  let added = 0;
  for (const [id, t] of byId) {
    const raw = JSON.stringify(t), old = stored.get(id);
    if (old && old.raw === raw) continue;
    const author = (((t.author || {}).screen_name) || "").toLowerCase(), created = t.created_timestamp || 0, views = t.views || 0;
    if (!old) {
      added++;
      stmts.push(db.prepare(`INSERT INTO posts(id, author, created, views, raw, updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET views = excluded.views, raw = excluded.raw, updated_at = excluded.updated_at WHERE posts.raw IS NOT excluded.raw`)
        .bind(id, author, created, views, raw, ts));
    } else if (old.author !== author || old.created !== created) {
      stmts.push(db.prepare("UPDATE posts SET author = ?, created = ?, views = ?, raw = ?, updated_at = ? WHERE id = ?").bind(author, created, views, raw, ts, id));
    } else {
      stmts.push(db.prepare("UPDATE posts SET views = ?, raw = ?, updated_at = ? WHERE id = ?").bind(views, raw, ts, id));
    }
    // videos of a new or changed post (INSERT OR IGNORE writes nothing for a video already recorded)
    for (const v of ((t.media || {}).videos || []) as any[]) {
      if (v.type === "video" && v.id) stmts.push(db.prepare("INSERT OR IGNORE INTO videos(video_id, post_id, url, duration) VALUES (?,?,?,?)")
        .bind(String(v.id), id, smallMp4(v) || "", v.duration || 0));
    }
  }
  await batchRun(db, stmts, 40);
  return added;
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
export async function planRound(env: Env, mode: Mode, rnd: number, budget: number, now: number): Promise<{ jobs: Job[]; budget: number; rest?: number }> {
  const db = env.DB;
  const jobs: Job[] = [];
  const fresh = await db.prepare("SELECT handle FROM accounts WHERE last_checked = 0 ORDER BY rowid LIMIT ?").bind(Math.max(budget, 0)).all<{ handle: string }>();
  for (const a of fresh.results) jobs.push([a.handle, LAUNCH, MAX_PAGES_NEW]);
  budget -= fresh.results.length;
  if (rnd === 1) {
    if (mode === "fast") {
      // Priority order: the always-read accounts, then the FAST_HOT_MAX most recently active ones, then the other active
      // accounts from the rotation cursor. The pass reads this list for a fixed time (workflow FAST_READ_MS) and moves
      // the cursor, so every active account is read by some fast pass in turn and a fast pass stays a few minutes long.
      const r = await db.prepare(`SELECT a.k, a.handle, (SELECT MAX(p.created) FROM posts p WHERE p.author = a.k AND p.created > ?) AS last
        FROM accounts a WHERE a.last_checked > 0`).bind(now - FAST_ACTIVE_DAYS * 86400).all<{ k: string; handle: string; last: number | null }>();
      const cursor = (await db.prepare("SELECT v FROM kv WHERE k = 'fast_cursor'").first<{ v: string }>())?.v || "";
      const always = r.results.filter(a => FAST_ALWAYS.has(a.k));
      const active = r.results.filter(a => !FAST_ALWAYS.has(a.k) && a.last).sort((a, b) => b.last! - a.last!);
      const hot = active.slice(0, FAST_HOT_MAX);
      const rest = active.slice(FAST_HOT_MAX).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
      const at = rest.findIndex(a => a.k > cursor);
      const rotated = at <= 0 ? rest : [...rest.slice(at), ...rest.slice(0, at)];
      for (const a of [...always, ...hot]) jobs.push([a.handle, now - OVERLAP, 1]);
      const restFrom = jobs.length;
      for (const a of rotated) jobs.push([a.handle, now - OVERLAP, 1]);
      return { jobs, budget, rest: restFrom };
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
export async function readTimelines(env: Env, mode: Mode, jobs: Job[], now: number): Promise<{ added: number; pending: Pair[]; failed: number; t: number }> {
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
    // (and only writes when the failure flag or a first check changes something)
    stmts.push(mode === "fast"
      ? db.prepare("UPDATE accounts SET failed = ?1, last_checked = CASE WHEN last_checked = 0 THEN ?2 ELSE last_checked END WHERE k = ?3 AND (failed != ?1 OR last_checked = 0)").bind(r.ok ? 0 : 1, now, k)
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
  return { added, pending: [...pend.values()].slice(0, 15000), failed, t: Date.now() };
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

/** Step (fast pass): remember where the rotation stopped. */
export async function saveFastCursor(env: Env, handle: string | null) {
  if (handle) await env.DB.prepare("INSERT INTO kv(k, v) VALUES ('fast_cursor', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE kv.v IS NOT excluded.v").bind(handle.toLowerCase()).run();
  return { cursor: handle };
}

/** Step: recount tracked posts per account, trim the seen list, record crawl totals. */
export async function crawlFinish(env: Env, mode: Mode, added: number, now: number) {
  const db = env.DB;
  await db.batch([
    // recount tracked posts, writing only the accounts whose count changed
    db.prepare("UPDATE accounts SET posts = (SELECT COUNT(*) FROM posts p WHERE p.author = accounts.k) WHERE posts != (SELECT COUNT(*) FROM posts p WHERE p.author = accounts.k)"),
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
      stmts.push(db.prepare("INSERT INTO replied(target, data) VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET data = excluded.data WHERE replied.data IS NOT excluded.data").bind(String(target), JSON.stringify({
        reply: t.id, url: t.url ?? null, ts: t.created_timestamp ?? null, kind: t.replying_to ? "reply" : "quote" })));
    }
    cursor = (d.cursor || {}).bottom || null;
    if (!cursor || knownPage) break;
  }
  await batchRun(db, stmts);
  return { total: known.size, found };
}
