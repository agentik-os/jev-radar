// Video transcription with Workers AI Whisper (replaces faster-whisper on the old VPS).
//
// Audio comes from the video's HLS audio rendition (X serves every video as HLS with a separate AAC track in 3-second
// fMP4 segments): the first MAX_SECONDS (30 minutes, as MAX_SECONDS in the old transcribe.py) are fetched and sent to
// Whisper in CHUNK_SECONDS pieces, so a long video is no longer "too large". A video without an HLS playlist falls back
// to its smallest mp4 rendition, sent whole when it is at most MAX_BYTES.
//
// An empty transcript is kept only when it is proven: the playlist declares no audio track (no_audio), or Whisper found
// no speech in the audio (no_speech, e.g. music only): its voice activity detection kept under 1 s of audio and a second
// hearing without it found no clear speech (see `whisper`), or every segment it wrote is one of its known hallucinations
// on non-speech audio (see `hallucinated`). Every other error is
// retried with back-off inside the call; if it still fails the video stays pending and the next pass tries again, and
// after MAX_ATTEMPTS passes it is stored as "[failed: …]" so it is not retried forever. Running out of the Worker
// invocation's subrequest budget is not a property of the video: it is not retried in that invocation and does not count
// as an attempt (Deferred), the next pass takes the video again.
import { Env, now as nowS, pool } from "./env";

export const MAX_SECONDS = 1800;
export const CHUNK_SECONDS = 600;
const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_ATTEMPTS = 4;        // passes
const CALL_TRIES = 3;                 // tries per request inside one pass
export const LONG_VIDEO = 300;        // seconds; a fast pass leaves longer videos to the full pass
const UA = { "User-Agent": "Mozilla/5.0" };

export type Status = "ok" | "no_audio" | "no_speech" | "failed";
export interface Outcome { text: string; status: Status; detail: string; seconds: number; chunks: number; source: "hls" | "mp4" | ""; segments?: any[] }
export class Transient extends Error {}
/** The invocation's subrequest budget is used up: retrying in the same invocation fails the same way. */
export class Deferred extends Error {}
const BUDGET = /too many subrequests/i;
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
    } catch (e: any) {
      last = String(e?.message || e).slice(0, 80);
      if (BUDGET.test(last)) throw new Deferred(`fetch: ${last}`);
    }
    if (i < CALL_TRIES - 1) await sleep(1500 * 4 ** i);
  }
  throw new Transient(`fetch: ${last}`);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Whisper's well-known inventions on music, noise or silence (lower case, punctuation and spaces removed). A transcript
// made only of these, segment by segment, is not speech: e.g. "Thank you." on music, "you" on birdsong, a TV-station
// credit or a subtitle credit on a song. Real speech that happens to say one of them is kept when the audio has other
// speech; a video whose only words are "thank you" is stored as no_speech, which loses nothing the classifier uses
// (transcripts under 15 words are not sent to it, see radar.speech).
const HALLUCINATIONS = new Set([
  "you", "thankyou", "thankyouverymuch", "thankyousomuch", "thanks", "thanksforwatching", "thankyouforwatching", "thanksforwatchingandillseeyounexttime",
  "pleasesubscribe", "pleasesubscribetomychannel", "subscribe", "bye", "byebye", "ok", "okay", "oh", "uh", "um", "hmm", "mm", "ah", "wow", "yeah",
  "music", "applause", "laughter", "silence", "foreign", "blankaudio", "musicplaying", "birdschirping", "noise",
  "subtitlesbytheamaraorgcommunity", "subtitlesbyamaraorg", "formoreinformationvisitwwwfemaorg", "formoreinformationvisitwwwfemagov",
  "ご視聴ありがとうございました", "ありがとうございました", "おやすみなさい", "시청해주셔서감사합니다", "감사합니다", "mbc뉴스", "字幕由amaraorg社区提供", "谢谢观看", "请不吝点赞订阅转发打赏支持明镜与点点栏目",
  "untertitelderamaraorgcommunity", "untertitelimauftragdeszdffürfunkinterpretation", "soustitragestfrançais", "soustitresréalisésparlacommunautédamaraorg",
  "gracias", "graciasporver", "obrigado", "merci", "danke",
]);
const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}\s]+/gu, "");
/** True when every sentence of the text is a known non-speech hallucination (see HALLUCINATIONS). */
export function hallucinated(text: string): boolean {
  const parts = text.split(/(?<=[.!?])\s+|(?<=[。！？])\s*|\n+/).map(norm).filter(Boolean);
  return parts.length > 0 && parts.every(p => HALLUCINATIONS.has(p) || HALLUCINATIONS.has(p.replace(/(.+?)\1+$/, "$1")));
}

