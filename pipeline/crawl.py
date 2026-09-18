"""Collecte incrémentale des posts X qui parlent de Jev (API publique fxtwitter, sans compte X).

Pas de recherche X sans compte : on suit un réseau de comptes (seeds.txt + tous les comptes
découverts). Les comptes qui ont déjà parlé de Jev sont relus à chaque passage, les autres
toutes les 6 h. Chaque nouveau post ajoute à la file son auteur, les comptes cités/mentionnés et
les posts liés. Les métriques des posts récents et des plus vus sont rafraîchies."""
import json, re, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor

from common import DATA, LAUNCH, PIPE, get_json, load_posts, read_json, save_posts, write_json

MATCH = re.compile(r"\bjev\b|typesafe", re.I)
STATUS = re.compile(r"(?:x|twitter)\.com/(\w{1,15})/status/(\d{15,20})")
MENTION = re.compile(r"@(\w{1,15})")
SKIP = {"i", "home", "search", "intent", "share"}
IDLE_RECHECK = 6 * 3600       # comptes sans post Jev : relus toutes les 6 h
OVERLAP = 2 * 86400           # relit 2 jours en arrière pour rafraîchir les métriques
MAX_PAGES_NEW = 12
MAX_PAGES_KNOWN = 4
REFRESH_TOP = 250             # posts les plus vus dont on rafraîchit les métriques
REFRESH_EVERY = 6 * 3600
MAX_NEW_ACCOUNTS = 400        # nouveaux comptes explorés par passage
STATE = DATA / "crawl_state.json"


def blob(t):
    parts = [t.get("text") or "", (t.get("quote") or {}).get("text") or ""]
    a = t.get("article") or {}
    parts.append(a.get("title") or "")
    parts += [b.get("text", "") for b in (a.get("content") or {}).get("blocks", [])]
    return "\n".join(parts)


def is_jev(t):
    return t.get("created_timestamp", 0) >= LAUNCH and bool(MATCH.search(blob(t)))


def links(t):
    ids = {(h, i) for h, i in STATUS.findall(json.dumps(t)) if h.lower() not in SKIP}
    handles = set(MENTION.findall(blob(t)))
    handles.add((t.get("author") or {}).get("screen_name", ""))
    q = t.get("quote") or {}
    if q:
        qa = (q.get("author") or {}).get("screen_name", "")
        handles.add(qa)
        ids.add((qa or "i", q.get("id")))
    return {p for p in ids if p[1]}, {h for h in handles if h}


def timeline(args):
    handle, since, max_pages = args
    base = f"https://api.fxtwitter.com/2/profile/{handle}/statuses"
    cursor, found, ok = None, [], False
    for _ in range(max_pages):
        d = get_json(base + ("?cursor=" + urllib.parse.quote(cursor) if cursor else ""))
        if not d or not d.get("results"):
            break
        ok = True
        found += [t for t in d["results"] if is_jev(t)]
        cursor = (d.get("cursor") or {}).get("bottom")
        # le 1er post peut être un vieux post épinglé
        if not cursor or all(t.get("created_timestamp", 0) < since for t in d["results"][1:]):
            break
    return handle, found, ok


def status(pair):
    h, i = pair
    d = get_json(f"https://api.fxtwitter.com/{h or 'i'}/status/{i}")
    return (d or {}).get("tweet")


def main():
    t0 = now = time.time()
    posts = load_posts()
    st = read_json(STATE, {"accounts": {}, "seen_ids": [], "last_refresh": 0})
    accounts, seen_ids = st["accounts"], set(st["seen_ids"])

    def add_account(h):
        k = h.lower()
        if k not in accounts:
            accounts[k] = {"handle": h, "last_checked": 0, "jev_posts": 0}

    for line in (PIPE / "seeds.txt").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            m = STATUS.search(line)
            add_account(m.group(1) if m else line.lstrip("@"))
    for t in posts.values():
        add_account((t.get("author") or {}).get("screen_name", ""))
    accounts.pop("", None)

    added = updated = 0

    def keep(t):
        nonlocal added, updated
        if not t or not t.get("id") or not is_jev(t):
            return False
        new = t["id"] not in posts
        posts[t["id"]] = t  # remplace : métriques à jour
        added += new
        updated += not new
        return new

    pending = set()
    for t in posts.values():
        if t.get("created_timestamp", 0) >= now - OVERLAP:
            pending |= links(t)[0]

    with ThreadPoolExecutor(8) as pool:
        rnd, new_budget = 0, MAX_NEW_ACCOUNTS
        while True:
            rnd += 1
            ids = [p for p in pending if p[1] not in seen_ids and p[1] not in posts]
            pending = set()
            seen_ids |= {p[1] for p in ids}
            for t in pool.map(status, ids):
                if keep(t):
                    add_account((t.get("author") or {}).get("screen_name", ""))
            jobs = []
            for k, a in accounts.items():
                if a["last_checked"] == 0:
                    if new_budget > 0:
                        new_budget -= 1
                        jobs.append((a["handle"], LAUNCH, MAX_PAGES_NEW))
                elif rnd == 1 and (a["jev_posts"] > 0 or now - a["last_checked"] > IDLE_RECHECK):
                    jobs.append((a["handle"], max(LAUNCH, a["last_checked"] - OVERLAP), MAX_PAGES_KNOWN))
            if not jobs and not pending:
                break
            for handle, found, ok in pool.map(timeline, jobs):
                a = accounts[handle.lower()]
                a["last_checked"] = now  # même en échec (compte suspendu, privé…) : on réessaiera dans 6 h
                a["failed"] = not ok
                for t in found:
                    if keep(t):
                        a["jev_posts"] += 1
                    ids2, hs = links(t)
                    pending |= ids2
                    for h in hs:
                        add_account(h)
            print(f"tour {rnd}: {len(ids)} posts liés, {len(jobs)} comptes lus, total {len(posts)} (+{added})", flush=True)
            if rnd > 8:
                break

        if now - st.get("last_refresh", 0) > REFRESH_EVERY:
            top = sorted(posts.values(), key=lambda t: -(t.get("views") or 0))[:REFRESH_TOP]
            for t in pool.map(status, [((x.get("author") or {}).get("screen_name"), x["id"]) for x in top]):
                if t and t.get("id") in posts:
                    posts[t["id"]] = t
            st["last_refresh"] = now
            print(f"métriques rafraîchies pour {len(top)} posts", flush=True)

    for a in accounts.values():
        a["jev_posts"] = 0
    for t in posts.values():
        k = ((t.get("author") or {}).get("screen_name") or "").lower()
        if k in accounts:
            accounts[k]["jev_posts"] += 1
    save_posts(posts)
    st.update(accounts=accounts, seen_ids=sorted(seen_ids)[-20000:], last_run=now)
    write_json(STATE, st)
    print(f"collecte : {len(posts)} posts (+{added} nouveaux, {updated} mis à jour), "
          f"{len(accounts)} comptes suivis, {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
