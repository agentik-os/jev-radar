"""Autopost horaire : cite (quote-post) le meilleur post du Top 100 pas encore partagé, avec un commentaire.

Publication via Composio (premier compte X actif relié par `composio link twitter`),
ou à défaut via des clés X OAuth 1.0a dans ~/.config/x-autopost/.env
(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET).
Sécurité : rien n'est publié tant que ~/.config/x-autopost/.env ne contient pas X_AUTOPOST_ENABLED=1 ;
sinon mode aperçu (data/autopost_preview.json).
Règles : 1 post par passage, jamais deux fois le même, jamais ses propres posts, pas de @mention
automatique (règles d'automatisation de X), plafond quotidien MAX_PER_DAY."""
import base64, hashlib, hmac, json, secrets, shutil, subprocess, time, urllib.error, urllib.parse, urllib.request
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


def compose(p, niches, quote_url=None):
    rk, (likes, reposts, _, bookmarks, views) = p["rk"], p["m"]
    head = f"#{rk} on the Jev Radar · {CAT.get(p['j']['category'], 'Jev')}"
    niche = next((n for n in niches if n["id"] == p["j"].get("niche")), None)
    stats = f"{fmt(views)} views · {fmt(likes)} likes · {fmt(bookmarks)} bookmarks"
    tail = f"Every Jev build & niche, ranked hourly → {SITE_URL}"
    if quote_url:  # le lien du post en fin de texte = affiché comme citation sur X
        tail += "\n" + quote_url
    if p.get("sys"):
        body = p["sys"]["en"]
    elif niche:
        body = f"Niche: {niche['label']['en']} (#{niche['rank']} of {len(niches)} on our passive-income leaderboard)."
    else:
        body = ""
    # 280 caractères, une URL compte 23
    url_cost = sum(len(u) - 23 for u in (SITE_URL, quote_url) if u)
    budget = 280 - len(head) - len(stats) - (len(tail) - url_cost) - 8
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


def composio_post(text, quote_id, account):
    """Publie via Composio ; renvoie l'id du post ou lève une erreur."""
    r = subprocess.run(["composio", "execute", "TWITTER_CREATION_OF_A_POST", "--account", account,
                        "-d", json.dumps({"text": text, "quote_tweet_id": quote_id})],
                       capture_output=True, text=True, timeout=120)
    out = json.loads(r.stdout or "{}")
    if not out.get("successful"):
        raise RuntimeError(out.get("error") or r.stderr[:300])
    data = out.get("data") or {}
    return (data.get("data") or data).get("id")


def composio_account():
    """Sélecteur (alias ou word_id) du premier compte X actif dans Composio, sinon None."""
    if not shutil.which("composio"):
        return None
    r = subprocess.run(["composio", "connections", "list", "--toolkit", "twitter"], capture_output=True, text=True, timeout=60)
    try:
        active = [c for c in json.loads(r.stdout).get("twitter", []) if c.get("status") == "ACTIVE"]
    except Exception:
        return None
    return (active[0].get("alias") or active[0].get("word_id")) if active else None


def zernio_account():
    """Compte X actif dans Zernio (via Composio) : (sélecteur Composio, account_id Zernio) ou None."""
    if not shutil.which("composio"):
        return None
    r = subprocess.run(["composio", "connections", "list", "--toolkit", "zernio_mcp"], capture_output=True, text=True, timeout=60)
    try:
        active = [c for c in json.loads(r.stdout).get("zernio_mcp", []) if c.get("status") == "ACTIVE"]
    except Exception:
        return None
    if not active:
        return None
    sel = active[0].get("alias") or active[0].get("word_id")
    r = subprocess.run(["composio", "execute", "ZERNIO_MCP_ACCOUNTS_LIST", "--account", sel, "-d", "{}"], capture_output=True, text=True, timeout=120)
    txt = r.stdout
    # l'id du compte X : on prend le premier compte « twitter » trouvé dans la réponse
    try:
        out = json.loads(txt)
        stack = [out]
        while stack:
            x = stack.pop()
            if isinstance(x, dict):
                if str(x.get("platform", "")).lower() in ("twitter", "x") and (x.get("_id") or x.get("id") or x.get("accountId")):
                    return sel, x.get("_id") or x.get("id") or x.get("accountId")
                stack += list(x.values())
            elif isinstance(x, list):
                stack += x
            elif isinstance(x, str) and x.strip().startswith(("{", "[")):
                try:
                    stack.append(json.loads(x))
                except Exception:
                    pass
    except Exception:
        pass
    return None


def zernio_post(text, sel, account_id):
    r = subprocess.run(["composio", "execute", "ZERNIO_MCP_POSTS_CREATE", "--account", sel, "-d",
                        json.dumps({"content": text, "platform": "twitter", "account_id": account_id, "publish_now": True})],
                       capture_output=True, text=True, timeout=180)
    out = json.loads(r.stdout or "{}")
    if not out.get("successful"):
        raise RuntimeError(out.get("error") or r.stderr[:300])
    return json.dumps(out.get("data"))[:200]


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
    account = composio_account()
    use_composio = bool(account)
    zern = None if use_composio else zernio_account()
    has_keys = all(env.get(k) for k in ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"))
    via = "composio-twitter" if use_composio else "zernio" if zern else "api" if has_keys else None
    if env.get("X_AUTOPOST_ENABLED") != "1" or not via:
        print(f"autopost : mode aperçu ({len(candidates)} candidats, canal={via or 'aucun'}), rien publié")
        return
    today = [x for x in st["log"] if now - x["ts"] < 86400]
    if len(today) >= MAX_PER_DAY or not candidates:
        print("autopost : plafond atteint ou aucun candidat")
        return
    p = candidates[0]
    text = compose(p, niches, quote_url=p["u"] if via == "zernio" else None)
    try:
        if via == "composio-twitter":
            tid = composio_post(text, p["id"], account)
        elif via == "zernio":
            tid = zernio_post(text, *zern)
        else:
            tid = oauth_post("https://api.x.com/2/tweets", {"text": text, "quote_tweet_id": p["id"]}, env).get("data", {}).get("id")
    except (urllib.error.HTTPError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as e:
        print(f"autopost : échec {type(e).__name__}: {str(e)[:300]}")
        return
    st["posted"][p["id"]] = {"ts": now, "tweet": tid, "via": via}
    st["log"] = (st["log"] + [{"ts": now, "id": p["id"]}])[-500:]
    write_json(STATE, st, indent=1)
    print(f"autopost : publié (quote de {p['u']}) -> {tid}")


if __name__ == "__main__":
    main()
