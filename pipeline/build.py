"""Prépare les données du site : posts compacts, statistiques et classement des niches.

Score de niche (0-100), transparent et recalculé à chaque passage :
  30 % potentiel passif  : moyenne (pondérée par l'audience) du jugement Jev « produit self-serve récurrent ? »
  25 % traction          : engagement cumulé des posts de la niche (échelle log, min-max)
  20 % demande           : posts qui réclament l'outil, le code ou l'accès, + questions
  15 % dynamique         : part de la niche dans les posts des dernières 48 h vs sa part totale
  10 % espace libre      : 1 - part des posts déjà liés à un produit commercial
Les niches avec peu de posts sont atténuées (facteur sqrt(n/8), plafonné à 1)."""
import json, math, time
from collections import defaultdict

from common import DATA, SITE, load_posts, read_json, write_json
from analyze import speech
from ideas import IDEA_WEIGHTS, IDEAS
from plays import PLAYS
from niches import NICHES

WEIGHTS = {"passive": 0.30, "traction": 0.25, "demand": 0.20, "momentum": 0.15, "space": 0.10}


def small_mp4(v):
    """Version mp4 la plus légère (aperçu en boucle dans les cartes) ; la vidéo complète reste dans `u`."""
    mp4 = [f for f in v.get("formats") or [] if f.get("container") == "mp4" and f.get("url")]
    return min(mp4, key=lambda f: f.get("bitrate") or 1e12)["url"] if mp4 else v.get("url")


def compact(t, j, transcripts, systems):
    a, q, ar, m = t.get("author") or {}, t.get("quote") or {}, t.get("article") or {}, t.get("media") or {}
    facets = (t.get("raw_text") or {}).get("facets") or []
    p = {
        "id": t["id"], "u": t.get("url"), "c": t.get("created_timestamp"), "l": t.get("lang"),
        "a": {"h": a.get("screen_name"), "n": a.get("name"), "f": a.get("followers") or 0, "av": a.get("avatar_url")},
        "t": t.get("text") or "", "r": bool(t.get("replying_to")),
        "ph": [x["url"] for x in m.get("photos") or []],
        "v": [{"u": v["url"], "s": small_mp4(v), "th": v.get("thumbnail_url"), "d": round(v.get("duration") or 0),
               "w": v.get("width"), "h": v.get("height")} for v in m.get("videos") or []],
        "lk": [f["replacement"] for f in facets if f.get("type") == "url" and f.get("replacement")],
        "m": [t.get(k) or 0 for k in ("likes", "reposts", "replies", "bookmarks", "views")],
        "j": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in j.items() if not k.endswith("_conf")},
    }
    if q:
        p["q"] = {"h": (q.get("author") or {}).get("screen_name"), "t": q.get("text") or "", "u": q.get("url")}
    if ar:
        body = "\n".join(b.get("text", "") for b in (ar.get("content") or {}).get("blocks", []))
        p["ar"] = {"ti": ar.get("title"), "tx": body[:3000],
                   "co": ((ar.get("cover_media") or {}).get("media_info") or {}).get("original_img_url")}
    if tr := speech(t, transcripts):
        p["tr"] = tr[:5000]
    if t["id"] in systems:
        p["sys"] = systems[t["id"]]
    return p


def eng(p):
    likes, reposts, _, bookmarks, _ = p["m"]
    return likes + 2 * reposts + bookmarks


def radar_score(p):
    """Classement des posts : engagement (log) + bonus aux démos concrètes et au détail technique."""
    j = p["j"]
    s = math.log1p(eng(p)) + 0.3 * math.log1p(p["m"][4]) / 3
    s += {"build_demo": 1.5, "integration": 1.0, "explainer": 0.6, "official": 0.4}.get(j["category"], 0)
    return round(s + 0.4 * j.get("depth", 0) / 4 + 0.4 * j.get("working_demo", 0) + 0.3 * j.get("open_source", 0), 3)


