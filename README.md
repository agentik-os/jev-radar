# AGK Radar

AGK Radar tracks every post on X about System One models, classifies each one with AGK Intelligence, and ranks the product niches and business ideas they point to. The repository keeps its historical name, `agentik-os/jev-radar`; the product name is AGK Radar.

- Preview host (Cloudflare Workers): https://agk-radar.x-18a.workers.dev
- Public host after the DNS move: https://radar.agentik-os.com (the old `jev.agentik-os.com` then answers a 301 to the same path)

## How it runs (branch `cloudflare`)

Everything runs on Cloudflare. There is no server of our own.

| Part | Where |
|---|---|
| Site, `/data/*.json`, `/api/check-idea`, `/api/money-now`, `/sitemap.xml`, `/llms.txt`, `/robots.txt` | Worker `agk-radar` (`worker/src/index.ts`, `site.ts`, `api.ts`), static files from `site/` |
| Schedule | Cron Triggers: a full pass at minute 7 of every hour, a fast pass every 10 minutes (:02, :12, …). Full and fast passes hold separate leases, so fast passes keep publishing while a full pass crawls. When a full pass runs past the hour, the next one starts at the first fast firing 58 minutes after it started, so full passes start about every hour but not always at :07 |
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
- `GET /admin/transcribe/<video id>[?store=1][&debug=1]` runs one stored video through the pass's transcription path and shows the outcome (`store=1` records it as a pass would; `debug=1` adds Whisper's segments with their confidence)

Secrets (names only): `TYPESAFE_API_KEY` (AGK Intelligence provider), `ADMIN_TOKEN`.

## Configuration

`worker/src/config/*.json` is generated from `pipeline/*.py` by `worker/scripts/export_config.py` (niches, ideas, money plays, system breakdowns, seeds, classification questions). Edit the Python source, then re-export. The classification questions are exported verbatim so the classification cache stays valid.

## Data import

`worker/scripts/import.py` copied the Vercel-era data once, read-only: the raw state from this repository at commit `cccf7c4` and the published JSON from Vercel Blob `jev/`. Counts matched: 14,397 posts, 14,397 classified, 14,364 cache entries, 3,350 accounts, 1,973 transcripts, 10,159 published posts.

## Limits

- **Pass length and freshness.** A full pass rereads about 3,700 accounts with at most 6 fxtwitter requests in flight: 42 minutes on 2026-09-25 21:32 (7,370 fxtwitter calls, 306 of them answered 429 and retried; fxtwitter rate-limits once fast and full passes crawl together). A fast pass reads timelines for 2.5 minutes (the always-read accounts, then the 160 most recently active ones interleaved with the other active accounts from a rotation cursor, two for one, so the rotation moves on every fast pass), transcribes short videos, classifies what is new and publishes, in about 3 to 6 minutes. Full and fast passes hold separate leases, so a fast pass is never blocked by a full pass; a firing that finds a pass of its own mode running is skipped and written to the run log (`covered by …`). A full pass is started next to the fast one when none is running and none has started for 58 minutes, and a :07 firing within 40 minutes of the last full start is skipped (`recent full pass …`), so full passes start about every hour. Each pass records its fxtwitter calls, retries and pages in `runs.stats.crawl`. fxtwitter also answers 404 to a few percent of the timeline reads of live accounts, so a profile read asks once more after a 404 or an empty first page. A timeline read that still gets 429, 5xx or timeouts after its retries writes nothing (`throttledAccounts`): the account keeps its last read time and is read again by the next pass, back to that time less 2 days, so no post is lost.
- **Subrequests.** A pass is one Workflow instance, and Cloudflare caps the subrequests of an instance (10,000 by default). A full pass needs more (7,000+ timeline calls, then up to 600 audio segments per long video), so `worker/wrangler.toml` sets `[limits] subrequests = 200000`. If the cap is ever reached, the videos left are deferred to the next pass without counting an attempt.
- **D1 writes and reads.** A post, account, reply or history row is written only when it changed (a post read again with the same content and metrics costs nothing), and indexed columns only when their value changed. Post counts per account are recounted by full passes (one grouped read) and, in fast passes, only for the authors of new posts. Every pass records its rows written and read, by stage, in `runs.stats.d1`.
- **Long posts.** fxtwitter's status endpoints return a long post cut to its first ~280 characters; timelines return the whole text. A cut copy (the 6-hourly refresh of the most viewed posts) never replaces a stored full text (`keepFullText` in `worker/src/crawl.ts`), so a post keeps one classification key instead of alternating between two. Likewise a copy whose quoted post is missing or has no text (fxtwitter could not load it at that read, or it was deleted since) never replaces a stored quote.
- **`posts.json` holds every post** (14.6 MB for 11,886 posts). The build keeps them all in memory, so the file should be split by page if it grows past about 40 MB.
- **X articles.** A timeline copy of an X long-form article carries the title but not the body. A recrawl never replaces a stored body with an empty one (`keepArticleBodies` in `worker/src/crawl.ts`), because the body feeds the classification. Articles first seen on a timeline have no body; the linked-status fetch returns one.
- **Transcription.** An empty transcript is stored only when it is proven: the HLS playlist declares no audio track (`no_audio`), Whisper's voice activity detection found no speech and a second hearing without it found no clear speech (at least 3 distinct sentences and 15 words that are not known hallucinations, heard the same way by a third hearing), or everything Whisper wrote is a known non-speech hallucination (`no_speech`, e.g. music only). The second hearing exists because the voice activity detection misses speech under loud game sound or music (a 5-minute game video with clear dialogue was stored empty before it). Workers AI reports no no-speech probability, so the filter uses Whisper's confidence per segment (`avg_logprob`, `compression_ratio`) and a list of its usual inventions ("Thank you.", "You", subtitle credits); see `worker/src/transcribe.ts`. Whisper output on music is not deterministic, so an occasional invented line can still pass; transcripts under 15 words never reach the classifier. Other errors are retried with back-off inside the pass, then by the next passes; after 4 failed passes the video is stored as `[failed: …]`. Videos over 5 minutes are left to the full pass (6 per pass, one per step). Audio past 30 minutes is not transcribed.
- **Autopost is not ported.** The X credentials do not exist yet.

## Legacy (main branch)

`pipeline/` (Python), `api/` and `vercel.json` are the previous implementation. They still serve `jev.agentik-os.com` from Vercel until the DNS move, updated by `.github/workflows/failover.yml` on GitHub Actions. The previous VPS schedule is gone and nothing here depends on it.

Model provider: TypeSafe AI. AGK Radar is independent and not affiliated with TypeSafe AI. Posts belong to their authors.
