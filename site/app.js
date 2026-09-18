/* Jev Radar : site statique, données régénérées toutes les heures par le pipeline. */
(() => {
"use strict";
const CFG = window.JEV_CONFIG || {};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");

// ---------------------------------------------------------------- langue
const T = {
  en: {
    nav_home: "Live", nav_builds: "Builds", nav_opps: "Opportunities", nav_top: "Top 100", nav_people: "People", nav_all: "Everything", nav_map: "Map",
    search_short: "Search", join: "Join Discord", support: "Support", support_long: "Support the project", follow: "Follow",
    hero_live: (m, n) => `LIVE · updated ${m} · ${n} posts tracked`,
    hero_h: "Everything happening with <em>Jev</em>, live.",
    hero_p: "Every post, demo, integration and debate about TypeSafe's System One model on X. Classified by Jev itself and updated live, every few minutes, with a leaderboard of the businesses worth building.",
    hero_search: "Search posts, people, demos, transcripts, ideas…",
    k_posts: "posts", k_people: "people", k_views: "views", k_builds: "builds & demos", k_videos: "videos", k_code: "open source / free tools",
    latest: "Latest posts, <em>live</em>", latest_p: "Every new post about Jev as it lands on X, refreshed every few minutes.",
    trending: "Trending <em>now</em>", trending_p: "The most engaging posts of the last 24 hours.",
    builds_h: "What people <em>built</em>", builds_p: "Real systems running on Jev, with how they work.",
    opps_h: "Where the <em>money</em> is", opps_p: "Niches ranked by passive-income potential, recomputed every hour from every post.",
    pulse_h: "The <em>pulse</em>", pulse_p: "How the conversation is moving.",
    debate_h: "The <em>debate</em>", debate_p: "Not everyone is convinced. The strongest voices on both sides.",
    people_h: "People to <em>follow</em>", people_p: "Who is building and talking about Jev, ranked by reach.",
    runs_h: "Where Jev <em>runs</em>", runs_p: "Platforms, SDKs and integrations announced so far.",
    see_all: "See all →", per_day: "Posts per day", by_domain: "Application domain", by_pattern: "How Jev is used in systems", tone: "Tone toward Jev", format: "Format",
    skeptics: "Skeptics", believers: "Believers",
    cta_h: "Build with Jev <em>alongside us</em>.", cta_p: "Join the Agentik OS Discord: builders shipping Jev products, sharing code, niches and revenue. Follow on X for the hourly best-of.",
    builds_title: "Everything people <em>built</em> with Jev", builds_lead: "Demos, tools and experiments, with a short explanation of the system behind each one.",
    opps_title: "Passive-income <em>opportunities</em>", opps_lead: "An analysis of the analysis: every post is classified by Jev into a product niche, then niches are scored on the signals that matter for a product that earns while you sleep.",
    seg_niches: "Niche leaderboard", seg_ideas: "Idea library", seg_check: "Test your idea",
    col_rank: "Rank", col_niche: "Niche", col_score: "Score", col_signals: "Signals", col_activity: "Activity",
    s_passive: "passive", s_traction: "traction", s_demand: "demand", s_momentum: "momentum", s_space: "space",
    s_pain: "pain", s_recurring: "recurring", s_automation: "hands-off", s_jev_fit: "Jev fit", s_open_market: "open", s_build_ease: "easy", s_x_signal: "X buzz",
    w_passive: "Passive potential (Jev's judgment)", w_traction: "Traction (engagement)", w_demand: "Demand (people asking)", w_momentum: "Momentum (last 48 h)", w_space: "Open space (few products yet)",
    idea_label: "Product idea", evidence: "Evidence from X", untapped: "UNTAPPED",
    ideas_lead: "Product ideas scored by Jev on six criteria, plus the buzz of their niche on X. Ideas marked untapped have no builder on X yet.",
    buyer: "Buyer", price: "Pricing", niche_rank: "niche rank",
    not_advice: "Signals, not financial advice. Scores reflect public posts on X and Jev's judgments; validate demand before building.",
    check_h: "Test your own idea with Jev", check_p: "Describe a product. Jev scores it on the same six criteria in about a second.",
    check_ph: "e.g. A Shopify app that flags fraudulent orders before shipping, $29/month…", check_btn: "Score my idea",
    check_empty: "Your scores will appear here.", check_err: "Could not reach Jev. Try again in a minute.",
    top_title: "Top <em>100</em>", top_lead: "The Radar Score blends engagement with how concrete a post is: working demos, technical depth and shared code rank higher.",
    people_title: "The <em>people</em> of Jev", people_lead: "Everyone who posted about Jev, ranked by the total reach of their Jev posts.",
    all_title: "<em>Everything</em>", all_lead: "Every post, filterable and sortable.",
    map_title: "The Jev <em>map</em>", map_lead: "Everything known about Jev in one interactive map, rebuilt every hour from the data. Click a branch to open it.",
    f_all_types: "All types", f_all_domains: "All domains", f_all_niches: "All niches", f_all_formats: "All formats",
    f_video: "Video", f_photo: "Image", f_article: "Article", f_text: "Text only",
    sort_rs: "Sort: Radar score", sort_views: "Sort: views", sort_likes: "Sort: likes", sort_date: "Sort: newest", sort_depth: "Sort: technical depth",
    replies: "include replies", posts_n: n => `${n} posts`, load_more: "Load more",
    view_on_x: "View on X ↗", copy_link: "Copy link", copied: "Copied", transcript: "Video transcript", links: "Links", article: "Article", system: "The system",
    sr_people: "People", sr_posts: "Posts", sr_ideas: "Ideas & niches", sr_none: "Nothing found. Try another word.",
    sr_tips: "Try:", ago: s => s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`,
    followers: "followers", jposts: n => `${n} post${n > 1 ? "s" : ""} about Jev`, reach: "reach",
    foot_about: "An unofficial, independent tracker of everything said about Jev on X. Not affiliated with TypeSafe AI. Posts belong to their authors and link back to X.",
    foot_method: "Method", foot_community: "Community",
    foot_method_txt: "Public posts are collected live (every 3 minutes for active accounts, hourly for the whole network), videos are transcribed, and each post is classified by Jev itself: type, domain, system pattern, niche and business signals.",
    builders: "builders", in48: "in 48 h",
    nav_money: "Money now",
    money_eyebrow: "Money now", money_title: "Make money with Jev <em>this week</em>",
    money_lead: "Tell Jev who you are. It ranks the fastest ways to get paid with Jev plus Claude or Astra: what to sell, the price, the 48-hour plan, the payment setup and the launch post.",
    q_code: "Can you code?", q_audience: "Your audience", q_hours: "Hours this week", q_goal: "You want",
    o_code: ["No", "A little", "Yes"], o_audience: ["None", "< 1k", "1k–10k", "10k+"], o_hours: ["< 5 h", "5–15 h", "15–40 h", "40 h+"], o_goal: ["Cash this week", "Monthly recurring", "Either"],
    notes_ph: "Anything else? Your niche, skills, what you already have… (optional)",
    money_btn: "Show me the money 💸", money_wait: "Jev is ranking the plays…",
    do_today: "Do this <em>today</em>", more_plays: "More plays", fit: "fit", launch_in: h => `launch in ~${h} h`,
    plan48: "48-hour plan", get_paid: "Get paid with", launch_post: "Launch post (copy & post)", copy: "Copy", copied2: "Copied ✓",
    evidence_line: (r, n) => `Niche #${r} on the radar · ${n} posts`, recurring: "recurring", one_off: "one-off",
    pay_box_h: "Take payments in 10 minutes", pay_box: ["Create a product in Stripe, Lemon Squeezy or Gumroad", "Copy its Payment Link (no code, no website needed)", "Put the link in your launch post and your X bio", "Deliver automatically: file download, license key or Discord role"],
    money_disclaimer: "No guaranteed income. These are plays ranked on public signals; results depend on execution.",
    money_personal: "Ranked for you by Jev", money_default: "Ranked by speed and demand. Answer the 4 questions to personalize with Jev.",
    type_names: { pack: "Pack", code: "Code", service: "Service", subscription: "Subscription", course: "Workshop", api: "API" },
  },
  fr: {
    nav_home: "En direct", nav_builds: "Démos", nav_opps: "Opportunités", nav_top: "Top 100", nav_people: "Personnes", nav_all: "Tout", nav_map: "Carte",
    search_short: "Rechercher", join: "Rejoindre le Discord", support: "Soutenir", support_long: "Soutenir le projet", follow: "Suivre",
    hero_live: (m, n) => `EN DIRECT · mis à jour ${m} · ${n} posts suivis`,
    hero_h: "Tout ce qui se passe autour de <em>Jev</em>, en direct.",
    hero_p: "Chaque post, démo, intégration et débat sur le modèle System One de TypeSafe sur X. Classé par Jev lui-même et mis à jour en direct, toutes les quelques minutes, avec un classement des business à construire.",
    hero_search: "Chercher des posts, personnes, démos, transcriptions, idées…",
    k_posts: "posts", k_people: "personnes", k_views: "vues", k_builds: "démos & systèmes", k_videos: "vidéos", k_code: "open source / outils gratuits",
    latest: "Derniers posts, <em>en direct</em>", latest_p: "Chaque nouveau post sur Jev dès qu'il arrive sur X, rafraîchi toutes les quelques minutes.",
    trending: "En ce <em>moment</em>", trending_p: "Les posts les plus engageants des dernières 24 heures.",
    builds_h: "Ce que les gens ont <em>construit</em>", builds_p: "De vrais systèmes qui tournent sur Jev, avec leur fonctionnement.",
    opps_h: "Où est l'<em>argent</em>", opps_p: "Les niches classées selon leur potentiel de revenu passif, recalculées chaque heure à partir de tous les posts.",
    pulse_h: "Le <em>pouls</em>", pulse_p: "Comment évolue la conversation.",
    debate_h: "Le <em>débat</em>", debate_p: "Tout le monde n'est pas convaincu. Les voix les plus fortes des deux camps.",
    people_h: "Qui <em>suivre</em>", people_p: "Ceux qui construisent et parlent de Jev, classés par audience.",
    runs_h: "Où tourne <em>Jev</em>", runs_p: "Plateformes, SDK et intégrations annoncés jusqu'ici.",
    see_all: "Tout voir →", per_day: "Posts par jour", by_domain: "Domaine d'application", by_pattern: "Comment Jev est utilisé", tone: "Ton envers Jev", format: "Format",
    skeptics: "Sceptiques", believers: "Convaincus",
    cta_h: "Construis avec Jev <em>avec nous</em>.", cta_p: "Rejoins le Discord Agentik OS : des builders qui lancent des produits Jev et partagent code, niches et revenus. Suis-nous sur X pour le best-of horaire.",
    builds_title: "Tout ce qui a été <em>construit</em> avec Jev", builds_lead: "Démos, outils et expériences, avec une courte explication du système derrière chacun.",
    opps_title: "Opportunités de <em>revenu passif</em>", opps_lead: "L'analyse de l'analyse : Jev classe chaque post dans une niche de produit, puis chaque niche est notée sur les signaux qui comptent pour un produit qui rapporte pendant que tu dors.",
    seg_niches: "Classement des niches", seg_ideas: "Bibliothèque d'idées", seg_check: "Teste ton idée",
    col_rank: "Rang", col_niche: "Niche", col_score: "Score", col_signals: "Signaux", col_activity: "Activité",
    s_passive: "passif", s_traction: "traction", s_demand: "demande", s_momentum: "dynamique", s_space: "espace",
    s_pain: "douleur", s_recurring: "récurrent", s_automation: "autonome", s_jev_fit: "fit Jev", s_open_market: "ouvert", s_build_ease: "facile", s_x_signal: "buzz X",
    w_passive: "Potentiel passif (jugement de Jev)", w_traction: "Traction (engagement)", w_demand: "Demande (gens qui réclament)", w_momentum: "Dynamique (48 dernières h)", w_space: "Espace libre (peu de produits)",
    idea_label: "Idée de produit", evidence: "Preuves sur X", untapped: "VIERGE",
    ideas_lead: "Des idées de produits notées par Jev sur six critères, plus le buzz de leur niche sur X. Les idées « vierges » n'ont encore aucun builder sur X.",
    buyer: "Client", price: "Prix", niche_rank: "rang de la niche",
    not_advice: "Des signaux, pas un conseil financier. Les scores reflètent les posts publics sur X et les jugements de Jev ; valide la demande avant de construire.",
    check_h: "Teste ta propre idée avec Jev", check_p: "Décris un produit. Jev le note sur les six mêmes critères en une seconde environ.",
    check_ph: "ex. Une app Shopify qui repère les commandes frauduleuses avant expédition, 29 $/mois…", check_btn: "Noter mon idée",
    check_empty: "Tes scores apparaîtront ici.", check_err: "Impossible de joindre Jev. Réessaie dans une minute.",
    top_title: "Top <em>100</em>", top_lead: "Le Radar Score mélange l'engagement et le côté concret d'un post : démos qui marchent, détail technique et code partagé passent devant.",
    people_title: "Les <em>gens</em> de Jev", people_lead: "Tous ceux qui ont posté sur Jev, classés par audience totale de leurs posts sur Jev.",
    all_title: "<em>Tout</em>", all_lead: "Chaque post, filtrable et triable.",
    map_title: "La <em>carte</em> de Jev", map_lead: "Tout ce qu'on sait sur Jev dans une carte interactive, reconstruite chaque heure à partir des données. Clique sur une branche pour l'ouvrir.",
    f_all_types: "Tous types", f_all_domains: "Tous domaines", f_all_niches: "Toutes niches", f_all_formats: "Tous formats",
    f_video: "Vidéo", f_photo: "Image", f_article: "Article", f_text: "Texte seul",
    sort_rs: "Tri : Radar score", sort_views: "Tri : vues", sort_likes: "Tri : likes", sort_date: "Tri : plus récent", sort_depth: "Tri : profondeur technique",
    replies: "inclure les réponses", posts_n: n => `${n} posts`, load_more: "Afficher plus",
    view_on_x: "Voir sur X ↗", copy_link: "Copier le lien", copied: "Copié", transcript: "Transcription vidéo", links: "Liens", article: "Article", system: "Le système",
    sr_people: "Personnes", sr_posts: "Posts", sr_ideas: "Idées & niches", sr_none: "Rien trouvé. Essaie un autre mot.",
    sr_tips: "Essaie :", ago: s => s < 60 ? "à l'instant" : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`,
    followers: "abonnés", jposts: n => `${n} post${n > 1 ? "s" : ""} sur Jev`, reach: "audience",
    foot_about: "Un suivi indépendant et non officiel de tout ce qui se dit sur Jev sur X. Aucun lien avec TypeSafe AI. Les posts appartiennent à leurs auteurs et renvoient vers X.",
    foot_method: "Méthode", foot_community: "Communauté",
    foot_method_txt: "Les posts publics sont collectés en direct (toutes les 3 minutes pour les comptes actifs, chaque heure pour tout le réseau), les vidéos sont transcrites, et chaque post est classé par Jev lui-même : type, domaine, système, niche et signaux business.",
    builders: "builders", in48: "en 48 h",
    nav_money: "Money now",
    money_eyebrow: "Money now", money_title: "Gagne de l'argent avec Jev <em>cette semaine</em>",
    money_lead: "Dis à Jev qui tu es. Il classe les façons les plus rapides d'être payé avec Jev + Claude ou Astra : quoi vendre, le prix, le plan sur 48 h, le système de paiement et le post de lancement.",
    q_code: "Tu sais coder ?", q_audience: "Ton audience", q_hours: "Heures dispo cette semaine", q_goal: "Tu veux",
    o_code: ["Non", "Un peu", "Oui"], o_audience: ["Aucune", "< 1k", "1k–10k", "10k+"], o_hours: ["< 5 h", "5–15 h", "15–40 h", "40 h+"], o_goal: ["Du cash cette semaine", "Du récurrent", "Peu importe"],
    notes_ph: "Autre chose ? Ta niche, tes compétences, ce que tu as déjà… (optionnel)",
    money_btn: "Montre-moi l'argent 💸", money_wait: "Jev classe les pistes…",
    do_today: "À faire <em>aujourd'hui</em>", more_plays: "Autres pistes", fit: "fit", launch_in: h => `lancement en ~${h} h`,
    plan48: "Plan sur 48 h", get_paid: "Encaisser avec", launch_post: "Post de lancement (copie et poste)", copy: "Copier", copied2: "Copié ✓",
    evidence_line: (r, n) => `Niche n°${r} sur le radar · ${n} posts`, recurring: "récurrent", one_off: "vente unique",
    pay_box_h: "Encaisser en 10 minutes", pay_box: ["Crée un produit sur Stripe, Lemon Squeezy ou Gumroad", "Copie son lien de paiement (ni code ni site nécessaires)", "Mets le lien dans ton post de lancement et ta bio X", "Livre automatiquement : fichier, clé de licence ou rôle Discord"],
    money_disclaimer: "Aucun revenu garanti. Ce sont des pistes classées sur des signaux publics ; le résultat dépend de l'exécution.",
    money_personal: "Classé pour toi par Jev", money_default: "Classé par rapidité et demande. Réponds aux 4 questions pour que Jev personnalise.",
    type_names: { pack: "Pack", code: "Code", service: "Service", subscription: "Abonnement", course: "Atelier", api: "API" },
  },
};
const L = {
  category: {
    en: { pending: "New · classifying…", build_demo: "Build / demo", integration: "Integration", explainer: "Explainer", news: "News", opinion: "Opinion", critique: "Critique", official: "Official TypeSafe", meme: "Meme", question: "Question" },
    fr: { pending: "Nouveau · en cours de classement", build_demo: "Démo / construit", integration: "Intégration", explainer: "Explication", news: "Actu", opinion: "Avis", critique: "Critique", official: "Officiel TypeSafe", meme: "Mème", question: "Question" },
  },
  domain: {
    en: { marketing_ads: "Marketing & ads", social_content: "Social & content", sales_leads: "Sales & leads", coding_devtools: "Code & dev tools", agents_browser: "Agents & browser", games: "Games", trading_finance: "Trading & finance", support_email: "Support & email", search_rag: "Search & RAG", safety_moderation: "Safety & moderation", data_classification: "Data classification", ux_personalization: "UX & personalization", research_science: "Research & benchmarks", general: "General" },
    fr: { marketing_ads: "Marketing & pubs", social_content: "Réseaux & contenu", sales_leads: "Vente & leads", coding_devtools: "Code & outils dev", agents_browser: "Agents & navigateur", games: "Jeux", trading_finance: "Trading & finance", support_email: "Support & emails", search_rag: "Recherche & RAG", safety_moderation: "Sécurité & modération", data_classification: "Classification de données", ux_personalization: "UX & personnalisation", research_science: "Recherche & benchmarks", general: "Général" },
  },
  pattern: {
    en: { batch_classifier: "Bulk classifier", realtime_loop: "Real-time loop", router: "Router / switch", reviewer_guardrail: "Reviewer / guardrail", ranking: "Ranking / rerank", features_for_ml: "Features for ML", none: "No system" },
    fr: { batch_classifier: "Classement en masse", realtime_loop: "Boucle temps réel", router: "Routeur / aiguillage", reviewer_guardrail: "Relecteur / garde-fou", ranking: "Classement / reranking", features_for_ml: "Features pour ML", none: "Pas de système" },
  },
};
let lang = (navigator.language || "en").slice(0, 2) === "fr" ? "fr" : "en";
try { const saved = localStorage.getItem("jr_lang"); if (saved === "fr" || saved === "en") lang = saved; } catch {}
const t = k => (T[lang][k] ?? T.en[k] ?? k);
const lab = (kind, k) => (L[kind][lang][k] || L[kind].en[k] || k);

// ---------------------------------------------------------------- thème
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem("jr_theme", th); } catch {}
}
try { const th = localStorage.getItem("jr_theme"); if (th) setTheme(th); else if (matchMedia("(prefers-color-scheme: light)").matches) setTheme("light"); } catch {}

// ---------------------------------------------------------------- utilitaires
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n || 0);
const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const now = () => Date.now() / 1000;
const fmtDate = c => new Date(c * 1000).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const sentiment = s => s < 0.8 ? 0 : s < 1.6 ? 1 : s < 2.4 ? 2 : s < 3.3 ? 3 : 4;
const SENT = { en: ["Hostile", "Skeptical", "Neutral", "Positive", "Enthusiastic"], fr: ["Hostile", "Sceptique", "Neutre", "Positif", "Enthousiaste"] };
const SENT_COL = ["var(--red)", "var(--amber)", "var(--faint)", "var(--cyan)", "var(--acc)"];
const fmtOf = p => p.v.length ? "video" : p.ph.length ? "photo" : p.ar ? "article" : "text";
const ICON = {
  eye: '<svg width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  heart: '<svg width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  rt: '<svg width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3"/></svg>',
  bm: '<svg width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg>',
  play: '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#fff" d="M8 5v14l11-7z"/></svg>',
  discord: $("#discordTop svg")?.outerHTML || "",
  x: '<svg width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M18.2 2.3h3.4l-7.4 8.4L23 21.7h-6.8l-5.3-7-6.1 7H1.4l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.4h1.9L7.1 4.2H5.1l11.9 15.5Z"/></svg>',
};

// ---------------------------------------------------------------- données
let POSTS = [], MAIN = [], NICHES = [], IDEAS = [], PLAYS = [], META = {}, BYID = new Map(), AUTHORS = [], INDEX = [];

async function load(quiet = false) {
  if (!quiet) view.innerHTML = `<div class="skeleton">loading the radar…</div>`;
  const bust = quiet ? `?t=${Date.now()}` : "";
  const get = u => fetch(u + bust, { cache: "no-cache" }).then(r => r.json());
  BYID = new Map();
  [POSTS, NICHES, IDEAS, META, PLAYS] = await Promise.all([get("/data/posts.json"), get("/data/niches.json"), get("/data/ideas.json"), get("/data/meta.json"), get("/data/plays.json").catch(() => [])]);
  MAIN = POSTS.filter(p => !p.r);
  POSTS.forEach(p => BYID.set(p.id, p));
  const au = new Map();
  for (const p of POSTS) {
    const a = au.get(p.a.h) || { ...p.a, posts: 0, views: 0, likes: 0, builds: 0, best: null };
    a.posts++; a.views += p.m[4]; a.likes += p.m[0];
    if (p.j.category === "build_demo") a.builds++;
    if (!a.best || p.m[4] > a.best.m[4]) a.best = p;
    a.f = Math.max(a.f || 0, p.a.f || 0); a.av = a.av || p.a.av;
    au.set(p.a.h, a);
  }
  AUTHORS = [...au.values()].sort((a, b) => b.views - a.views);
  buildIndex();
}

// ---------------------------------------------------------------- recherche
function buildIndex() {
  INDEX = POSTS.map(p => ({
    p,
    main: fold([p.t, p.q?.t, p.ar?.ti].join(" ")),
    who: fold(p.a.h + " " + p.a.n),
    deep: fold([p.ar?.tx, p.tr, p.sys?.en, p.sys?.fr, (p.lk || []).join(" "),
      lab("category", p.j.category), lab("domain", p.j.domain), lab("pattern", p.j.pattern),
      L.category.en[p.j.category], L.domain.en[p.j.domain], L.pattern.en[p.j.pattern],
      NICHES.find(n => n.id === p.j.niche)?.label.en, NICHES.find(n => n.id === p.j.niche)?.label.fr].join(" ")),
  }));
}
function terms(q) { return fold(q).split(/\s+/).filter(w => w.length > 1 || /\d/.test(w)); }
function search(q, limit = 60) {
  const ws = terms(q);
  if (!ws.length) return [];
  const out = [];
  for (const d of INDEX) {
    let s = 0, ok = true;
    for (const w of ws) {
      const m = d.main.includes(w) ? 3 : 0, a = d.who.includes(w) ? 4 : 0, x = d.deep.includes(w) ? 1 : 0;
      if (!m && !a && !x) { ok = false; break; }
      s += m + a + x;
    }
    if (ok) out.push({ p: d.p, s: s + Math.log10(1 + d.p.m[4]) / 2 + (d.p.r ? -1 : 0) });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map(o => o.p);
}
function hl(text, q) {
  let h = esc(text);
  const ws = terms(q || "").filter(w => w.length > 1).sort((a, b) => b.length - a.length);
  if (!ws.length) return h;
  const re = new RegExp("(" + ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return h.replace(re, "<mark>$1</mark>");
}
function snippet(p, q) {
  const ws = terms(q);
  const fields = [p.t, p.sys?.[lang], p.tr, p.ar?.tx, p.q?.t].filter(Boolean);
  for (const f of fields) {
    const ff = fold(f);
    const i = Math.min(...ws.map(w => ff.indexOf(w)).filter(i => i >= 0));
    if (isFinite(i)) return (i > 60 ? "…" : "") + f.slice(Math.max(0, i - 60), i + 160);
  }
  return p.t.slice(0, 200);
}

const layer = $("#searchLayer"), sq = $("#sq"), sres = $("#sres");
let sel = -1;
function openSearch(q = "") {
  layer.hidden = false; sq.value = q; sq.placeholder = t("hero_search"); sq.focus(); renderSearch();
  document.body.style.overflow = "hidden";
}
function closeSearch() { layer.hidden = true; document.body.style.overflow = ""; }
function renderSearch() {
  const q = sq.value.trim();
  sel = -1;
  if (!q) {
    const tips = lang === "fr" ? ["browser use", "mario", "vercel", "compaction", "trading", "email", "open source", "critique", "discord"] : ["browser use", "mario", "vercel", "compaction", "trading", "email", "open source", "skeptic", "minecraft"];
    sres.innerHTML = `<div class="sr-tips"><span class="sr-empty" style="padding:4px 6px">${t("sr_tips")}</span>${tips.map(x => `<button class="chip" data-tip="${x}">${x}</button>`).join("")}</div>`;
    return;
  }
  const fq = fold(q);
  const people = AUTHORS.filter(a => fold(a.h + " " + a.n).includes(fq)).slice(0, 5);
  const niches = [...NICHES.map(n => ({ kind: "n", id: n.id, t: n.label[lang], s: n.idea[lang] })), ...IDEAS.map(i => ({ kind: "i", id: i.k, t: i[lang], s: i["p" + lang] }))]
    .filter(x => terms(q).every(w => fold(x.t + " " + x.s).includes(w))).slice(0, 5);
  const posts = search(q, 40);
  let h = "";
  if (people.length) h += `<div class="sr-group"><h4>${t("sr_people")}</h4>${people.map(a => `
    <div class="sr-item" data-go="/all?q=@${encodeURIComponent(a.h)}"><img src="${esc(a.av)}" alt="" loading="lazy"><div class="sr-body"><b>${hl(a.n, q)}</b> <small>@${hl(a.h, q)} · ${T[lang].jposts(a.posts)} · ${fmtN(a.views)} ${t("reach")}</small></div></div>`).join("")}</div>`;
  if (niches.length) h += `<div class="sr-group"><h4>${t("sr_ideas")}</h4>${niches.map(x => `
    <div class="sr-item" data-go="/opportunities/${x.kind === "n" ? "niches" : "ideas"}?focus=${x.id}"><div class="sr-body"><b>${hl(x.t, q)}</b><p>${hl(x.s, q)}</p></div></div>`).join("")}</div>`;
  if (posts.length) h += `<div class="sr-group"><h4>${t("sr_posts")} <span>${posts.length >= 40 ? "40+" : posts.length}</span></h4>${posts.map(p => {
    const th = p.v[0]?.th || p.ph[0] || p.ar?.co;
    return `<div class="sr-item" data-post="${p.id}"><img src="${esc(p.a.av)}" alt="" loading="lazy"><div class="sr-body"><b>${esc(p.a.n)}</b> <small>@${esc(p.a.h)} · ${fmtN(p.m[4])} views · ${lab("category", p.j.category)}</small><p>${hl(snippet(p, q), q)}</p></div>${th ? `<img class="sr-thumb" src="${esc(th)}" alt="" loading="lazy">` : ""}</div>`;
  }).join("")}</div>`;
  sres.innerHTML = h || `<div class="sr-empty">${t("sr_none")}</div>`;
}
sq.addEventListener("input", renderSearch);
sq.addEventListener("keydown", e => {
  const items = $$(".sr-item", sres);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1)));
    items.forEach((el, i) => el.classList.toggle("sel", i === sel));
    items[sel]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    if (items[sel]) items[sel].click();
    else if (sq.value.trim()) { closeSearch(); go("/all?q=" + encodeURIComponent(sq.value.trim())); }
  }
});
sres.addEventListener("click", e => {
  const tip = e.target.closest("[data-tip]");
  if (tip) { sq.value = tip.dataset.tip; renderSearch(); sq.focus(); return; }
  const it = e.target.closest(".sr-item");
  if (!it) return;
  if (it.dataset.post) { closeSearch(); openPost(it.dataset.post); }
  else if (it.dataset.go) { closeSearch(); go(it.dataset.go); }
});
layer.addEventListener("click", e => { if (e.target === layer) closeSearch(); });
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); layer.hidden ? openSearch() : closeSearch(); }
  else if (e.key === "/" && layer.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  else if (e.key === "Escape") { if (!$("#lb").hidden) $("#lb").hidden = true; else if (!layer.hidden) closeSearch(); else if (!$("#modal").hidden) closePost(); }
});
$("#openSearch").onclick = () => openSearch();

// ---------------------------------------------------------------- cartes
function mediaBlock(p) {
  if (p.v.length) {
    // aperçu : version légère, muette, en boucle, lancée seulement quand la carte est visible
    const v = p.v[0];
    return `<div class="media vid"><video muted loop playsinline preload="${v.th ? "none" : "metadata"}" ${v.th ? `poster="${esc(v.th)}"` : ""} data-src="${esc(v.s || v.u)}"></video><span class="live-dot">▶</span>${v.d ? `<span class="dur">${Math.floor(v.d / 60)}:${String(v.d % 60).padStart(2, "0")}</span>` : ""}</div>`;
  }
  if (p.ph.length) return `<div class="media"><img src="${esc(p.ph[0])}" alt="" loading="lazy">${p.ph.length > 1 ? `<span class="cnt">+${p.ph.length - 1}</span>` : ""}</div>`;
  if (p.ar) return `<div class="art">${p.ar.co ? `<img src="${esc(p.ar.co)}" alt="" loading="lazy">` : ""}<div>📄 ${esc(p.ar.ti)}</div></div>`;
  return "";
}
function tagsOf(p) {
  const j = p.j, s = sentiment(j.sentiment);
  const tags = [`<span class="tag cat">${lab("category", j.category)}</span>`];
  if (j.domain && j.domain !== "general") tags.push(`<span class="tag">${lab("domain", j.domain)}</span>`);
  if (j.pattern && j.pattern !== "none" && ["build_demo", "official", "integration"].includes(j.category)) tags.push(`<span class="tag">⚙ ${lab("pattern", j.pattern)}</span>`);
  if (j.open_source > .6) tags.push(`<span class="tag">${lang === "fr" ? "code / outil gratuit" : "open source / free"}</span>`);
  tags.push(`<span class="tag ${s <= 1 ? "neg" : s >= 3 ? "pos" : ""}">${SENT[lang][s]}</span>`);
  return `<div class="tags">${tags.join("")}</div>`;
}
const FRESH = new Map(); // id -> heure d'arrivée en direct
function card(p, opts = {}) {
  const q = opts.q || "";
  const fresh = FRESH.has(p.id) && Date.now() - FRESH.get(p.id) < 15 * 60_000;
  return `<article class="post${fresh ? " fresh" : ""}" data-post="${p.id}">${fresh ? `<span class="fresh-badge">● NEW</span>` : ""}
    <div class="who"><img src="${esc(p.a.av)}" alt="" loading="lazy"><div class="nm"><b>${hl(p.a.n, q)}</b><span>@${esc(p.a.h)} · ${fmtN(p.a.f)} ${t("followers")} · ${opts.ago ? `<b class="ago" data-ago="${p.c}">${T[lang].ago(now() - p.c)}</b>` : fmtDate(p.c)}</span></div>${opts.rank ? `<span class="rank-badge">#${p.rk}</span>` : ""}</div>
    ${p.sys ? `<div class="sys"><b>${t("system")}</b>${esc(p.sys[lang] || p.sys.en)}</div>` : ""}
    <div class="ptext">${hl(p.t, q)}</div>
    ${p.q ? `<div class="qt">↪ @${esc(p.q.h)}: ${esc(p.q.t)}</div>` : ""}
    ${mediaBlock(p)}
    ${tagsOf(p)}
    <div class="metrics"><span>${ICON.eye}${fmtN(p.m[4])}</span><span>${ICON.heart}${fmtN(p.m[0])}</span><span>${ICON.rt}${fmtN(p.m[1])}</span><span>${ICON.bm}${fmtN(p.m[3])}</span></div>
  </article>`;
}

// ---------------------------------------------------------------- modale
const modal = $("#modal"), mcard = $("#modalCard");
let modalBack = null;
function openPost(id, push = true) {
  const p = BYID.get(id);
  if (!p) return;
  const media = [
    ...p.v.map(v => `<video controls playsinline preload="metadata" poster="${esc(v.th)}" src="${esc(v.u)}"></video>`),
    ...p.ph.map(u => `<img class="mimg" src="${esc(u)}" alt="" loading="lazy">`),
  ].join("");
  const n = NICHES.find(x => x.id === p.j.niche);
  mcard.innerHTML = `
    <button class="icon-btn close" aria-label="Close">✕</button>
    <div class="who"><img src="${esc(p.a.av)}" alt=""><div class="nm"><b>${esc(p.a.n)}</b><span>@${esc(p.a.h)} · ${fmtN(p.a.f)} ${t("followers")} · ${fmtDate(p.c)}</span></div></div>
    ${p.sys ? `<div class="sys"><b>${t("system")}</b>${esc(p.sys[lang] || p.sys.en)}</div>` : ""}
    <div class="full">${esc(p.t)}</div>
    ${p.q ? `<div class="qt" style="-webkit-line-clamp:unset">↪ <a href="${esc(p.q.u)}" target="_blank" rel="noopener">@${esc(p.q.h)}</a>: ${esc(p.q.t)}</div>` : ""}
    ${media}
    ${p.ar ? `<details open><summary>📄 ${esc(p.ar.ti)}</summary><div>${esc(p.ar.tx)}${p.ar.tx.length >= 3000 ? "…" : ""}</div></details>` : ""}
    ${p.tr ? `<details><summary>${t("transcript")}</summary><div>${esc(p.tr)}</div></details>` : ""}
    ${p.lk?.length ? `<details open><summary>${t("links")}</summary><div>${p.lk.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join("<br>")}</div></details>` : ""}
    ${tagsOf(p)}
    ${n ? `<div class="tags"><a class="tag" href="/opportunities/niches?focus=${n.id}">💡 ${esc(n.label[lang])} · #${n.rank}</a></div>` : ""}
    <div class="metrics"><span>${ICON.eye}${fmtN(p.m[4])}</span><span>${ICON.heart}${fmtN(p.m[0])}</span><span>${ICON.rt}${fmtN(p.m[1])}</span><span>💬 ${fmtN(p.m[2])}</span><span>${ICON.bm}${fmtN(p.m[3])}</span>${p.rk ? `<span>Radar #${p.rk}</span>` : ""}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="${esc(p.u)}" target="_blank" rel="noopener">${t("view_on_x")}</a><button class="btn ghost" id="copyLink">${t("copy_link")}</button></div>`;
  modal.hidden = false; document.body.style.overflow = "hidden";
  $(".close", mcard).onclick = closePost;
  $("#copyLink").onclick = e => { navigator.clipboard?.writeText(location.origin + "/p/" + p.id); e.target.textContent = t("copied"); };
  if (push && !location.pathname.startsWith("/p/")) { modalBack = location.pathname + location.search; history.pushState(null, "", "/p/" + p.id); }
}
function closePost() {
  modal.hidden = true; document.body.style.overflow = "";
  $$("video", mcard).forEach(v => v.pause());
  if (location.pathname.startsWith("/p/")) { if (modalBack) history.back(); else go("/"); }
}
modal.addEventListener("click", e => {
  if (e.target === modal) closePost();
  if (e.target.matches(".mimg")) { $("#lbimg").src = e.target.src; $("#lb").hidden = false; }
});
$("#lb").onclick = () => $("#lb").hidden = true;
view.addEventListener("click", e => {
  const c = e.target.closest("[data-post]");
  if (c && !e.target.closest("a")) openPost(c.dataset.post);
});

// ---------------------------------------------------------------- blocs réutilisables
const counts = (arr, f) => arr.reduce((m, p) => { const k = f(p); if (k != null) m[k] = (m[k] || 0) + 1; return m; }, {});
function hbars(obj, kind, link, color) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(1, ...e.map(x => x[1]));
  return e.map(([k, n]) => `<div class="hbar" data-go="${link ? link(k) : ""}"><span class="l">${esc(kind ? lab(kind, k) : k)}</span><div class="t"><div class="f" style="width:${n / mx * 100}%;${color ? `background:${color}` : ""}"></div></div><span class="n">${n}</span></div>`).join("");
}
function perDayChart(arr) {
  const byDay = counts(arr, p => new Date(p.c * 1000).toISOString().slice(0, 10));
  const days = Object.keys(byDay).sort();
  const mx = Math.max(...Object.values(byDay));
  const W = 600, H = 140, bw = W / days.length;
  return `<svg class="spark" viewBox="0 0 ${W} ${H + 22}" preserveAspectRatio="none">${days.map((d, i) => {
    const h = byDay[d] / mx * H;
    return `<rect x="${i * bw + 4}" y="${H - h}" width="${bw - 8}" height="${h}" rx="4" fill="var(--acc)" opacity="${.45 + .55 * (i + 1) / days.length}"/><text x="${i * bw + bw / 2}" y="${H - h - 5}" text-anchor="middle" fill="var(--ink2)" font-size="11" font-family="JetBrains Mono">${byDay[d]}</text><text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle" fill="var(--muted)" font-size="11" font-family="JetBrains Mono">${d.slice(8)}/${d.slice(5, 7)}</text>`;
  }).join("")}</svg>`;
}
function sentimentBar(arr) {
  const c = [0, 0, 0, 0, 0];
  arr.forEach(p => c[sentiment(p.j.sentiment)]++);
  const tot = arr.length || 1;
  return `<div class="stack">${c.map((n, i) => `<div style="width:${n / tot * 100}%;background:${SENT_COL[i]}"></div>`).join("")}</div>
    <div class="legend">${c.map((n, i) => `<span><i style="background:${SENT_COL[i]}"></i>${SENT[lang][i]} ${Math.round(n / tot * 100)}%</span>`).join("")}</div>`;
}
function ring(v, col = "var(--acc)") {
  const r = 16, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 38 38"><circle cx="19" cy="19" r="${r}" fill="none" stroke="var(--card2)" stroke-width="4"/><circle cx="19" cy="19" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 19 19)"/></svg>`;
}
const SUBCOL = { passive: "var(--acc)", traction: "var(--cyan)", demand: "var(--pink)", momentum: "var(--amber)", space: "var(--violet)",
  pain: "var(--pink)", recurring: "var(--acc)", automation: "var(--cyan)", jev_fit: "var(--violet)", open_market: "var(--amber)", build_ease: "var(--green)", x_signal: "var(--red)" };
function subBars(sub) {
  return `<div class="subs">${Object.entries(sub).map(([k, v]) => `<div class="sub">${t("s_" + k)}<div class="t"><div class="f" style="width:${Math.round(v * 100)}%;background:${SUBCOL[k]}"></div></div></div>`).join("")}</div>`;
}
function deltaHtml(b) {
  if (b.prev_rank == null) return `<small class="flat">new</small>`;
  const d = b.prev_rank - b.rank;
  return d > 0 ? `<small class="up">▲${d}</small>` : d < 0 ? `<small class="down">▼${-d}</small>` : `<small class="flat">=</small>`;
}
function ctaBlock() {
  return `<section class="cta"><div class="eyebrow">Agentik OS</div><h2>${t("cta_h")}</h2><p>${t("cta_p")}</p>
    <div class="row"><a class="discord-btn" href="${CFG.discord}" target="_blank" rel="noopener">${ICON.discord}<span>${t("join")}</span></a>
    ${CFG.x ? `<a class="x-btn" href="${CFG.x}" target="_blank" rel="noopener">${ICON.x}<span>${t("follow")} @${CFG.x.split("/").pop()}</span></a>` : ""}</div></section>`;
}
function person(a, i) {
  return `<div class="person" data-go="/all?q=@${encodeURIComponent(a.h)}"><span class="pr">${i + 1}</span><img src="${esc(a.av)}" alt="" loading="lazy"><div style="min-width:0"><b>${esc(a.n)}</b><span>@${esc(a.h)} · ${fmtN(a.f)} ${t("followers")}</span><span>${T[lang].jposts(a.posts)} · ${fmtN(a.views)} ${t("reach")}</span></div></div>`;
}
view.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g && g.dataset.go) go(g.dataset.go);
});

