// Note une idée de produit avec Jev (mêmes critères que la bibliothèque d'idées). Clé côté serveur uniquement.
import { CRITERIA, NICHES } from "./_criteria.js";

const hits = new Map(); // limite best-effort par IP et par instance
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  w.push(now); hits.set(ip, w);
  return w.length > 30;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (limited(ip)) return res.status(429).json({ error: "Too many requests, try again later" });
  const idea = String(req.body?.idea || "").trim().slice(0, 1200);
  if (idea.length < 15) return res.status(400).json({ error: "Describe the idea in a sentence or two" });
  const questions = {};
  for (const [k, c] of Object.entries(CRITERIA)) questions[k] = { type: "score", instructions: c.q, criteria: c.levels };
  questions.niche = { type: "choice", instructions: "Which product niche does this idea belong to?", criteria: NICHES };
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: { product_idea: idea, engine: "Jev: a model that returns fast typed decisions (choice, score, yes/no probability) for $0.042 per million input tokens, in ~100-500 ms. It cannot generate text." },
      questions,
    }),
  });
  if (!r.ok) return res.status(502).json({ error: "Jev unavailable" });
  const d = await r.json();
  const sub = {};
  for (const k of Object.keys(CRITERIA)) sub[k] = Math.round((d.answers[k].score / 4) * 1000) / 1000;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ sub, niche: d.answers.niche.choice, model: d.model });
}
