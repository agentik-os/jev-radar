"""Publie site/data/*.json dans Vercel Blob (store agentik-radars, dossier jev/) : le site les lit via la
réécriture /data/* de vercel.json. Les données changent ainsi toutes les heures SANS redéployer le site.

Jeton : BLOB_READ_WRITE_TOKEN (env) ou ~/.config/radars/blob.env. Vérifie après envoi que meta.json public
porte bien la nouvelle date ; code de sortie 1 sinon (run.sh le signale dans le log)."""
import json, os, sys, time, urllib.request
from pathlib import Path

from common import SITE

SLUG = "jev"

BLOB_API = "https://blob.vercel-storage.com/"
ENV = Path.home() / ".config/radars/blob.env"


def token():
    t = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not t and ENV.exists():
        for line in ENV.read_text().splitlines():
            if line.startswith("BLOB_READ_WRITE_TOKEN="):
                t = line.split("=", 1)[1].strip().strip("\"'")
    if not t:
        sys.exit("publish : BLOB_READ_WRITE_TOKEN absent (env ou ~/.config/radars/blob.env)")
    return t


def put(tok, pathname, body):
    req = urllib.request.Request(f"{BLOB_API}?pathname={pathname}", data=body, method="PUT", headers={
        "Authorization": f"Bearer {tok}", "x-api-version": "11", "x-add-random-suffix": "0",
        "x-allow-overwrite": "1", "x-cache-control-max-age": "60", "x-content-type": "application/json"})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["url"]
        except Exception as e:
            if i == 3:
                raise
            time.sleep(3 * (i + 1))


def main():
    tok = token()
    files = sorted((SITE / "data").glob("*.json"))
    meta_first = [f for f in files if f.name != "meta.json"] + [f for f in files if f.name == "meta.json"]
    url, size = None, 0
    for f in meta_first:  # meta.json en dernier : quand sa date change, tout le reste est déjà en ligne
        body = f.read_bytes()
        size += len(body)
        url = put(tok, f"{SLUG}/{f.name}", body)
    want = json.loads((SITE / "data/meta.json").read_text())["updated"]
    # le CDN Blob garde les fichiers 60 s (x-cache-control-max-age) : on patiente avant de conclure
    ok = False
    for _ in range(9):
        with urllib.request.urlopen(url + f"?check={time.time()}", timeout=30) as r:
            ok = abs(json.load(r)["updated"] - want) < 1
        if ok:
            break
        time.sleep(10)
    print(f"publish : {len(files)} fichiers, {size/1e6:.1f} Mo -> Blob {SLUG}/ ; meta public "
          f"{'à jour' if ok else 'PAS à jour'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