// ---------------------------------------------------------------- pages
function pageHome() {
  const recent = MAIN.filter(p => p.c >= now() - 86400).sort((a, b) => (b.rs || 0) - (a.rs || 0)).slice(0, 12);
  const trending = recent.length >= 6 ? recent : [...MAIN].sort((a, b) => b.c - a.c).slice(0, 40).sort((a, b) => (b.rs || 0) - (a.rs || 0)).slice(0, 12);
  const builds = MAIN.filter(p => p.sys).sort((a, b) => b.m[4] - a.m[4]).slice(0, 6);
  const crit = MAIN.filter(p => p.j.category === "critique").sort((a, b) => b.m[4] - a.m[4]).slice(0, 3);
  const fans = MAIN.filter(p => sentiment(p.j.sentiment) === 4 && p.j.category !== "official").sort((a, b) => b.m[4] - a.m[4]).slice(0, 3);
  const integ = MAIN.filter(p => p.j.category === "integration").sort((a, b) => b.m[4] - a.m[4]).slice(0, 6);
  const chipDefs = [
    ["/builds", lang === "fr" ? "Démos" : "Builds", MAIN.filter(p => p.j.category === "build_demo").length],
    ["/all?cat=integration", lang === "fr" ? "Intégrations" : "Integrations", MAIN.filter(p => p.j.category === "integration").length],
    ["/all?cat=critique", lang === "fr" ? "Critiques" : "Critiques", MAIN.filter(p => p.j.category === "critique").length],
    ["/all?dom=games", lang === "fr" ? "Jeux" : "Games", MAIN.filter(p => p.j.domain === "games").length],
    ["/all?dom=agents_browser", lang === "fr" ? "Agents navigateur" : "Browser agents", MAIN.filter(p => p.j.domain === "agents_browser").length],
    ["/all?fmt=video", lang === "fr" ? "Vidéos" : "Videos", MAIN.filter(p => p.v.length).length],
    ["/opportunities", lang === "fr" ? "Idées business" : "Business ideas", IDEAS.length],
    ["/map", lang === "fr" ? "Carte" : "Map", null],
  ];
  view.innerHTML = `
  <section class="hero">
    <span class="live" id="liveLabel">${T[lang].hero_live(T[lang].ago(now() - META.updated), META.posts.toLocaleString(lang))}</span>
    <h1>${t("hero_h")}</h1>
    <p class="lead">${t("hero_p")}</p>
    <div class="hero-search" id="heroSearch">
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2" d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"/></svg>
      <span>${t("hero_search")}</span><kbd>⌘K</kbd>
    </div>
    <div class="hero-cta"><a class="btn money-hero" href="/money">💸 ${lang === "fr" ? "Comment gagner de l'argent avec Jev, maintenant" : "How to make money with Jev, right now"}</a></div>
    <div class="chips" style="margin-top:18px">${chipDefs.map(([h, l, n]) => `<a class="chip" href="${h}">${l}${n != null ? `<span class="n">${n}</span>` : ""}</a>`).join("")}</div>
  </section>
  <div class="kpis">
    <div class="kpi"><b>${MAIN.length.toLocaleString(lang)}</b><span>${t("k_posts")}</span></div>
    <div class="kpi"><b>${AUTHORS.length.toLocaleString(lang)}</b><span>${t("k_people")}</span></div>
    <div class="kpi"><b>${fmtN(META.views)}</b><span>${t("k_views")}</span></div>
    <div class="kpi"><b>${MAIN.filter(p => p.j.category === "build_demo").length}</b><span>${t("k_builds")}</span></div>
    <div class="kpi"><b>${MAIN.filter(p => p.v.length).length}</b><span>${t("k_videos")}</span></div>
    <div class="kpi"><b>${MAIN.filter(p => p.j.open_source > .6).length}</b><span>${t("k_code")}</span></div>
  </div>
  <section class="sec latest-sec"><div class="sec-head"><div><h2><span class="pulse"></span>${t("latest")}</h2><p>${t("latest_p")}</p></div><a class="more" href="/all?sort=date">${t("see_all")}</a></div>
    <div class="rail">${[...MAIN].sort((a, b) => b.c - a.c).slice(0, 14).map(p => card(p, { ago: true })).join("")}</div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("trending")}</h2><p>${t("trending_p")}</p></div><a class="more" href="/all?sort=date">${t("see_all")}</a></div>
    <div class="rail">${trending.map(p => card(p)).join("")}</div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("builds_h")}</h2><p>${t("builds_p")}</p></div><a class="more" href="/builds">${t("see_all")}</a></div>
    <div class="grid">${builds.map(p => card(p)).join("")}</div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("opps_h")}</h2><p>${t("opps_p")}</p></div><a class="more" href="/opportunities">${t("see_all")}</a></div>
    ${nicheBoard(NICHES.slice(0, 6), false)}</section>
  <section class="sec"><div class="sec-head"><div><h2>${t("pulse_h")}</h2><p>${t("pulse_p")}</p></div></div>
    <div class="panels">
      <div class="panel"><h3>${t("per_day")}</h3>${perDayChart(MAIN)}</div>
      <div class="panel"><h3>${t("tone")}</h3>${sentimentBar(MAIN)}<h3 style="margin-top:22px">${t("by_pattern")}</h3>${hbars(counts(MAIN.filter(p => ["build_demo", "official", "integration"].includes(p.j.category) && p.j.pattern !== "none"), p => p.j.pattern), "pattern", k => "/all?pat=" + k, "var(--cyan)")}</div>
      <div class="panel"><h3>${t("by_domain")}</h3>${hbars(counts(MAIN, p => p.j.domain), "domain", k => "/all?dom=" + k)}</div>
    </div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("debate_h")}</h2><p>${t("debate_p")}</p></div></div>
    <div class="panels"><div><h3 class="eyebrow" style="color:var(--red)">${t("skeptics")}</h3><div class="grid" style="grid-template-columns:1fr">${crit.map(p => card(p)).join("")}</div></div>
    <div><h3 class="eyebrow">${t("believers")}</h3><div class="grid" style="grid-template-columns:1fr">${fans.map(p => card(p)).join("")}</div></div></div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("runs_h")}</h2><p>${t("runs_p")}</p></div><a class="more" href="/all?cat=integration">${t("see_all")}</a></div>
    <div class="grid">${integ.map(p => card(p)).join("")}</div></section>
  <section class="sec"><div class="sec-head"><div><h2>${t("people_h")}</h2><p>${t("people_p")}</p></div><a class="more" href="/people">${t("see_all")}</a></div>
    <div class="people">${AUTHORS.slice(0, 12).map(person).join("")}</div></section>
  ${ctaBlock()}`;
  $("#heroSearch").onclick = () => openSearch();
}

