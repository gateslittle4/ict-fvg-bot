# Vraies bougies M15 — production cTrader, 2026-02-10 → 2026-09-16

Exportées le 2026-09-16 via `GET /api/admin/export-candles?symbol=X&days=245&token=...`
(route admin-gated, `ADMIN_EXPORT_TOKEN`), depuis le compte broker réellement
connecté en production (`ict-fvg-bot.onrender.com`). Format identique aux CSV
historiques (`time,open,high,low,close`, timestamps en ms UTC), lisible par
`loadCandlesFromCsv()`.

Plafond de 245 jours par requête (limite cTrader elle-même, pas une limite du
bot) — c'est pourquoi la fenêtre ne remonte pas plus loin que le 10 février
2026, quel que soit `days` demandé au-delà de ça.

Utilisé par `scripts/testNewComboOnRealData7Months.js` pour valider (ou pas)
la cible dynamique de liquidité (voir HANDOFF.md, section "Même test sur
VRAIES données broker") sur de vraies données jamais vues par le backtest
2009-2025 ni par le réglage de ce mécanisme. Résultat au moment de l'export :
la cible dynamique PERD 15.27R par rapport à la production sur cette fenêtre
— contredit le backtest historique (positif), d'où la décision de ne pas
déployer pour l'instant.

Committé (à la demande explicite d'Esdras, "on commit tout pour ne pas
perdre des info pertinentes") pour que cette fenêtre réelle reste
reproductible/ré-analysable plus tard, plutôt que perdue dans un scratchpad
de session éphémère. Ne sera PAS ré-exporté automatiquement — un futur
export (fenêtre plus récente) irait dans un nouveau dossier daté, celui-ci
reste un instantané figé du 2026-09-16.
