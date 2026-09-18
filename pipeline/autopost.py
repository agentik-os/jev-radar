"""Autopost horaire : cite (quote-post) le meilleur post du Top 100 pas encore partagé, avec un commentaire.

Sans clés X : mode aperçu (écrit data/autopost_preview.json, ne publie rien).
Clés attendues dans ~/.config/x-autopost/.env (compte qui publie, OAuth 1.0a « Read and write ») :
  X_API_KEY=…  X_API_SECRET=…  X_ACCESS_TOKEN=…  X_ACCESS_SECRET=…
  X_AUTOPOST_ENABLED=1        (sécurité : rien n'est publié tant que ce n'est pas à 1)
Règles : 1 post par passage, jamais deux fois le même, jamais ses propres posts, pas de @mention
automatique (règles d'automatisation de X), plafond quotidien MAX_PER_DAY."""
import base64, hashlib, hmac, json, os, secrets, time, urllib.parse, urllib.request
from pathlib import Path

from common import DATA, SITE, read_json, write_json

ENV = Path.home() / ".config/x-autopost/.env"
STATE = DATA / "autopost.json"
MAX_PER_DAY = 24
MAX_AGE_DAYS = 10
SELF = "agentik_os"
SITE_URL = "https://jev.agentik-os.com"

CAT = {"build_demo": "Built with Jev", "integration": "Jev integration", "explainer": "Jev explained",
       "official": "From TypeSafe", "news": "Jev news", "opinion": "Jev take", "critique": "The other side of the Jev debate"}


def fmt(n):
    return f"{n/1e6:.1f}M" if n >= 1e6 else f"{n/1e3:.1f}k" if n >= 1e3 else str(n)


def compose(p, niches):
    rk, (likes, reposts, _, bookmarks, views) = p["rk"], p["m"]
    head = f"#{rk} on the Jev Radar · {CAT.get(p['j']['category'], 'Jev')}"
    niche = next((n for n in niches if n["id"] == p["j"].get("niche")), None)
    stats = f"{fmt(views)} views · {fmt(likes)} likes · {fmt(bookmarks)} bookmarks"
    tail = f"Every Jev build & niche, ranked hourly → {SITE_URL}"
    if p.get("sys"):
        body = p["sys"]["en"]
    elif niche:
        body = f"Niche: {niche['label']['en']} (#{niche['rank']} of {len(niches)} on our passive-income leaderboard)."
    else:
        body = ""
    # 280 caractères, une URL compte 23
    budget = 280 - len(head) - len(stats) - (len(tail) - len(SITE_URL) + 23) - 8
    if len(body) > budget:
        body = body[: max(0, budget - 1)].rsplit(" ", 1)[0] + "…"
    return "\n\n".join(x for x in (head, body, stats, tail) if x)


def load_env():
    env = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("\"'")
    return env


def oauth_post(url, body, env):
    """POST JSON signé OAuth 1.0a (contexte utilisateur)."""
    oauth = {
        "oauth_consumer_key": env["X_API_KEY"], "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1", "oauth_timestamp": str(int(time.time())),
        "oauth_token": env["X_ACCESS_TOKEN"], "oauth_version": "1.0",
    }
    enc = lambda s: urllib.parse.quote(str(s), safe="~")
    params = "&".join(f"{enc(k)}={enc(v)}" for k, v in sorted(oauth.items()))
    base = "&".join(["POST", enc(url), enc(params)])
    key = f"{enc(env['X_API_SECRET'])}&{enc(env['X_ACCESS_SECRET'])}"
    oauth["oauth_signature"] = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    auth = "OAuth " + ", ".join(f'{enc(k)}="{enc(v)}"' for k, v in sorted(oauth.items()))
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": auth, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    posts = read_json(SITE / "data/posts.json", [])
    niches = read_json(SITE / "data/niches.json", [])
    st = read_json(STATE, {"posted": {}, "log": []})
    now = time.time()
    candidates = sorted((p for p in posts if p.get("rk") and p["rk"] <= 100 and not p["r"]
                         and p["id"] not in st["posted"] and p["a"]["h"].lower() != SELF
                         and now - p["c"] < MAX_AGE_DAYS * 86400 and p["j"]["category"] != "meme"),
                        key=lambda p: p["rk"])
    preview = [{"quote": p["u"], "text": compose(p, niches)} for p in candidates[:5]]
    write_json(DATA / "autopost_preview.json", preview, indent=1)

    env = load_env()
    if env.get("X_AUTOPOST_ENABLED") != "1" or not all(env.get(k) for k in ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")):
        print(f"autopost : mode aperçu ({len(candidates)} candidats), rien publié")
        return
    today = [x for x in st["log"] if now - x["ts"] < 86400]
    if len(today) >= MAX_PER_DAY or not candidates:
        print("autopost : plafond atteint ou aucun candidat")
        return
    p = candidates[0]
    text = compose(p, niches)
    try:
        r = oauth_post("https://api.x.com/2/tweets", {"text": text, "quote_tweet_id": p["id"]}, env)
    except urllib.error.HTTPError as e:
        print(f"autopost : échec HTTP {e.code} {e.read()[:300]!r}")
        return
    st["posted"][p["id"]] = {"ts": now, "tweet": r.get("data", {}).get("id")}
    st["log"] = (st["log"] + [{"ts": now, "id": p["id"]}])[-500:]
    write_json(STATE, st, indent=1)
    print(f"autopost : publié (quote de {p['u']}) -> {r.get('data', {}).get('id')}")


if __name__ == "__main__":
    main()
