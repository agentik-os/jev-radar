// AGK Intelligence client (typed decisions). At most 6 calls in flight, with back-off on 429 and 5xx,
// the same cap the Python pipeline settled on after the provider rate-limited at 12 parallel calls.
import { Env, sleep } from "./env";

export const AI_PARALLEL = 6;
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest"; // provider model id (internal, never shown to users)

export class AiBlocked extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export interface CallLog { ts: number; purpose: string; status: number; attempts: number; inflight: number; ms: number; tokens: number }

export class AiClient {
  inflight = 0;
  maxInflight = 0;
  log: CallLog[] = [];
  constructor(private env: Env) {}

  async ask(state: unknown, questions: Record<string, unknown>, purpose: string): Promise<{ answers: Record<string, any>; tokens: number; model: string }> {
    if (!this.env.TYPESAFE_API_KEY) throw new AiBlocked(0, "TYPESAFE_API_KEY secret missing");
    while (this.inflight >= AI_PARALLEL) await sleep(20);
    this.inflight++;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    const entry: CallLog = { ts: Date.now(), purpose, status: 0, attempts: 0, inflight: this.inflight, ms: 0, tokens: 0 };
    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        entry.attempts = attempt;
        let r: Response | null = null;
        try {
          r = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODEL, state, questions }),
            signal: AbortSignal.timeout(120_000),
          });
        } catch { /* network error: retry */ }
        entry.status = r ? r.status : 0;
        if (r && r.ok) {
          const d: any = await r.json();
          entry.tokens = d.usage?.input_tokens || 0;
          return { answers: d.answers, tokens: entry.tokens, model: d.model };
        }
        if (r && (r.status === 401 || r.status === 402 || r.status === 403)) {
          throw new AiBlocked(r.status, `AGK Intelligence provider answered HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
        if (r && r.status >= 400 && r.status < 500 && r.status !== 429) {
          throw new Error(`AGK Intelligence HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
        await sleep(Math.min(30_000, 1500 * 2 ** (attempt - 1)) + Math.random() * 500);
      }
      throw new Error(`AGK Intelligence unavailable after retries (last status ${entry.status})`);
    } finally {
      entry.ms = Date.now() - entry.ts;
      this.log.push(entry);
      this.inflight--;
    }
  }

  async flushLog(db: D1Database, runId: string) {
    const rows = this.log.splice(0);
    for (let i = 0; i < rows.length; i += 50) {
      await db.batch(rows.slice(i, i + 50).map(c => db.prepare(
        "INSERT INTO ai_calls(run_id, ts, purpose, status, attempts, inflight, ms, tokens) VALUES (?,?,?,?,?,?,?,?)")
        .bind(runId, Math.floor(c.ts / 1000), c.purpose, c.status, c.attempts, c.inflight, c.ms, c.tokens)));
    }
    return rows;
  }
}
