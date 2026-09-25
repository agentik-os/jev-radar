// One radar pass as a Cloudflare Workflow: every stage is a durable step, retried on its own,
// so a long full pass survives transient failures without starting over.
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Env, PassParams, chunks, now as nowS } from "./env";
import { MAX_ROUNDS, NEW_BUDGET, Pair, crawlFinish, crawlInit, fetchLinked, planRound, readTimelines, refreshTop, replies } from "./crawl";
import { classifySlice, evalIdeas, rekey, unclassified } from "./classify";
import { pendingVideos, transcribeSlice } from "./transcribe";
import { buildAndPublish, heartbeat } from "./build";

const STEP = { retries: { limit: 3, delay: "15 seconds" as const, backoff: "exponential" as const }, timeout: "20 minutes" as const };
const TIMELINE_SLICE = 150;
const CLASSIFY_SLICE = 150;
const VIDEO_SLICE = 9;
const MAX_VIDEOS_PER_PASS = 60;
const MAX_CLASSIFY_PER_PASS = 3000;

export class RadarPass extends WorkflowEntrypoint<Env, PassParams> {
  async run(event: WorkflowEvent<PassParams>, step: WorkflowStep) {
    const { mode, trigger } = event.payload;
    const id = event.instanceId;
    const env = this.env;
    const stats: Record<string, unknown> = { mode };

    const now = await step.do("start", async () => {
      const t = nowS();
      await env.DB.prepare("INSERT OR IGNORE INTO runs(id, mode, trigger, started, status) VALUES (?,?,?,?, 'running')").bind(id, mode, trigger, t).run();
      return t;
    });

    try {
      stats.replies = await step.do("replies", STEP, () => replies(env));

      // ---- crawl
      const init = await step.do("crawl-init", STEP, () => crawlInit(env, now));
      let pending: Pair[] = init.pending;
      let budget = NEW_BUDGET[mode];
      let added = 0, linked = 0, accountsRead = 0, failedAccounts = 0;
      for (let rnd = 1; rnd <= MAX_ROUNDS[mode] + 1; rnd++) {
        const l = await step.do(`r${rnd}-linked`, STEP, () => fetchLinked(env, pending));
        added += l.added; linked += l.fetched;
        const plan = await step.do(`r${rnd}-plan`, STEP, () => planRound(env, mode, rnd, budget, now));
        budget = plan.budget;
        pending = [];
        if (!plan.jobs.length) break;
        const slices = chunks(plan.jobs, TIMELINE_SLICE);
        for (let i = 0; i < slices.length; i++) {
          const r = await step.do(`r${rnd}-timelines-${i}`, STEP, () => readTimelines(env, mode, slices[i], now));
          added += r.added; failedAccounts += r.failed; accountsRead += slices[i].length;
          pending.push(...r.pending);
        }
      }
      if (mode === "full") stats.refresh = await step.do("refresh-top", STEP, () => refreshTop(env, now));
      stats.crawl = await step.do("crawl-finish", STEP, async () => ({ ...(await crawlFinish(env, mode, added, now)), linked, accountsRead, failedAccounts }));

      if (mode === "fast" && added === 0) {
        stats.heartbeat = await step.do("heartbeat", STEP, () => heartbeat(env, nowS()));
      } else {
        // ---- transcription (Workers AI Whisper)
        const touched: string[] = [];
        const tStats = { ok: 0, failed: 0, empty: 0 };
        const vids = await step.do("videos-pending", STEP, () => pendingVideos(env, MAX_VIDEOS_PER_PASS));
        const vslices = chunks(vids, VIDEO_SLICE);
        for (let i = 0; i < vslices.length; i++) {
          const r = await step.do(`transcribe-${i}`, STEP, () => transcribeSlice(env, vslices[i]));
          touched.push(...r.posts); tStats.ok += r.ok; tStats.failed += r.failed; tStats.empty += r.empty;
        }
        stats.transcribe = { videos: vids.length, ...tStats };

        // ---- AGK Intelligence classification
        stats.rekey = await step.do("rekey", STEP, () => rekey(env, now, touched));
        const todo = await step.do("classify-todo", STEP, () => unclassified(env, MAX_CLASSIFY_PER_PASS));
        const cls = { todo: todo.length, ok: 0, failed: 0, tokens: 0, maxInflight: 0, statuses: {} as Record<string, number>, blocked: undefined as string | undefined };
        const cslices = chunks(todo, CLASSIFY_SLICE);
        for (let i = 0; i < cslices.length; i++) {
          const r = await step.do(`classify-${i}`, STEP, () => classifySlice(env, id, cslices[i]));
          cls.ok += r.ok; cls.failed += r.failed; cls.tokens += r.tokens; cls.maxInflight = Math.max(cls.maxInflight, r.maxInflight);
          for (const [k, v] of Object.entries(r.statuses)) cls.statuses[k] = (cls.statuses[k] || 0) + v;
          if (r.blocked) { cls.blocked = r.blocked; break; }
        }
        stats.classify = cls;
        if (mode === "full" && !cls.blocked) stats.ideas = await step.do("ideas-eval", STEP, () => evalIdeas(env, id));

        // ---- build and publish to R2
        stats.publish = await step.do("build-publish", { ...STEP, timeout: "30 minutes" }, () => buildAndPublish(env, nowS(), id));
      }

      await step.do("finish", async () => {
        await env.DB.prepare("UPDATE runs SET status = 'complete', finished = ?, stats = ? WHERE id = ?").bind(nowS(), JSON.stringify(stats), id).run();
      });
      return stats;
    } catch (e: any) {
      await step.do("fail", async () => {
        await env.DB.prepare("UPDATE runs SET status = 'failed', finished = ?, stats = ?, error = ? WHERE id = ?")
          .bind(nowS(), JSON.stringify(stats), String(e?.message || e).slice(0, 500), id).run();
      });
      throw e;
    }
  }
}
