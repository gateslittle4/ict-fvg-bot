# Simulation continue avec reset au +8% ou au bust (-5% trailing) — CTI 1-Step, toutes stratégies live, compte 10k

Fork direct de ftmo-1step-all-live-strategies-cycle-account-impact.md (même architecture de reset continu, voir ce rapport pour le détail du mécanisme). Esdras (2026-09-12), après avoir vu le prix CTI 1-Step ($159 pour un compte $25k, contre ~$200-265+ chez FTMO) : "il est probable qu'on le prenne plutôt que FTMO à cause de l'argent." La seule inconnue avant de traiter CTI comme un vrai candidat : son drawdown max est deux fois plus serré que FTMO (**5% trailing sur le plus haut solde atteint**, contre 10% chez FTMO) - tout le calibrage de risque fait jusqu'ici (0.5% challenge, 0.3% live) n'a jamais été testé contre un plancher aussi serré.

**Règles CTI utilisées ici** (sourcées en direct sur citytradersimperium.com/1-step-challenge-trailing-drawdown/, 2026-09-12) : target **+8%** (au lieu de +10%), drawdown max **5% trailing** basé sur le solde (pas l'équité intra-journalière) - mécanisme déjà correctement modélisé par ce script (le plancher suit le plus haut solde atteint APRÈS chaque trade fermé, identique à la logique FTMO déjà en place, seuls les deux seuils changent). Aucune limite de perte journalière chez CTI (contre 3% chez FTMO) - non modélisée séparément ici, la propre protection journalière du bot (GuardrailEngine, une sécurité du bot, pas une règle de la prop firm) reste active comme pour le test FTMO.

**6 scénarios** : les 5 mêmes que le rapport FTMO (comparaison directe ligne à ligne) plus un 6e à 0.2%, vu que le plancher CTI est deux fois plus serré.

Note sur les dates : simulation continue sur TOUT l'historique CSV disponible par symbole (XAUUSD/EURUSD dès début 2018, US100/US500 dès début 2019), identique au rapport FTMO.

## Comparaison des 6 scénarios (historique complet en continu)

| Scénario | Cycles totaux | Passes | Busts | Taux de bust | Jours moy. pour passer | Trades moy. / cycle |
|---|---|---|---|---|---|---|
| Actuel (0.5%, aucun plafond) | 83 | 55 | 28 | 34% | 32 | 28 |
| 0.4% par trade, aucun plafond | 58 | 43 | 15 | 26% | 50 | 40 |
| 0.3% par trade, aucun plafond | 38 | 31 | 7 | 18% | 73 | 62 |
| 0.2% par trade, aucun plafond | 23 | 21 | 2 | 9% | 126 | 102 |
| 0.5% par trade, max 2 positions simultanées | 85 | 57 | 28 | 33% | 32 | 27 |
| 0.5% par trade, max 1 position simultanée (sérialisé) | 66 | 46 | 20 | 30% | 49 | 28 |

## Détail cycle par cycle, scénario actuel (0.5%, aucun plafond)

| # | Période | Durée | Trades | Win rate | Drawdown trailing max | Résultat |
|---|---|---|---|---|---|---|
| 1 | 2018-01-01 → 2018-06-05 | 155j | 50 | 30.6% | 5.3% | ❌ **bust** |
| 2 | 2018-06-05 → 2019-01-14 | 223j | 82 | 25.9% | 5.5% | ❌ **bust** |
| 3 | 2019-01-14 → 2019-03-04 | 49j | 39 | 35.9% | 0.0% | ✅ pass |
| 4 | 2019-03-04 → 2019-04-21 | 49j | 49 | 24.5% | 5.4% | ❌ **bust** |
| 5 | 2019-04-21 → 2019-07-03 | 73j | 47 | 34.0% | 0.0% | ✅ pass |
| 6 | 2019-07-03 → 2019-08-07 | 35j | 30 | 36.7% | 0.0% | ✅ pass |
| 7 | 2019-08-07 → 2019-10-04 | 58j | 42 | 33.3% | 0.0% | ✅ pass |
| 8 | 2019-10-04 → 2019-11-01 | 28j | 23 | 39.1% | 0.0% | ✅ pass |
| 9 | 2019-11-01 → 2019-12-26 | 55j | 43 | 35.7% | 0.0% | ✅ pass |
| 10 | 2019-12-26 → 2020-01-24 | 29j | 27 | 22.2% | 5.3% | ❌ **bust** |
| 11 | 2020-01-24 → 2020-02-25 | 32j | 30 | 37.9% | 0.0% | ✅ pass |
| 12 | 2020-02-25 → 2020-03-03 | 7j | 9 | 55.6% | 0.0% | ✅ pass |
| 13 | 2020-03-03 → 2020-04-13 | 41j | 36 | 30.6% | 0.0% | ✅ pass |
| 14 | 2020-04-13 → 2020-05-12 | 29j | 24 | 37.5% | 0.0% | ✅ pass |
| 15 | 2020-05-12 → 2020-06-23 | 42j | 37 | 32.4% | 0.0% | ✅ pass |
| 16 | 2020-06-23 → 2020-07-29 | 36j | 36 | 22.2% | 5.1% | ❌ **bust** |
| 17 | 2020-07-29 → 2020-09-11 | 44j | 42 | 21.4% | 5.1% | ❌ **bust** |
| 18 | 2020-09-11 → 2020-10-27 | 46j | 42 | 23.8% | 5.3% | ❌ **bust** |
| 19 | 2020-10-27 → 2020-11-23 | 27j | 24 | 17.4% | 5.3% | ❌ **bust** |
| 20 | 2020-11-23 → 2020-11-25 | 2j | 5 | 80.0% | 0.0% | ✅ pass |
| 21 | 2020-11-25 → 2020-12-08 | 13j | 16 | 12.5% | 5.4% | ❌ **bust** |
| 22 | 2020-12-08 → 2020-12-24 | 16j | 15 | 46.7% | 0.0% | ✅ pass |
| 23 | 2020-12-24 → 2021-01-20 | 27j | 21 | 42.9% | 0.0% | ✅ pass |
| 24 | 2021-01-20 → 2021-02-11 | 22j | 20 | 25.0% | 5.0% | ❌ **bust** |
| 25 | 2021-02-11 → 2021-04-20 | 68j | 54 | 24.1% | 5.3% | ❌ **bust** |
| 26 | 2021-04-20 → 2021-05-07 | 17j | 20 | 20.0% | 5.4% | ❌ **bust** |
| 27 | 2021-05-07 → 2021-05-23 | 17j | 13 | 53.8% | 0.0% | ✅ pass |
| 28 | 2021-05-23 → 2021-07-23 | 60j | 49 | 30.6% | 0.0% | ✅ pass |
| 29 | 2021-07-23 → 2021-07-30 | 7j | 10 | 50.0% | 0.0% | ✅ pass |
| 30 | 2021-07-30 → 2021-08-26 | 27j | 28 | 37.0% | 0.0% | ✅ pass |
| 31 | 2021-08-26 → 2021-09-14 | 19j | 14 | 14.3% | 5.3% | ❌ **bust** |
| 32 | 2021-09-14 → 2021-09-28 | 14j | 14 | 14.3% | 5.4% | ❌ **bust** |
| 33 | 2021-09-28 → 2021-10-13 | 15j | 10 | 0.0% | 5.5% | ❌ **bust** |
| 34 | 2021-10-13 → 2021-10-19 | 6j | 5 | 100.0% | 0.0% | ✅ pass |
| 35 | 2021-10-19 → 2021-11-05 | 17j | 13 | 46.2% | 0.0% | ✅ pass |
| 36 | 2021-11-05 → 2021-12-06 | 31j | 37 | 18.9% | 5.2% | ❌ **bust** |
| 37 | 2021-12-06 → 2021-12-23 | 17j | 19 | 10.5% | 5.2% | ❌ **bust** |
| 38 | 2021-12-23 → 2022-01-31 | 39j | 33 | 33.3% | 0.0% | ✅ pass |
| 39 | 2022-01-31 → 2022-02-28 | 28j | 25 | 36.0% | 0.0% | ✅ pass |
| 40 | 2022-02-28 → 2022-03-29 | 29j | 26 | 34.6% | 0.0% | ✅ pass |
| 41 | 2022-03-29 → 2022-05-23 | 55j | 51 | 29.4% | 0.0% | ✅ pass |
| 42 | 2022-05-23 → 2022-07-28 | 66j | 61 | 29.5% | 0.0% | ✅ pass |
| 43 | 2022-07-28 → 2022-08-24 | 27j | 26 | 19.2% | 5.0% | ❌ **bust** |
| 44 | 2022-08-24 → 2022-09-16 | 23j | 24 | 37.5% | 0.0% | ✅ pass |
| 45 | 2022-09-16 → 2022-10-31 | 45j | 44 | 25.0% | 5.4% | ❌ **bust** |
| 46 | 2022-10-31 → 2022-12-01 | 31j | 26 | 38.5% | 0.0% | ✅ pass |
| 47 | 2022-12-01 → 2022-12-22 | 21j | 18 | 22.2% | 5.4% | ❌ **bust** |
| 48 | 2022-12-22 → 2023-01-25 | 34j | 31 | 32.3% | 0.0% | ✅ pass |
| 49 | 2023-01-25 → 2023-02-10 | 16j | 14 | 14.3% | 5.1% | ❌ **bust** |
| 50 | 2023-02-10 → 2023-04-28 | 77j | 57 | 30.4% | 0.0% | ✅ pass |
| 51 | 2023-04-28 → 2023-05-16 | 18j | 13 | 7.7% | 5.3% | ❌ **bust** |
| 52 | 2023-05-16 → 2023-05-26 | 10j | 10 | 60.0% | 0.0% | ✅ pass |
| 53 | 2023-05-26 → 2023-07-18 | 53j | 41 | 34.1% | 0.0% | ✅ pass |
| 54 | 2023-07-18 → 2023-08-16 | 29j | 18 | 44.4% | 0.0% | ✅ pass |
| 55 | 2023-08-16 → 2023-09-28 | 43j | 46 | 30.4% | 0.0% | ✅ pass |
| 56 | 2023-09-28 → 2023-10-24 | 26j | 23 | 39.1% | 0.0% | ✅ pass |
| 57 | 2023-10-24 → 2023-10-30 | 6j | 7 | 57.1% | 0.0% | ✅ pass |
| 58 | 2023-10-30 → 2023-12-27 | 58j | 59 | 28.8% | 0.0% | ✅ pass |
| 59 | 2023-12-27 → 2024-01-16 | 20j | 15 | 46.7% | 0.0% | ✅ pass |
| 60 | 2024-01-16 → 2024-02-02 | 17j | 19 | 47.4% | 0.0% | ✅ pass |
| 61 | 2024-02-02 → 2024-04-04 | 62j | 53 | 23.1% | 5.2% | ❌ **bust** |
| 62 | 2024-04-04 → 2024-04-22 | 18j | 14 | 46.2% | 0.0% | ✅ pass |
| 63 | 2024-04-22 → 2024-05-22 | 30j | 19 | 42.1% | 0.0% | ✅ pass |
| 64 | 2024-05-22 → 2024-06-28 | 37j | 32 | 18.8% | 5.1% | ❌ **bust** |
| 65 | 2024-06-28 → 2024-08-21 | 54j | 46 | 28.3% | 0.0% | ✅ pass |
| 66 | 2024-08-21 → 2024-09-13 | 23j | 23 | 34.8% | 0.0% | ✅ pass |
| 67 | 2024-09-13 → 2024-09-22 | 9j | 7 | 71.4% | 0.0% | ✅ pass |
| 68 | 2024-09-22 → 2024-11-06 | 45j | 34 | 33.3% | 0.0% | ✅ pass |
| 69 | 2024-11-06 → 2024-12-16 | 40j | 43 | 20.9% | 5.4% | ❌ **bust** |
| 70 | 2024-12-16 → 2024-12-31 | 15j | 12 | 8.3% | 5.1% | ❌ **bust** |
| 71 | 2024-12-31 → 2025-01-13 | 13j | 11 | 54.5% | 0.0% | ✅ pass |
| 72 | 2025-01-13 → 2025-01-27 | 13j | 14 | 14.3% | 5.4% | ❌ **bust** |
| 73 | 2025-01-27 → 2025-02-21 | 25j | 22 | 45.5% | 0.0% | ✅ pass |
| 74 | 2025-02-21 → 2025-04-01 | 39j | 37 | 35.1% | 0.0% | ✅ pass |
| 75 | 2025-04-01 → 2025-05-16 | 45j | 42 | 31.7% | 0.0% | ✅ pass |
| 76 | 2025-05-16 → 2025-06-24 | 39j | 33 | 33.3% | 0.0% | ✅ pass |
| 77 | 2025-06-24 → 2025-07-17 | 23j | 20 | 40.0% | 0.0% | ✅ pass |
| 78 | 2025-07-17 → 2025-08-03 | 17j | 15 | 46.7% | 0.0% | ✅ pass |
| 79 | 2025-08-03 → 2025-08-21 | 18j | 18 | 11.8% | 5.3% | ❌ **bust** |
| 80 | 2025-08-21 → 2025-09-10 | 20j | 19 | 42.1% | 0.0% | ✅ pass |
| 81 | 2025-09-10 → 2025-10-15 | 35j | 32 | 34.4% | 0.0% | ✅ pass |
| 82 | 2025-10-15 → 2025-10-27 | 12j | 15 | 46.7% | 0.0% | ✅ pass |
| 83 | 2025-10-27 → 2025-11-25 | 29j | 29 | 31.0% | 0.0% | ✅ pass |

## Verdict

Contre le plancher CTI (5% trailing, deux fois plus serré que FTMO), le scénario actuel (0.5% par trade, aucun plafond) produit 83 cycles sur l'historique complet : 55 passes (challenge/live gagné) contre 28 busts, soit un taux de bust de 34% - à comparer directement au taux de bust FTMO à 0.5% (9% sur 46 cycles, plancher 10%) pour mesurer l'effet réel du drawdown plus serré.

Le scénario qui réduit le plus le taux de bust est **"0.2% par trade, aucun plafond"** (9% de bust contre 34% pour l'actuel), au prix d'un passage un peu plus lent (126j contre 32j en moyenne). Comparer les 6 lignes du tableau ci-dessus donne l'arbitrage complet vitesse/risque de chaque levier - à Esdras de choisir le compromis. Aucun changement fait dans `src/` — recherche seulement.