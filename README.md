# Jev Radar — jev.agentik-os.com

Suivi en direct de tout ce qui se dit sur Jev (TypeSafe) sur X, classé par Jev lui-même.

- `pipeline/` : collecte (fxtwitter), transcription, classement Jev, idées, build du site.
- `site/` : site statique (données dans `site/data/`), servi par Vercel.
- `api/check-idea.js` : fonction Vercel qui note une idée avec Jev (`TYPESAFE_API_KEY`).
- `run.sh` : mise à jour complète, lancée toutes les heures par cron sur agk-core ; le push déclenche le déploiement Vercel.
