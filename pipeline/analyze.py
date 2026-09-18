"""Classe chaque post avec Jev (type, domaine, système, niche, signaux business).
Cache par contenu : seuls les posts nouveaux ou modifiés sont envoyés à Jev.
Sortie : data/classified.json {id: réponses aplaties}."""
import hashlib, json, re
from concurrent.futures import ThreadPoolExecutor

from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

from common import DATA, load_key, load_posts, read_json, write_json
from niches import NICHES

P = "the X post in `post` (with its `quoted_post`, `article` and `video_transcript` when present)"

CATEGORIES = {
    "build_demo": "The author shows something they built or ran with Jev: an app, tool, bot, experiment or benchmark on their own data",
    "integration": "A company or platform announces Jev is available in or powering its product (gateway, SDK, framework, API integration)",
    "explainer": "Explains what Jev is or how to use it: tutorial, thread, article, guide, ELI5",
    "news": "Reports the launch or news about TypeSafe/Jev (funding, founder, release) without building anything",
    "opinion": "Gives a personal reaction or opinion about Jev (excited, impressed, curious) without a demo",
    "critique": "Is skeptical or critical of Jev, its claims or its marketing",
    "official": "An official TypeSafe post (announcement, demo, customer result)",
    "meme": "A joke or meme about Jev",
    "question": "Asks a question about Jev or asks for help or access",
    "unrelated": "Not about TypeSafe's Jev model at all (e.g. a person named Jev, another TypeSafe)",
}
DOMAINS = {
    "marketing_ads": "Marketing, ads, creatives, SEO, brand",
    "social_content": "Social media posts, virality, content creation, news-jacking",
    "sales_leads": "Sales, leads, outreach, CRM",
    "coding_devtools": "Code review, developer tools, CLI safety, testing",
    "agents_browser": "Agents, browser/computer use, tool calling, agent routing",
    "games": "Games and game bots (Doom, Minecraft, chess…)",
    "trading_finance": "Trading, markets, finance",
    "support_email": "Customer support, email triage, tickets",
    "search_rag": "Search, retrieval, reranking, RAG, memory",
    "safety_moderation": "Safety, moderation, guardrails, spam, content filtering",
    "data_classification": "Generic classification, extraction or labeling of documents or data",
    "ux_personalization": "Adaptive UI, personalization, recommendations, voice interfaces",
    "research_science": "Research papers, science, evaluation, benchmarks of the model itself",
    "general": "No specific application domain",
}
PATTERNS = {
    "batch_classifier": "Runs Jev over many items in bulk to label, score or filter them (ads, emails, papers, posts)",
    "realtime_loop": "Calls Jev repeatedly in a live loop to decide the next action (game bot, trading bot, browser agent)",
    "router": "Uses Jev as a switch that routes requests to tools, models, handlers or humans",
    "reviewer_guardrail": "Uses Jev to check or approve another model's output or command before acting",
    "ranking": "Uses Jev to rank or rerank candidates (search results, leads, stories)",
    "features_for_ml": "Turns Jev answers into numeric features for a scoring or prediction model",
    "none": "No system is described",
}

QUESTIONS = {
    "about_jev": Noul(instructions=f"Is {P} about TypeSafe's AI model Jev (or TypeSafe AI)?"),
    "category": Choice(instructions=f"What is the main kind of {P}?", criteria=CATEGORIES),
    "domain": Choice(instructions=f"Which application domain does {P} relate to?", criteria=DOMAINS),
    "pattern": Choice(instructions=f"If {P} describes a system built with Jev, how is Jev used in it?", criteria=PATTERNS),
    "niche": Choice(instructions=f"Which product niche does the use case in {P} belong to?",
                    criteria={k: v["desc"] for k, v in NICHES.items()}),
    "sentiment": Score(instructions=f"What attitude toward Jev does {P} express?", criteria=[
        "Hostile: dismissive or calls it hype or a scam", "Skeptical: doubts the claims",
        "Neutral: factual, no opinion", "Positive: impressed or interested", "Enthusiastic: calls it insane, game-changing"]),
    "depth": Score(instructions=f"How much technical detail does {P} give about how something works or was built?", criteria=[
        "None", "A vague mention", "Some concrete detail", "Clear explanation of the setup", "Detailed technical walkthrough"]),
    "passive_potential": Score(
        instructions=f"How well could the use case in {P} become a self-serve product that earns recurring revenue with little ongoing work from its owner?",
        criteria=[
            "No product here: a toy, a one-off experiment, or just commentary",
            "Hard to sell: niche curiosity, or needs constant manual work or custom service",
            "Plausible product, but needs sales effort or heavy support",
            "Clear self-serve product with an obvious buyer and recurring use",
            "Strong passive product: buyers already pay for this problem, usage recurs automatically, little upkeep",
        ]),
    "demand_signal": Noul(instructions=f"Does {P} (or the reaction it describes) show that people want this: asking for access, the code, a tool, or saying they need it?"),
    "commercial": Noul(instructions=f"Is {P} tied to a commercial product, paid service or startup already selling this use case?"),
    "working_demo": Noul(instructions=f"Does {P} show a working demo, screenshot or video of Jev in action?"),
    "open_source": Noul(instructions=f"Does {P} share open source code, a repo, or a free tool people can try?"),
    "numbers": Noul(instructions=f"Does {P} give concrete numbers about Jev's cost, speed, accuracy or scale?"),
    "vs_llm": Noul(instructions=f"Does {P} compare Jev against LLMs such as GPT, Claude, Gemini or Fable?"),
    "self_promo": Noul(instructions=f"Is {P} also promoting the author's own product, service or course?"),
}


