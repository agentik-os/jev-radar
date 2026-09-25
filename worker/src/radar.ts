// Pure radar logic ported from pipeline/*.py (crawl filters, classification state, site build).
// No bindings here, so the module also runs under Node for parity tests.
import { pyDumps, pySlice, pySplit, sha1hex } from "./py";
import QCONF from "./config/questions.json";
import NICHES from "./config/niches.json";
import IDEAS_CONF from "./config/ideas.json";
import PLAYS from "./config/plays.json";

export type Raw = any; // one fxtwitter status object, as stored in the posts table
export type Answers = Record<string, any>;

export const LAUNCH = 1789344000; // 2026-09-14 00:00 UTC, the day before the model launch
export const QVER: string = QCONF.qver;
export const QUESTIONS: Record<string, any> = QCONF.questions;

// ---------------------------------------------------------------- crawl filters (pipeline/crawl.py)
const MATCH = /\bjev\b|typesafe/i;
const STATUS = /(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{15,20})/g;
const MENTION = /@(\w{1,15})/g;
const SKIP = new Set(["i", "home", "search", "intent", "share"]);

export function textBlob(t: Raw): string {
  const a = t.article || {};
  const parts = [t.text || "", (t.quote || {}).text || "", a.title || ""];
  for (const b of (a.content || {}).blocks || []) parts.push(b.text || "");
  return parts.join("\n");
}

/** A post counts when it was published after launch and names the model or its maker. */
export function isTracked(t: Raw): boolean {
  return (t.created_timestamp || 0) >= LAUNCH && MATCH.test(textBlob(t));
}

/** Linked statuses and handles found in a post (same rules as crawl.links). */
export function links(t: Raw, rawJson?: string): { ids: [string, string][]; handles: string[] } {
  const ids = new Map<string, [string, string]>();
  const json = rawJson ?? JSON.stringify(t);
  for (const m of json.matchAll(STATUS)) if (!SKIP.has(m[1].toLowerCase())) ids.set(m[2], [m[1], m[2]]);
  const handles = new Set<string>();
  for (const m of textBlob(t).matchAll(MENTION)) handles.add(m[1]);
  handles.add((t.author || {}).screen_name || "");
  const q = t.quote || {};
  if (Object.keys(q).length) {
    const qa = (q.author || {}).screen_name || "";
    handles.add(qa);
    if (q.id) ids.set(q.id, [qa || "i", q.id]);
  }
  return { ids: [...ids.values()].filter(p => p[1]), handles: [...handles].filter(Boolean) };
}

// ---------------------------------------------------------------- classification state (pipeline/analyze.py)
/** Useful speech from a video transcript: tags removed, empty when there is no voice or a repetitive hallucination. */
export function speech(t: Raw, transcripts: Record<string, string>): string {
  const vids = ((t.media || {}).videos || []) as any[];
  const text = vids.map(v => (transcripts[v.id] || "").replace(/\[[^\]]*\]|\([^)]*\)/g, " ")).join(" ");
  const words = pySplit(text);
  return words.length >= 15 && new Set(words).size / words.length > 0.25 ? words.join(" ") : "";
}

export function classifyState(t: Raw, transcripts: Record<string, string>): Record<string, unknown> {
  const q = t.quote || {}, a = t.article || {};
  const facets = ((t.raw_text || {}).facets || []) as any[];
  const s: Record<string, unknown> = { post: t.text || "", author: (t.author || {}).screen_name ?? null };
  if (Object.keys(q).length) s.quoted_post = q.text || "";
  if (Object.keys(a).length) {
    const body = ((a.content || {}).blocks || []).map((b: any) => b.text || "").join("\n");
    s.article = pySlice((a.title || "") + "\n" + body, 6000);
  }
  const tr = speech(t, transcripts);
  if (tr) s.video_transcript = pySlice(tr, 6000);
  const m = t.media || {};
  s.attachments = `${(m.photos || []).length} image(s), ${(m.videos || []).length} video(s)`;
  const lk = facets.filter(f => f.type === "url" && f.replacement).map(f => f.replacement);
  if (lk.length) s.links = lk;
  return s;
}

export async function stateKey(state: Record<string, unknown>): Promise<string> {
  return (await sha1hex(QVER + pyDumps(state))).slice(0, 16);
}

/** Flattens an API answer set the way analyze.flat does. */
export function flat(answers: Record<string, any>): Answers {
  const out: Answers = {};
  for (const [k, a] of Object.entries(answers)) {
    if (a.type === "noul") out[k] = a.noul;
    else if (a.type === "choice") { out[k] = a.choice; out[k + "_conf"] = a.confidence; }
    else out[k] = a.score;
  }
  return out;
}

