// « Money now » : Jev classe les pistes selon le profil du visiteur (une question Score par piste, un seul appel).
import { PLAYS } from "./_criteria.js";

const hits = new Map(); // limite best-effort par IP et par instance
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  w.push(now); hits.set(ip, w);
  return w.length > 30;
}
const pick = (v, ok) => (ok.includes(v) ? v : ok[0]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (limited(ip)) return res.status(429).json({ error: "Too many requests, try again later" });
  const b = req.body || {};
  const profile = {
    can_code: pick(b.code, ["no", "a little", "yes, comfortably"]),
    audience: pick(b.audience, ["none", "under 1,000 followers", "1,000 to 10,000 followers", "over 10,000 followers"]),
    hours_this_week: pick(b.hours, ["under 5", "5 to 15", "15 to 40", "over 40"]),
    prefers: pick(b.goal, ["cash this week", "recurring monthly revenue", "either"]),
    notes: String(b.notes || "").slice(0, 400),
    tools: "Jev for fast typed decisions, plus Claude or GPT-6 Astra to write the code and content",
  };
  const questions = {};
  for (const p of PLAYS) {
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
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: profile, questions }),
  });
  if (!r.ok) return res.status(502).json({ error: "Jev unavailable" });
  const d = await r.json();
  const fit = {};
  for (const p of PLAYS) fit[p.k] = { score: Math.round((d.answers[p.k].score / 4) * 1000) / 1000, confidence: d.answers[p.k].confidence };
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ fit, model: d.model });
}
