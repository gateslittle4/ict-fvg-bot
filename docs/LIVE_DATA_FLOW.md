# Flux de données live du bot : du tick à l'ordre (et où ça peut casser)

*Écrit le 2026-09-21 après deux incidents réels (signal NWOG manqué à cause du sommeil du serveur, signal Weekly Sweep manqué à cause de bougies « premier tick »). Complète HANDOFF.md et `data/research-memory.json`.*

## 1. Le chemin d'un signal

1. **Boot** (`cTraderDataSource._subscribeLiveCandles`) : 90 jours de bougies M15 demandées au broker, `LiveStrategyEngine.warmUp()` reconstruit l'état en un passage (bougies COMPLÈTES). Les signaux de l'historique sont du passé : jamais tradés. Le moteur en garde des « croyances » de positions ouvertes ; `_clearStaleBeliefsAgainstBroker` efface celles qui n'ont pas de position réelle chez le broker (`cleared stale believed-open position on boot`).
2. **Live** : `ProtoOASubscribeLiveTrendbarReq` envoie la bougie EN COURS à chaque tick (`ProtoOASpotEvent.trendbar`).
   - **Premier tick d'une nouvelle bougie N** → `_ingestNewLiveBar` : (a) demande au broker les dernières bougies et corrige celles que le moteur suivait tick par tick (`reconcileRecentCandles`, journal `[bar-reconcile]` s'il y a un écart), (b) seulement ensuite `ingestCandle(N)` évalue les signaux. Les entrées sont à l'ouverture de N, donc on ne peut pas attendre la clôture.
   - **Ticks suivants de N** → `ingestCandle` met à jour la bougie suivie (OHLC courant), sans évaluer de signal.
3. **Signal propre** (`validated` sans `blockedReason`) → `_notify` (ntfy) puis, si l'exécution automatique est active, `_handleAutoExecuteEntry` (journal `[auto-execute] entry signal received`), ordre au broker, événements `ProtoOAExecutionEvent`.
4. **Raisons de blocage** (`blockedReason`, `_blockReason`) : `netting` (une position est déjà crue ouverte sur la paire), `spread-too-tight` (stop < 3× le spread), `guardrail` (3 trades/jour, pause après perte, perte du jour), `direction-filtered` (NWOG US100 n'achète que), `invalid-distance`.

## 2. Incidents connus (et correctifs)

| Date | Symptôme | Cause | Correctif |
|---|---|---|---|
| 2026-09-20/21 | Signal NWOG US100/GER40 (22:15 UTC dimanche) valide mais aucun trade | Serveur Render (offre gratuite) endormi le week-end, réveillé à 22:35 UTC ; le warm-up rejoue le signal comme du passé | `.github/workflows/wake-sunday.yml` (appelle `/healthz` toutes les 10 min le dimanche 19-21 h UTC) ; watchdog existant inchangé. **Reste une limite** : les crons GitHub sont « au mieux » ; pour une garantie, un plan Render payant ou un pinger externe (UptimeRobot) |
| 2026-09-21 | Signal Weekly Sweep US500 (00:15 UTC) valide au rejeu, aucune trace d'ordre | `ingestCandle` jetait tous les ticks après le premier d'une bougie (« doublon ») : l'historique live contenait des bougies « stub » (haut = bas = clôture = ouverture) | `liveStrategyEngine.ingestCandle` met à jour la bougie suivie ; `reconcileRecentCandles` + `_ingestNewLiveBar` la finalisent avec les valeurs du broker ; tests `test/liveIngestion.test.js`, `test/cTraderDataSourceLiveBar.test.js` (fixture réelle `test/fixtures/us500-m15-…csv`) |

Conséquence : avant ce correctif, tout signal live dépendant des hauts/bas/clôtures de bougies reçues en direct depuis le dernier boot pouvait être manqué ou faux. Les trades de la démo antérieurs au 2026-09-21 ne sont donc pas une référence fiable de ce que le moteur corrigé aurait fait.

## 3. Comment vérifier la santé du flux

- `GET /healthz` : `marketOpen`, `lastCandleAgeSec` (doit rester < ~20 min marché ouvert), `accountsConnected`.
- Logs Render (`type: app`) :
  - `[bar-reconcile] SYMBOLE: tracked bar HH:MMZ corrected...` : écart entre la bougie suivie par ticks et la finale du broker. Peu ou pas de lignes = le suivi par ticks est déjà exact ; beaucoup = normal aussi, c'est le correctif qui travaille. `[bar-reconcile] ... broker refresh failed` répétés = problème de connexion au broker.
  - `[auto-execute] entry signal received` : un signal propre a atteint l'exécution ; suivi de `CONFIRMED FILLED` / `CONFIRMED UNFILLED`.
- Supabase (tables `bot_*` uniquement) : `bot_order_events` (signal, order_sent, filled, rejected, expired, cancelled), `bot_spread_samples` (spread min/moy/max par paire et par tranche de 15 min), colonnes de détail de `bot_trade_events`.
- Rejouer un signal contesté : exporter les bougies (`/api/accounts/default/admin/export-candles?symbol=…&timeframe=M15&days=120&token=…`, jeton `ADMIN_EXPORT_TOKEN`), décaler de −5 h (temps moteur), `warmUp` puis `ingestCandle` comme dans `test/liveIngestion.test.js`.

## 4. Règles à retenir pour toute modification du chemin live

- Ne jamais déployer marché ouvert sans nécessité : chaque déploiement coupe le bot quelques minutes (utiliser `[skip render]` pour la documentation seule).
- Un rafraîchissement broker qui échoue ne doit JAMAIS coûter une entrée (tests dédiés).
- Toute nouvelle règle de signal doit être testée sur une fixture de bougies RÉELLES ingérées comme en live (premier tick, puis mises à jour), pas seulement sur un historique complet.
