// Sert index.html avec les balises Open Graph / Twitter Card propres à chaque adresse
// (/money, /opportunities/…, /p/<id>…), pour que chaque lien partagé ait sa propre carte.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://jev.agentik-os.com";
const root = join(process.cwd(), "site");
let cache = null;
function load() {
  if (!cache) {
    const read = f => readFileSync(join(root, f), "utf8");
    const posts = JSON.parse(read("data/posts.json"));
    cache = {
      html: read("index.html"),
      posts: new Map(posts.map(p => [p.id, p])),
      niches: JSON.parse(read("data/niches.json")),
      ideas: JSON.parse(read("data/ideas.json")),
      meta: JSON.parse(read("data/meta.json")),
    };
  }
  return cache;
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : s; };
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n);

const SECTIONS = {
  builds: ["Everything people built with Jev", "Real systems running on TypeSafe's Jev: browser agents, code review, game bots, classifiers… each with a plain-English breakdown of how it works.", "builds"],
  opportunities: ["Where the money is: Jev niches & business ideas, ranked", "Every Jev post classified by Jev into a product niche, then ranked for passive-income potential. Plus 50 business ideas graded by Jev. Updated hourly.", "opportunities"],
  money: ["Make money with Jev this week 💸", "Answer 4 questions. Jev ranks the fastest ways to get paid with Jev + Claude or Astra: what to sell, the price, the 48-hour plan and the launch post.", "money"],
  top: ["Top 100 Jev posts, ranked hourly", "The most useful posts about Jev on X: working demos, technical depth and shared code first. Refreshed every hour.", "top"],
  people: ["The people building with Jev", "Everyone posting about TypeSafe's Jev on X, ranked by reach. Find the builders to follow.", "people"],
  all: ["Every post about Jev, searchable", "Thousands of posts about Jev on X, classified by Jev itself. Search text, people, video transcripts and ideas.", "all"],
  map: ["The Jev map", "Everything known about Jev in one interactive map: what it is, where it runs, system patterns, niches and the debate.", "map"],
};

function metaFor(path, query, d) {
  const parts = path.split("/").filter(Boolean);
  const base = { title: "Jev Radar: everything happening with Jev, and where the money is",
    desc: `Every post, demo and debate about TypeSafe's Jev on X, classified by Jev itself and updated hourly. ${d.niches.length} niches and ${d.ideas.length} business ideas ranked for passive income.`,
    image: `${SITE}/og.png`, url: SITE + path, alt: "Jev Radar" };
  if (parts[0] === "p" && parts[1]) {
    const p = d.posts.get(parts[1]);
    if (!p) return base;
    const img = p.ph?.[0] || p.v?.[0]?.th || p.ar?.co;
    const first = clip(p.t.split("\n").find(l => l.trim()) || p.ar?.ti || "", 90);
    const sys = p.sys?.en ? clip(p.sys.en, 170) + " · " : "";
    return {
      title: `${p.a.n} on Jev: ${first}`,
      desc: `${sys}${clip(p.t, sys ? 80 : 190)} · ${fmt(p.m[4])} views · ${fmt(p.m[0])} likes${p.rk ? ` · #${p.rk} on the Jev Radar` : ""}`,
      image: img || `${SITE}/og.png`, url: `${SITE}/p/${p.id}`, alt: `Post by @${p.a.h} about Jev`,
    };
  }
  if (parts[0] === "post") return { ...base, title: "Jev Radar · /post", noindex: true };
  const sec = SECTIONS[parts[0]];
  if (!sec) return base;
  const m = { title: `${sec[0]} · Jev Radar`, desc: sec[1], image: `${SITE}/og/${sec[2]}.png`, url: SITE + path, alt: sec[0] };
  const focus = query.get("focus");
  if (parts[0] === "opportunities" && focus) {
    const n = d.niches.find(x => x.id === focus), i = d.ideas.find(x => x.k === focus);
    if (n) { m.title = `#${n.rank} ${n.label.en}: Jev niche score ${Math.round(n.score)}/100`; m.desc = `${n.idea.en} ${n.posts} posts, ${n.builders} builders on X. Ranked by Jev for passive-income potential.`; m.url += `?focus=${focus}`; }
    if (i) { m.title = `${i.en}: Jev business idea #${i.rank} (${Math.round(i.score)}/100)`; m.desc = `${i.pen} Buyer: ${i.ben}. Pricing: ${i.price}.`; m.url += `?focus=${focus}`; }
  }
  return m;
}

function block(m) {
  const t = esc(m.title), d = esc(m.desc), img = esc(m.image), u = esc(m.url), alt = esc(m.alt);
  return `<!--META-->
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:site_name" content="Jev Radar">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:type" content="${m.url.includes("/p/") ? "article" : "website"}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Agentik_os">
<meta name="twitter:creator" content="@Agentik_os">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${alt}">
<link rel="canonical" href="${u}">${m.noindex ? '\n<meta name="robots" content="noindex,nofollow">' : ""}
<!--/META-->`;
}

export default function handler(req, res) {
  const url = new URL(req.url, SITE);
  const path = url.searchParams.get("path") || "/";
  url.searchParams.delete("path");
  const d = load();
  const html = d.html.replace(/<!--META-->[\s\S]*?<!--\/META-->/, block(metaFor(path, url.searchParams, d)));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