interface Heard { text: string; speech: number | null; removed: number; novad?: boolean; segments?: any[]; info?: any }

// When the voice activity detection keeps under 1 s of audio, the audio is heard a second time without it: Whisper's VAD
// (Silero) misses speech under loud game sound, gunfire or music (2103613540166664192, a 5-minute game video: VAD 0 s,
// while the voices say "Reload!", "Get to the chopper!", "Rescue 7 affirmative"). That second result is kept only when
// it is clearly speech: at least FALLBACK_MIN_SEGMENTS segments and FALLBACK_MIN_WORDS words (what radar.speech needs
// to send a transcript to the classifier) after the filters below, not one phrase looping. On silence and music it is
// one or two invented lines ("Thank you.", "We'll be right back.", "This video is brought to you by…"), so those videos
// stay no_speech. condition_on_previous_text is off for it, since conditioning makes Whisper loop on one line there.
const FALLBACK_MIN_SEGMENTS = 3, FALLBACK_MIN_WORDS = 15;

async function runWhisper(env: Env, input: Record<string, unknown>): Promise<any> {
  let last = "";
  for (let i = 0; i < CALL_TRIES; i++) {
    try {
      return await env.AI.run(env.WHISPER_MODEL as any, input as any);
    } catch (e: any) {
      last = String(e?.message || e).slice(0, 120);
      if (BUDGET.test(last)) throw new Deferred(`whisper: ${last}`);
      if (i < CALL_TRIES - 1) await sleep(2000 * 4 ** i);
    }
  }
  throw new Transient(`whisper: ${last}`);
}

/** Text of one Whisper result after the filters. Segments Whisper itself rates as probably not speech (no_speech_prob >
 *  0.6 with avg_logprob < -1, its own rule; Workers AI reports no_speech_prob 0), as looping text (compression_ratio >
 *  2.4), as a low-confidence loop (avg_logprob < -1 with compression_ratio > 2.2: e.g. one sentence repeated over a song)
 *  or as a guess (avg_logprob < -2) are dropped, and so is a chunk left with under 60 words, every segment below -1; a
 *  result left with only known hallucinations is empty. Measured on 2026-09-25: real speech averages -0.11 to -0.34 per
 *  chunk, its worst segment -1.38 at ratio 2.09; the music loops seen score -1.13 at 2.40. */
function filtered(out: any): { text: string; removed: number; kept: number } {
  const segs: any[] = Array.isArray(out?.segments) ? out.segments : [];
  let removed = 0, text: string, kept = 0;
  if (segs.length) {
    const good = segs.filter(s => {
      const lp = Number(s.avg_logprob), cr = Number(s.compression_ratio);
      const bad = (Number(s.no_speech_prob) > 0.6 && lp < -1) || cr > 2.4 || (lp < -1 && cr > 2.2) || lp < -2;
      if (bad) removed++;
      return !bad;
    });
    text = good.map(s => String(s.text || "")).join(" ");
    kept = good.length;
    // a few words, every segment written at low confidence: what Whisper invents over music (e.g. "I love you." twice
    // at -1.62, or 23 words at -1.51/-1.04, over a song that whisper.cpp hears as [MUSIC PLAYING]). Real speech scores
    // -0.1 to -0.35 on average; its worst segments reach about -1.4, never all of them in a short chunk.
    if (good.length && good.every(s => Number(s.avg_logprob) < -1) && text.split(/\s+/).filter(Boolean).length < 60) { removed += good.length; text = ""; kept = 0; }
  } else { text = String(out?.text ?? ""); kept = text.trim() ? 1 : 0; }
  text = text.split(/\s+/).filter(Boolean).join(" ");
  if (text && hallucinated(text)) { removed++; text = ""; kept = 0; }
  return { text, removed, kept };
}

