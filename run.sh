#!/usr/bin/env bash
# Mise à jour horaire : collecte -> transcription -> classement Jev -> notes des idées -> site -> push (Vercel redéploie).
set -euo pipefail
cd "$(dirname "$0")"
exec 9>/tmp/jev-radar.lock
flock -n 9 || { echo "déjà en cours"; exit 0; }
git pull --rebase --quiet
cd pipeline
uv run --project .. --extra ci python crawl.py
uv run --project .. --extra ci python transcribe.py
uv run --project .. python analyze.py
uv run --project .. python ideas_eval.py
uv run --project .. python build.py
[ -f autopost.py ] && uv run --project .. python autopost.py || true
cd ..
git add -A data site api
if ! git diff --cached --quiet; then
  git commit -q -m "data: mise à jour $(date -u +%Y-%m-%dT%H:%MZ)"
  git push -q
fi
