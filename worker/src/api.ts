// Visitor-facing AGK Intelligence endpoints (ported from api/check-idea.js and api/money-now.js).
// The provider key stays server-side; best-effort rate limit per IP and isolate.
import { AiClient } from "./ai";
import { Env } from "./env";
import { IDEA_CRITERIA, IDEA_ENGINE, IDEA_QTEXT } from "./radar";
import NICHES from "./config/niches.json";
import PLAYS from "./config/plays.json";

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), w = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  w.push(now); hits.set(ip, w);
  return w.length > 30;
}
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const pick = (v: unknown, ok: string[]) => (ok.includes(v as string) ? (v as string) : ok[0]);

async function guard(req: Request): Promise<any | Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ip = req.headers.get("cf-connecting-ip") || "?";
  if (limited(ip)) return json({ error: "Too many requests, try again later" }, 429);
  try { return await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
}

export async function checkIdea(env: Env, req: Request): Promise<Response> {
  const body = await guard(req);
  if (body instanceof Response) return body;
  const idea = String(body?.idea || "").trim().slice(0, 1200);
  if (idea.length < 15) return json({ error: "Describe the idea in a sentence or two" }, 400);
  const questions: Record<string, unknown> = {};
  for (const [k, levels] of Object.entries(IDEA_CRITERIA)) questions[k] = { type: "score", instructions: IDEA_QTEXT[k], criteria: levels };
  questions.niche = { type: "choice", instructions: "Which product niche does this idea belong to?",
    criteria: Object.fromEntries(Object.entries(NICHES as Record<string, any>).map(([k, v]) => [k, v.desc])) };
  try {
    const r = await new AiClient(env).ask({ product_idea: idea, engine: IDEA_ENGINE }, questions, "check-idea");
    const sub: Record<string, number> = {};
    for (const k of Object.keys(IDEA_CRITERIA)) sub[k] = Math.round((r.answers[k].score / 4) * 1000) / 1000;
    return json({ sub, niche: r.answers.niche.choice, model: "agk-intelligence" });
  } catch {
    return json({ error: "AGK Intelligence unavailable" }, 502);
  }
}

export async function moneyNow(env: Env, req: Request): Promise<Response> {
  const b = await guard(req);
  if (b instanceof Response) return b;
  const profile = {
    can_code: pick(b.code, ["no", "a little", "yes, comfortably"]),
    audience: pick(b.audience, ["none", "under 1,000 followers", "1,000 to 10,000 followers", "over 10,000 followers"]),
    hours_this_week: pick(b.hours, ["under 5", "5 to 15", "15 to 40", "over 40"]),
    prefers: pick(b.goal, ["cash this week", "recurring monthly revenue", "either"]),
    notes: String(b.notes || "").slice(0, 400),
    tools: "System One for fast typed decisions, plus Claude or GPT-6 Astra to write the code and content",
  };
  const questions: Record<string, unknown> = {};
  for (const p of PLAYS as any[]) {
    questions[p.k] = {
      type: "score",
      instructions: `How well does this money play fit the person in \`state\`, for making a first sale within 7 days? Play: ${p.en}. ${p.pen} Price: ${p.price}. Needs coding: ${["no", "some", "yes"][p.code]}. Needs an audience: ${["no", "a small one", "yes"][p.audience]}. Estimated hours to launch: ${p.hours}.`,
      criteria: [
        "Poor fit: missing a hard requirement (skills, audience or time)",
        "Weak fit: possible but slow or risky for this person",
        "Decent fit: doable with some stretch",
        "Good fit: matches skills, time and goal",
        "Ideal fit: plays to this person's strengths, first sale is realistic this week",
      ],
    };
  }
  try {
    const r = await new AiClient(env).ask(profile, questions, "money-now");
    const fit: Record<string, unknown> = {};
    for (const p of PLAYS as any[]) fit[p.k] = { score: Math.round((r.answers[p.k].score / 4) * 1000) / 1000, confidence: r.answers[p.k].confidence };
    return json({ fit, model: "agk-intelligence" });
  } catch {
    return json({ error: "AGK Intelligence unavailable" }, 502);
  }
}
