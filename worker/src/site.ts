// Server-rendered pages: index.html with per-path title, description, Open Graph, Twitter Card and JSON-LD,
// plus sitemap.xml, llms.txt and robots.txt. Replaces api/page.js on Vercel.
import { Env } from "./env";
import { PENDING, compact } from "./radar";
import SYSTEMS from "./config/systems.json";

const NAME = "AGK Radar";
const TAGLINE = "every post about System One models on X, classified by AGK Intelligence";

export const SECTIONS: Record<string, [string, string, string]> = {
  builds: ["Everything people built with System One", "Real systems running on System One models: browser agents, code review, game bots, classifiers… each with a plain-English breakdown of how it works.", "builds"],
  opportunities: ["Where the money is: System One niches & business ideas, ranked", "Every System One post classified by AGK Intelligence into a product niche, then ranked for passive-income potential. Plus 50 business ideas graded by AGK Intelligence. Updated hourly.", "opportunities"],
  money: ["Make money with System One this week 💸", "Answer 4 questions. AGK Intelligence ranks the fastest ways to get paid with System One + Claude or Astra: what to sell, the price, the 48-hour plan and the launch post.", "money"],
  top: ["Top 100 System One posts, ranked hourly", "The most useful posts about System One on X: working demos, technical depth and shared code first. Refreshed every hour.", "top"],
  people: ["The people building with System One", "Everyone posting about System One on X, ranked by reach. Find the builders to follow.", "people"],
  all: ["Every post about System One, searchable", "Thousands of posts about System One on X, classified by AGK Intelligence. Search text, people, video transcripts and ideas.", "all"],
  map: ["The System One map", "Everything known about System One in one interactive map: what it is, where it runs, system patterns, niches and the debate.", "map"],
};
export const PAGE_PATHS = ["/", ...Object.keys(SECTIONS).map(s => "/" + s), "/opportunities/niches", "/opportunities/ideas", "/opportunities/check"];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const clip = (s: unknown, n: number) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : t; };
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n);

// ---------------------------------------------------------------- small cached reads (per isolate)
const cache = new Map<string, { at: number; v: any }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttlMs) return c.v;
  try { const v = await load(); cache.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (c) return c.v; throw e; }
}
async function r2json(env: Env, name: string, fallback: any) {
  return cached(`r2:${name}`, 120_000, async () => { const o = await env.BUCKET.get(`data/${name}`); return o ? JSON.parse(await o.text()) : fallback; });
}
async function shell(env: Env, origin: string): Promise<string> {
  return cached("html", 300_000, async () => (await env.ASSETS.fetch(new Request(origin + "/"))).text());
}

async function postFor(env: Env, id: string) {
  if (!/^\d{5,25}$/.test(id)) return null;
  const row = await env.DB.prepare("SELECT p.raw, c.answers FROM posts p LEFT JOIN cls_cache c ON c.key = p.cls_key WHERE p.id = ?").bind(id).first<{ raw: string; answers: string | null }>();
  if (!row) return null;
  const j = row.answers ? JSON.parse(row.answers) : PENDING;
  if (row.answers && !(j.about_jev >= 0.5 && j.category !== "unrelated")) return null;
  const tr: Record<string, string> = {};
  const vids = await env.DB.prepare("SELECT t.video_id, t.text FROM videos v JOIN transcripts t ON t.video_id = v.video_id WHERE v.post_id = ?").bind(id).all<{ video_id: string; text: string }>();
  for (const v of vids.results) tr[v.video_id] = v.text;
  const p = compact(JSON.parse(row.raw), j, tr, SYSTEMS as any);
  const ranks = await r2json(env, "ranks.json", {});
  p.rk = ranks[id] ?? null;
  return p;
}

interface Meta { title: string; desc: string; image: string; url: string; alt: string; noindex?: boolean; ld?: any }

async function metaFor(env: Env, site: string, path: string, query: URLSearchParams): Promise<{ m: Meta; status: number }> {
  const [niches, ideas] = await Promise.all([r2json(env, "niches.json", []), r2json(env, "ideas.json", [])]);
  const parts = path.split("/").filter(Boolean);
  const base: Meta = {
    title: `${NAME}: everything happening with System One, and where the money is`,
    desc: `Every post, demo and debate about System One models on X, classified by AGK Intelligence and updated hourly. ${niches.length} niches and ${ideas.length} business ideas ranked for passive income.`,
    image: `${site}/og.png`, url: site + path, alt: NAME,
  };
  if (parts[0] === "p" && parts[1]) {
    const p = await postFor(env, parts[1]);
    if (!p) return { m: { ...base, title: `Post not found · ${NAME}`, noindex: true }, status: 404 };
    const img = p.ph?.[0] || p.v?.[0]?.th || p.ar?.co;
    const first = clip(p.t.split("\n").find((l: string) => l.trim()) || p.ar?.ti || "", 90);
    const sys = p.sys?.en ? clip(p.sys.en, 170) + " · " : "";
    return { status: 200, m: {
      title: `${p.a.n} on System One: ${first}`,
      desc: `${sys}${clip(p.t, sys ? 80 : 190)} · ${fmt(p.m[4])} views · ${fmt(p.m[0])} likes${p.rk ? ` · #${p.rk} on ${NAME}` : ""}`,
      image: img || `${site}/og.png`, url: `${site}/p/${p.id}`, alt: `Post by @${p.a.h}`,
      ld: { "@context": "https://schema.org", "@type": "SocialMediaPosting", headline: first, url: `${site}/p/${p.id}`, sharedContent: p.u,
        datePublished: p.c ? new Date(p.c * 1000).toISOString() : undefined, author: { "@type": "Person", name: p.a.n, alternateName: "@" + p.a.h },
        interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: p.m[0] }] },
    } };
  }
  if (parts[0] === "post") return { status: 200, m: { ...base, title: `${NAME} · /post`, noindex: true } };
  const sec = SECTIONS[parts[0]];
  if (!sec) return { status: parts.length ? 404 : 200, m: parts.length ? { ...base, title: `Page not found · ${NAME}`, noindex: true } : base };
  const m: Meta = { title: `${sec[0]} · ${NAME}`, desc: sec[1], image: `${site}/og/${sec[2]}.png`, url: site + path, alt: sec[0] };
  const focus = query.get("focus");
  if (parts[0] === "opportunities" && focus) {
    const n = niches.find((x: any) => x.id === focus), i = ideas.find((x: any) => x.k === focus);
    if (n) { m.title = `#${n.rank} ${n.label.en}: niche score ${Math.round(n.score)}/100 · ${NAME}`; m.desc = `${n.idea.en} ${n.posts} posts, ${n.builders} builders on X. Ranked by AGK Intelligence for passive-income potential.`; m.url += `?focus=${encodeURIComponent(focus)}`; }
    if (i) { m.title = `${i.en}: business idea #${i.rank} (${Math.round(i.score)}/100) · ${NAME}`; m.desc = `${i.pen} Buyer: ${i.ben}. Pricing: ${i.price}.`; m.url += `?focus=${encodeURIComponent(focus)}`; }
  }
  return { status: 200, m };
}

