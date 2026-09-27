// Writes of the published JSON to R2, one object at a time, each retried on its own.
// From about 13:40 UTC on 2026-09-27, R2 answered a share of PutObject calls with HTTP 500 ("We encountered an internal
// error. Please try again. (10001)", sometimes "Unspecified error (0)") in both radar buckets (WEUR), after the call had
// hung for one to six minutes. Only the larger objects failed (posts, tools, gallery and people, 0.3 to 7 MB: 7 to 42 % of
// their writes between 13:30 and 16:20 UTC); meta.json and keywords.json (under 15 KB) never did, and the objects had not
// grown (item counts moved under 1 % that day). In AGK Radar's bucket, data/ranks.json and data/posts.json failed (3 of 34). The four retries of a whole build-publish step rebuilt and rewrote every
// file and failed together, so a pass failed. Now each object is retried alone with exponential backoff and jitter, a
// hung call is abandoned after PUT_TIMEOUT_MS, and an object whose content is already stored (same SHA-256 in its custom
// metadata) is not written again, so a retried step only writes what is still missing.
export const PUT_TRIES = 6;
export const PUT_TIMEOUT_MS = 90_000;
const BACKOFF_BASE_MS = 2_000, BACKOFF_MAX_MS = 30_000;
/** Retries stop starting once this much time has gone by in one publish (the step times out at 30 minutes and is retried). */
export const PUBLISH_BUDGET_MS = 18 * 60_000;

export const JSON_META = { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=30" };

export interface PutStats { written: number; unchanged: number; retries: number; errors: string[]; ms: number }
export const putStats = (): PutStats => ({ written: 0, unchanged: 0, retries: 0, errors: [], ms: 0 });

/** Delay before retry `i` (0-based): exponential, capped, with jitter so passes that failed together do not retry together. */
export const backoff = (i: number, rnd = Math.random()) => Math.round(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** i) * (0.5 + rnd));

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: any;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: no answer after ${ms / 1000} s`)), ms); })])
    .finally(() => clearTimeout(t));
}

/** Writes `body` under `key` unless the stored object already has that content. Throws the last error when every try
 *  failed or the publish budget ran out (the step's own retry then starts over, skipping the objects already written). */
export async function putJson(bucket: R2Bucket, key: string, body: string, st: PutStats = putStats(), started = Date.now(),
    wait = (ms: number) => new Promise(res => setTimeout(res, ms))): Promise<"written" | "unchanged"> {
  const t0 = Date.now();
  const hash = await sha256(body);
  try {
    const head = await bucket.head(key);
    if (head && head.customMetadata && head.customMetadata.sha256 === hash) { st.unchanged++; st.ms += Date.now() - t0; return "unchanged"; }
  } catch { /* a failed head only means the object is written again */ }
  for (let i = 0; ; i++) {
    try {
      await timeout(bucket.put(key, body, { httpMetadata: JSON_META, customMetadata: { sha256: hash } }), PUT_TIMEOUT_MS, `put ${key}`);
      st.written++; st.ms += Date.now() - t0;
      return "written";
    } catch (e: any) {
      const msg = `${key}: ${String(e?.message || e).slice(0, 120)}`;
      if (st.errors.length < 12) st.errors.push(msg);
      if (i + 1 >= PUT_TRIES || Date.now() - started > PUBLISH_BUDGET_MS) { st.ms += Date.now() - t0; throw new Error(`put: ${msg} (${i + 1} tries)`); }
      st.retries++;
      await wait(backoff(i));
    }
  }
}
