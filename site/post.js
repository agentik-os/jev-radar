// /post: private page for replying by hand, on X, to every post about System One.
// One draft per post -> pre-filled X intent (in_reply_to) -> manual publication -> confirmation.
// Automatic confirmation: the public replies of @Agentik_os are read (fxtwitter) and answered posts are ticked.
const SELF = "agentik_os";
const SITE = location.origin;
const PAGE = 25;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const ago = ts => { const h = (Date.now() / 1000 - ts) / 3600; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`; };

// ---------- local state ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let STATE = load("jr_post_state", {});      // id -> {s: "done"|"skip", at, url?, v?: verified}
let DRAFTS = load("jr_post_drafts", {});    // id -> text edited by hand
let VARIANT = load("jr_post_variant", {});  // id -> variant index
const LAST = load("jr_post_lastvisit", 0);
save("jr_post_lastvisit", Math.floor(Date.now() / 1000));

try { const th = localStorage.getItem("jr_theme"); if (th) document.documentElement.dataset.theme = th; else if (matchMedia("(prefers-color-scheme: light)").matches) document.documentElement.dataset.theme = "light"; } catch {}
$("#theme").onclick = () => { const th = document.documentElement.dataset.theme === "light" ? "dark" : "light"; document.documentElement.dataset.theme = th; try { localStorage.setItem("jr_theme", th); } catch {} };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }

// ---------- drafts ----------
// Each reply: a hook tied to the post, the promise (free, all of System One in one place, updated hourly)
// and the link to the post's radar page: the author sees their own post there, which invites them to share it.
// French posts get French drafts (the reply is written in the author's language); the page itself is in English.
const EN = {
  build_demo: [
    "This is the kind of System One build people need to see{nm}. It's now on AGK Radar{rk}: a free hub that tracks every System One build, demo and debate on X, updated hourly.\n\n{link}",
    "Great demo{nm}. Logged it on AGK Radar, the free place where every System One build gets collected and explained in plain English. Yours is here 👇\n{link}",
    "Added this to AGK Radar{rk}. Free, no signup: every System One project on X in one place, refreshed every hour. Yours has its own page:\n{link}",
  ],
  integration: [
    "Nice integration{nm}. We collect every System One integration in one free place so builders stop digging through threads. Yours is in 👇\n{link}",
    "Saved this on AGK Radar{rk}: the free hub with every System One integration, build and explainer from X, updated hourly.\n{link}",
  ],
  explainer: [
    "Clear breakdown{nm}. We're putting every System One explainer, demo and debate in one free place, updated hourly. Added yours:\n{link}",
    "One of the better System One explanations I've read. It's on AGK Radar now{rk}, the free hub for everything System One on X:\n{link}",
  ],
  question: [
    "Good question{nm}. The answers are scattered across X, so we pulled every System One post, demo and explainer into one free, searchable hub (updated hourly):\n{home}",
    "Most of what's known about System One so far is collected here, free and searchable: builds, integrations, benchmarks, critiques. Might help:\n{home}",
  ],
  critique: [
    "Fair point{nm}, and worth reading next to the demos. AGK Radar keeps both sides in one free place, critiques included, updated hourly:\n{link}",
    "Useful pushback. We track the whole System One debate, not just the hype: every critique sits next to the builds on one free page.\n{link}",
  ],
  opinion: [
    "If you want the full picture{nm}: we track every System One post, build and take on X in one free hub, refreshed hourly. Yours is on it{rk}:\n{link}",
    "Added your take to AGK Radar{rk}. Free, no signup: everything people build and say about System One, in one place.\n{link}",
  ],
  news: [
    "Adding this to the AGK Radar timeline{rk}. Free hub, every System One update on X in one place, updated hourly:\n{link}",
    "Logged. AGK Radar keeps every System One announcement, build and debate in one free place:\n{link}",
  ],
  official: [
    "Congrats on the launch. We built a free community hub that tracks everything people build and say about System One, updated every hour. {count} posts so far:\n{home}",
    "The community is moving fast on System One. We're mapping all of it in one free place (builds, integrations, critiques), refreshed hourly:\n{home}",
  ],
  meme: [
    "Filed under System One culture 😄 Everything about System One on X, memes included, lives in one free hub:\n{link}",
  ],
};
const FR = {
  build_demo: [
    "Exactement le genre de build System One qu'il faut montrer{nm}. Il est sur AGK Radar{rk} : le hub gratuit qui suit chaque build, démo et débat autour de System One sur X, mis à jour chaque heure.\n\n{link}",
    "Super démo{nm}. Ajoutée sur AGK Radar, l'endroit gratuit où tous les builds System One sont rassemblés et expliqués simplement. La tienne est ici 👇\n{link}",
  ],
  integration: ["Belle intégration{nm}. On rassemble toutes les intégrations System One au même endroit, gratuitement. La tienne y est 👇\n{link}"],
  explainer: ["Explication très claire{nm}. On centralise tous les explainers, démos et débats sur System One dans un hub gratuit, mis à jour chaque heure. Ajouté :\n{link}"],
  question: ["Bonne question{nm}. Les réponses sont éparpillées sur X, alors on a tout rassemblé au même endroit, gratuit et cherchable :\n{home}"],
  critique: ["Point juste{nm}, à lire à côté des démos. AGK Radar garde les deux côtés du débat au même endroit, gratuitement :\n{link}"],
  opinion: ["Pour avoir la vue complète{nm} : on suit chaque post, build et avis sur System One dans un hub gratuit, mis à jour chaque heure :\n{link}"],
  news: ["Ajouté à la chronologie AGK Radar{rk}. Tout System One sur X au même endroit, gratuit :\n{link}"],
  official: ["Bravo pour le lancement. On a monté un hub communautaire gratuit qui suit tout ce qui se construit et se dit sur System One, chaque heure :\n{home}"],
  meme: ["Classé dans la culture System One 😄 Tout System One sur X, memes compris, au même endroit :\n{link}"],
};
function firstName(p) {
  const n = String(p.a.n || "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/)[0] || "";
  return n.length >= 2 && n.length <= 14 && !/^(the|jev|ai|dr)$/i.test(n) && !/\d/.test(n) ? n : "";
}
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function variants(p) { const set = p.l === "fr" ? FR : EN; return set[p.j.category] || set.opinion; }
function draft(p, count) {
  if (DRAFTS[p.id]) return DRAFTS[p.id];
  const fr = p.l === "fr", vs = variants(p), i = (VARIANT[p.id] ?? hash(p.id)) % vs.length;
  const nm = firstName(p);
  const rk = p.rk && p.rk <= 100 ? (fr ? ` (n°${p.rk} du Top 100)` : ` (#${p.rk} in the Top 100)`) : "";
  return vs[i].replace("{nm}", nm ? (fr ? `, ${nm}` : `, ${nm}`) : "").replace("{rk}", rk)
    .replace("{link}", `${SITE}/p/${p.id}`).replace("{home}", SITE).replace("{count}", count.toLocaleString("en-US"));
}
// X counts every URL as 23 characters, and most emoji / CJK characters as 2.
function xLen(t) {
  const urls = t.match(/https?:\/\/\S+/g) || [];
  let rest = urls.reduce((s, u) => s.replace(u, ""), t);
  let n = urls.length * 23;
  for (const ch of rest) n += /[\u1100-\uFFFF\u{1F000}-\u{1FFFF}]/u.test(ch) && !/[\u2000-\u206F]/.test(ch) ? 2 : 1;
  return n;
}

// ---------- data ----------
let POSTS = [], COUNT = 0, shown = PAGE;
const prio = p => Math.log10((p.a.f || 0) + 10) + 0.5 * Math.log10((p.m?.[4] || 0) + 10) - Math.max(0, (Date.now() / 1000 - p.c) / 3600) / 24;

function current() {
  const st = $("#status .on").dataset.v, so = $("#sort .on").dataset.v, lg = $("#lang").value;
  const q = $("#q").value.trim().toLowerCase();
  let L = POSTS.filter(p => {
    const s = STATE[p.id]?.s || "todo";
    if (st !== "all" && s !== st) return false;
    if (lg === "other" ? ["en", "fr"].includes(p.l) : lg && p.l !== lg) return false;
    if (q && !`${p.a.n} ${p.a.h} ${p.t}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = so === "new" ? p => -p.c : so === "top" ? p => p.rk || 1e9 : p => -prio(p);
  return L.sort((a, b) => key(a) - key(b));
}

function stats() {
  const done = POSTS.filter(p => STATE[p.id]?.s === "done"), ver = done.filter(p => STATE[p.id].v);
  const fresh = POSTS.filter(p => p.c > LAST && !STATE[p.id]).length;
  $("#stats").innerHTML = `<span><b>${POSTS.length}</b> posts</span><span><b>${POSTS.filter(p => !STATE[p.id]).length}</b> to do</span>` +
    `<span><b>${done.length}</b> posted (${ver.length} verified on X)</span>` + (LAST ? `<span><b>${fresh}</b> new since your last visit</span>` : "") +
    `<span id="sync">X sync…</span>`;
}

function item(p) {
  const s = STATE[p.id], text = draft(p, COUNT), n = xLen(text), isNew = LAST && p.c > LAST && !s;
  const intent = `https://x.com/intent/tweet?in_reply_to=${p.id}&text=${encodeURIComponent(text)}`;
  const nv = variants(p).length;
  return `<article class="rp-item ${s?.s || ""}" data-id="${p.id}">
    <div class="rp-src">
      <div class="rp-author"><img src="${esc(p.a.av)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <div style="min-width:0"><div class="nm">${esc(p.a.n)}</div><div class="hd">@${esc(p.a.h)} · ${fmt(p.a.f || 0)} followers · ${ago(p.c)} ago</div></div>
        <div class="rp-badges">${isNew ? `<span class="rp-b new">new</span>` : ""}${p.rk && p.rk <= 100 ? `<span class="rp-b">#${p.rk}</span>` : ""}<span class="rp-b">${esc(p.j.category)}</span></div></div>
      <div class="rp-text">${esc(p.t)}</div>
      <div class="rp-meta"><span>${fmt(p.m[4])} views · ${fmt(p.m[0])} likes</span><a href="${esc(p.u)}" target="_blank" rel="noopener">view on X ↗</a><a href="/p/${p.id}" target="_blank">radar page ↗</a></div>
    </div>
    <div class="rp-reply">
      <textarea aria-label="Reply to @${esc(p.a.h)}">${esc(text)}</textarea>
      <div class="rp-actions">
        <span class="rp-count ${n > 280 ? "over" : ""}">${n}/280</span>
        ${nv > 1 && !DRAFTS[p.id] ? `<button class="btn ghost" data-a="alt" title="Another version">↻ Another version</button>` : ""}
        ${DRAFTS[p.id] ? `<button class="btn ghost" data-a="reset">Restore</button>` : ""}
        <span class="sp"></span>
        ${s?.s === "done" ? "" : `<button class="btn ghost" data-a="skip">${s?.s === "skip" ? "Restore" : "Skip"}</button>`}
        <a class="btn" data-a="open" href="${intent}" target="_blank" rel="noopener">Reply on X</a>
      </div>
      ${s?.s === "done"
        ? `<div class="rp-done-line">${s.v ? "✓ Reply verified on X" : "✓ Marked as posted"} · ${new Date(s.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">my reply ↗</a>` : ""} <button class="btn ghost" data-a="undo">Undo</button></div>`
        : `<div class="rp-done-line"><input placeholder="Link to your reply (optional, to verify it)" data-a="url"><button class="btn ghost" data-a="done">✓ Posted</button></div>`}
    </div></article>`;
}

function render() {
  const L = current();
  $("#list").innerHTML = L.slice(0, shown).map(item).join("") || `<div class="rp-empty">Nothing here. ${$("#status .on").dataset.v === "todo" ? "Everything has a reply 🎉" : ""}</div>`;
  $("#more").parentElement.style.display = L.length > shown ? "" : "none";
  $("#more").textContent = `Show more (${L.length - shown} left)`;
  stats();
  $("#sync").textContent = SYNC;
}

function mark(id, data) { if (data) STATE[id] = data; else delete STATE[id]; save("jr_post_state", STATE); }

// ---------- verification on X (fxtwitter, public, open CORS) ----------
let SYNC = "X sync…";
async function checkUrl(url, id) {
  const m = String(url).match(/status\/(\d+)/); if (!m) return null;
  const r = await fetch(`https://api.fxtwitter.com/i/status/${m[1]}`).then(r => r.json()).catch(() => null);
  const t = r?.tweet; if (!t) return null;
  const to = t.replying_to_status || t.replying_to?.status;
  return { mine: t.author?.screen_name?.toLowerCase() === SELF, ok: to === id, url: t.url || url };
}
async function syncReplies() {
  const ids = new Set(POSTS.map(p => p.id)); let cursor = "", found = 0, pages = 0;
  const oldest = Math.min(...POSTS.map(p => p.c));
  try {
    while (pages++ < 8) {
      const r = await fetch(`https://api.fxtwitter.com/2/profile/${SELF}/statuses?with_replies=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).then(r => r.json());
      const res = r.results || [];
      for (const t of res) {
        const to = t.replying_to?.status;
        if (t.author?.screen_name?.toLowerCase() === SELF && to && ids.has(to) && !(STATE[to]?.v)) {
          mark(to, { s: "done", at: (t.created_timestamp || Date.now() / 1000) * 1000, url: t.url, v: 1 }); found++;
        }
      }
      cursor = r.cursor?.bottom;
      if (!cursor || !res.length || Math.min(...res.map(t => t.created_timestamp || Infinity)) < oldest) break;
    }
    SYNC = found ? `X sync: ${found} repl${found > 1 ? "ies" : "y"} found` : "X sync up to date";
  } catch { SYNC = "X sync unavailable"; }
  render();
}

// ---------- events ----------
$("#list").addEventListener("input", e => {
  const ta = e.target.closest("textarea"); if (!ta) return;
  const el = ta.closest(".rp-item"), id = el.dataset.id, n = xLen(ta.value);
  DRAFTS[id] = ta.value; save("jr_post_drafts", DRAFTS);
  const c = el.querySelector(".rp-count"); c.textContent = `${n}/280`; c.classList.toggle("over", n > 280);
  el.querySelector('[data-a="open"]').href = `https://x.com/intent/tweet?in_reply_to=${id}&text=${encodeURIComponent(ta.value)}`;
});
$("#list").addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"); if (!b || b.dataset.a === "url") return;
  const el = b.closest(".rp-item"), id = el.dataset.id, p = POSTS.find(x => x.id === id), a = b.dataset.a;
  if (a === "open") { el.querySelector('[data-a="url"]')?.focus(); return; } // the link opens; get the confirmation ready
  if (a === "alt") { VARIANT[id] = ((VARIANT[id] ?? hash(id)) + 1) % variants(p).length; save("jr_post_variant", VARIANT); }
  if (a === "reset") { delete DRAFTS[id]; save("jr_post_drafts", DRAFTS); }
  if (a === "skip") mark(id, STATE[id]?.s === "skip" ? null : { s: "skip", at: Date.now() });
  if (a === "undo") mark(id, null);
  if (a === "done") {
    const url = el.querySelector('[data-a="url"]').value.trim();
    if (url) {
      b.disabled = true; b.textContent = "Checking…";
      const r = await checkUrl(url, id);
      if (!r) { toast("Link not found on X, check it"); b.disabled = false; b.textContent = "✓ Posted"; return; }
      if (!r.ok || !r.mine) { toast(!r.mine ? "This post is not from @Agentik_os" : "This post does not reply to that post"); b.disabled = false; b.textContent = "✓ Posted"; return; }
      mark(id, { s: "done", at: Date.now(), url: r.url, v: 1 }); toast("Reply verified on X ✓");
    } else { mark(id, { s: "done", at: Date.now() }); toast("Marked as posted"); }
  }
  render();
});
for (const g of ["#status", "#sort"]) $(g).addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  $(g).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); shown = PAGE; render();
});
$("#lang").onchange = () => { shown = PAGE; render(); };
$("#q").oninput = () => { shown = PAGE; render(); };
$("#more").onclick = () => { shown += PAGE; render(); };
$("#export").onclick = () => {
  const blob = new Blob([JSON.stringify({ state: STATE, drafts: DRAFTS }, null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `agk-radar-replies-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); URL.revokeObjectURL(a.href);
};
$("#import").onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    STATE = { ...STATE, ...(d.state || {}) }; DRAFTS = { ...DRAFTS, ...(d.drafts || {}) };
    save("jr_post_state", STATE); save("jr_post_drafts", DRAFTS); toast("Confirmations imported"); render();
  } catch { toast("Unreadable file"); }
};

(async () => {
  const [posts, meta] = await Promise.all([fetch("/data/posts.json").then(r => r.json()), fetch("/data/meta.json").then(r => r.json()).catch(() => ({}))]);
  COUNT = meta.main || posts.length;
  // Main posts about System One (ranked by the radar), excluding our own and reposts.
  POSTS = posts.filter(p => p.rk && !p.r && p.a?.h?.toLowerCase() !== SELF && (p.j?.about_jev ?? 1) >= 0.5);
  render();
  syncReplies();
})();
