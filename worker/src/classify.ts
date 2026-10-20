// AGK Intelligence classification of posts (pipeline/analyze.py) and scoring of the idea library
// (pipeline/ideas_eval.py). Content-keyed cache: only new or changed posts are sent.
import { AiBlocked, AiClient } from "./ai";
import { Env, chunks, now as nowS, pool } from "./env";
import { IDEAS, IDEA_CRITERIA, IDEA_QTEXT, QUESTIONS, classifyState, flat, stateKey } from "./radar";

async function transcriptsFor(db: D1Database, postIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of chunks(postIds, 90)) {
    const r = await db.prepare(`SELECT t.video_id, t.text FROM videos v JOIN transcripts t ON t.video_id = v.video_id
      WHERE v.post_id IN (${c.map(() => "?").join(",")})`).bind(...c).all<{ video_id: string; text: string }>();
    for (const row of r.results) out[row.video_id] = row.text;
  }
  return out;
}

/** Step: recompute the content key of posts changed since `since` (or never keyed). */
export async function rekey(env: Env, since: number, extraPostIds: string[] = []): Promise<{ rekeyed: number }> {
  const db = env.DB;
  const rows = (await db.prepare("SELECT id, raw, cls_key FROM posts WHERE cls_key IS NULL OR updated_at >= ?").bind(since).all<{ id: string; raw: string; cls_key: string | null }>()).results;
  if (extraPostIds.length) {
    for (const c of chunks(extraPostIds, 90)) {
      const r = await db.prepare(`SELECT id, raw, cls_key FROM posts WHERE id IN (${c.map(() => "?").join(",")})`).bind(...c).all<{ id: string; raw: string; cls_key: string | null }>();
      rows.push(...r.results);
    }
  }
  const tr = await transcriptsFor(db, rows.map(r => r.id));
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows) {
    const key = await stateKey(classifyState(JSON.parse(row.raw), tr));
    if (key !== row.cls_key) stmts.push(db.prepare("UPDATE posts SET cls_key = ? WHERE id = ?").bind(key, row.id));
  }
  for (const c of chunks(stmts, 80)) await db.batch(c);
  return { rekeyed: stmts.length };
}

/** Post ids whose current content has no classification yet. */
export async function unclassified(env: Env, limit = 5000): Promise<string[]> {
  const r = await env.DB.prepare(`SELECT p.id FROM posts p LEFT JOIN cls_cache c ON c.key = p.cls_key
    WHERE c.key IS NULL ORDER BY p.created DESC LIMIT ?`).bind(limit).all<{ id: string }>();
  return r.results.map(x => x.id);
}

export interface AiStepResult { asked: number; ok: number; failed: number; tokens: number; maxInflight: number; statuses: Record<string, number>; blocked?: string }

/** Step: classify one slice of posts with AGK Intelligence. */
export async function classifySlice(env: Env, runId: string, ids: string[]): Promise<AiStepResult> {
  const db = env.DB;
  const rows: { id: string; raw: string }[] = [];
  for (const c of chunks(ids, 90)) {
    const r = await db.prepare(`SELECT id, raw FROM posts WHERE id IN (${c.map(() => "?").join(",")})`).bind(...c).all<{ id: string; raw: string }>();
    rows.push(...r.results);
  }
  const tr = await transcriptsFor(db, rows.map(r => r.id));
  const ai = new AiClient(env);
  let blocked: string | undefined;
  const results = await pool(rows, 6, async row => {
    if (blocked) return null;
    const st = classifyState(JSON.parse(row.raw), tr);
    const key = await stateKey(st);
    try {
      const r = await ai.ask(st, QUESTIONS, "classify");
      return { id: row.id, key, answers: flat(r.answers), tokens: r.tokens };
    } catch (e) {
      if (e instanceof AiBlocked) blocked = e.message;
      return null;
    }
  });
  const ts = nowS();
  const stmts: D1PreparedStatement[] = [];
  let tokens = 0;
  for (const r of results) {
    if (!r) continue;
    tokens += r.tokens;
    stmts.push(db.prepare("INSERT OR REPLACE INTO cls_cache(key, answers, created_at) VALUES (?,?,?)").bind(r.key, JSON.stringify(r.answers), ts));
    stmts.push(db.prepare("UPDATE posts SET cls_key = ? WHERE id = ?").bind(r.key, r.id));
  }
  for (const c of chunks(stmts, 80)) await db.batch(c);
  const log = await ai.flushLog(db, runId);
  const statuses: Record<string, number> = {};
  for (const c of log) statuses[String(c.status)] = (statuses[String(c.status)] || 0) + 1;
  const ok = results.filter(Boolean).length;
  return { asked: log.length, ok, failed: rows.length - ok, tokens, maxInflight: ai.maxInflight, statuses, ...(blocked ? { blocked } : {}) };
}

/** Step: score the ideas whose wording or criteria changed (ideas_eval.py). */
export async function evalIdeas(env: Env, runId: string): Promise<AiStepResult & { todo: number }> {
  const db = env.DB;
  const stored = new Map((await db.prepare("SELECT k, data FROM ideas_eval").all<{ k: string; data: string }>()).results.map(r => [r.k, JSON.parse(r.data)]));
  const todo = IDEAS.filter(i => stored.get(i.k)?._h !== i._h);
  const questions = Object.fromEntries(Object.entries(IDEA_CRITERIA).map(([k, v]) => [k, { type: "score", instructions: IDEA_QTEXT[k], criteria: v }]));
  const ai = new AiClient(env);
  let blocked: string | undefined;
  const res = await pool(todo, 6, async i => {
    if (blocked) return null;
    try {
      const r = await ai.ask(i._state, questions, "ideas");
      const out: Record<string, unknown> = { _h: i._h };
      for (const [k, a] of Object.entries<any>(r.answers)) { out[k] = Math.round(a.score * 100) / 100; out[k + "_conf"] = Math.round(a.confidence * 100) / 100; }
      return { k: i.k, out, tokens: r.tokens };
    } catch (e) {
      if (e instanceof AiBlocked) blocked = e.message;
      return null;
    }
  });
  const ok = res.filter(Boolean) as { k: string; out: unknown; tokens: number }[];
  for (const c of chunks(ok, 50)) await db.batch(c.map(r => db.prepare("INSERT OR REPLACE INTO ideas_eval(k, data) VALUES (?, ?)").bind(r.k, JSON.stringify(r.out))));
  const log = await ai.flushLog(db, runId);
  const statuses: Record<string, number> = {};
  for (const c of log) statuses[String(c.status)] = (statuses[String(c.status)] || 0) + 1;
  return { todo: todo.length, asked: log.length, ok: ok.length, failed: todo.length - ok.length, tokens: ok.reduce((a, r) => a + r.tokens, 0), maxInflight: ai.maxInflight, statuses, ...(blocked ? { blocked } : {}) };
}
