"""Battement de cœur : marque « vérifié maintenant » même quand il n'y a aucun nouveau post.
N'envoie que meta.json (quelques centaines d'octets) : le site montre ainsi qu'il surveille en continu."""
import json, time

from common import SITE, write_json
from publish import SLUG, put, token


def main():
    f = SITE / "data/meta.json"
    meta = json.loads(f.read_text())
    meta["checked"] = time.time()
    write_json(f, meta, separators=(",", ":"))
    put(token(), f"{SLUG}/meta.json", f.read_bytes())
    print(f"battement : vérifié à {time.strftime('%H:%M:%S')} (données du {time.strftime('%H:%M:%S', time.localtime(meta['updated']))})")


if __name__ == "__main__":
    main()
