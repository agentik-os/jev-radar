// Public fxtwitter API (no X account needed), with the retry rules of pipeline/common.get_json.
import { sleep } from "./env";

const UA = "agk-radar/2.0 (+https://github.com/agentik-os/jev-radar)";
export let fxCalls = 0;
export const resetFxCalls = () => { const n = fxCalls; fxCalls = 0; return n; };

/** Request counters of one step: calls, answers other than 2xx/4xx by kind, time spent waiting for answers and in back-off. */
export interface FxStats { calls: number; retried: Record<string, number>; wait_ms: number; backoff_ms: number }
export const fxStats = (): FxStats => ({ calls: 0, retried: {}, wait_ms: 0, backoff_ms: 0 });
export function addFx(a: FxStats, b: FxStats) {
  a.calls += b.calls; a.wait_ms += b.wait_ms; a.backoff_ms += b.backoff_ms;
  for (const [k, v] of Object.entries(b.retried)) a.retried[k] = (a.retried[k] || 0) + v;
  return a;
}

/** How a request ended: "ok" (2xx, body parsed), "gone" (400/401/403/404: fxtwitter's answer about the account or post,
 *  which it also gives for a live account now and then) or "transient" (429, 5xx, timeout or network error on every try).
 *  `again404`: ask once more after a 404 before taking it as the answer (fxtwitter answers 404 to a few percent of the
 *  timeline reads of live accounts from a Worker; a profile read asks twice). */
export type FxKind = "ok" | "gone" | "transient";

export async function fetchJson(url: string, st?: FxStats, tries = 4, again404 = false): Promise<{ d: any | null; kind: FxKind; status?: number }> {
  let asked404 = false;
  for (let i = 0; i < tries; i++) {
    fxCalls++;
    if (st) st.calls++;
    const t0 = Date.now();
    let why = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 404 && again404 && !asked404) {
        asked404 = true; await r.body?.cancel();
        if (st) { st.wait_ms += Date.now() - t0; st.retried["404"] = (st.retried["404"] || 0) + 1; st.backoff_ms += 3000; }
        await sleep(3000); i--; continue;
      }
      if ([400, 401, 403, 404].includes(r.status)) { await r.body?.cancel(); if (st) st.wait_ms += Date.now() - t0; return { d: null, kind: "gone", status: r.status }; }
      if (r.ok) { const d = await r.json(); if (st) st.wait_ms += Date.now() - t0; return { d, kind: "ok" }; }
      why = String(r.status);
      await r.body?.cancel();
    } catch (e: any) { why = /timed? ?out|abort/i.test(String(e?.message || e)) ? "timeout" : "error"; }
    if (st) { st.wait_ms += Date.now() - t0; st.retried[why] = (st.retried[why] || 0) + 1; }
    if (i < tries - 1) { await sleep(2000 * (i + 1)); if (st) st.backoff_ms += 2000 * (i + 1); }
  }
  return { d: null, kind: "transient" };
}

export async function getJson(url: string, st?: FxStats, tries = 4): Promise<any | null> {
  return (await fetchJson(url, st, tries)).d;
}

/** What fxtwitter says about an account on a later, separate look: its first timeline page (`tl`) and up to three reads of
 *  its profile (`pr`), a few seconds apart, on two endpoints: `/2/profile/<handle>`, `/<handle>`, `/2/profile/<handle>`.
 *  Since 2026-09-26 23:00 UTC fxtwitter answers 404 for live accounts on a share of the requests to every endpoint, with
 *  the same body, headers and about the same timing as a real 404, sometimes several in a row (2026-09-27 12:55 UTC: 33 %
 *  of timeline reads, 21 % of `/2/profile` reads, 12 % of `/<handle>` reads of live accounts); an account that is really
 *  gone or renamed answers 404 on every one. */
export interface Look { tl: "posts" | "empty" | "404" | "other"; pr: ("user" | "404" | "other")[] }

const PROFILE = [(h: string) => `https://api.fxtwitter.com/2/profile/${h}`, (h: string) => `https://api.fxtwitter.com/${h}`,
  (h: string) => `https://api.fxtwitter.com/2/profile/${h}`];

export async function lookAgain(handle: string, st?: FxStats, gapMs = 3000): Promise<Look> {
  const t = await fetchJson(`https://api.fxtwitter.com/2/profile/${handle}/statuses`, st, 4);
  const tl: Look["tl"] = t.kind === "ok" ? ((t.d?.results || []).length ? "posts" : "empty") : t.status === 404 ? "404" : "other";
  const pr: Look["pr"] = [];
  if (tl === "posts") return { tl, pr };
  for (let i = 0; i < PROFILE.length; i++) {
    if (i) await sleep(gapMs);
    const p = await fetchJson(PROFILE[i](handle), st, 4);
    pr.push(p.kind === "ok" && p.d?.user?.screen_name ? "user" : p.status === 404 ? "404" : "other");
    if (pr[i] !== "404") break; // one profile answer is enough to know the account exists; throttling makes the look unsure
  }
  return { tl, pr };
}

/** The confirmation rule (same as the radars). "live": any look found the account (a timeline with posts, or its profile).
 *  "gone": the timeline has nothing (404 or empty) and all three profile reads answer 404. Anything else is "unsure" and
 *  counts like throttling. */
export function verdict(l: Look): "live" | "gone" | "unsure" {
  if (l.tl === "posts" || l.pr.includes("user")) return "live";
  if ((l.tl === "404" || l.tl === "empty") && l.pr.length >= PROFILE.length && l.pr.every(x => x === "404")) return "gone";
  return "unsure";
}
