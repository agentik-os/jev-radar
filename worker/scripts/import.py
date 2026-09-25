"""One-off, read-only import of the Vercel-era AGK Radar data into the Worker's D1 and R2.

Sources (never written to):
  * raw pipeline state from the public GitHub repo at a pinned commit (data/*.json, data/posts.jsonl)
  * the published JSON from the public Vercel Blob URLs (jev/*.json)
Destination: https://<worker>/admin/import/<table> and /admin/r2/<file>, authorised with the Worker's ADMIN_TOKEN
(read from ~/.config/agk-radar/admin.env; never printed).

usage: python import.py <raw dir> <blob dir> <golden_keys.json> <worker origin> <commit>
"""
import json, os, sys, time, urllib.request
from pathlib import Path

raw, blob, golden, origin, commit = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4].rstrip("/"), sys.argv[5]
extra = Path(sys.argv[6]) if len(sys.argv) > 6 else raw  # niche_history / ideas_eval / replied
TOKEN = next(l.split("=", 1)[1].strip() for l in (Path.home() / ".config/agk-radar/admin.env").read_text().splitlines() if l.startswith("AGK_RADAR_ADMIN_TOKEN="))


def call(method, path, body, ctype="application/json"):
    data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
    for i in range(5):
        try:
            req = urllib.request.Request(origin + path, data=data, method=method,
                                         headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype, "User-Agent": "agk-radar-import/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except Exception as e:
            if i == 4:
                raise
            print(f"  retry {path}: {e}", flush=True)
            time.sleep(5 * (i + 1))


def send(table, rows, max_bytes=2_500_000):
    batch, size, n = [], 0, 0
    for r in rows:
        s = len(json.dumps(r, ensure_ascii=False))
        if batch and size + s > max_bytes:
            call("POST", f"/admin/import/{table}", batch); n += len(batch); batch, size = [], 0
        batch.append(r); size += s
    if batch:
        call("POST", f"/admin/import/{table}", batch); n += len(batch)
    print(f"{table}: {n} rows", flush=True)
    return n


t0 = time.time()
keys = json.loads(golden.read_text())
counts = {}
counts["cls_cache"] = send("cls_cache", ({"key": k, "answers": v} for k, v in json.loads((raw / "jev_cache.json").read_text()).items()))
counts["posts"] = send("posts", ({"raw": json.loads(l), "cls_key": keys[json.loads(l)["id"]]} for l in (raw / "posts.jsonl").open()))
st = json.loads((raw / "crawl_state.json").read_text())
counts["accounts"] = send("accounts", ({"k": k, "handle": a["handle"], "last_checked": a.get("last_checked", 0), "posts": a.get("jev_posts", 0),
                                        "failed": a.get("failed", False)} for k, a in st["accounts"].items()))
counts["seen_ids"] = send("seen_ids", st.get("seen_ids", []), 1_000_000)
counts["kv"] = send("kv", [{"k": k, "v": int(st[k])} for k in ("last_refresh", "last_run", "last_fast") if st.get(k)])
counts["transcripts"] = send("transcripts", ({"video_id": k, "text": v} for k, v in json.loads((raw / "transcripts.json").read_text()).items()))
counts["niche_history"] = send("niche_history", json.loads((extra / "niche_history.json").read_text()))
counts["ideas_eval"] = send("ideas_eval", [{"k": k, "data": v} for k, v in json.loads((extra / "ideas_eval.json").read_text()).items()])
counts["replied"] = send("replied", [{"target": k, "data": v} for k, v in json.loads((extra / "replied.json").read_text()).items()])

# published JSON as the site's starting data (the first Cloudflare pass rebuilds it)
posts = json.loads((blob / "posts.json").read_text())
ranks = {p["id"]: p["rk"] for p in posts if p.get("rk")}
call("PUT", "/admin/r2/ranks.json", json.dumps(ranks).encode())
for f in ("posts.json", "niches.json", "ideas.json", "plays.json", "replied.json", "meta.json"):
    r = call("PUT", f"/admin/r2/{f}", (blob / f).read_bytes())
    print(f"r2 {f}: {r['bytes']} bytes", flush=True)
counts["published_posts"] = len(posts)
call("POST", "/admin/import/run", [{"id": f"import-{time.strftime('%Y%m%d%H%M', time.gmtime())}", "started": int(t0),
                                   "stats": {"source_commit": commit, "blob_meta_updated": json.loads((blob / 'meta.json').read_text())["updated"], "rows": counts}}])
print(json.dumps(counts), f"{time.time() - t0:.0f}s")
