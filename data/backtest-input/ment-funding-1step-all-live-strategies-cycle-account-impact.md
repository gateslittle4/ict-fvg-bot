# Simulation continue avec reset au +10% ou au bust (-6% statique) — Ment Funding 1-Step, toutes stratégies live, compte 10k

Fork direct de ftmo-1step-all-live-strategies-cycle-account-impact.md et cti-1step-all-live-strategies-cycle-account-impact.md (même architecture de reset continu). Esdras (2026-09-12), après que FundedNext et Alpha Capital Group se soient révélés incompatibles avec un bot 100% autonome (interdisent l'exécution sans supervision humaine) et que The5ers se soit révélé 4-5x plus cher : "Autre platforme sérieuse?" **Ment Funding** passe les deux filtres : EA/cBots explicitement permis sans restriction ("EAs, hedging, scalping, any strategy - all permitted", sourcé en direct sur mentfunding.com, 2026-09-12), cTrader supporté (déjà câblé dans ce bot), prix $25k confirmé à **$250** (dans la fourchette FTMO, pas celle de CTI). Firme plus petite que FTMO (4.9/5 Trustpilot mais ~227 avis seulement, contre 8000+ à 4.6 chez FTMO - solide mais échantillon mince, à garder en tête).

**Différence de règle qui a demandé un vrai changement de code** (pas juste des constantes) : le drawdown max 6% de Ment Funding est **STATIQUE** (fixé 6% sous le solde DE DÉPART, confirmé "fixed below starting balance, doesn't trail with profits"), pas trailing comme FTMO (10%, fin de journée) ou CTI (5%, sur le solde). Un plancher statique ne monte jamais - une fois un cycle significativement en avance, le plancher à 6% sous le DÉPART devient pratiquement hors de portée. `simulateContinuous()` calcule donc le drawdown contre le solde de départ fixe, pas contre un pic mobile. Target **+10%** (comme FTMO, pas les +8% de CTI). Perte journalière 5% du solde de la veille (plus souple que les 3% de FTMO, plus stricte que l'absence de limite chez CTI) - non modélisée séparément ici, même raisonnement que les scripts FTMO/CTI (la protection journalière propre du bot reste active quelle que soit la firme).

**6 scénarios**, identiques au rapport CTI pour comparaison directe ligne à ligne entre les 3 rapports.

Note sur les dates : simulation continue sur TOUT l'historique CSV disponible par symbole, identique aux rapports FTMO/CTI.

## Comparaison des 6 scénarios (historique complet en continu)

| Scénario | Cycles totaux | Passes | Busts | Taux de bust | Jours moy. pour passer | Trades moy. / cycle |
|---|---|---|---|---|---|---|
| Actuel (0.5%, aucun plafond) | 45 | 42 | 3 | 7% | 65 | 52 |
| 0.4% par trade, aucun plafond | 39 | 35 | 4 | 10% | 76 | 60 |
| 0.3% par trade, aucun plafond | 25 | 24 | 1 | 4% | 113 | 93 |
| 0.2% par trade, aucun plafond | 16 | 16 | 0 | 0% | 178 | 145 |
| 0.5% par trade, max 2 positions simultanées | 46 | 42 | 4 | 9% | 64 | 51 |
| 0.5% par trade, max 1 position simultanée (sérialisé) | 40 | 36 | 4 | 10% | 76 | 47 |

## Détail cycle par cycle, scénario actuel (0.5%, aucun plafond)

| # | Période | Durée | Trades | Win rate | Drawdown vs départ (statique) | Résultat |
|---|---|---|---|---|---|---|
| 1 | 2018-01-01 → 2019-03-24 | 447j | 192 | 30.0% | 0.0% | ✅ pass |
| 2 | 2019-03-24 → 2019-08-01 | 130j | 99 | 30.3% | 0.0% | ✅ pass |
| 3 | 2019-08-01 → 2019-10-03 | 63j | 45 | 33.3% | 0.0% | ✅ pass |
| 4 | 2019-10-03 → 2019-11-04 | 32j | 27 | 40.7% | 0.0% | ✅ pass |
| 5 | 2019-11-04 → 2020-01-09 | 66j | 51 | 34.0% | 0.0% | ✅ pass |
| 6 | 2020-01-09 → 2020-01-30 | 21j | 20 | 10.0% | 6.4% | ❌ **bust** |
| 7 | 2020-01-30 → 2020-02-25 | 26j | 26 | 44.0% | 0.0% | ✅ pass |
| 8 | 2020-02-25 → 2020-03-04 | 8j | 11 | 54.5% | 0.0% | ✅ pass |
| 9 | 2020-03-04 → 2020-04-14 | 41j | 36 | 33.3% | 0.0% | ✅ pass |
| 10 | 2020-04-14 → 2020-05-13 | 29j | 26 | 38.5% | 0.0% | ✅ pass |
| 11 | 2020-05-13 → 2020-07-02 | 50j | 46 | 30.4% | 0.0% | ✅ pass |
| 12 | 2020-07-02 → 2020-09-10 | 70j | 66 | 21.2% | 6.5% | ❌ **bust** |
| 13 | 2020-09-10 → 2020-12-28 | 110j | 107 | 27.4% | 0.0% | ✅ pass |
| 14 | 2020-12-28 → 2021-01-21 | 23j | 21 | 47.6% | 0.0% | ✅ pass |
| 15 | 2021-01-21 → 2021-06-15 | 145j | 126 | 27.8% | 0.0% | ✅ pass |
| 16 | 2021-06-15 → 2021-07-26 | 41j | 34 | 35.3% | 0.0% | ✅ pass |
| 17 | 2021-07-26 → 2021-08-23 | 28j | 32 | 35.5% | 0.0% | ✅ pass |
| 18 | 2021-08-23 → 2021-10-03 | 41j | 32 | 15.6% | 6.5% | ❌ **bust** |
| 19 | 2021-10-03 → 2021-10-22 | 19j | 18 | 47.1% | 0.0% | ✅ pass |
| 20 | 2021-10-22 → 2022-02-11 | 112j | 114 | 26.3% | 0.0% | ✅ pass |
| 21 | 2022-02-11 → 2022-03-08 | 25j | 20 | 45.0% | 0.0% | ✅ pass |
| 22 | 2022-03-08 → 2022-05-23 | 76j | 68 | 29.4% | 0.0% | ✅ pass |
| 23 | 2022-05-23 → 2022-08-03 | 72j | 68 | 29.4% | 0.0% | ✅ pass |
| 24 | 2022-08-03 → 2022-10-07 | 65j | 64 | 31.3% | 0.0% | ✅ pass |
| 25 | 2022-10-07 → 2023-01-04 | 89j | 78 | 28.2% | 0.0% | ✅ pass |
| 26 | 2023-01-04 → 2023-05-26 | 142j | 116 | 28.7% | 0.0% | ✅ pass |
| 27 | 2023-05-26 → 2023-07-19 | 54j | 42 | 35.7% | 0.0% | ✅ pass |
| 28 | 2023-07-19 → 2023-09-14 | 57j | 42 | 35.7% | 0.0% | ✅ pass |
| 29 | 2023-09-14 → 2023-10-06 | 22j | 25 | 36.0% | 0.0% | ✅ pass |
| 30 | 2023-10-06 → 2023-10-26 | 20j | 23 | 43.5% | 0.0% | ✅ pass |
| 31 | 2023-10-26 → 2024-01-09 | 75j | 69 | 29.0% | 0.0% | ✅ pass |
| 32 | 2024-01-09 → 2024-01-18 | 9j | 11 | 63.6% | 0.0% | ✅ pass |
| 33 | 2024-01-18 → 2024-02-26 | 39j | 37 | 36.1% | 0.0% | ✅ pass |
| 34 | 2024-02-26 → 2024-05-20 | 84j | 63 | 30.6% | 0.0% | ✅ pass |
| 35 | 2024-05-20 → 2024-08-27 | 99j | 85 | 27.1% | 0.0% | ✅ pass |
| 36 | 2024-08-27 → 2024-09-20 | 24j | 23 | 39.1% | 0.0% | ✅ pass |
| 37 | 2024-09-20 → 2024-10-29 | 39j | 32 | 35.5% | 0.0% | ✅ pass |
| 38 | 2024-10-29 → 2025-03-03 | 125j | 121 | 28.9% | 0.0% | ✅ pass |
| 39 | 2025-03-03 → 2025-05-12 | 70j | 63 | 32.3% | 0.0% | ✅ pass |
| 40 | 2025-05-12 → 2025-06-18 | 37j | 30 | 36.7% | 0.0% | ✅ pass |
| 41 | 2025-06-18 → 2025-07-07 | 19j | 16 | 50.0% | 0.0% | ✅ pass |
| 42 | 2025-07-07 → 2025-07-29 | 22j | 19 | 42.1% | 0.0% | ✅ pass |
| 43 | 2025-07-29 → 2025-09-11 | 44j | 45 | 31.8% | 0.0% | ✅ pass |
| 44 | 2025-09-11 → 2025-10-20 | 39j | 35 | 34.3% | 0.0% | ✅ pass |
| 45 | 2025-10-20 → 2025-11-07 | 18j | 21 | 38.1% | 0.0% | ✅ pass |

## Verdict

Contre le plancher STATIQUE de Ment Funding (6% sous le départ, jamais trailing), le scénario actuel (0.5% par trade, aucun plafond) produit 45 cycles sur l'historique complet : 42 passes (challenge/live gagné) contre 3 busts, soit un taux de bust de 7% - à comparer directement aux taux de bust FTMO (9% à 0.5%, plancher 10% trailing) et CTI (34% à 0.5%, plancher 5% trailing) pour mesurer l'effet réel d'un plancher statique plutôt que mobile.

Le scénario qui réduit le plus le taux de bust est **"0.2% par trade, aucun plafond"** (0% de bust contre 7% pour l'actuel), au prix d'un passage un peu plus lent (178j contre 65j en moyenne). Comparer les 6 lignes du tableau ci-dessus donne l'arbitrage complet vitesse/risque de chaque levier - à Esdras de choisir le compromis. Aucun changement fait dans `src/` — recherche seulement.