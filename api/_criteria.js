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