// ---------------------------------------------------------------- site build (pipeline/build.py)
export const WEIGHTS = { passive: 0.30, traction: 0.25, demand: 0.20, momentum: 0.15, space: 0.10 } as const;
export const PENDING: Answers = {
  about_jev: 1.0, category: "pending", domain: "general", pattern: "none", niche: "none", sentiment: 2.0, depth: 0.0,
  passive_potential: 0.0, demand_signal: 0.0, commercial: 0.0, working_demo: 0.0, open_source: 0.0, numbers: 0.0,
  vs_llm: 0.0, self_promo: 0.0,
};

/** Python round(x, n): round half to even on the decimal representation. */
export function pyRound(x: number, n = 0): number {
  const f = 10 ** n, y = x * f, r = Math.round(y);
  if (Math.abs(y % 1) === 0.5) return (r % 2 === 0 ? r : r - 1) / f;
  return r / f;
}
const r2 = (v: any) => (typeof v === "number" && !Number.isInteger(v) ? pyRound(v, 2) : v);

function smallMp4(v: any): string {
  const mp4 = ((v.formats || []) as any[]).filter(f => f.container === "mp4" && f.url);
  return mp4.length ? mp4.reduce((a, b) => ((b.bitrate || 1e12) < (a.bitrate || 1e12) ? b : a)).url : v.url;
}
export { smallMp4 };

export function compact(t: Raw, j: Answers, transcripts: Record<string, string>, systems: Record<string, any>): any {
  const a = t.author || {}, q = t.quote || {}, ar = t.article || {}, m = t.media || {};
  const facets = ((t.raw_text || {}).facets || []) as any[];
  const jj: Answers = {};
  for (const [k, v] of Object.entries(j)) if (!k.endsWith("_conf")) jj[k] = r2(v);
  const p: any = {
    id: t.id, u: t.url ?? null, c: t.created_timestamp ?? null, l: t.lang ?? null,
    a: { h: a.screen_name ?? null, n: a.name ?? null, f: a.followers || 0, av: a.avatar_url ?? null },
    t: t.text || "", r: Boolean(t.replying_to),
    ph: ((m.photos || []) as any[]).map(x => x.url),
    v: ((m.videos || []) as any[]).map(v => ({ u: v.url, s: smallMp4(v), th: v.thumbnail_url ?? null, d: pyRound(v.duration || 0), w: v.width ?? null, h: v.height ?? null })),
    lk: facets.filter(f => f.type === "url" && f.replacement).map(f => f.replacement),
    m: ["likes", "reposts", "replies", "bookmarks", "views"].map(k => t[k] || 0),
    j: jj,
  };
  if (Object.keys(q).length) p.q = { h: (q.author || {}).screen_name ?? null, t: q.text || "", u: q.url ?? null };
  if (Object.keys(ar).length) {
    const body = ((ar.content || {}).blocks || []).map((b: any) => b.text || "").join("\n");
    p.ar = { ti: ar.title ?? null, tx: pySlice(body, 3000), co: ((ar.cover_media || {}).media_info || {}).original_img_url ?? null };
  }
  const tr = speech(t, transcripts);
  if (tr) p.tr = pySlice(tr, 5000);
  if (systems[t.id]) p.sys = systems[t.id];
  return p;
}

const eng = (p: any) => p.m[0] + 2 * p.m[1] + p.m[3];

export function radarScore(p: any): number {
  const j = p.j;
  let s = Math.log1p(eng(p)) + 0.3 * Math.log1p(p.m[4]) / 3;
  s += ({ build_demo: 1.5, integration: 1.0, explainer: 0.6, official: 0.4 } as Record<string, number>)[j.category] || 0;
  return pyRound(s + 0.4 * (j.depth || 0) / 4 + 0.4 * (j.working_demo || 0) + 0.3 * (j.open_source || 0), 3);
}

