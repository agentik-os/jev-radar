// Video transcription with Workers AI Whisper (replaces faster-whisper on the old VPS).
// The smallest mp4 rendition is sent as-is; a video without an audio track, or one Whisper cannot decode,
// is stored with an empty or "[failed: …]" transcript so it is not retried every pass (same rule as transcribe.py).
import { Env, now as nowS } from "./env";

const MAX_BYTES = 25 * 1024 * 1024;

export async function pendingVideos(env: Env, limit: number): Promise<{ video_id: string; post_id: string; url: string }[]> {
  const r = await env.DB.prepare(`SELECT v.video_id, v.post_id, v.url FROM videos v LEFT JOIN transcripts t ON t.video_id = v.video_id
    WHERE t.video_id IS NULL AND v.url != '' ORDER BY v.rowid DESC LIMIT ?`).bind(limit).all<{ video_id: string; post_id: string; url: string }>();
  return r.results;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribeOne(env: Env, v: { video_id: string; url: string }): Promise<string> {
  try {
    const r = await fetch(v.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return `[failed: HTTP ${r.status}]`;
    const len = Number(r.headers.get("content-length") || 0);
    if (len > MAX_BYTES) { await r.body?.cancel(); return "[failed: too large]"; }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return "[failed: too large]";
    const out: any = await env.AI.run(env.WHISPER_MODEL as any, { audio: b64(buf), vad_filter: true } as any);
    const text = String(out?.text ?? (out?.segments || []).map((s: any) => s.text).join(" ") ?? "");
    return text.split(/\s+/).filter(Boolean).join(" ");
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Whisper rejects containers without an audio stream: same outcome as ffprobe finding no audio
    if (/audio|decode|format|invalid/i.test(msg)) return "";
    return `[failed: ${msg.slice(0, 60)}]`;
  }
}

/** Step: transcribe a few pending videos; returns the posts whose classification input changed. */
export async function transcribeSlice(env: Env, videos: { video_id: string; post_id: string; url: string }[]) {
  const ts = nowS();
  const done: { post_id: string; ok: boolean; failed: boolean }[] = [];
  for (const v of videos) {
    const text = await transcribeOne(env, v);
    await env.DB.prepare("INSERT OR REPLACE INTO transcripts(video_id, text, created_at) VALUES (?,?,?)").bind(v.video_id, text, ts).run();
    done.push({ post_id: v.post_id, ok: !!text && !text.startsWith("[failed"), failed: text.startsWith("[failed") });
  }
  return { posts: [...new Set(done.map(d => d.post_id))], ok: done.filter(d => d.ok).length, failed: done.filter(d => d.failed).length, empty: done.filter(d => !d.ok && !d.failed).length };
}