function nicheBoard(list, full = true, focus) {
  return `<div class="board">
    <div class="brow head"><span>${t("col_rank")}</span><span>${t("col_niche")}</span><span>${t("col_score")}</span><span>${t("col_signals")}</span><span>${t("col_activity")}</span><span></span></div>
    ${list.map(b => `
      <div class="brow ${focus === b.id ? "open" : ""}" data-nk="${b.id}">
        <div class="brk">${b.rank}${deltaHtml(b)}</div>
        <div class="bname"><b>${esc(b.label[lang])}</b><span>${esc(b.idea[lang])}</span></div>
        <div class="bscore">${ring(b.score)}<b>${Math.round(b.score)}</b></div>
        ${subBars(b.sub)}
        <div class="bmeta">${b.posts} posts<br>${b.builders} ${t("builders")}<br>+${b.recent48} ${t("in48")}</div>
        <span class="chev">›</span>
      </div>
      <div class="bdetail ${focus === b.id ? "open" : ""}" id="nd-${b.id}">
        <div class="idea"><b>${t("idea_label")}</b>${esc(b.idea[lang])}</div>
        ${IDEAS.filter(i => i.n === b.id).length ? `<div class="tags" style="margin-bottom:12px">${IDEAS.filter(i => i.n === b.id).map(i => `<a class="tag" href="/opportunities/ideas?focus=${i.k}">💡 ${esc(i[lang])} · ${Math.round(i.score)}</a>`).join("")}</div>` : ""}
        <div class="eyebrow">${t("evidence")}</div>
        <div class="grid">${b.top.map(id => BYID.get(id)).filter(Boolean).slice(0, full ? 4 : 3).map(p => card(p)).join("")}</div>
      </div>`).join("")}
  </div>`;
}
view.addEventListener("click", e => {
  const r = e.target.closest(".brow[data-nk]");
  if (!r || e.target.closest("a")) return;
  r.classList.toggle("open");
  $("#nd-" + r.dataset.nk)?.classList.toggle("open");
});

