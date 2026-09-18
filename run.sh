#!/usr/bin/env bash
# Mise à jour du radar. `./run.sh` = passage complet (horaire) ; `./run.sh fast` = passage rapide (toutes les 15 min).
# Le passage rapide ne pousse (donc ne redéploie) que s'il a trouvé des posts ET si le dernier push date de plus de 25 min,
# pour rester sous la limite de déploiements Vercel.
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-full}"
exec 9>/tmp/jev-radar.lock
flock -n 9 || { echo "$(date '+%F %T') déjà en cours ($MODE ignoré)"; exit 0; }
echo "=== $(date '+%F %T') passage $MODE"
commit_local() {  # garde l'état localement (sans pousser) pour que le prochain `git pull --rebase` passe
  git add -A data site api
  git diff --cached --quiet || git commit -q -m "data: état $MODE $(date -u +%Y-%m-%dT%H:%MZ) (local)"
}
git pull --rebase --quiet
cd pipeline
if [ "$MODE" = fast ]; then
  uv run --project .. --extra ci python crawl.py --fast
  if [ "$(cat ../data/last_crawl_new.txt 2>/dev/null || echo 0)" = "0" ]; then cd ..; commit_local; echo "rien de nouveau"; exit 0; fi
  last=$(git -C .. log -1 --format=%ct origin/main 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - last )) -lt 1500 ]; then cd ..; commit_local; echo "nouveaux posts gardés pour le prochain push"; exit 0; fi
  uv run --project .. --extra ci python transcribe.py
  uv run --project .. python analyze.py
  uv run --project .. python build.py
else
  uv run --project .. --extra ci python crawl.py
  uv run --project .. --extra ci python transcribe.py
  uv run --project .. python analyze.py
  uv run --project .. python ideas_eval.py
  uv run --project .. python build.py
  [ -f autopost.py ] && uv run --project .. python autopost.py || true
fi
cd ..
git add -A data site api
if ! git diff --cached --quiet; then
  git commit -q -m "data: mise à jour $MODE $(date -u +%Y-%m-%dT%H:%MZ)"
  git push -q
  echo "poussé"
fi
