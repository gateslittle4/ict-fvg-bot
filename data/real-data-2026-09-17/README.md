# Vraies bougies M15 — production cTrader, ~2026-07-27 → 2026-09-17

Exportées le 2026-09-17 via `GET /api/candles?symbol=X&timeframe=M15&limit=5000` (route
publique, sert `LiveStrategyEngine.getHistory()` — la même fenêtre de 90 jours
gardée "chaude" par le bot pour la détection de signaux), pas via
`/api/admin/export-candles` (celle-là exige `ADMIN_EXPORT_TOKEN`, non
disponible dans cette session). Format identique aux CSV historiques
(`time,open,high,low,close`, timestamps en ms), lisible par
`loadCandlesFromCsv()`.

⚠ Ces bougies sont en UTC RÉEL (`/api/candles` réapplique l'offset -5h avant
de servir, pour l'affichage du graphique — voir le commentaire de cette route
dans `server.js`), PAS la convention "EST fixe" des CSV historiques
2019-2025. Toujours convertir (`time - FIXED_EST_TO_UTC_OFFSET_MS`, voir
`nySession.js`) avant de nourrir un backtest — même précaution que
`data/real-data-2026-02-to-09/` et le forward-test Silver Bullet.

Plafond de 5000 bougies par requête (limite de cette route elle-même, pas du
broker) — ~52 jours de M15, pas les 245 jours de la route admin.

Utilisé pour : (1) estimer la fréquence réelle de trades/semaine du combo
complet une fois Silver Bullet/Weekly Sweep/Breaker Block réellement câblés,
(2) un forward-test "depuis le début de la semaine" sur ces vraies données,
à la demande d'Esdras.

Committé pour que cette fenêtre réelle reste reproductible/ré-analysable
plus tard (même choix que `data/real-data-2026-02-to-09/`). Ne sera PAS
ré-exporté automatiquement — un futur export irait dans un nouveau dossier
daté.