function ideaBoard(focus) {
  return `<div class="board">
    <div class="brow head"><span>${t("col_rank")}</span><span>${lang === "fr" ? "Idée" : "Idea"}</span><span>${t("col_score")}</span><span>${t("col_signals")}</span><span>${t("price")}</span><span></span></div>
    ${IDEAS.map(i => `
      <div class="brow ${focus === i.k ? "open" : ""}" data-ik="${i.k}">
        <div class="brk">${i.rank}</div>
        <div class="bname"><b>${esc(i[lang])}${i.untapped ? `<span class="untapped">${t("untapped")}</span>` : ""}</b><span>${esc(i["p" + lang])}</span></div>
        <div class="bscore">${ring(i.score, "var(--cyan)")}<b>${Math.round(i.score)}</b></div>
        ${subBars(i.sub)}
        <div class="bmeta">${esc(i.price)}<br>${esc(i["b" + lang])}</div>
        <span class="chev">›</span>
      </div>
      <div class="bdetail ${focus === i.k ? "open" : ""}" id="id-${i.k}">
        <div class="idea"><b>${t("idea_label")}</b>${esc(i["p" + lang])}</div>
        <div class="bmeta">${t("buyer")} : ${esc(i["b" + lang])} · ${t("price")} : ${esc(i.price)}${i.niche_rank ? ` · ${t("niche_rank")} #${i.niche_rank} (${i.niche_posts} posts)` : ""}</div>
        ${i.n ? `<div class="grid" style="margin-top:12px">${(NICHES.find(n => n.id === i.n)?.top || []).map(id => BYID.get(id)).filter(Boolean).slice(0, 3).map(p => card(p)).join("")}</div>` : ""}
      </div>`).join("")}
  </div>`;
}
view.addEventListener("click", e => {
  const r = e.target.closest(".brow[data-ik]");
  if (!r || e.target.closest("a")) return;
  r.classList.toggle("open");
  $("#id-" + r.dataset.ik)?.classList.toggle("open");
});