function block(m: Meta, indexable: boolean): string {
  const t = esc(m.title), d = esc(m.desc), img = esc(m.image), u = esc(m.url), alt = esc(m.alt);
  const ld = m.ld ?? { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: m.url, description: m.desc,
    publisher: { "@type": "Organization", name: "Agentik OS", url: "https://www.agentik-os.com/" } };
  const robots = m.noindex || !indexable ? '\n<meta name="robots" content="noindex,nofollow">' : "";
  return `<!--META-->
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:site_name" content="${NAME}">
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
<link rel="canonical" href="${u}">${robots}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<!--/META-->`;
}

export async function renderPage(env: Env, req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);
  const site = env.SITE_URL || url.origin;
  const [html, { m, status }] = await Promise.all([shell(env, url.origin), metaFor(env, site, path, url.searchParams)]);
  const out = html.replace(/<!--META-->[\s\S]*?<!--\/META-->/, block(m, env.INDEXABLE === "true"));
  return new Response(out, { status, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=300",
    ...(m.noindex || env.INDEXABLE !== "true" ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  } });
}

export async function sitemap(env: Env, origin: string): Promise<Response> {
  const site = env.SITE_URL || origin;
  const [meta, ranks] = await Promise.all([r2json(env, "meta.json", {}), r2json(env, "ranks.json", {})]);
  const lastmod = meta.updated ? new Date(meta.updated * 1000).toISOString() : new Date().toISOString();
  const top = Object.entries(ranks as Record<string, number>).sort((a, b) => a[1] - b[1]).slice(0, 1000).map(([id]) => id);
  const urls = [...PAGE_PATHS.map(p => site + (p === "/" ? "/" : p)), ...top.map(id => `${site}/p/${id}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

export async function llms(env: Env, origin: string): Promise<Response> {
  const site = env.SITE_URL || origin;
  const [meta, niches] = await Promise.all([r2json(env, "meta.json", {}), r2json(env, "niches.json", [])]);
  const top = (niches as any[]).slice(0, 10).map(n => `- #${n.rank} ${n.label.en} (${Math.round(n.score)}/100, ${n.posts} posts): ${n.idea.en}`).join("\n");
  const body = `# ${NAME}

> ${NAME} tracks ${TAGLINE}. It collects public posts, transcribes videos, ranks product niches and business ideas, and refreshes every hour. Built by Agentik OS (https://www.agentik-os.com/).

Last update: ${meta.updated ? new Date(meta.updated * 1000).toISOString() : "unknown"}. ${meta.posts ?? "?"} posts from ${meta.authors ?? "?"} authors, ${meta.tracked_accounts ?? "?"} tracked accounts.

## Pages
- [Live](${site}/): the latest posts as they land
- [Builds](${site}/builds): systems people built, with how they work
- [Opportunities](${site}/opportunities): niches and business ideas ranked for passive income
- [Money now](${site}/money): the fastest ways to get paid, ranked for your profile
- [Top 100](${site}/top): the most useful posts, ranked hourly
- [People](${site}/people): who is building and posting, ranked by reach
- [Everything](${site}/all): every post, searchable
- [Map](${site}/map): the interactive map

## Data (JSON, updated hourly)
- ${site}/data/meta.json: counts and update time
- ${site}/data/niches.json: niche leaderboard with sub-scores
- ${site}/data/ideas.json: business ideas with scores
- ${site}/data/posts.json: every post, compact form

## Top niches now
${top}

## Method
Public posts are collected from a growing network of X accounts through the public fxtwitter API, videos are transcribed with Whisper on Workers AI, and each post is classified by AGK Intelligence: type, domain, system pattern, niche and business signals. Model provider: TypeSafe AI. ${NAME} is independent and not affiliated with TypeSafe AI. Posts belong to their authors.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

export function robots(env: Env, origin: string): Response {
  const site = env.SITE_URL || origin;
  const body = env.INDEXABLE === "true"
    ? `User-agent: *\nAllow: /\nDisallow: /post\nDisallow: /admin/\n\nSitemap: ${site}/sitemap.xml\n`
    : `# ${NAME} preview host: indexing opens when the site moves to its public hostname\nUser-agent: *\nDisallow: /\n\nSitemap: ${site}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
