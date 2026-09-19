#!/usr/bin/env bash
# Mise à jour du radar. `./run.sh` = passage complet (horaire) ; `./run.sh fast` = passage rapide (toutes les 15 min).
# Chaque passage publie les données dans Vercel Blob (le site en ligne change sans redéploiement ; Vercel ignore les
# commits de données). Le passage rapide ne pousse sur GitHub (sauvegarde) que si le dernier push date de plus de 25 min.
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
commit_local            # un reste non enregistré (publication manuelle…) ne doit jamais bloquer le pull
git pull --rebase --quiet -X theirs
cd pipeline
if [ "$MODE" = live ]; then
  # toutes les 3 min : comptes chauds, classement des seuls nouveaux posts, publication Blob (pas de push GitHub)
  uv run --project .. --extra ci python crawl.py --hot
  if [ "$(cat ../data/last_crawl_new.txt 2>/dev/null || echo 0)" = "0" ]; then
    uv run --project .. python heartbeat.py || true   # « vérifié à l'instant » même sans nouveau post
    cd ..; commit_local; echo "rien de nouveau"; exit 0
  fi
  uv run --project .. python analyze.py
  uv run --project .. python build.py
  uv run --project .. python publish.py || echo "!! publish : le site en ligne n'a PAS été mis à jour"
  cd ..; commit_local; echo "site publié en direct"; exit 0
elif [ "$MODE" = fast ]; then
  uv run --project .. python replies.py || true
  uv run --project .. --extra ci python crawl.py --fast
  if [ "$(cat ../data/last_crawl_new.txt 2>/dev/null || echo 0)" = "0" ]; then cd ..; commit_local; echo "rien de nouveau"; exit 0; fi
  uv run --project .. --extra ci python transcribe.py
  uv run --project .. python analyze.py
  uv run --project .. python build.py
  uv run --project .. python publish.py || echo "!! publish : le site en ligne n'a PAS été mis à jour"
  # le site en ligne est déjà à jour (Blob) ; le push GitHub n'est qu'une sauvegarde : pas plus d'un toutes les 25 min
  last=$(git -C .. log -1 --format=%ct origin/main 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - last )) -lt 1500 ]; then cd ..; commit_local; echo "site publié, push GitHub reporté"; exit 0; fi
else
  uv run --project .. python replies.py || true
  uv run --project .. --extra ci python crawl.py
  uv run --project .. --extra ci python transcribe.py
  uv run --project .. python analyze.py
  uv run --project .. python ideas_eval.py
  uv run --project .. python build.py
  uv run --project .. python publish.py || echo "!! publish : le site en ligne n'a PAS été mis à jour"
  [ -f autopost.py ] && uv run --project .. python autopost.py || true
fi
cd ..
git add -A data site api
if ! git diff --cached --quiet; then
  git commit -q -m "data: mise à jour $MODE $(date -u +%Y-%m-%dT%H:%MZ)"
fi
# pousse aussi les commits locaux en attente ; si le dépôt distant a bougé, on rebase et on réessaie
for i in 1 2 3; do
  if git push -q 2>/dev/null; then echo "poussé"; break; fi
  git pull --rebase --quiet -X theirs || { git rebase --abort 2>/dev/null; echo "conflit git"; exit 1; }
done
