# Combo actuel (US100/US500/XAUUSD/EURUSD, GER40 retiré) — entraînement / test-forward 2026-01-01 → aujourd'hui, réglement M15 (moteur) vs M1 exact

Données : `data/real-m1-full/*.csv.gz` (FP Markets, M1 réel, EURUSD/XAUUSD dès 2022-05-19, US100/US500 dès 2023-01-11, jusqu'à ~2026-09-21), M15 reconstruits du M1. Un seul `warmUp()` du VRAI moteur (`LiveStrategyEngine`) sur tout l'historique disponible, réglé aux DEUX conventions (M15 "stop d'abord", comme le moteur en solo ; M1 exact, minute par minute — méthode identique à `scripts/runEngineM1Backtest.js`, la réconciliation de la session précédente qui a montré que le M15 sous-estime structurellement le résultat), puis rejeu dans un vrai `GuardrailEngine` (3 trades/jour, pause 30 min après perte, arrêt du jour à -2%). **Entraînement** = avant 2026-01-01 (contexte + référence). **Test/forward** = 2026-01-01 → dernière bougie dispo, jamais vu par aucun réglage antérieur du combo.

**Lecture :** coûts partiels (spread mesuré par paire, sans commission/swap/glissement réel ni le correctif de géométrie d'ordre au marché, encore non déployé) : niveau absolu encore surestimé par rapport à la démo réelle. Le M1 exact est la convention de référence désormais (voir `engine-m1-vs-m15-reconciliation.md`) ; le M15 reste affiché pour comparaison, pas comme vérité.

## Risque 0.25%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1637 | 365 | +17.81% | 14.3% | 4/3/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **400** | **91** | **+3.22%** | **8.3%** | **0/0/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1626 | 376 | +52.07% | 10.3% | 5/1/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **396** | **95** | **+10.95%** | **6.9%** | **1/0/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 0.25%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-20 | 199 | 296 | RÉUSSI (+10%) | $11062.74 |
| 2 | 2026-07-20 | 2026-09-21 | 63 | 100 | en cours (+0.29%) | $10029.39 |

## Risque 0.3%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1637 | 365 | +21.11% | 17.0% | 4/3/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **400** | **91** | **+3.75%** | **9.9%** | **1/0/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1626 | 376 | +64.50% | 12.2% | 7/3/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **396** | **95** | **+13.14%** | **8.2%** | **1/0/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 0.3%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-06 | 186 | 273 | RÉUSSI (+10%) | $11028.06 |
| 2 | 2026-07-06 | 2026-09-21 | 76 | 123 | en cours (+2.59%) | $10258.94 |

## Risque 0.5%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1637 | 365 | +33.01% | 27.5% | 11/14/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **400** | **91** | **+5.46%** | **16.0%** | **2/2/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1626 | 376 | +121.34% | 19.6% | 13/11/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **396** | **95** | **+21.79%** | **13.3%** | **4/2/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 0.5%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-02-11 | 41 | 62 | RATÉ (drawdown -10%) | $9162.02 |
| 2 | 2026-02-11 | 2026-04-22 | 70 | 104 | RÉUSSI (+10%) | $11084.28 |
| 3 | 2026-04-22 | 2026-06-17 | 56 | 81 | RÉUSSI (+10%) | $11011.29 |
| 4 | 2026-06-17 | 2026-08-04 | 48 | 77 | RÉUSSI (+10%) | $11090.61 |
| 5 | 2026-08-04 | 2026-08-27 | 23 | 38 | RATÉ (drawdown -10%) | $9135.81 |
| 6 | 2026-08-27 | 2026-09-15 | 19 | 26 | RÉUSSI (+10%) | $11025.94 |
| 7 | 2026-09-15 | 2026-09-21 | 5 | 8 | en cours (-2.51%) | $9748.73 |

## Risque 0.75%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1637 | 365 | +44.00% | 40.4% | 21/26/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **400** | **91** | **+6.66%** | **23.2%** | **4/6/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1626 | 376 | +208.52% | 28.2% | 24/20/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **396** | **95** | **+32.27%** | **19.4%** | **6/5/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 0.75%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-19 | 17 | 26 | RATÉ (drawdown -10%) | $9204.44 |
| 2 | 2026-01-19 | 2026-02-09 | 21 | 32 | RATÉ (drawdown -10%) | $9544.65 |
| 3 | 2026-02-09 | 2026-03-12 | 31 | 52 | RATÉ (drawdown -10%) | $9645.14 |
| 4 | 2026-03-12 | 2026-03-31 | 19 | 24 | RÉUSSI (+10%) | $11096.75 |
| 5 | 2026-03-31 | 2026-04-08 | 8 | 15 | RATÉ (drawdown -10%) | $9210.04 |
| 6 | 2026-04-08 | 2026-04-15 | 7 | 11 | RÉUSSI (+10%) | $11114.62 |
| 7 | 2026-04-15 | 2026-06-01 | 47 | 62 | RÉUSSI (+10%) | $11104.43 |
| 8 | 2026-06-01 | 2026-06-17 | 16 | 26 | RÉUSSI (+10%) | $11200.72 |
| 9 | 2026-06-17 | 2026-07-20 | 33 | 48 | RÉUSSI (+10%) | $11033.98 |
| 10 | 2026-07-20 | 2026-08-21 | 32 | 59 | RATÉ (drawdown -10%) | $9549.11 |
| 11 | 2026-08-21 | 2026-09-16 | 26 | 34 | RÉUSSI (+10%) | $11121.77 |
| 12 | 2026-09-16 | 2026-09-21 | 5 | 7 | en cours (-5.72%) | $9428.41 |

## Risque 1%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1467 | 535 | +120.53% | 35.8% | 36/42/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **363** | **128** | **+11.38%** | **26.7%** | **7/8/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1471 | 531 | +398.31% | 33.0% | 40/39/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **362** | **129** | **+65.02%** | **21.8%** | **8/7/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 1%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-14 | 13 | 19 | RATÉ (drawdown -10%) | $9255.10 |
| 2 | 2026-01-14 | 2026-02-02 | 19 | 31 | RATÉ (drawdown -10%) | $9489.38 |
| 3 | 2026-02-02 | 2026-03-11 | 37 | 57 | RATÉ (drawdown -10%) | $9375.34 |
| 4 | 2026-03-11 | 2026-03-31 | 20 | 28 | RÉUSSI (+10%) | $11005.98 |
| 5 | 2026-03-31 | 2026-04-07 | 7 | 11 | RATÉ (drawdown -10%) | $9356.24 |
| 6 | 2026-04-07 | 2026-04-15 | 8 | 15 | RÉUSSI (+10%) | $11012.32 |
| 7 | 2026-04-15 | 2026-04-21 | 6 | 8 | RÉUSSI (+10%) | $11046.55 |
| 8 | 2026-04-21 | 2026-05-12 | 21 | 29 | RATÉ (drawdown -10%) | $8889.50 |
| 9 | 2026-05-12 | 2026-05-26 | 14 | 18 | RÉUSSI (+10%) | $11171.21 |
| 10 | 2026-05-26 | 2026-06-02 | 7 | 11 | RÉUSSI (+10%) | $11261.76 |
| 11 | 2026-06-02 | 2026-07-06 | 34 | 49 | RÉUSSI (+10%) | $11173.23 |
| 12 | 2026-07-06 | 2026-08-04 | 29 | 51 | RÉUSSI (+10%) | $11168.06 |
| 13 | 2026-08-04 | 2026-08-20 | 16 | 28 | RATÉ (drawdown -10%) | $9308.60 |
| 14 | 2026-08-20 | 2026-08-27 | 7 | 10 | RATÉ (drawdown -10%) | $8941.47 |
| 15 | 2026-08-27 | 2026-09-11 | 15 | 23 | RÉUSSI (+10%) | $11314.48 |
| 16 | 2026-09-11 | 2026-09-21 | 9 | 14 | en cours (-1.49%) | $9851.04 |

## Risque 1.5%/trade

| Fenêtre | Réglement | Trades | Vétos | Compte continu $10k | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | M15 (moteur) | 1465 | 537 | +153.88% | 51.9% | 53/68/1 |
| **Test/forward (2026-01-01 → fin)** | **M15 (moteur)** | **362** | **129** | **+12.98%** | **37.5%** | **12/14/1** |
| Entraînement (< 2026-01-01) | M1 exact | 1469 | 533 | +754.73% | 45.8% | 59/62/1 |
| **Test/forward (2026-01-01 → fin)** | **M1 exact** | **361** | **130** | **+102.91%** | **31.0%** | **17/13/1** |

### Détail des cycles FTMO 1-Step — test/forward, M1 exact, risque 1.5%

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-13 | 12 | 16 | RATÉ (drawdown -10%) | $9328.34 |
| 2 | 2026-01-13 | 2026-01-21 | 8 | 15 | RATÉ (drawdown -10%) | $8850.91 |
| 3 | 2026-01-21 | 2026-01-22 | 1 | 4 | RÉUSSI (+10%) | $11035.37 |
| 4 | 2026-01-22 | 2026-02-03 | 12 | 16 | RATÉ (drawdown -10%) | $9559.75 |
| 5 | 2026-02-03 | 2026-02-12 | 9 | 13 | RATÉ (drawdown -10%) | $9114.01 |
| 6 | 2026-02-12 | 2026-02-12 | 0 | 2 | RÉUSSI (+10%) | $11227.85 |
| 7 | 2026-02-12 | 2026-03-03 | 19 | 27 | RATÉ (drawdown -10%) | $9658.54 |
| 8 | 2026-03-03 | 2026-03-11 | 8 | 12 | RATÉ (drawdown -10%) | $9538.03 |
| 9 | 2026-03-11 | 2026-03-18 | 7 | 8 | RÉUSSI (+10%) | $11468.84 |
| 10 | 2026-03-18 | 2026-03-24 | 6 | 9 | RATÉ (drawdown -10%) | $9158.10 |
| 11 | 2026-03-24 | 2026-04-01 | 8 | 10 | RÉUSSI (+10%) | $11267.10 |
| 12 | 2026-04-01 | 2026-04-05 | 5 | 7 | RATÉ (drawdown -10%) | $8957.73 |
| 13 | 2026-04-05 | 2026-04-14 | 9 | 15 | RÉUSSI (+10%) | $11175.93 |
| 14 | 2026-04-14 | 2026-04-17 | 3 | 5 | RÉUSSI (+10%) | $11001.82 |
| 15 | 2026-04-17 | 2026-04-21 | 4 | 6 | RÉUSSI (+10%) | $11317.48 |
| 16 | 2026-04-21 | 2026-05-04 | 13 | 17 | RATÉ (drawdown -10%) | $8755.50 |
| 17 | 2026-05-04 | 2026-05-11 | 7 | 10 | RATÉ (drawdown -10%) | $9017.92 |
| 18 | 2026-05-11 | 2026-05-13 | 2 | 4 | RÉUSSI (+10%) | $11142.31 |
| 19 | 2026-05-13 | 2026-06-01 | 19 | 18 | RÉUSSI (+10%) | $11159.51 |
| 20 | 2026-06-01 | 2026-06-02 | 1 | 3 | RÉUSSI (+10%) | $11027.57 |
| 21 | 2026-06-02 | 2026-06-11 | 9 | 15 | RÉUSSI (+10%) | $11048.37 |
| 22 | 2026-06-11 | 2026-07-06 | 25 | 33 | RÉUSSI (+10%) | $11725.61 |
| 23 | 2026-07-06 | 2026-07-20 | 14 | 22 | RÉUSSI (+10%) | $11228.62 |
| 24 | 2026-07-20 | 2026-08-04 | 15 | 24 | RÉUSSI (+10%) | $11258.67 |
| 25 | 2026-08-04 | 2026-08-13 | 9 | 15 | RÉUSSI (+10%) | $11082.92 |
| 26 | 2026-08-13 | 2026-08-20 | 7 | 9 | RATÉ (drawdown -10%) | $8588.72 |
| 27 | 2026-08-20 | 2026-08-25 | 5 | 7 | RATÉ (drawdown -10%) | $8887.50 |
| 28 | 2026-08-25 | 2026-09-09 | 15 | 19 | RATÉ (drawdown -10%) | $9597.94 |
| 29 | 2026-09-09 | 2026-09-11 | 2 | 3 | RÉUSSI (+10%) | $11055.12 |
| 30 | 2026-09-11 | 2026-09-15 | 4 | 7 | RÉUSSI (+10%) | $11174.26 |
| 31 | 2026-09-15 | 2026-09-21 | 5 | 8 | en cours (-7.46%) | $9253.64 |
