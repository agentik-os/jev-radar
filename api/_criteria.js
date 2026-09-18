// Généré par pipeline/build.py — ne pas modifier à la main.
export const CRITERIA = {
 "pain": {
  "q": "How painful and costly is the problem this product solves for its buyer?",
  "levels": [
   "Nice to have, nobody pays for this today",
   "Mild annoyance",
   "Real recurring pain",
   "Costly problem teams already spend money on",
   "Critical problem with an obvious budget"
  ]
 },
 "recurring": {
  "q": "How naturally does this product generate recurring revenue?",
  "levels": [
   "One-off purchase at best",
   "Occasional use",
   "Monthly use is plausible",
   "Used every week, subscription feels natural",
   "Used every day, usage-based billing grows by itself"
  ]
 },
 "automation": {
  "q": "Once built, how much can this product run without its owner's ongoing work?",
  "levels": [
   "Needs the owner's constant manual work",
   "Frequent manual intervention",
   "Some support and tuning",
   "Mostly runs by itself",
   "Fully self-serve, runs unattended"
  ]
 },
 "jev_fit": {
  "q": "How much does this product's core rely on fast, cheap, typed decisions (Jev's strength) rather than generated text?",
  "levels": [
   "Needs long text generation, Jev does not help",
   "Jev helps marginally",
   "Jev handles an important part",
   "The core is fast typed decisions, ideal for Jev",
   "Impossible or uneconomic without Jev's speed and price"
  ]
 },
 "open_market": {
  "q": "How open is the market for this product today?",
  "levels": [
   "Crowded with strong incumbents",
   "Several good competitors",
   "Some competition",
   "Few serious competitors",
   "Wide open"
  ]
 },
 "build_ease": {
  "q": "How easy is it for a solo developer to ship a first version?",
  "levels": [
   "Needs a large team and months",
   "Hard for a solo developer",
   "A few weeks for a solo developer",
   "An MVP in about a week",
   "An MVP in a weekend"
  ]
 }
};
export const NICHES = {
 "ad_intelligence": "Analyzing ads or marketing creatives at scale (hooks, offers, CTAs, competitor ads)",
 "content_virality": "Scoring or improving social media posts, predicting virality, content optimization for creators",
 "newsjacking_pr": "Monitoring news or trends and matching them to brands, PR, press opportunities",
 "lead_scoring": "Scoring sales leads, matching prospects to messages, outreach personalization, buying signals",
 "email_triage": "Classifying, prioritizing or routing emails, inbox triage",
 "support_routing": "Routing or classifying customer support tickets, chat intents, helpdesk automation",
 "code_review": "Reviewing pull requests or code diffs, detecting risky changes, code quality checks",
 "agent_safety": "Guarding AI agents: approving shell commands, permissions, tool-call safety, guardrails",
 "context_compaction": "Compacting or pruning an AI agent's context, memory selection, deciding what to keep in context",
 "browser_automation": "Browser agents or computer use: choosing clicks, typing and navigation on web pages or desktop apps",
 "qa_testing": "Automated QA testing of apps, adversarial testing, test agents",
 "tool_routing": "Routing requests between tools, models or skills; choosing which LLM or handler to use",
 "search_ranking": "Search, reranking results, RAG passage selection, launchers ranking by intent",
 "data_labeling": "Classifying rows of data, spreadsheets, databases, CSV labeling, research paper or document sorting",
 "moderation": "Content moderation, spam, rage bait, scam detection, feed filtering",
 "trading_signals": "Trading decisions, market signals, buy/sell bots, finance",
 "game_bots": "Game-playing bots and game AI (Mario, chess, Minecraft, Doom, NPCs)",
 "voice_control": "Voice commands mapped to actions, voice interfaces",
 "adaptive_ui": "Adaptive or personalized interfaces, recommendations, predictive UX",
 "robotics_iot": "Drones, robots, IoT, physical devices controlled by decisions",
 "dev_integration": "SDKs, libraries, wrappers or plugins that make Jev easier to use for developers (DuckDB, RubyLLM, MCP, languages)",
 "education_content": "Teaching Jev: courses, tutorials, explainers, newsletters about building with Jev",
 "none": "No specific product use case"
};
export const PLAYS = [
 {
  "k": "question_packs",
  "en": "Sell ready-to-use Jev question packs",
  "pen": "JSON packs of tuned Jev questions for one job each (virality score, lead score, PR risk, ticket triage) with a copy-paste script. Buyers skip the prompt-engineering.",
  "type": "pack",
  "price": "$29\u201349",
  "code": 0,
  "audience": 1,
  "hours": 8
 },
 {
  "k": "starter_kit",
  "en": "Jev SaaS starter kit",
  "pen": "A Next.js boilerplate with Jev calls, Stripe subscriptions, auth and a landing page. Devs pay to ship a Jev product in a weekend.",
  "type": "code",
  "price": "$49\u201399",
  "code": 2,
  "audience": 1,
  "hours": 16
 },
 {
  "k": "done_for_you",
  "en": "Done-for-you Jev classifier setup",
  "pen": "Plug Jev into a company's inbox, tickets or leads and hand over a dashboard. Fastest cash: no audience needed, just DMs.",
  "type": "service",
  "price": "$500\u20131,500",
  "code": 1,
  "audience": 0,
  "hours": 24
 },
 {
  "k": "viral_scorer",
  "en": "Viral post scorer micro-SaaS",
  "pen": "Paste a post, get a score and what to fix, loop until it peaks. Creators pay monthly; cost per score is $0.0004.",
  "type": "subscription",
  "price": "$9\u201312/mo",
  "code": 1,
  "audience": 1,
  "hours": 24
 },
 {
  "k": "opportunity_report",
  "en": "Weekly Jev opportunity report",
  "pen": "Every week: the niches rising on the radar, untapped ideas, the builds that got traction and what they would charge. Sell the analysis itself.",
  "type": "subscription",
  "price": "$9/mo or $19 one-off",
  "code": 0,
  "audience": 1,
  "hours": 6
 },
 {
  "k": "pr_action",
  "en": "PR risk-check GitHub Action",
  "pen": "One Jev call per diff with 15 typed checks, a comment on the PR, a monthly plan per repo. $0.00007 of cost per PR.",
  "type": "subscription",
  "price": "$19/repo/mo",
  "code": 2,
  "audience": 0,
  "hours": 40
 },
 {
  "k": "context_plugin",
  "en": "Claude Code / Codex context plugin",
  "pen": "Instant context pruning and tool-call cleanup for coding agents. The top post in this niche got 900k views; the demand is proven.",
  "type": "code",
  "price": "$9 one-off / $5/mo",
  "code": 2,
  "audience": 1,
  "hours": 16
 },
 {
  "k": "feed_extension",
  "en": "Feed cleaner Chrome extension",
  "pen": "Hides rage bait, engagement farming and crypto spam on X and LinkedIn. Mass-market, tiny price, runs by itself.",
  "type": "subscription",
  "price": "$3/mo",
  "code": 2,
  "audience": 1,
  "hours": 24
 },
 {
  "k": "sheets_addon",
  "en": "=JEV() spreadsheet add-on",
  "pen": "A formula that classifies or scores any row in plain language. Analysts and ops pay every month.",
  "type": "subscription",
  "price": "$12/mo",
  "code": 2,
  "audience": 0,
  "hours": 40
 },
 {
  "k": "lead_audit",
  "en": "Outreach & lead audit for agencies",
  "pen": "Score an agency's leads and cold emails with Jev, return a ranked sheet and the messages that will flop. Sold by DM.",
  "type": "service",
  "price": "$300 per audit",
  "code": 0,
  "audience": 0,
  "hours": 12
 },
 {
  "k": "weekend_workshop",
  "en": "Live workshop: build 3 Jev apps in a weekend",
  "pen": "A paid live cohort while the topic is hot. Record it and resell the replay as a pack.",
  "type": "course",
  "price": "$99 per seat",
  "code": 1,
  "audience": 2,
  "hours": 10
 },
 {
  "k": "paid_community",
  "en": "Paid Discord tier with radar alerts",
  "pen": "A premium Discord channel: hourly radar alerts, templates, code, weekly calls. Recurring, near-zero work once running.",
  "type": "subscription",
  "price": "$19/mo",
  "code": 0,
  "audience": 2,
  "hours": 4
 },
 {
  "k": "decide_api",
  "en": "Cheapest-model router API",
  "pen": "An OpenAI-compatible proxy: Jev judges each request's difficulty and routes it to the cheapest capable model. Bill a share of the savings.",
  "type": "api",
  "price": "usage-based",
  "code": 2,
  "audience": 1,
  "hours": 60
 },
 {
  "k": "niche_landing",
  "en": "Adaptive landing pages for local businesses",
  "pen": "Claude builds the page, Jev reorders sections per visitor. Sell setups to local businesses and coaches, add a monthly hosting fee.",
  "type": "service",
  "price": "$29\u2013199 per site",
  "code": 1,
  "audience": 0,
  "hours": 10
 }
];
