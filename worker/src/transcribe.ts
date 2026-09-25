// Video transcription with Workers AI Whisper (replaces faster-whisper on the old VPS).
//
// Audio comes from the video's HLS audio rendition (X serves every video as HLS with a separate AAC track in 3-second
// fMP4 segments): the first MAX_SECONDS (30 minutes, as MAX_SECONDS in the old transcribe.py) are fetched and sent to
// Whisper in CHUNK_SECONDS pieces, so a long video is no longer "too large". A video without an HLS playlist falls back
// to its smallest mp4 rendition, sent whole when it is at most MAX_BYTES.
//
// An empty transcript is kept only when it is proven: the playlist declares no audio track (no_audio), or Whisper's
// voice activity detection found no speech in the audio (no_speech, e.g. music only). Every other error is retried with
// back-off inside the call; if it still fails the video stays pending and the next pass tries again, and after
// MAX_ATTEMPTS passes it is stored as "[failed: …]" so it is not retried forever.
import { Env, now as nowS, pool } from "./env";

export const MAX_SECONDS = 1800;
export const CHUNK_SECONDS = 600;
const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_ATTEMPTS = 4;        // passes
const CALL_TRIES = 3;                 // tries per request inside one pass
export const LONG_VIDEO = 300;        // seconds; a fast pass leaves longer videos to the full pass
const UA = { "User-Agent": "Mozilla/5.0" };

export type Status = "ok" | "no_audio" | "no_speech" | "failed";
export interface Outcome { text: string; status: Status; detail: string; seconds: number; chunks: number; source: "hls" | "mp4" | "" }
export class Transient extends Error {}
class NoAudioRendition extends Error {}
export interface PendingVideo { video_id: string; post_id: string; url: string; duration: number; hls: string | null; attempts: number }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Retries a request on network errors, 429 and 5xx with exponential back-off; 4xx is final. */
async function fetchRetry(url: string): Promise<Response> {
  let last = "";
  for (let i = 0; i < CALL_TRIES; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) return r;
      last = `HTTP ${r.status}`;
      await r.body?.cancel();
    } catch (e: any) { last = String(e?.message || e).slice(0, 80); }
    if (i < CALL_TRIES - 1) await sleep(1500 * 4 ** i);
  }
  throw new Transient(`fetch: ${last}`);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** One Whisper request with retries: Workers AI sometimes answers "3030: Failed to decode audio file" for audio it
 *  decodes on the next try, so no error is taken as a property of the video. */