export function nicheBoard(posts: any[], now: number): any[] {
  const main = posts.filter(p => !p.r && (p.j.niche ?? "none") !== "none");
  const total = main.length || 1;
  const recentTotal = main.filter(p => p.c >= now - 48 * 3600).length || 1;
  const by = new Map<string, any[]>();
  for (const p of main) { if (!by.has(p.j.niche)) by.set(p.j.niche, []); by.get(p.j.niche)!.push(p); }
  const raw = new Map<string, any>();
  for (const [n, ps] of by) {
    let builds = ps.filter(p => ["build_demo", "integration", "official"].includes(p.j.category));
    if (!builds.length) builds = ps;
    const w = builds.map(p => Math.log1p(p.m[4]) + 1);
    const wsum = w.reduce((a, b) => a + b, 0);
    raw.set(n, {
      passive: builds.reduce((a, p, i) => a + (p.j.passive_potential || 0) * w[i], 0) / wsum / 4,
      traction: Math.log1p(ps.reduce((a, p) => a + eng(p), 0)),
      demand: ps.reduce((a, p) => a + (p.j.demand_signal || 0) * Math.log1p(p.m[0] + 1), 0)
        + 2 * ps.filter(p => p.j.category === "question").length,
      momentum: (ps.filter(p => p.c >= now - 48 * 3600).length / recentTotal) / (ps.length / total),
      space: 1 - ps.filter(p => (p.j.commercial || 0) > 0.5).length / ps.length,
      n: ps.length,
    });
  }
  const vals = [...raw.values()];
  const mx = { traction: Math.max(...vals.map(r => r.traction), 0) || 1, demand: Math.max(...vals.map(r => r.demand), 0) || 1 };
  if (!vals.length) { mx.traction = 1; mx.demand = 1; }
  const mnT = vals.length ? Math.min(...vals.map(r => r.traction)) : 0;
  const board: any[] = [];
  for (const [n, r] of raw) {
    const sub: Record<string, number> = {
      passive: r.passive, traction: (r.traction - mnT) / ((mx.traction - mnT) || 1), demand: r.demand / mx.demand,
      momentum: Math.min(r.momentum, 2) / 2, space: r.space,
    };
    const shrink = Math.min(1, Math.sqrt(r.n / 8));
    const score = 100 * shrink * Object.entries(sub).reduce((a, [k, v]) => a + (WEIGHTS as any)[k] * v, 0);
    const ps = [...by.get(n)!].sort((a, b) => b.m[4] - a.m[4]);
    const builds = ps.filter(p => ["build_demo", "integration"].includes(p.j.category));
    const nc = (NICHES as any)[n] || { en: n, fr: n, idea_en: "", idea_fr: "" };
    board.push({
      id: n, score: pyRound(score, 1), sub: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, pyRound(v, 3)])),
      posts: r.n, builds: builds.length, builders: new Set(builds.map(p => p.a.h)).size,
      views: ps.reduce((a, p) => a + p.m[4], 0), recent48: ps.filter(p => p.c >= now - 48 * 3600).length,
      open_source: ps.filter(p => (p.j.open_source || 0) > 0.5).length,
      commercial: ps.filter(p => (p.j.commercial || 0) > 0.5).length,
      top: ps.slice(0, 4).map(p => p.id),
      label: { fr: nc.fr, en: nc.en }, idea: { fr: nc.idea_fr, en: nc.idea_en },
    });
  }
  board.sort((a, b) => b.score - a.score);
  board.forEach((b, i) => (b.rank = i + 1));
  return board;
}

export const IDEAS: any[] = (IDEAS_CONF as any).ideas;
export const IDEA_WEIGHTS: Record<string, number> = (IDEAS_CONF as any).weights;
export const IDEA_CRITERIA: Record<string, string[]> = (IDEAS_CONF as any).criteria;
export const IDEA_QTEXT: Record<string, string> = (IDEAS_CONF as any).questions_text;
export const IDEA_ENGINE: string = (IDEAS_CONF as any).engine;

const IDEA_PUBLIC = ["k", "n", "en", "fr", "pen", "pfr", "ben", "bfr", "price"];

export function buildIdeas(evals: Record<string, any>, board: any[]): any[] {
  const nscore = new Map(board.map(b => [b.id, b]));
  const ideas: any[] = [];
  for (const i of IDEAS) {
    const e = evals[i.k];
    if (!e) continue;
    const nb = i.n ? nscore.get(i.n) : undefined;
    const sub: Record<string, number> = {};
    for (const k of ["pain", "recurring", "automation", "jev_fit", "open_market", "build_ease"]) sub[k] = e[k] / 4;
    sub.x_signal = nb ? nb.score / 100 : 0.0;
    const pub = Object.fromEntries(IDEA_PUBLIC.map(k => [k, i[k] ?? null]));
    ideas.push({
      ...pub, sub: Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, pyRound(v, 3)])),
      score: pyRound(100 * Object.entries(sub).reduce((a, [k, v]) => a + IDEA_WEIGHTS[k] * v, 0), 1),
      niche_rank: nb ? nb.rank : null, niche_posts: nb ? nb.posts : 0, untapped: !nb || nb.builds === 0,
    });
  }
  ideas.sort((a, b) => b.score - a.score);
  ideas.forEach((x, r) => (x.rank = r + 1));
  return ideas;
}

export function buildPlays(ideas: any[], board: any[]): any[] {
  const nscore = new Map(board.map(b => [b.id, b]));
  const ibyk = new Map(ideas.map(i => [i.k, i]));
  return (PLAYS as any[]).map(pl => {
    const nb = nscore.get(pl.niche), idea = pl.idea ? ibyk.get(pl.idea) : undefined;
    return { ...pl, niche_rank: nb ? nb.rank : null, niche_score: nb ? nb.score : 0, niche_posts: nb ? nb.posts : 0,
      niche_top: nb ? nb.top.slice(0, 2) : [], idea_score: idea ? idea.score : null };
  });
}