const debugSegs = (out: any) => ((Array.isArray(out?.segments) ? out.segments : []) as any[]).map(s => ({ start: s.start, end: s.end, text: s.text,
  avg_logprob: s.avg_logprob, no_speech_prob: s.no_speech_prob, compression_ratio: s.compression_ratio }));

/** One Whisper request with retries (Workers AI sometimes answers "3030: Failed to decode audio file" for audio it
 *  decodes on the next try, so no error is taken as a property of the video), then the no-VAD second hearing above. */
async function whisper(env: Env, audio: Uint8Array, debug = false): Promise<Heard> {
  const body = b64(audio);
  const out = await runWhisper(env, { audio: body, vad_filter: true });
  const info = out?.transcription_info || {};
  const speech = typeof info.duration_after_vad === "number" ? info.duration_after_vad : null;
  const f = filtered(out);
  const dbg = debug ? { segments: debugSegs(out), info } : {};
  if (f.text || speech === null || speech >= 1) return { text: f.text, speech, removed: f.removed, ...dbg };
  const out2 = await runWhisper(env, { audio: body, vad_filter: false, condition_on_previous_text: false });
  const g = filtered(out2);
  const words = g.text.split(" ").filter(Boolean);
  const clear = g.kept >= FALLBACK_MIN_SEGMENTS && words.length >= FALLBACK_MIN_WORDS && new Set(words.map(w => w.toLowerCase())).size / words.length > 0.25;
  const dbg2 = debug ? { segments: debugSegs(out2), info: { vad: info, novad: out2?.transcription_info } } : {};
  if (clear) return { text: g.text, speech: null, removed: g.removed, novad: true, ...dbg2 };
  return { text: "", speech, removed: f.removed + (g.text ? 1 : 0), ...dbg2 };
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

async function viaHls(env: Env, master: string, debug = false): Promise<Outcome> {
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
  const heard: Heard[] = [];
  for (const c of chunks) {
    const parts = await pool(c, 8, async s => {
      const r = await fetchRetry(s.url);
      if (!r.ok) throw new Transient(`segment HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    const w = await whisper(env, concat([initBytes, ...parts]), debug);
    heard.push(w);
    if (w.text) texts.push(w.text);
  }
  return outcome(texts.join(" "), heard, { seconds: Math.round(total), chunks: chunks.length, source: "hls" });
}

/** The outcome of a transcription: text, or a proven empty result (no_speech), or a Transient error. */
function outcome(text: string, heard: Heard[], o: { seconds: number; chunks: number; source: "hls" | "mp4" }): Outcome {
  const segments = heard.some(h => h.segments) ? heard.flatMap(h => h.segments || []) : undefined;
  if (text) return { text, status: "ok", detail: `${o.chunks} chunk(s)${heard.some(h => h.novad) ? ", speech found without VAD" : ""}${heard.some(h => h.removed) ? ", non-speech segments removed" : ""}`, ...o, segments };
  const speech = heard.every(h => h.speech !== null) ? heard.reduce((a, h) => a + (h.speech || 0), 0) : null;
  if (speech !== null && speech < 1) return { text: "", status: "no_speech", detail: "voice activity detection found no speech, and the audio heard without it has no clear speech", ...o, segments };
  if (heard.some(h => h.removed)) return { text: "", status: "no_speech", detail: "Whisper heard only non-speech hallucinations (music or noise)", ...o, segments };
  throw new Transient("empty transcript with speech detected");
}

async function viaMp4(env: Env, url: string, debug = false): Promise<Outcome> {
  const r = await fetchRetry(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BYTES) { await r.body?.cancel(); throw new Error("too large and no HLS audio rendition"); }
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("too large and no HLS audio rendition");
  const w = await whisper(env, buf, debug);
  return outcome(w.text, [w], { seconds: 0, chunks: 1, source: "mp4" });
}

/** Transcribes one video. Returns a final outcome, or throws Transient when a later pass should try again. */
export async function transcribeOne(env: Env, v: { url: string; hls?: string | null }, debug = false): Promise<Outcome> {
  try {
    if (v.hls) {
      try { return await viaHls(env, v.hls, debug); } catch (e) { if (!(e instanceof NoAudioRendition)) throw e; }
    }
    return await viaMp4(env, v.url, debug);
  } catch (e: any) {
    if (e instanceof Transient || e instanceof Deferred) throw e;
    if (BUDGET.test(String(e?.message || e))) throw new Deferred(String(e?.message || e).slice(0, 120));
    // a definite answer that is not a transcript (the video is gone, or cannot be read without ffmpeg)
    return { text: `[failed: ${String(e?.message || e).slice(0, 60)}]`, status: "failed", detail: String(e?.message || e), seconds: 0, chunks: 0, source: v.hls ? "hls" : "mp4" };
  }
}

/** Videos to transcribe: never transcribed, or stored empty or "too large" by the first Cloudflare passes, before an
 *  empty transcript had to be proven (status NULL, created_at > 0; imported transcripts have created_at = 0), or marked
 *  'recheck' (short transcripts written before the hallucination filter; their text stays until the new result). */
export async function pendingVideos(env: Env, limit: number, maxDuration = Infinity): Promise<PendingVideo[]> {
  const r = await env.DB.prepare(`SELECT v.video_id, v.post_id, v.url, v.duration, v.attempts, p.raw FROM videos v
      LEFT JOIN transcripts t ON t.video_id = v.video_id JOIN posts p ON p.id = v.post_id
    WHERE v.url != '' AND v.attempts < ? AND v.duration <= ?
      AND (t.video_id IS NULL OR t.status = 'recheck' OR (t.status IS NULL AND t.created_at > 0 AND (t.text = '' OR t.text = '[failed: too large]')))
    ORDER BY v.rowid DESC LIMIT ?`).bind(MAX_ATTEMPTS, Number.isFinite(maxDuration) ? maxDuration : 1e9, limit)
    .all<{ video_id: string; post_id: string; url: string; duration: number; attempts: number; raw: string }>();
  return r.results.map(x => {
    const vid = (((JSON.parse(x.raw).media || {}).videos || []) as any[]).find(y => String(y.id) === x.video_id);
    return { video_id: x.video_id, post_id: x.post_id, url: x.url, duration: x.duration, attempts: x.attempts, hls: hlsUrl(vid) };
  });
}

/** Stores a final outcome, or counts a failed attempt (the last allowed attempt stores "[failed: …]"). */
export async function record(env: Env, v: PendingVideo, o: Outcome | { transient: string } | { deferred: string }, ts = nowS()) {
  const db = env.DB;
  if ("deferred" in o) return "deferred"; // nothing is written: the next pass takes the video again
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
  let budget = false;
  const done = await pool(videos, 3, async v => {
    let o: Outcome | { transient: string } | { deferred: string };
    if (budget) o = { deferred: "subrequest budget used up" };
    else try { o = await transcribeOne(env, v); } catch (e: any) {
      if (e instanceof Deferred) { budget = true; o = { deferred: String(e.message) }; } else o = { transient: String(e?.message || e) };
    }
    return { post_id: v.post_id, result: await record(env, v, o) };
  });
  const n = (s: string) => done.filter(d => d.result === s).length;
  return { posts: [...new Set(done.filter(d => d.result !== "retry" && d.result !== "deferred").map(d => d.post_id))], ok: n("ok"), no_audio: n("no_audio"), no_speech: n("no_speech"),
    failed: n("failed"), retry: n("retry"), deferred: n("deferred") };
}
