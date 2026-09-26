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

export async function fetchJson(url: string, st?: FxStats, tries = 4, again404 = false): Promise<{ d: any | null; kind: FxKind }> {
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
      if ([400, 401, 403, 404].includes(r.status)) { await r.body?.cancel(); if (st) st.wait_ms += Date.now() - t0; return { d: null, kind: "gone" }; }
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