function pageOpps(sub, params) {
  sub = sub || "niches";
  const W = META.weights || {};
  view.innerHTML = `
  <div class="page-head"><div class="eyebrow">${lang === "fr" ? "Analyse de l'analyse" : "Analysis of the analysis"}</div><h1>${t("opps_title")}</h1><p>${t("opps_lead")}</p></div>
  <div class="seg">${["niches", "ideas", "check"].map(s => `<button data-seg="${s}" class="${s === sub ? "on" : ""}">${t("seg_" + s)}</button>`).join("")}</div>
  <div id="oppBody"></div>`;
  $$(".seg button").forEach(b => b.onclick = () => go("/opportunities/" + b.dataset.seg));
  const body = $("#oppBody");
  if (sub === "niches") {
    body.innerHTML = `<div class="method">${Object.entries(W).map(([k, v]) => `<div><b style="color:${SUBCOL[k]}">${Math.round(v * 100)}%</b><span>${t("w_" + k)}</span></div>`).join("")}</div>
      <p class="note">${t("not_advice")}</p>${nicheBoard(NICHES, true, params.get("focus"))}`;
  } else if (sub === "ideas") {
    body.innerHTML = `<p style="color:var(--ink2);margin:0 0 14px">${t("ideas_lead")}</p><p class="note">${t("not_advice")}</p>${ideaBoard(params.get("focus"))}`;
  } else {
    body.innerHTML = `<div class="checker"><div class="panel"><h3>${t("check_h")}</h3><p style="color:var(--muted);margin:-6px 0 12px">${t("check_p")}</p>
      <textarea id="ideaTxt" maxlength="1200" placeholder="${esc(t("check_ph"))}"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" id="ideaGo">${t("check_btn")}</button></div></div>
      <div class="panel" id="ideaRes"><div class="result-empty">${t("check_empty")}</div></div></div>`;
    $("#ideaGo").onclick = checkIdea;
  }
  const f = params.get("focus");
  if (f) setTimeout(() => $(`[data-nk="${f}"],[data-ik="${f}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}
async function checkIdea() {
  const txt = $("#ideaTxt").value.trim();
  if (txt.length < 15) return;
  const btn = $("#ideaGo"), res = $("#ideaRes");
  btn.disabled = true; btn.textContent = "…";
  try {
    const r = await fetch("/api/check-idea", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: txt }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "error");
    // même formule que la bibliothèque : critères Jev + buzz X de la niche la plus proche
    const nb = NICHES.find(n => n.id === d.niche);
    d.sub.x_signal = nb ? nb.score / 100 : 0;
    const W = META.idea_weights || {};
    const score = 100 * Object.entries(W).reduce((a, [k, w]) => a + w * (d.sub[k] || 0), 0);
    res.innerHTML = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">${ring(score, "var(--cyan)").replace('class="ring"', 'class="ring" style="width:64px;height:64px"')}<div><b style="font:600 34px var(--mono);letter-spacing:-.04em">${Math.round(score)}</b><div style="color:var(--muted);font-size:13px">${lang === "fr" ? "vs les idées de la bibliothèque" : "vs the idea library"} : #${IDEAS.filter(i => i.score > score).length + 1} / ${IDEAS.length + 1}</div></div></div>
      ${Object.entries(d.sub).map(([k, v]) => `<div class="hbar" style="cursor:default"><span class="l">${t("s_" + k)}</span><div class="t"><div class="f" style="width:${v * 100}%;background:${SUBCOL[k]}"></div></div><span class="n">${Math.round(v * 100)}</span></div>`).join("")}
      ${d.niche && d.niche !== "none" ? `<p style="margin-top:14px">${lang === "fr" ? "Niche la plus proche" : "Closest niche"} : <a href="/opportunities/niches?focus=${d.niche}">${esc(NICHES.find(n => n.id === d.niche)?.label[lang] || d.niche)}</a></p>` : ""}
      <p class="note">${t("not_advice")}</p>`;
  } catch {
    res.innerHTML = `<div class="result-empty">${t("check_err")}</div>`;
  }
  btn.disabled = false; btn.textContent = t("check_btn");
}

function feedPage({ title, lead, base, params, masonry = true, rank = false }) {
  const q = params.get("q") || "", cat = params.get("cat") || "", dom = params.get("dom") || "", nic = params.get("nic") || "", pat = params.get("pat") || "", fm = params.get("fmt") || "";
  const sort = params.get("sort") || "rs", rep = params.get("rep") === "1";
  const opt = (kind, v, all) => `<option value="">${all}</option>` + Object.entries(counts(base, p => p.j[kind])).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(kind === "niche" ? (NICHES.find(x => x.id === k)?.label[lang] || k) : lab(kind, k))} (${n})</option>`).join("");
  view.innerHTML = `
  <div class="page-head"><h1>${title}</h1><p>${lead}</p></div>
  <div class="filters">
    <input id="fq" type="search" value="${esc(q)}" placeholder="${esc(t("hero_search"))}">
    <select id="fcat">${opt("category", cat, t("f_all_types"))}</select>
    <select id="fdom">${opt("domain", dom, t("f_all_domains"))}</select>
    <select id="fnic">${opt("niche", nic, t("f_all_niches"))}</select>
    <select id="ffmt"><option value="">${t("f_all_formats")}</option>${["video", "photo", "article", "text"].map(k => `<option value="${k}" ${k === fm ? "selected" : ""}>${t("f_" + k)}</option>`).join("")}</select>
    <select id="fsort">${["rs", "views", "likes", "date", "depth"].map(k => `<option value="${k}" ${k === sort ? "selected" : ""}>${t("sort_" + k)}</option>`).join("")}</select>
    <label class="count"><input type="checkbox" id="frep" ${rep ? "checked" : ""}> ${t("replies")}</label>
    <span class="count" id="fcount"></span>
  </div>
  <div class="${masonry ? "masonry" : "grid"}" id="feed"></div>
  <button class="btn ghost loadmore" id="more">${t("load_more")}</button>`;
  let list = q ? search(q, 5000) : base.slice();
  if (q.startsWith("@")) list = POSTS.filter(p => fold(p.a.h) === fold(q.slice(1)));
  list = list.filter(p => (rep || !p.r || q.startsWith("@")) && (!cat || p.j.category === cat) && (!dom || p.j.domain === dom) && (!nic || p.j.niche === nic) && (!pat || p.j.pattern === pat) && (!fm || fmtOf(p) === fm));
  if (!q || sort !== "rs") {
    const by = { rs: (a, b) => (b.rs || 0) - (a.rs || 0), views: (a, b) => b.m[4] - a.m[4], likes: (a, b) => b.m[0] - a.m[0], date: (a, b) => b.c - a.c, depth: (a, b) => b.j.depth - a.j.depth };
    list.sort(by[sort]);
  }
  $("#fcount").textContent = T[lang].posts_n(list.length);
  let shown = 0;
  const feed = $("#feed"), more = $("#more");
  const hq = q.startsWith("@") ? "" : q;
  const page = () => { feed.insertAdjacentHTML("beforeend", list.slice(shown, shown + 48).map(p => card(p, { q: hq, rank })).join("")); shown += 48; more.style.display = shown < list.length ? "block" : "none"; };
  page();
  if (!list.length) feed.innerHTML = `<div class="empty">${t("sr_none")}</div>`;
  more.onclick = page;
  new IntersectionObserver(es => es[0].isIntersecting && shown < list.length && page(), { rootMargin: "600px" }).observe(more);
  const upd = () => {
    const ps = new URLSearchParams();
    const v = { q: $("#fq").value.trim(), cat: $("#fcat").value, dom: $("#fdom").value, nic: $("#fnic").value, fmt: $("#ffmt").value, sort: $("#fsort").value === "rs" ? "" : $("#fsort").value, rep: $("#frep").checked ? "1" : "", pat };
    Object.entries(v).forEach(([k, x]) => x && ps.set(k, x));
    history.replaceState(null, "", location.pathname + (ps.toString() ? "?" + ps : ""));
    route();
  };
  let tm;
  $("#fq").addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(upd, 250); });
  ["fcat", "fdom", "fnic", "ffmt", "fsort", "frep"].forEach(id => $("#" + id).addEventListener("change", upd));
}

function pagePeople() {
  view.innerHTML = `<div class="page-head"><h1>${t("people_title")}</h1><p>${t("people_lead")}</p></div>
    <div class="people">${AUTHORS.slice(0, 300).map(person).join("")}</div>${ctaBlock()}`;
}

// ---------------------------------------------------------------- money now
const MONEY_KEYS = { code: ["no", "a little", "yes, comfortably"], audience: ["none", "under 1,000 followers", "1,000 to 10,000 followers", "over 10,000 followers"],
  hours: ["under 5", "5 to 15", "15 to 40", "over 40"], goal: ["cash this week", "recurring monthly revenue", "either"] };
let moneyProfile = { code: 1, audience: 1, hours: 1, goal: 2, notes: "" }, moneyFit = null;
try { Object.assign(moneyProfile, JSON.parse(localStorage.getItem("jr_money") || "{}")); } catch {}
function heuristicFit(p) {
  // sans Jev : rapidité, demande sur le radar, et compatibilité grossière avec le profil
  const pr = moneyProfile;
  let s = 0.55 - p.hours / 150 + (p.niche_score || 0) / 250;
  if (p.code > pr.code) s -= 0.25 * (p.code - pr.code);
  if (p.audience > pr.audience + 1) s -= 0.2;
  if (pr.goal === 0 && p.recurring) s -= 0.08;
  if (pr.goal === 1 && !p.recurring) s -= 0.08;
  if (p.hours > [5, 15, 40, 80][pr.hours] * 1.5) s -= 0.15;
  return Math.max(0.05, Math.min(0.95, s));
}
function rankedPlays() {
  return PLAYS.map(p => ({ ...p, fitv: moneyFit?.[p.k]?.score ?? heuristicFit(p) }))
    .sort((a, b) => b.fitv - a.fitv || a.hours - b.hours);
}
function segGroup(key, opts) {
  return `<div class="mq"><label>${t("q_" + key)}</label><div class="seg mini">${opts.map((o, i) => `<button data-mk="${key}" data-mv="${i}" class="${moneyProfile[key] === i ? "on" : ""}">${esc(o)}</button>`).join("")}</div></div>`;
}
function playCard(p, i, big) {
  const steps = p["s" + lang], hook = p["hook_" + lang], done = (() => { try { return JSON.parse(localStorage.getItem("jr_steps_" + p.k) || "[]"); } catch { return []; } })();
  return `<article class="play ${big ? "big" : ""}">
    <div class="play-top"><span class="play-rank">${i + 1}</span>
      <div class="play-title"><b>${esc(p[lang])}</b><div class="play-meta"><span class="tag cat">${esc(T[lang].type_names[p.type] || p.type)}</span><span class="tag">💰 ${esc(p.price)}</span><span class="tag">${p.recurring ? t("recurring") : t("one_off")}</span><span class="tag">⏱ ${T[lang].launch_in(p.hours)}</span></div></div>
      <div class="bscore">${ring(Math.round(p.fitv * 100), "var(--acc)")}<b>${Math.round(p.fitv * 100)}</b></div></div>
    <p class="play-pitch">${esc(p["p" + lang])}</p>
    ${big ? `<div class="play-grid">
      <div><h4>${t("plan48")}</h4><ol class="steps">${steps.map((st, j) => `<li><label><input type="checkbox" data-step="${p.k}:${j}" ${done.includes(j) ? "checked" : ""}> ${esc(st)}</label></li>`).join("")}</ol>
        <h4>${t("get_paid")}</h4><p class="pay">${esc(p.pay)}</p></div>
      <div><h4>${t("launch_post")}</h4><div class="hook"><pre>${esc(hook)}</pre><button class="btn ghost small" data-copy="${esc(hook)}">${t("copy")}</button></div>
        ${p.niche_rank ? `<a class="evidence" href="/opportunities/niches?focus=${p.niche}">📈 ${T[lang].evidence_line(p.niche_rank, p.niche_posts)} →</a>` : ""}</div>
    </div>` : `<details class="play-more"><summary>${t("plan48")} · ${t("launch_post")}</summary><ol class="steps">${steps.map(st => `<li>${esc(st)}</li>`).join("")}</ol><div class="hook"><pre>${esc(hook)}</pre><button class="btn ghost small" data-copy="${esc(hook)}">${t("copy")}</button></div></details>`}
  </article>`;
}
function renderPlays() {
  const list = rankedPlays();
  $("#moneyRes").innerHTML = `
    <p class="note" style="border-color:var(--acc)">${moneyFit ? t("money_personal") : t("money_default")}</p>
    <div class="sec-head" style="margin-top:26px"><h2>${t("do_today")}</h2></div>
    <div class="plays-big">${list.slice(0, 3).map((p, i) => playCard(p, i, true)).join("")}</div>
    <div class="panel paybox"><h3>${t("pay_box_h")}</h3><ol>${T[lang].pay_box.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>
    <div class="sec-head" style="margin-top:34px"><h2>${t("more_plays")}</h2></div>
    <div class="grid">${list.slice(3).map((p, i) => playCard(p, i + 3, false)).join("")}</div>
    <p class="note">${t("money_disclaimer")}</p>
    ${ctaBlock()}`;
}
function pageMoney() {
  view.innerHTML = `
  <div class="page-head"><div class="eyebrow">💸 ${t("money_eyebrow")}</div><h1>${t("money_title")}</h1><p>${t("money_lead")}</p></div>
  <div class="panel money-form">
    <div class="mqs">${segGroup("code", T[lang].o_code)}${segGroup("audience", T[lang].o_audience)}${segGroup("hours", T[lang].o_hours)}${segGroup("goal", T[lang].o_goal)}</div>
    <textarea id="mnotes" maxlength="400" placeholder="${esc(t("notes_ph"))}">${esc(moneyProfile.notes || "")}</textarea>
    <button class="btn money-go" id="moneyGo">${t("money_btn")}</button>
  </div>
  <div id="moneyRes"></div>`;
  renderPlays();
  $("#moneyGo").onclick = runMoney;
}
async function runMoney() {
  moneyProfile.notes = $("#mnotes").value.trim();
  try { localStorage.setItem("jr_money", JSON.stringify(moneyProfile)); } catch {}
  const btn = $("#moneyGo");
  btn.disabled = true; btn.textContent = t("money_wait");
  try {
    const body = { notes: moneyProfile.notes };
    for (const k of ["code", "audience", "hours", "goal"]) body[k] = MONEY_KEYS[k][moneyProfile[k]];
    const r = await fetch("/api/money-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    moneyFit = d.fit;
  } catch { moneyFit = null; }
  renderPlays();
  btn.disabled = false; btn.textContent = t("money_btn");
  $("#moneyRes").scrollIntoView({ behavior: "smooth" });
}
view.addEventListener("click", e => {
  const b = e.target.closest("[data-mk]");
  if (b) {
    moneyProfile[b.dataset.mk] = +b.dataset.mv; moneyFit = null;
    $$(`[data-mk="${b.dataset.mk}"]`).forEach(x => x.classList.toggle("on", x === b));
    try { localStorage.setItem("jr_money", JSON.stringify(moneyProfile)); } catch {}
    renderPlays();
  }
  const c = e.target.closest("[data-copy]");
  if (c) { navigator.clipboard?.writeText(c.dataset.copy); c.textContent = t("copied2"); setTimeout(() => c.textContent = t("copy"), 1500); }
});
view.addEventListener("change", e => {
  const cb = e.target.closest("[data-step]");
  if (!cb) return;
  const [k, j] = cb.dataset.step.split(":");
  let done = [];
  try { done = JSON.parse(localStorage.getItem("jr_steps_" + k) || "[]"); } catch {}
  done = cb.checked ? [...new Set([...done, +j])] : done.filter(x => x !== +j);
  try { localStorage.setItem("jr_steps_" + k, JSON.stringify(done)); } catch {}
});

// ---------------------------------------------------------------- /post (page cachée : réponses manuelles)
const SITE_URL = "https://jev.agentik-os.com";
let REPLIED = {};
const REPLY_TPL = {
  build_demo: [
    "This is one of the best Jev builds so far 🔥\n\nI added it to Jev Radar: a free page that tracks everything built with Jev, in one place.\n\n{url}",
    "Great build. It's now on Jev Radar with a plain-English breakdown of how it works.\n\nEvery Jev project, demo and idea, free and updated hourly:\n{url}",
    "Love this one. Added to Jev Radar, where I centralize every Jev build, integration and business idea. Free:\n{url}",
  ],
  integration: [
    "Big one for the Jev ecosystem. I'm tracking every Jev integration on Jev Radar, free and updated every hour:\n{url}",
    "Added to the \"where Jev runs\" list on Jev Radar. Everything about Jev in one place, free:\n{url}",
  ],
  explainer: [
    "Great explainer. For anyone who wants the full picture: Jev Radar centralizes every Jev post, demo and idea. Free:\n{url}",
    "Saved this in Jev Radar's Learn section. Everything about Jev, one free page, updated hourly:\n{url}",
  ],
  critique: [
    "Fair point, and worth hearing. Jev Radar tracks both sides of the Jev debate, skeptics included. Free:\n{url}",
  ],
  question: [
    "This might help: Jev Radar puts every Jev demo, explainer and integration in one free page:\n{url}",
  ],
  default: [
    "Hey, I put everything about Jev in one place: every post, demo and business idea. Free, updated hourly.\n\nYours is on it:\n{url}",
    "If you're following Jev: I centralize every post, build and money idea on one free page, updated every hour.\n\n{url}",
    "Jev moves fast, so I built one free page that tracks all of it: posts, builds, integrations, niches.\n\n{url}",
  ],
};
function replyFor(p) {
  const list = REPLY_TPL[p.j.category] || REPLY_TPL.default;
  const h = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
  return list[h % list.length].replace("{url}", `${SITE_URL}/p/${p.id}`);
}
const tweetLen = s => s.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
const postState = () => { try { return JSON.parse(localStorage.getItem("jr_post_state") || "{}"); } catch { return {}; } };
const setPostState = (id, v) => { const s = postState(); if (v) s[id] = v; else delete s[id]; try { localStorage.setItem("jr_post_state", JSON.stringify(s)); } catch {} };
let postFilter = "todo";
async function pagePost() {
  document.querySelector('meta[name="robots"]') || document.head.insertAdjacentHTML("beforeend", '<meta name="robots" content="noindex,nofollow">');
  try { REPLIED = await fetch("/data/replied.json", { cache: "no-cache" }).then(r => r.json()); } catch { REPLIED = {}; }
  renderPostPage();
}
function renderPostPage() {
  const st = postState();
  const all = MAIN.filter(p => p.a.h.toLowerCase() !== "agentik_os" && !["meme"].includes(p.j.category));
  const status = p => REPLIED[p.id] ? "verified" : st[p.id] === "done" ? "done" : st[p.id] === "opened" ? "opened" : "todo";
  const seen = (() => { try { return +localStorage.getItem("jr_post_seen") || 0; } catch { return 0; } })();
  const counts = { todo: 0, opened: 0, done: 0, verified: 0 };
  all.forEach(p => counts[status(p)]++);
  const list = all.filter(p => postFilter === "all" || (postFilter === "todo" ? ["todo", "opened"].includes(status(p)) : ["done", "verified"].includes(status(p))))
    .sort((a, b) => postFilter === "new" ? b.c - a.c : (b.c > seen) - (a.c > seen) || b.m[4] - a.m[4]);
  view.innerHTML = `
  <div class="page-head"><div class="eyebrow">/post · ${lang === "fr" ? "page privée" : "private page"}</div>
    <h1>${lang === "fr" ? "Réponses à <em>poster</em>" : "Replies to <em>post</em>"}</h1>
    <p>${lang === "fr" ? "Un commentaire prêt pour chaque post sur Jev. Clique « Répondre sur X », poste, puis marque-le. Tes réponses publiées depuis @Agentik_os sont validées automatiquement." : "A ready reply for every post about Jev. Click Reply on X, post it, then mark it. Replies published from @Agentik_os are verified automatically."}</p></div>
  <div class="method">
    <div><b>${counts.todo + counts.opened}</b><span>${lang === "fr" ? "à faire" : "to do"}</span></div>
    <div><b style="color:var(--acc)">${counts.verified}</b><span>${lang === "fr" ? "vérifiés sur X ✓" : "verified on X ✓"}</span></div>
    <div><b>${counts.done}</b><span>${lang === "fr" ? "marqués à la main" : "marked by hand"}</span></div>
    <div><b>${all.filter(p => p.c > seen).length}</b><span>${lang === "fr" ? "nouveaux depuis ta dernière visite" : "new since your last visit"}</span></div>
  </div>
  <div class="seg">${[["todo", lang === "fr" ? "À faire" : "To do"], ["new", lang === "fr" ? "Plus récents" : "Newest"], ["done", lang === "fr" ? "Faits" : "Done"], ["all", lang === "fr" ? "Tous" : "All"]]
    .map(([k, l]) => `<button data-pf="${k}" class="${postFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
  <div class="replies">${list.slice(0, 150).map(p => {
    const s = status(p), txt = replyFor(p);
    return `<div class="rrow ${s}" data-rid="${p.id}">
      <div class="rpost">
        <div class="who"><img src="${esc(p.a.av)}" alt="" loading="lazy"><div class="nm"><b>${esc(p.a.n)}${p.c > seen ? ' <span class="untapped">NEW</span>' : ""}</b><span>@${esc(p.a.h)} · ${fmtN(p.a.f)} ${t("followers")} · ${fmtDate(p.c)}</span></div></div>
        <div class="ptext" style="-webkit-line-clamp:4">${esc(p.t)}</div>
        <div class="metrics"><span>${ICON.eye}${fmtN(p.m[4])}</span><span>${ICON.heart}${fmtN(p.m[0])}</span><span>💬 ${fmtN(p.m[2])}</span><a href="${esc(p.u)}" target="_blank" rel="noopener">${t("view_on_x")}</a></div>
      </div>
      <div class="rreply">
        <textarea data-rtxt="${p.id}" rows="5">${esc(txt)}</textarea>
        <div class="rbar"><span class="rlen" data-rlen="${p.id}">${tweetLen(txt)}/280</span>
          ${s === "verified" ? `<a class="rstat ok" href="${esc(REPLIED[p.id].url)}" target="_blank" rel="noopener">✓ ${lang === "fr" ? "posté, vérifié" : "posted, verified"}</a>`
            : `<button class="btn" data-rgo="${p.id}">${lang === "fr" ? "Répondre sur X ↗" : "Reply on X ↗"}</button>
               <button class="btn ghost" data-rdone="${p.id}">${s === "done" ? (lang === "fr" ? "Annuler" : "Undo") : (lang === "fr" ? "Marquer posté ✓" : "Mark posted ✓")}</button>`}
        </div>
      </div>
    </div>`;
  }).join("") || `<div class="empty">${lang === "fr" ? "Tout est fait 🎉" : "All done 🎉"}</div>`}</div>`;
  try { localStorage.setItem("jr_post_seen", String(Math.floor(now()))); } catch {}
}
view.addEventListener("click", e => {
  const f = e.target.closest("[data-pf]");
  if (f) { postFilter = f.dataset.pf; renderPostPage(); return; }
  const g = e.target.closest("[data-rgo]");
  if (g) {
    const id = g.dataset.rgo, txt = $(`[data-rtxt="${id}"]`).value;
    window.open(`https://x.com/intent/post?in_reply_to=${id}&text=${encodeURIComponent(txt)}`, "_blank", "noopener");
    setPostState(id, "opened");
    g.closest(".rrow").classList.add("opened");
    return;
  }
  const d = e.target.closest("[data-rdone]");
  if (d) { const id = d.dataset.rdone; setPostState(id, postState()[id] === "done" ? null : "done"); renderPostPage(); }
});
view.addEventListener("input", e => {
  const ta = e.target.closest("[data-rtxt]");
  if (ta) { const el = $(`[data-rlen="${ta.dataset.rtxt}"]`), n = tweetLen(ta.value); el.textContent = `${n}/280`; el.classList.toggle("over", n > 280); }
});

// ---------------------------------------------------------------- carte mentale
function mapTree() {
  const fr = lang === "fr";
  const pick = (arr, n = 5) => arr.slice(0, n).map(p => ({ label: `@${p.a.h} · ${p.t.split("\n")[0].slice(0, 46)}`, post: p.id }));
  const byPat = k => pick(MAIN.filter(p => p.j.pattern === k && ["build_demo", "official"].includes(p.j.category)).sort((a, b) => b.m[4] - a.m[4]), 4);
  const integ = MAIN.filter(p => p.j.category === "integration").sort((a, b) => b.m[4] - a.m[4]);
  return {
    label: "Jev", children: [
      { label: fr ? "Ce qu'est Jev" : "What Jev is", children: [
        { label: fr ? "Un modèle « System One », pas un LLM" : "A System One model, not an LLM" },
        { label: fr ? "Entrée : state + questions typées" : "Input: state + typed questions" },
        { label: fr ? "3 types de questions" : "Three question types", children: [{ label: "Choice" }, { label: "Score" }, { label: "Noul (oui/non)" }] },
        { label: fr ? "Toutes les questions en parallèle" : "All questions run in parallel" },
        { label: fr ? "0,042 $ / M tokens d'entrée, sortie gratuite" : "$0.042 / M input tokens, output free" },
        { label: fr ? "~70 à 500 ms par décision" : "~70-500 ms per decision" },
      ] },
      { label: fr ? "Où il tourne" : "Where it runs", children: [
        { label: "API TypeSafe · SDK Python / JS", href: "https://docs.typesafe.ai" },
        ...pick(integ, 6),
      ] },
      { label: fr ? "Schémas de systèmes" : "System patterns", children: ["realtime_loop", "batch_classifier", "router", "reviewer_guardrail", "ranking", "features_for_ml"].map(k => ({
        label: lab("pattern", k), count: MAIN.filter(p => p.j.pattern === k && ["build_demo", "official"].includes(p.j.category)).length, go: "/all?pat=" + k, children: byPat(k) })) },
      { label: fr ? "Top niches" : "Top niches", children: NICHES.slice(0, 8).map(n => ({ label: `#${n.rank} ${n.label[lang]}`, count: Math.round(n.score), go: "/opportunities/niches?focus=" + n.id,
        children: [{ label: n.idea[lang].slice(0, 70) + (n.idea[lang].length > 70 ? "…" : "") }, ...(n.top.slice(0, 2).map(id => BYID.get(id)).filter(Boolean).map(p => ({ label: `@${p.a.h} · ${p.t.split("\n")[0].slice(0, 40)}`, post: p.id })))] })) },
      { label: fr ? "Meilleures idées business" : "Best business ideas", children: IDEAS.slice(0, 8).map(i => ({ label: `${i[lang]}`, count: Math.round(i.score), go: "/opportunities/ideas?focus=" + i.k })) },
      { label: fr ? "Le débat" : "The debate", children: pick(MAIN.filter(p => p.j.category === "critique").sort((a, b) => b.m[4] - a.m[4]), 5) },
      { label: fr ? "Apprendre" : "Learn", children: [
        { label: fr ? "Blog de lancement" : "Launch blog", href: "https://typesafe.ai/blog/introducing-system-one-models-and-jev" },
        { label: "Docs TypeSafe", href: "https://docs.typesafe.ai" },
        ...pick(MAIN.filter(p => p.j.category === "explainer").sort((a, b) => b.m[4] - a.m[4]), 5),
      ] },
    ],
  };
}
const MM_COLORS = ["#ffb547", "#ff6fb5", "#5ad7ff", "#c5f82a", "#a78bfa", "#ff6b5b", "#4ade80", "#f59e0b"];
let mmOpen = new Set(["root", "0", "1", "2", "3"]);
function pageMap() {
  view.innerHTML = `<div class="page-head"><h1>${t("map_title")}</h1><p>${t("map_lead")}</p></div><div class="mm-wrap" id="mm"></div>`;
  drawMap();
}
function drawMap() {
  const root = mapTree();
  const ROW = 34, COLW = [120, 250, 330, 360];
  let y = 0;
  const nodes = [], links = [];
  (function lay(n, depth, path, color) {
    n.path = path; n.depth = depth; n.color = color;
    const kids = mmOpen.has(path) ? (n.children || []) : [];
    if (kids.length) {
      kids.forEach((c, i) => lay(c, depth + 1, path === "root" ? String(i) : path + "." + i, depth === 0 ? MM_COLORS[i % MM_COLORS.length] : color));
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    } else { n.y = y; y += ROW; }
    n.x = COLW.slice(0, depth).reduce((a, b) => a + b, 20);
    nodes.push(n);
    kids.forEach(c => links.push([n, c]));
  })(root, 0, "root", "var(--acc)");
  const W = Math.max(...nodes.map(n => n.x + 380)), H = y + 30;
  const tw = n => Math.min(360, (n.label.length + (n.count != null ? 5 : 0)) * 7.4 + 30);
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <g transform="translate(0,20)">
    ${links.map(([a, b]) => {
      const x1 = a.x + (a.depth === 0 ? 70 : tw(a)), y1 = a.y, x2 = b.x, y2 = b.y, mx = (x1 + x2) / 2;
      return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 6},${y2}" fill="none" stroke="${b.color}" stroke-width="1.6" opacity=".75"/><line x1="${x2 - 6}" y1="${y2 + 8}" x2="${x2 + tw(b) - 10}" y2="${y2 + 8}" stroke="${b.color}" stroke-width="1.2" opacity=".5"/>`;
    }).join("")}
    ${nodes.map(n => {
      const has = n.children?.length, open = mmOpen.has(n.path);
      if (n.depth === 0) return `<g class="mm-node mm-root" data-path="root"><rect x="${n.x - 6}" y="${n.y - 20}" width="80" height="40" rx="10"/><text x="${n.x + 34}" y="${n.y + 6}" text-anchor="middle" style="font:italic 24px 'Instrument Serif';fill:var(--acc)">Jev</text></g>`;
      return `<g class="mm-node" data-path="${n.path}" ${n.post ? `data-mpost="${n.post}"` : ""} ${n.go ? `data-mgo="${n.go}"` : ""} ${n.href ? `data-mhref="${esc(n.href)}"` : ""}>
        <rect x="${n.x - 8}" y="${n.y - 14}" width="${tw(n)}" height="28" fill="transparent"/>
        <text class="lbl" x="${n.x}" y="${n.y + 4}" ${n.depth === 1 ? 'style="font-weight:600"' : ""}>${esc(n.label.length > 48 ? n.label.slice(0, 47) + "…" : n.label)}${n.count != null ? `<tspan class="cnt" dx="8">${n.count}</tspan>` : ""}</text>
        ${has ? `<circle cx="${n.x - 14}" cy="${n.y}" r="5" fill="${open ? n.color : "var(--card)"}" stroke="${n.color}" stroke-width="1.6"/>` : n.post || n.go || n.href ? `<circle cx="${n.x - 14}" cy="${n.y}" r="2.5" fill="${n.color}"/>` : ""}
      </g>`;
    }).join("")}
    </g></svg>`;
  $("#mm").innerHTML = svg;
}
view.addEventListener("click", e => {
  const n = e.target.closest(".mm-node");
  if (!n) return;
  if (n.dataset.mpost) return openPost(n.dataset.mpost);
  if (n.dataset.mhref) return window.open(n.dataset.mhref, "_blank", "noopener");
  const p = n.dataset.path;
  const node = (function find(x) { if (x.path === p) return x; for (const c of x.children || []) { const r = find(c); if (r) return r; } })(mapTreeCache());
  if (node?.children?.length) { mmOpen.has(p) ? mmOpen.delete(p) : mmOpen.add(p); drawMap(); }
  else if (n.dataset.mgo) go(n.dataset.mgo);
});
function mapTreeCache() {
  const r = mapTree();
  (function tag(n, path) { n.path = path; (n.children || []).forEach((c, i) => tag(c, path === "root" ? String(i) : path + "." + i)); })(r, "root");
  return r;
}

// ---------------------------------------------------------------- routeur
function applyLang() {
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  $("#lang").textContent = lang === "fr" ? "EN" : "FR";
  const x = $("#xLinkFoot");
  if (x && CFG.x) x.innerHTML = `<a href="${CFG.x}" target="_blank" rel="noopener">X · @${CFG.x.split("/").pop()}</a>`;
  if (!$("#tabMap")) $("#tabs").insertAdjacentHTML("beforeend", `<a href="/map" data-r="map" id="tabMap">${t("nav_map")}</a>`);
  else $("#tabMap").textContent = t("nav_map");
  if (!$("#moneyBtn")) $("#openSearch").insertAdjacentHTML("beforebegin", `<a class="money-btn" id="moneyBtn" href="/money" data-r="money">💸 <span>${t("nav_money")}</span></a>`);
}
function route() {
  const path = location.pathname || "/", qs = location.search.slice(1);
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  const r = parts[0] || "home";
  if (r === "p" && parts[1]) {
    if (!view.dataset.r) { pageHome(); view.dataset.r = "home"; }
    return openPost(parts[1], false);
  }
  if (!modal.hidden) { modal.hidden = true; document.body.style.overflow = ""; }
  $$("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
  const prev = view.dataset.r + "|" + path;
  view.dataset.r = r;
  if (r === "home") pageHome();
  else if (r === "builds") feedPage({ title: t("builds_title"), lead: t("builds_lead"), base: MAIN.filter(p => ["build_demo", "official"].includes(p.j.category)), params, masonry: true });
  else if (r === "opportunities") pageOpps(parts[1], params);
  else if (r === "top") feedPage({ title: t("top_title"), lead: t("top_lead"), base: MAIN.filter(p => p.rk && p.rk <= 100).sort((a, b) => a.rk - b.rk), params, masonry: false, rank: true });
  else if (r === "people") pagePeople();
  else if (r === "all") feedPage({ title: t("all_title"), lead: t("all_lead"), base: POSTS, params });
  else if (r === "map") pageMap();
  else if (r === "money") pageMoney();
  else if (r === "post") pagePost();
  else pageHome();
  if (prev.split("|")[1] !== path) window.scrollTo({ top: 0 });
}
function go(url) {
  if (url === location.pathname + location.search) return route();
  history.pushState(null, "", url);
  route();
}
window.addEventListener("popstate", () => { if (!location.pathname.startsWith("/p/")) modalBack = null; route(); });
// liens internes : navigation sans rechargement
document.addEventListener("click", e => {
  const a = e.target.closest("a[href^='/']");
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute("href"));
});
// anciens liens en #/… : convertis en vraies adresses
if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1) || "/");
$("#lang").onclick = () => { lang = lang === "fr" ? "en" : "fr"; try { localStorage.setItem("jr_lang", lang); } catch {} applyLang(); buildIndex(); route(); };
$("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");

// bouton Discord flottant
document.body.insertAdjacentHTML("beforeend", `<a class="discord-btn float-discord" href="${CFG.discord}" target="_blank" rel="noopener">${ICON.discord}<span>${t("join")}</span></a>`);

// ---------------------------------------------------------------- direct : nouveaux posts sans recharger
let liveBanner = null;
function liveAgo() {
  $$("[data-ago]").forEach(el => el.textContent = T[lang].ago(now() - +el.dataset.ago));
  const el = $("#liveLabel");
  if (el && META.updated) el.textContent = T[lang].hero_live(T[lang].ago(now() - META.updated), META.posts.toLocaleString(lang));
}
async function checkLive() {
  try {
    const m = await fetch(`/data/meta.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.json());
    if (!m.updated || m.updated <= META.updated) return liveAgo();
    const before = new Set(POSTS.map(p => p.id));
    await load(true);
    const added = MAIN.filter(p => !before.has(p.id));
    added.forEach(p => FRESH.set(p.id, Date.now()));
    liveAgo();
    if (!added.length) return;
    const r = (location.pathname.split("/")[1] || "home");
    const calm = window.scrollY < 300 && modal.hidden && layer.hidden && ["home", "all"].includes(r) && !document.activeElement?.matches?.("input,textarea");
    if (calm) { route(); return flash(added.length); }
    showLiveBanner(added.length);
  } catch {}
}
function flash(n) {
  const el = document.createElement("div");
  el.className = "live-toast";
  el.textContent = lang === "fr" ? `● ${n} nouveau${n > 1 ? "x" : ""} post${n > 1 ? "s" : ""} en direct` : `● ${n} new post${n > 1 ? "s" : ""}, live`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
function showLiveBanner(n) {
  liveBanner?.remove();
  liveBanner = document.createElement("button");
  liveBanner.className = "live-banner";
  liveBanner.textContent = lang === "fr" ? `● ${n} nouveau${n > 1 ? "x" : ""} post${n > 1 ? "s" : ""} · voir` : `● ${n} new post${n > 1 ? "s" : ""} · show`;
  liveBanner.onclick = () => { liveBanner.remove(); liveBanner = null; window.scrollTo({ top: 0 }); route(); };
  document.body.appendChild(liveBanner);
}
setInterval(checkLive, 60_000);
setInterval(liveAgo, 30_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkLive(); });

// aperçus vidéo : lecture quand ≥ 60 % de la carte est visible, pause sinon
const vidObs = new IntersectionObserver(entries => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.6) {
      if (!v.src && v.dataset.src) v.src = v.dataset.src;
      v.play().catch(() => {});
    } else v.pause();
  }
}, { threshold: [0, 0.6] });
new MutationObserver(() => $$("video[data-src]:not([data-obs])").forEach(v => { v.dataset.obs = 1; vidObs.observe(v); }))
  .observe(document.body, { childList: true, subtree: true });

load().then(() => { applyLang(); route(); }).catch(err => {
  view.innerHTML = `<div class="empty">Could not load data. ${esc(err.message)}</div>`;
});
})();