def niche_board(posts, now):
    main = [p for p in posts if not p["r"] and p["j"].get("niche", "none") != "none"]
    total = len(main) or 1
    recent_total = sum(1 for p in main if p["c"] >= now - 48 * 3600) or 1
    by = defaultdict(list)
    for p in main:
        by[p["j"]["niche"]].append(p)
    raw = {}
    for n, ps in by.items():
        builds = [p for p in ps if p["j"]["category"] in ("build_demo", "integration", "official")] or ps
        w = [math.log1p(p["m"][4]) + 1 for p in builds]
        raw[n] = {
            "passive": sum(p["j"].get("passive_potential", 0) * wi for p, wi in zip(builds, w)) / sum(w) / 4,
            "traction": math.log1p(sum(eng(p) for p in ps)),
            "demand": sum(p["j"].get("demand_signal", 0) * math.log1p(p["m"][0] + 1) for p in ps)
                      + 2 * sum(1 for p in ps if p["j"]["category"] == "question"),
            "momentum": (sum(1 for p in ps if p["c"] >= now - 48 * 3600) / recent_total) / (len(ps) / total),
            "space": 1 - sum(1 for p in ps if p["j"].get("commercial", 0) > 0.5) / len(ps),
            "n": len(ps),
        }
    mx = {k: max((r[k] for r in raw.values()), default=1) or 1 for k in ("traction", "demand")}
    mn_t = min((r["traction"] for r in raw.values()), default=0)
    board = []
    for n, r in raw.items():
        sub = {
            "passive": r["passive"], "traction": (r["traction"] - mn_t) / ((mx["traction"] - mn_t) or 1), "demand": r["demand"] / mx["demand"],
            "momentum": min(r["momentum"], 2) / 2, "space": r["space"],
        }
        shrink = min(1.0, math.sqrt(r["n"] / 8))
        score = 100 * shrink * sum(WEIGHTS[k] * v for k, v in sub.items())
        ps = sorted(by[n], key=lambda p: -p["m"][4])
        builds = [p for p in ps if p["j"]["category"] in ("build_demo", "integration")]
        board.append({
            "id": n, "score": round(score, 1), "sub": {k: round(v, 3) for k, v in sub.items()},
            "posts": r["n"], "builds": len(builds), "builders": len({p["a"]["h"] for p in builds}),
            "views": sum(p["m"][4] for p in ps), "recent48": sum(1 for p in ps if p["c"] >= now - 48 * 3600),
            "open_source": sum(1 for p in ps if p["j"].get("open_source", 0) > 0.5),
            "commercial": sum(1 for p in ps if p["j"].get("commercial", 0) > 0.5),
            "top": [p["id"] for p in ps[:4]],
            "label": {"fr": NICHES[n]["fr"], "en": NICHES[n]["en"]},
            "idea": {"fr": NICHES[n]["idea_fr"], "en": NICHES[n]["idea_en"]},
        })
    board.sort(key=lambda b: -b["score"])
    for i, b in enumerate(board, 1):
        b["rank"] = i
    return board


