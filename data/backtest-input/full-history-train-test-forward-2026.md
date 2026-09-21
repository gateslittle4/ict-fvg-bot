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
