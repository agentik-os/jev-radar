"""Chemins, accès fxtwitter et clé TypeSafe, partagés par tout le pipeline."""
import json, os, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SITE = ROOT / "site"
PIPE = ROOT / "pipeline"
LAUNCH = 1789344000  # 2026-09-14 00:00 UTC, veille du lancement de Jev


def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "jev-radar/1.0 (+https://jev.agentik-os.com)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):
                return None
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def load_key():
    if not os.environ.get("TYPESAFE_API_KEY"):
        f = Path.home() / ".config/typesafe/.env"
        for line in f.read_text().splitlines() if f.exists() else []:
            if line.startswith("TYPESAFE_API_KEY="):
                os.environ["TYPESAFE_API_KEY"] = line.split("=", 1)[1].strip().strip("\"'")
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise SystemExit("TYPESAFE_API_KEY manquant")


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, obj, **kw):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, **kw))
    tmp.replace(path)


def load_posts():
    posts = {}
    p = DATA / "posts.jsonl"
    if p.exists():
        for line in p.open():
            t = json.loads(line)
            posts[t["id"]] = t
    return posts


def save_posts(posts):
    # un post par ligne, trié : diffs git minimes d'une mise à jour à l'autre
    tmp = DATA / "posts.jsonl.tmp"
    with tmp.open("w") as f:
        for pid in sorted(posts):
            f.write(json.dumps(posts[pid], ensure_ascii=False, sort_keys=True) + "\n")
    tmp.replace(DATA / "posts.jsonl")