def main():
    now = time.time()
    raw = load_posts()
    cls = read_json(DATA / "classified.json", {})
    transcripts = read_json(DATA / "transcripts.json", {})
    systems = read_json(DATA.parent / "pipeline/systems.json", {})
    # un post pas encore classé par Jev (crédits épuisés, API indisponible…) s'affiche quand même, étiqueté « pending »
    pending = {"about_jev": 1.0, "category": "pending", "domain": "general", "pattern": "none", "niche": "none",
               "sentiment": 2.0, "depth": 0.0, "passive_potential": 0.0, "demand_signal": 0.0, "commercial": 0.0,
               "working_demo": 0.0, "open_source": 0.0, "numbers": 0.0, "vs_llm": 0.0, "self_promo": 0.0}
    posts = [compact(t, cls.get(pid, pending), transcripts, systems) for pid, t in raw.items()
             if pid not in cls or (cls[pid]["about_jev"] >= 0.5 and cls[pid]["category"] != "unrelated")]
    posts.sort(key=lambda p: -p["m"][4])

    board = niche_board(posts, now)
    ranked = sorted((p for p in posts if not p["r"]), key=radar_score, reverse=True)
    for i, p in enumerate(ranked, 1):
        p["rs"], p["rk"] = radar_score(p), i
    hist = read_json(DATA / "niche_history.json", [])
    # rang d'il y a ~24 h (ou le plus ancien disponible) pour la flèche d'évolution
    ref = next((h for h in reversed(hist) if h["ts"] <= now - 20 * 3600), hist[0] if hist else None)
    for b in board:
        b["prev_rank"] = ref["ranks"].get(b["id"]) if ref else None
    hist.append({"ts": now, "ranks": {b["id"]: b["rank"] for b in board}, "scores": {b["id"]: b["score"] for b in board}})
    write_json(DATA / "niche_history.json", hist[-500:])

    # idées : notes Jev + signal X de leur niche (score de niche / 100, 0 si personne n'en parle)
    evals = read_json(DATA / "ideas_eval.json", {})
    nscore = {b["id"]: b for b in board}
    ideas = []
    for i in IDEAS:
        e = evals.get(i["k"])
        if not e:
            continue
        nb = nscore.get(i["n"]) if i["n"] else None
        sub = {k: e[k] / 4 for k in ("pain", "recurring", "automation", "jev_fit", "open_market", "build_ease")}
        sub["x_signal"] = (nb["score"] / 100) if nb else 0.0
        ideas.append({**i, "sub": {k: round(v, 3) for k, v in sub.items()},
                      "score": round(100 * sum(IDEA_WEIGHTS[k] * v for k, v in sub.items()), 1),
                      "niche_rank": nb["rank"] if nb else None, "niche_posts": nb["posts"] if nb else 0,
                      "untapped": not nb or nb["builds"] == 0})
    ideas.sort(key=lambda x: -x["score"])
    for r, x in enumerate(ideas, 1):
        x["rank"] = r
    write_json(SITE / "data/ideas.json", ideas, separators=(",", ":"))

    # pistes « Money now » + preuves du radar (niche et idée liées)
    ibyk = {i["k"]: i for i in ideas}
    plays = []
    for pl in PLAYS:
        nb, idea = nscore.get(pl["niche"]), ibyk.get(pl["idea"]) if pl["idea"] else None
        plays.append({**pl, "niche_rank": nb["rank"] if nb else None, "niche_score": nb["score"] if nb else 0,
                      "niche_posts": nb["posts"] if nb else 0, "niche_top": nb["top"][:2] if nb else [],
                      "idea_score": idea["score"] if idea else None})
    write_json(SITE / "data/plays.json", plays, separators=(",", ":"))
    plays_api = [{"k": p["k"], "en": p["en"], "pen": p["pen"], "type": p["type"], "price": p["price"],
                  "code": p["code"], "audience": p["audience"], "hours": p["hours"]} for p in PLAYS]

    main_posts = [p for p in posts if not p["r"]]
    meta = {
        "updated": now, "posts": len(posts), "main": len(main_posts),
        "authors": len({p["a"]["h"] for p in posts}),
        "views": sum(p["m"][4] for p in main_posts), "likes": sum(p["m"][0] for p in main_posts),
        "first": min(p["c"] for p in posts), "tracked_accounts": len(read_json(DATA / "crawl_state.json", {}).get("accounts", {})),
        "weights": WEIGHTS, "idea_weights": IDEA_WEIGHTS,
        "niche_trend": [{"ts": h["ts"], "scores": h["scores"]} for h in hist[-60:]],
    }
    (SITE / "data").mkdir(parents=True, exist_ok=True)
    write_json(SITE / "data/posts.json", posts, separators=(",", ":"))
    write_json(SITE / "data/niches.json", board, separators=(",", ":"))
    write_json(SITE / "data/meta.json", meta, separators=(",", ":"))
    # critères partagés avec la fonction /api/check-idea (une seule source de vérité)
    from ideas import CRITERIA, QUESTIONS_TEXT
    crit = {k: {"q": QUESTIONS_TEXT[k], "levels": v} for k, v in CRITERIA.items()}
    (SITE.parent / "api/_criteria.js").write_text(
        "// Généré par pipeline/build.py — ne pas modifier à la main.\n"
        f"export const CRITERIA = {json.dumps(crit, indent=1)};\n"
        f"export const NICHES = {json.dumps({k: v['desc'] for k, v in NICHES.items()}, indent=1)};\n"
        f"export const PLAYS = {json.dumps(plays_api, indent=1)};\n")
    size = (SITE / "data/posts.json").stat().st_size / 1e6
    print(f"site : {len(posts)} posts ({size:.1f} Mo), {len(board)} niches, n°1 = {board[0]['id'] if board else '-'}")


if __name__ == "__main__":
    main()