def speech(t, transcripts):
    """Transcription utile : sans balises [MUSIC], vide si pas de voix ou hallucination répétitive."""
    vids = (t.get("media") or {}).get("videos") or []
    text = " ".join(re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", transcripts.get(v["id"], "")) for v in vids)
    words = text.split()
    return " ".join(words) if len(words) >= 15 and len(set(words)) / len(words) > 0.25 else ""


def state(t, transcripts):
    q, a = t.get("quote") or {}, t.get("article") or {}
    facets = (t.get("raw_text") or {}).get("facets") or []
    s = {"post": t.get("text") or "", "author": (t.get("author") or {}).get("screen_name")}
    if q:
        s["quoted_post"] = q.get("text") or ""
    if a:
        body = "\n".join(b.get("text", "") for b in (a.get("content") or {}).get("blocks", []))
        s["article"] = ((a.get("title") or "") + "\n" + body)[:6000]
    if tr := speech(t, transcripts):
        s["video_transcript"] = tr[:6000]
    m = t.get("media") or {}
    s["attachments"] = f"{len(m.get('photos') or [])} image(s), {len(m.get('videos') or [])} video(s)"
    links = [f["replacement"] for f in facets if f.get("type") == "url" and f.get("replacement")]
    if links:
        s["links"] = links
    return s


def flat(ans):
    out = {}
    for k, a in ans.items():
        if a["type"] == "noul":
            out[k] = a["noul"]
        elif a["type"] == "choice":
            out[k], out[k + "_conf"] = a["choice"], a["confidence"]
        else:
            out[k] = a["score"]
    return out


def main():
    load_key()
    posts = load_posts()
    transcripts = read_json(DATA / "transcripts.json", {})
    cache = read_json(DATA / "jev_cache.json", {})  # clé = hash(state + version des questions)
    qver = hashlib.sha1(json.dumps({k: q.model_dump() for k, q in QUESTIONS.items()}, sort_keys=True, default=str).encode()).hexdigest()[:8]
    client = TypeSafeClient(timeout=120.0)
    todo, result, tokens = [], {}, 0
    for pid, t in posts.items():
        st = state(t, transcripts)
        key = hashlib.sha1((qver + json.dumps(st, sort_keys=True)).encode()).hexdigest()[:16]
        if key in cache:
            result[pid] = cache[key]
        else:
            todo.append((pid, key, st))
    print(f"{len(posts)} posts, {len(todo)} à classer par Jev", flush=True)

    def ask(item):
        pid, key, st = item
        try:
            r = client.system_one(state=st, questions=QUESTIONS, model="jev-latest")
        except Exception as e:
            print(f"  ! {pid}: {type(e).__name__}", flush=True)
            return pid, key, None, 0
        return pid, key, flat({k: a.model_dump() for k, a in r.answers.items()}), r.usage.input_tokens or 0

    with ThreadPoolExecutor(12) as pool:
        for pid, key, ans, tok in pool.map(ask, todo):
            if ans:
                cache[key] = result[pid] = ans
                tokens += tok
    live = {v and json.dumps(v, sort_keys=True) for v in result.values()}
    cache = {k: v for k, v in cache.items() if json.dumps(v, sort_keys=True) in live}  # purge l'obsolète
    write_json(DATA / "jev_cache.json", cache)
    write_json(DATA / "classified.json", result)
    print(f"classement : {len(result)} posts, {tokens} tokens ≈ ${tokens * 0.042 / 1e6:.3f}")


if __name__ == "__main__":
    main()