async function whisper(env: Env, audio: Uint8Array): Promise<{ text: string; speech: number | null }> {
  const body = b64(audio);
  let last = "";
  for (let i = 0; i < CALL_TRIES; i++) {
    try {
      const out: any = await env.AI.run(env.WHISPER_MODEL as any, { audio: body, vad_filter: true } as any);
      const text = String(out?.text ?? (out?.segments || []).map((s: any) => s.text).join(" ") ?? "");
      const info = out?.transcription_info || {};
      return { text: text.split(/\s+/).filter(Boolean).join(" "), speech: typeof info.duration_after_vad === "number" ? info.duration_after_vad : null };
    } catch (e: any) { last = String(e?.message || e).slice(0, 120); }
    if (i < CALL_TRIES - 1) await sleep(2000 * 4 ** i);
  }
  throw new Transient(`whisper: ${last}`);
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** The HLS master playlist of a video (fxtwitter lists it in formats), or null. */
export function hlsUrl(video: any): string | null {
  const f = ((video?.formats || []) as any[]).find(x => x.container === "m3u8" && x.url);
  return f ? f.url : null;
}

async function viaHls(env: Env, master: string): Promise<Outcome> {
  const res = await fetchRetry(master);
  if (!res.ok) throw new Error(`playlist HTTP ${res.status}`);
  const text = await res.text();
  const groups = [...text.matchAll(/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*/g)].map(m => {
    const uri = /URI="([^"]+)"/.exec(m[0])?.[1];
    const bps = Number(/GROUP-ID="audio-(\d+)"/.exec(m[0])?.[1] || 0);
    return { uri, bps };
  }).filter(g => g.uri) as { uri: string; bps: number }[];
  const muxedAudio = /CODECS="[^"]*mp4a/.test(text);
  if (!groups.length) {
    // no separate audio rendition and no audio codec in any variant: the video has no sound track
    if (!muxedAudio) return { text: "", status: "no_audio", detail: "HLS playlist declares no audio track", seconds: 0, chunks: 0, source: "hls" };
    throw new NoAudioRendition(); // audio muxed into the video segments: use the mp4
  }
  // 64 kb/s when offered (clearer speech than 32 kb/s, a quarter of the 128 kb/s download)
  groups.sort((a, b) => Math.abs(a.bps - 64000) - Math.abs(b.bps - 64000));
  const base = new URL(master);
  const plRes = await fetchRetry(new URL(groups[0].uri, base).toString());
  if (!plRes.ok) throw new Error(`audio playlist HTTP ${plRes.status}`);
  const pl = await plRes.text();
  const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(pl)?.[1];
  const segs: { url: string; d: number }[] = [];
  let d = 0, total = 0;
  for (const line of pl.split("\n")) {
    const l = line.trim();
    if (l.startsWith("#EXTINF:")) d = parseFloat(l.slice(8));
    else if (l && !l.startsWith("#")) {
      if (total >= MAX_SECONDS) break;
      segs.push({ url: new URL(l, base).toString(), d }); total += d;
    }
  }
  if (!init || !segs.length) throw new Error("audio playlist without segments");
  const initBytes = new Uint8Array(await (await fetchRetry(new URL(init, base).toString())).arrayBuffer());
  // chunks of at most CHUNK_SECONDS of audio, each a valid fragmented MP4 (init segment + media segments)
  const chunks: { url: string; d: number }[][] = [];
  let cur: { url: string; d: number }[] = [], curD = 0;
  for (const s of segs) {
    if (curD + s.d > CHUNK_SECONDS && cur.length) { chunks.push(cur); cur = []; curD = 0; }
    cur.push(s); curD += s.d;
  }
  if (cur.length) chunks.push(cur);
  const texts: string[] = [];
  let speech = 0, speechKnown = true;
  for (const c of chunks) {
    const parts = await pool(c, 8, async s => {
      const r = await fetchRetry(s.url);
      if (!r.ok) throw new Transient(`segment HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    const w = await whisper(env, concat([initBytes, ...parts]));
    if (w.text) texts.push(w.text);
    if (w.speech === null) speechKnown = false; else speech += w.speech;
  }
  const out = texts.join(" ");
  if (out) return { text: out, status: "ok", detail: `${chunks.length} chunk(s)`, seconds: Math.round(total), chunks: chunks.length, source: "hls" };
  if (speechKnown && speech < 1) return { text: "", status: "no_speech", detail: "voice activity detection found no speech", seconds: Math.round(total), chunks: chunks.length, source: "hls" };
  throw new Transient("empty transcript with speech detected");
}

async function viaMp4(env: Env, url: string): Promise<Outcome> {
  const r = await fetchRetry(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BYTES) { await r.body?.cancel(); throw new Error("too large and no HLS audio rendition"); }
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("too large and no HLS audio rendition");
  const w = await whisper(env, buf);
  if (w.text) return { text: w.text, status: "ok", detail: "whole mp4", seconds: 0, chunks: 1, source: "mp4" };
  if (w.speech !== null && w.speech < 1) return { text: "", status: "no_speech", detail: "voice activity detection found no speech", seconds: 0, chunks: 1, source: "mp4" };
  throw new Transient("empty transcript with speech detected");
}

/** Transcribes one video. Returns a final outcome, or throws Transient when a later pass should try again. */
export async function transcribeOne(env: Env, v: { url: string; hls?: string | null }): Promise<Outcome> {
  try {
    if (v.hls) {
      try { return await viaHls(env, v.hls); } catch (e) { if (!(e instanceof NoAudioRendition)) throw e; }
    }
    return await viaMp4(env, v.url);
  } catch (e: any) {
    if (e instanceof Transient) throw e;
    // a definite answer that is not a transcript (the video is gone, or cannot be read without ffmpeg)
    return { text: `[failed: ${String(e?.message || e).slice(0, 60)}]`, status: "failed", detail: String(e?.message || e), seconds: 0, chunks: 0, source: v.hls ? "hls" : "mp4" };
  }
}

/** Videos to transcribe: never transcribed, or stored empty or "too large" by the first Cloudflare passes, before an
 *  empty transcript had to be proven (status NULL, created_at > 0; imported transcripts have created_at = 0). */
export async function pendingVideos(env: Env, limit: number, maxDuration = Infinity): Promise<PendingVideo[]> {
  const r = await env.DB.prepare(`SELECT v.video_id, v.post_id, v.url, v.duration, v.attempts, p.raw FROM videos v
      LEFT JOIN transcripts t ON t.video_id = v.video_id JOIN posts p ON p.id = v.post_id
    WHERE v.url != '' AND v.attempts < ? AND v.duration <= ?
      AND (t.video_id IS NULL OR (t.status IS NULL AND t.created_at > 0 AND (t.text = '' OR t.text = '[failed: too large]')))
    ORDER BY v.rowid DESC LIMIT ?`).bind(MAX_ATTEMPTS, Number.isFinite(maxDuration) ? maxDuration : 1e9, limit)
    .all<{ video_id: string; post_id: string; url: string; duration: number; attempts: number; raw: string }>();
  return r.results.map(x => {
    const vid = (((JSON.parse(x.raw).media || {}).videos || []) as any[]).find(y => String(y.id) === x.video_id);
    return { video_id: x.video_id, post_id: x.post_id, url: x.url, duration: x.duration, attempts: x.attempts, hls: hlsUrl(vid) };
  });
}

/** Stores a final outcome, or counts a failed attempt (the last allowed attempt stores "[failed: …]"). */
export async function record(env: Env, v: PendingVideo, o: Outcome | { transient: string }, ts = nowS()) {
  const db = env.DB;
  if ("transient" in o) {
    if (v.attempts + 1 >= MAX_ATTEMPTS) {
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO transcripts(video_id, text, created_at, status) VALUES (?,?,?, 'failed')").bind(v.video_id, `[failed: ${o.transient.slice(0, 60)}]`, ts),
        db.prepare("UPDATE videos SET attempts = attempts + 1, last_error = ? WHERE video_id = ?").bind(o.transient.slice(0, 200), v.video_id),
      ]);
      return "failed";
    }
    await db.prepare("UPDATE videos SET attempts = attempts + 1, last_error = ? WHERE video_id = ?").bind(o.transient.slice(0, 200), v.video_id).run();
    return "retry";
  }
  await db.prepare("INSERT OR REPLACE INTO transcripts(video_id, text, created_at, status) VALUES (?,?,?,?)").bind(v.video_id, o.text, ts, o.status).run();
  return o.status;
}

/** Step: transcribe a few pending videos; returns the posts whose classification input changed. */
export async function transcribeSlice(env: Env, videos: PendingVideo[]) {
  const done = await pool(videos, 3, async v => {
    let o: Outcome | { transient: string };
    try { o = await transcribeOne(env, v); } catch (e: any) { o = { transient: String(e?.message || e) }; }
    return { post_id: v.post_id, result: await record(env, v, o) };
  });
  const n = (s: string) => done.filter(d => d.result === s).length;
  return { posts: [...new Set(done.filter(d => d.result !== "retry").map(d => d.post_id))], ok: n("ok"), no_audio: n("no_audio"), no_speech: n("no_speech"),
    failed: n("failed"), retry: n("retry") };
}
