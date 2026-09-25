# AGK Radar

AGK Radar tracks every post on X about System One models, classifies each one with AGK Intelligence, and ranks the product niches and business ideas they point to. The repository keeps its historical name, `agentik-os/jev-radar`; the product name is AGK Radar.

- Preview host (Cloudflare Workers): https://agk-radar.x-18a.workers.dev
- Public host after the DNS move: https://radar.agentik-os.com (the old `jev.agentik-os.com` then answers a 301 to the same path)

## How it runs (branch `cloudflare`)

Everything runs on Cloudflare. There is no server of our own.

| Part | Where |
|---|---|
| Site, `/data/*.json`, `/api/check-idea`, `/api/money-now`, `/sitemap.xml`, `/llms.txt`, `/robots.txt` | Worker `agk-radar` (`worker/src/index.ts`, `site.ts`, `api.ts`), static files from `site/` |
| Schedule | Cron Triggers: a full pass at minute 7 of every hour, a fast pass every 10 minutes (:02, :12, …). Full and fast passes hold separate leases, so fast passes keep publishing while a full pass crawls |
| Each pass | Workflow `agk-radar-pass` (`worker/src/workflow.ts`): replies, crawl rounds, transcription, classification, idea scoring, build and publish, each a retried step. Every pass publishes, and records the D1 rows it wrote (`runs.stats.d1`) |
| Data | D1 `agk-radar` (posts, accounts, classifications, transcripts, run log, AGK Intelligence call log); R2 `agk-radar` (`data/*.json`, the files the site reads) |
| Crawl | Public fxtwitter API, 6 requests in flight (`worker/src/crawl.ts`) |
| Transcription | Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) on the video's HLS audio track, the first 30 minutes in 10-minute chunks (smallest mp4 rendition when a video has no HLS playlist); see Limits |
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
- `GET /admin/probe[?video=<mp4 url>&hls=<m3u8 url>]` checks fxtwitter, AGK Intelligence and Whisper from the Worker
- `GET /admin/transcribe/<video id>[?store=1]` runs one stored video through the pass's transcription path and shows the outcome (`store=1` records it as a pass would)

Secrets (names only): `TYPESAFE_API_KEY` (AGK Intelligence provider), `ADMIN_TOKEN`.

## Configuration

`worker/src/config/*.json` is generated from `pipeline/*.py` by `worker/scripts/export_config.py` (niches, ideas, money plays, system breakdowns, seeds, classification questions). Edit the Python source, then re-export. The classification questions are exported verbatim so the classification cache stays valid.

## Data import

`worker/scripts/import.py` copied the Vercel-era data once, read-only: the raw state from this repository at commit `cccf7c4` and the published JSON from Vercel Blob `jev/`. Counts matched: 14,397 posts, 14,397 classified, 14,364 cache entries, 3,350 accounts, 1,973 transcripts, 10,159 published posts.

## Limits

- **Pass length and freshness.** A full pass rereads about 3,000 accounts with at most 6 fxtwitter requests in flight and took 35 to 55 minutes before fast passes ran beside it, 65 minutes on 2026-09-25 18:07 with them (fxtwitter's throughput is shared). A fast pass reads timelines for 2.5 minutes (the always-read accounts, the 160 most recently active ones, then the other active accounts in turn from a rotation cursor), transcribes short videos, classifies what is new and publishes, in about 4 to 6 minutes. Full and fast passes hold separate leases, so a fast pass is never blocked by a full pass; a firing that finds a pass of its own mode running is skipped and written to the run log (`covered by …`). A full pass is started next to the fast one when none has started for 65 minutes and none is running.
- **D1 writes.** A post, account, reply or history row is written only when it changed (a post read again with the same content and metrics costs nothing), and indexed columns only when their value changed. Every pass records its rows written in `runs.stats.d1`.
- **`posts.json` holds every post** (14.6 MB for 11,886 posts). The build keeps them all in memory, so the file should be split by page if it grows past about 40 MB.
- **X articles.** A timeline copy of an X long-form article carries the title but not the body. A recrawl never replaces a stored body with an empty one (`keepArticleBodies` in `worker/src/crawl.ts`), because the body feeds the classification. Articles first seen on a timeline have no body; the linked-status fetch returns one.
- **Transcription.** An empty transcript is stored only when it is proven: the HLS playlist declares no audio track (`no_audio`) or Whisper's voice activity detection found no speech (`no_speech`, e.g. music only). Other errors are retried with back-off inside the pass, then by the next passes; after 4 failed passes the video is stored as `[failed: …]`. Videos over 5 minutes are left to the full pass (6 per pass, one per step). Audio past 30 minutes is not transcribed.
- **Autopost is not ported.** The X credentials do not exist yet.

## Legacy (main branch)

`pipeline/` (Python), `api/` and `vercel.json` are the previous implementation. They still serve `jev.agentik-os.com` from Vercel until the DNS move, updated by `.github/workflows/failover.yml` on GitHub Actions. The previous VPS schedule is gone and nothing here depends on it.

Model provider: TypeSafe AI. AGK Radar is independent and not affiliated with TypeSafe AI. Posts belong to their authors.
