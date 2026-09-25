// One radar pass as a Cloudflare Workflow: every stage is a durable step, retried on its own,
// so a long full pass survives transient failures without starting over.
// A fast pass is short by construction (it reads accounts for FAST_READ_MS, transcribes short videos, classifies what
// is new and publishes) and runs alongside a full pass (index.startPass keeps one lease per mode), so the site keeps
// publishing while a full pass crawls. Every step runs against a metered D1 binding; the pass records its rows written.
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Env, PassParams, chunks, now as nowS } from "./env";
import { MAX_ROUNDS, NEW_BUDGET, Pair, crawlFinish, crawlInit, fetchLinked, planRound, readTimelines, refreshTop, replies, saveFastCursor } from "./crawl";
import { classifySlice, evalIdeas, rekey, unclassified } from "./classify";
import { LONG_VIDEO, pendingVideos, transcribeSlice } from "./transcribe";
import { buildAndPublish } from "./build";
import { PassMeter, withMeter } from "./meter";

const STEP = { retries: { limit: 3, delay: "15 seconds" as const, backoff: "exponential" as const }, timeout: "20 minutes" as const };
const TIMELINE_SLICE = 150;
const FAST_SLICE = 60;
export const FAST_READ_MS = 150_000;   // a fast pass reads timelines for 2.5 minutes, then transcribes, classifies and publishes
const CLASSIFY_SLICE = 150;
const VIDEO_SLICE = 9;
const MAX_VIDEOS: Record<string, number> = { full: 60, fast: 9 };
const MAX_LONG_VIDEOS = 6;             // long videos (up to 30 minutes of audio each) per full pass, one per step
const MAX_CLASSIFY: Record<string, number> = { full: 3000, fast: 300 };

