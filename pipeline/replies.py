"""Détecte les réponses et citations publiées par @Agentik_os sur les posts Jev, pour valider
automatiquement la page cachée /post. Aucun token : API publique fxtwitter.
Sortie : data/replied.json (historique cumulé) et site/data/replied.json."""
import urllib.parse

from common import DATA, SITE, get_json, read_json, write_json

HANDLE = "Agentik_os"
MAX_PAGES = 10


def main():
    done = read_json(DATA / "replied.json", {})
    base = f"https://api.fxtwitter.com/2/profile/{HANDLE}/statuses?with_replies=true"
    cursor, found = None, 0
    for _ in range(MAX_PAGES):
        d = get_json(base + ("&cursor=" + urllib.parse.quote(cursor) if cursor else ""))
        if not d or not d.get("results"):
            break
        known_page = True
        for t in d["results"]:
            if (t.get("author") or {}).get("screen_name", "").lower() != HANDLE.lower():
                continue
            target = ((t.get("replying_to") or {}).get("status")) or ((t.get("quote") or {}).get("id"))
            if not target:
                continue
            if target not in done:
                known_page = False
                found += 1
            done[target] = {"reply": t["id"], "url": t.get("url"), "ts": t.get("created_timestamp"),
                            "kind": "reply" if t.get("replying_to") else "quote"}
        cursor = (d.get("cursor") or {}).get("bottom")
        if not cursor or known_page:  # page entièrement déjà connue : inutile de remonter plus loin
            break
    write_json(DATA / "replied.json", done)
    (SITE / "data").mkdir(parents=True, exist_ok=True)
    write_json(SITE / "data/replied.json", done, separators=(",", ":"))
    print(f"réponses @{HANDLE} : {len(done)} posts traités (+{found})")


if __name__ == "__main__":
    main()
