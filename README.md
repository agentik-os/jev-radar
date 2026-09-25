# AGK Radar

AGK Radar tracks every post on X about System One models, classifies each one with AGK Intelligence, and ranks the product niches and business ideas they point to. The repository keeps its historical name, `agentik-os/jev-radar`; the product name is AGK Radar.

- Preview host (Cloudflare Workers): https://agk-radar.x-18a.workers.dev
- Public host after the DNS move: https://radar.agentik-os.com (the old `jev.agentik-os.com` then answers a 301 to the same path)

## How it runs (branch `cloudflare`)

Everything runs on Cloudflare. There is no server of our own.

| Part | Where |
|---|---|
| Site, `/data/*.json`, `/api/check-idea`, `/api/money-now`, `/sitemap.xml`, `/llms.txt`, `/robots.txt` | Worker `agk-radar` (`worker/src/index.ts`, `site.ts`, `api.ts`), static files from `site/` |
| Schedule | Cron Triggers: a full pass at minute 7 of every hour, a fast pass (active accounts only) at minutes 22, 37 and 52 |
| Each pass | Workflow `agk-radar-pass` (`worker/src/workflow.ts`): replies, crawl rounds, transcription, classification, idea scoring, build and publish, each a retried step |
| Data | D1 `agk-radar` (posts, accounts, classifications, transcripts, run log, AGK Intelligence call log); R2 `agk-radar` (`data/*.json`, the files the site reads) |
| Crawl | Public fxtwitter API, 6 requests in flight (`worker/src/crawl.ts`) |
| Transcription | Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) on the smallest mp4 rendition |
| Classification | AGK Intelligence, at most 6 calls in flight with exponential back-off (`worker/src/ai.ts`), cached by content so only new or changed posts are sent |

Server-rendered pages keep the real paths: `/`, `/builds`, `/opportunities` (and `/opportunities/niches|ideas|check`, `?focus=<niche or idea>`), `/money`, `/top`, `/people`, `/all`, `/map`, `/p/<post id>`. Each gets its own title, description, Open Graph and Twitter Card tags, canonical URL and JSON-LD. `/post` is a private helper page (`noindex`).

While the site runs on `workers.dev` it sends `noindex` and `robots.txt` disallows crawling, so it does not compete with the live site. Setting `INDEXABLE = "true"` and `SITE_URL` in `worker/wrangler.toml` opens it on the public hostname.

## Commands

```sh
cd worker
npm install
npm run check                    # TypeScript
node scripts/parity.mjs <raw dir> <golden_keys.json> [published posts.json]   # parity with the Python pipeline
wrangler d1 migrations apply agk-radar --remote
wrangler deploy
```

Admin routes need `Authorization: Bearer $ADMIN_TOKEN` (Worker secret; local copy in `~/.config/agk-radar/admin.env`):

- `POST /admin/run?mode=full|fast` starts a pass; `GET /admin/run/<id>` reads it back; `GET /admin/runs` lists recent passes
- `GET /admin/stats` counts rows in D1 and shows the published `meta.json`
- `GET /admin/ai-calls[?run=<id>]` shows AGK Intelligence calls per run: status codes, retries, highest parallelism
- `GET /admin/probe[?video=<mp4 url>]` checks fxtwitter, AGK Intelligence and Whisper from the Worker

Secrets (names only): `TYPESAFE_API_KEY` (AGK Intelligence provider), `ADMIN_TOKEN`.

## Configuration

`worker/src/config/*.json` is generated from `pipeline/*.py` by `worker/scripts/export_config.py` (niches, ideas, money plays, system breakdowns, seeds, classification questions). Edit the Python source, then re-export. The classification questions are exported verbatim so the classification cache stays valid.

## Data import

`worker/scripts/import.py` copied the Vercel-era data once, read-only: the raw state from this repository at commit `cccf7c4` and the published JSON from Vercel Blob `jev/`. Counts matched: 14,397 posts, 14,397 classified, 14,364 cache entries, 3,350 accounts, 1,973 transcripts, 10,159 published posts.

## Limits

- **Pass length.** A full pass rereads about 3,000 accounts with at most 6 fxtwitter requests in flight. It took 35 to 45 minutes on 2026-09-25, with the other radars crawling at the same time; a fast pass takes about 10 minutes. One pass runs at a time, and a cron that fires during a pass is skipped.
- **`posts.json` holds every post** (14.6 MB for 11,886 posts). The build keeps them all in memory, so the file should be split by page if it grows past about 40 MB.
- **Autopost is not ported.** The X credentials do not exist yet.

## Legacy (main branch)

`pipeline/` (Python), `api/` and `vercel.json` are the previous implementation. They still serve `jev.agentik-os.com` from Vercel until the DNS move, updated by `.github/workflows/failover.yml` on GitHub Actions. The previous VPS schedule is gone and nothing here depends on it.

Model provider: TypeSafe AI. AGK Radar is independent and not affiliated with TypeSafe AI. Posts belong to their authors.