export class RadarPass extends WorkflowEntrypoint<Env, PassParams> {
  async run(event: WorkflowEvent<PassParams>, step: WorkflowStep) {
    const { mode, trigger } = event.payload;
    const id = event.instanceId;
    const env = this.env;
    const stats: Record<string, unknown> = { mode };
    // every step runs against a metered DB; its rows written/read travel in the step output (replayed outputs keep them)
    const pm = new PassMeter();
    const S = <T>(name: string, cfg: any, fn: (e: Env) => Promise<T>): Promise<T> =>
      step.do(name, cfg, async () => { const m = { w: 0, r: 0 }; const v = await fn(withMeter(env, m)); return { __m: 1, v, w: m.w, r: m.r } as any; })
        .then((o: any) => { if (o && o.__m === 1) { pm.add(name, o.w, o.r); return o.v as T; } return o as T; });

    const now = await step.do("start", async () => {
      const t = nowS();
      await env.DB.prepare("INSERT OR IGNORE INTO runs(id, mode, trigger, started, status) VALUES (?,?,?,?, 'running')").bind(id, mode, trigger, t).run();
      return t;
    });

    try {
      stats.replies = await S("replies", STEP, e => replies(e));

      // ---- crawl
      const init = await S("crawl-init", STEP, e => crawlInit(e, now));
      let pending: Pair[] = init.pending;
      let budget = NEW_BUDGET[mode];
      let added = 0, linked = 0, accountsRead = 0, failedAccounts = 0, planned = 0, cursor: string | null = null;
      for (let rnd = 1; rnd <= MAX_ROUNDS[mode] + 1; rnd++) {
        const l = await S(`r${rnd}-linked`, STEP, e => fetchLinked(e, pending));
        added += l.added; linked += l.fetched;
        const plan = await S(`r${rnd}-plan`, STEP, e => planRound(e, mode, rnd, budget, now));
        budget = plan.budget;
        pending = [];
        if (!plan.jobs.length) break;
        const fastRound = mode === "fast" && rnd === 1;
        const slices = chunks(plan.jobs, fastRound ? FAST_SLICE : TIMELINE_SLICE);
        let read = 0;
        for (let i = 0; i < slices.length; i++) {
          const r = await S(fastRound ? `r1-fast-read-${i}` : `r${rnd}-timelines-${i}`, STEP, e => readTimelines(e, mode, slices[i], now));
          added += r.added; failedAccounts += r.failed; accountsRead += slices[i].length; read += slices[i].length;
          pending.push(...r.pending);
          // the time is taken inside the step, so a replay makes the same decision
          if (fastRound && r.t - now * 1000 > FAST_READ_MS) break;
        }
        if (fastRound) {
          planned = plan.jobs.length;
          const last = plan.rest !== undefined && read > plan.rest ? plan.jobs[read - 1][0] : null;
          cursor = (await S("fast-cursor", STEP, e => saveFastCursor(e, last))).cursor;
        }
      }
      if (mode === "full") stats.refresh = await S("refresh-top", STEP, e => refreshTop(e, now));
      stats.crawl = await S("crawl-finish", STEP, async e => ({ ...(await crawlFinish(e, mode, added, now)), linked, accountsRead, failedAccounts,
        ...(mode === "fast" ? { planned, cursor } : {}) }));

      // ---- transcription (Workers AI Whisper): short videos in every pass, long ones (first 30 minutes) in the full pass
      const touched: string[] = [];
      const tStats = { videos: 0, ok: 0, no_audio: 0, no_speech: 0, failed: 0, retry: 0 };
      const vids = await S("videos-pending", STEP, e => pendingVideos(e, MAX_VIDEOS[mode], LONG_VIDEO));
      const long = mode === "full" ? await S("videos-pending-long", STEP, async e => (await pendingVideos(e, 200)).filter(v => v.duration > LONG_VIDEO).slice(0, MAX_LONG_VIDEOS)) : [];
      const vslices = [...chunks(vids, VIDEO_SLICE), ...long.map(v => [v])];
      for (let i = 0; i < vslices.length; i++) {
        const r = await S(`transcribe-${i}`, STEP, e => transcribeSlice(e, vslices[i]));
        touched.push(...r.posts);
        for (const k of ["ok", "no_audio", "no_speech", "failed", "retry"] as const) tStats[k] += r[k];
        tStats.videos += vslices[i].length;
      }
      stats.transcribe = tStats;

      // ---- AGK Intelligence classification: only posts whose content key has no answers yet
      stats.rekey = await S("rekey", STEP, e => rekey(e, now, touched));
      const todo = await S("classify-todo", STEP, e => unclassified(e, MAX_CLASSIFY[mode]));
      const cls = { todo: todo.length, ok: 0, failed: 0, tokens: 0, maxInflight: 0, statuses: {} as Record<string, number>, blocked: undefined as string | undefined };
      const cslices = chunks(todo, CLASSIFY_SLICE);
      for (let i = 0; i < cslices.length; i++) {
        const r = await S(`classify-${i}`, STEP, e => classifySlice(e, id, cslices[i]));
        cls.ok += r.ok; cls.failed += r.failed; cls.tokens += r.tokens; cls.maxInflight = Math.max(cls.maxInflight, r.maxInflight);
        for (const [k, v] of Object.entries(r.statuses)) cls.statuses[k] = (cls.statuses[k] || 0) + v;
        if (r.blocked) { cls.blocked = r.blocked; break; }
      }
      stats.classify = cls;
      if (mode === "full" && !cls.blocked) stats.ideas = await S("ideas-eval", STEP, e => evalIdeas(e, id));

      // ---- build and publish to R2: every pass publishes (metrics move even when no post is new)
      stats.publish = await S("build-publish", { ...STEP, timeout: "30 minutes" }, e => buildAndPublish(e, nowS(), id));

      stats.d1 = pm.toJSON();
      await step.do("finish", async () => {
        await env.DB.prepare("UPDATE runs SET status = 'complete', finished = ?, stats = ? WHERE id = ?").bind(nowS(), JSON.stringify(stats), id).run();
      });
      return stats;
    } catch (e: any) {
      stats.d1 = pm.toJSON();
      await step.do("fail", async () => {
        await env.DB.prepare("UPDATE runs SET status = 'failed', finished = ?, stats = ?, error = ? WHERE id = ?")
          .bind(nowS(), JSON.stringify(stats), String(e?.message || e).slice(0, 500), id).run();
      });
      throw e;
    }
  }
}
