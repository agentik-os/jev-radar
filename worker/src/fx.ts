// Public fxtwitter API (no X account needed), with the retry rules of pipeline/common.get_json.
import { sleep } from "./env";

const UA = "agk-radar/2.0 (+https://github.com/agentik-os/jev-radar)";
export let fxCalls = 0;
export const resetFxCalls = () => { const n = fxCalls; fxCalls = 0; return n; };

export async function getJson(url: string, tries = 4): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    fxCalls++;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if ([400, 401, 403, 404].includes(r.status)) return null;
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}
