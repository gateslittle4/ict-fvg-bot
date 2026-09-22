# Candidates 2026 : FVG US100+XAUUSD, RSI(2) US500, les deux ensemble, contre le combo actuel

Vrai `LiveStrategyEngine` (FVG, combo) et vraie classe `DailyAlertEngine` (RSI(2)) sur `data/real-m1-full` reconstruit en M15, règlement M1 exact, spread + **swap réel du broker** (relevé du 2026-09-22). FTMO 1-Step réel (`buildEffectiveConfig` : +10 %, perte max 10 % trailing fin de journée, perte quotidienne), simulé **par événements** (P&L à la sortie : dates exactes). Garde-fou du bot (3 trades/jour, pause 30 min) partagé entre toutes les stratégies d'une variante. Limites : perte quotidienne sur P&L clôturé (pas l'équité flottante), pas de commission (≈ 0 sur les trades réels) ni de glissement réel, taux de swap d'aujourd'hui appliqués au passé, 2026 = 1er janvier → 18 septembre.

## 1. Meilleur RRR pour FVG (choisi sur l'entraînement, 2026 lu ensuite)

Par paire, trades isolés (sans garde-fou), R net avec spread + swap. Le netting est par paire, donc le RRR d'une paire ne change pas les trades de l'autre.

| Paire | RRR | Trades entr. | Gagnants entr. | R net entraînement | R net 2025 | R net 2026 | R/trade 2026 |
|---|---|---|---|---|---|---|---|
| US100 | 1:2 | 312 | 35 % | -14.8 | +9.0 | -0.6 | -0.006 |
| US100 | 1:3 | 308 | 28 % | +1.3 | +31.0 | -5.8 | -0.054 |
| US100 | 1:4 | 302 | 25 % | +36.9 | +45.5 | +1.2 | +0.011 |
| US100 | 1:5 (actuel) | 295 | 23 % | +81.7 | +58.3 | +19.5 | +0.184 |
| US100 | 1:6 | 287 | 18 % | +39.3 | +82.4 | +20.5 | +0.193 |
| US100 | 1:7 | 287 | 15 % | +9.6 | +112.5 | +31.5 | +0.297 |
| XAUUSD | 1:2 | 131 | 40 % | +11.7 | +19.6 | +20.3 | +0.616 |
| XAUUSD | 1:3 | 121 | 30 % | +2.5 | +9.7 | +28.4 | +0.915 |
| XAUUSD | 1:4 (actuel) | 117 | 27 % | +11.3 | +12.3 | +30.4 | +1.047 |
| XAUUSD | 1:5 | 115 | 25 % | +15.4 | +11.3 | +29.2 | +1.009 |
| XAUUSD | 1:6 | 110 | 23 % | +14.6 | +15.4 | +39.1 | +1.396 |
| XAUUSD | 1:7 | 108 | 22 % | +17.1 | +21.4 | +40.1 | +1.432 |

**RRR retenu sur l'entraînement : US100 1:5, XAUUSD 1:7** (actuellement 1:5 et 1:4).

## 2. 2026 — trades (garde-fou du bot, compte continu)

| Variante | Trades | Win rate | RRR réalisé (gain moy. / perte moy.) | R net | R/trade | t |
|---|---|---|---|---|---|---|
| A. Combo actuel | 407 | 24 % | 3.38 | +28.7 | +0.071 | 0.69 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 125 | 25 % | 4.33 | +42.5 | +0.340 | 1.55 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 124 | 23 % | 5.20 | +52.2 | +0.421 | 1.69 |
| R. RSI(2) US500 journalier | 11 | 100 % | — (aucune perte) | +2.9 | +0.260 | 4.12 |
| C+R. FVG + RSI(2) | 135 | 29 % | 3.80 | +55.1 | +0.408 | 1.78 |

### Part de chaque paire dans FVG (variante C, 2026, trades isolés)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 106 | 21 % | +19.5 |
| XAUUSD | 28 | 32 % | +40.1 |

## 3. 2026 — cycles FTMO 1-Step (+10 %) par risque par trade

Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.

| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2026 | Pire baisse du compte continu | 2025 : réussis / ratés |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 1 | 0 | (-2.7 %) | +8.1 % | 9.1 % | 2 / 1 |
| A. Combo actuel | 0.5 % | 2 | 2 | (+3.0 %) | +13.0 % | 14.7 % | 4 / 2 |
| A. Combo actuel | 0.75 % | 5 | 4 | (-0.2 %) | +18.2 % | 21.4 % | 10 / 7 |
| A. Combo actuel | 1 % | 8 | 8 | (-1.5 %) | +33.5 % | 26.6 % | 12 / 10 |
| A. Combo actuel | 1.25 % | 12 | 13 | (-2.0 %) | +41.8 % | 32.3 % | 15 / 14 |
| A. Combo actuel | 1.5 % | 14 | 13 | (-5.1 %) | +47.6 % | 37.5 % | 16 / 17 |
| A. Combo actuel | 2 % | 19 | 27 | (-7.0 %) | +73.8 % | 44.7 % | 26 / 32 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 1 | 0 | (+1.7 %) | +13.2 % | 3.5 % | 1 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.5 % | 2 | 0 | (-1.6 %) | +22.5 % | 5.8 % | 3 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.75 % | 3 | 0 | (-2.7 %) | +34.6 % | 8.6 % | 4 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 4 | 1 | (+1.6 %) | +43.1 % | 11.3 % | 7 / 3 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 5 | 1 | (-0.7 %) | +54.8 % | 13.9 % | 9 / 5 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 6 | 3 | (-2.7 %) | +66.7 % | 16.5 % | 11 / 8 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 2 % | 8 | 8 | (-2.7 %) | +60.7 % | 19.7 % | 11 / 12 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.3 % | 2 | 0 | (-4.4 %) | +16.5 % | 5.5 % | 2 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 3 | 0 | (-6.1 %) | +28.3 % | 9.1 % | 3 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.75 % | 4 | 1 | (-3.0 %) | +44.1 % | 13.3 % | 5 / 1 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 5 | 1 | (-7.9 %) | +52.1 % | 17.4 % | 8 / 4 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 7 | 3 | (-1.3 %) | +66.7 % | 21.3 % | 11 / 5 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.5 % | 6 | 4 | (-6.0 %) | +81.9 % | 25.0 % | 13 / 8 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 2 % | 12 | 10 | — | +86.5 % | 23.6 % | 13 / 13 |
| R. RSI(2) US500 journalier | 0.3 % | 0 | 0 | (+0.9 %) | +0.9 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.5 % | 0 | 0 | (+1.4 %) | +1.4 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.75 % | 0 | 0 | (+2.2 %) | +2.2 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1 % | 0 | 0 | (+2.9 %) | +2.9 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.25 % | 0 | 0 | (+3.6 %) | +3.6 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.5 % | 0 | 0 | (+4.4 %) | +4.4 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 2 % | 0 | 0 | (+5.9 %) | +5.9 % | 0.0 % | 0 / 0 |
| C+R. FVG + RSI(2) | 0.3 % | 2 | 0 | (-4.0 %) | +17.5 % | 5.4 % | 2 / 0 |
| C+R. FVG + RSI(2) | 0.5 % | 3 | 0 | (-4.6 %) | +30.2 % | 8.8 % | 3 / 0 |
| C+R. FVG + RSI(2) | 0.75 % | 5 | 1 | (-2.7 %) | +47.2 % | 12.9 % | 5 / 1 |
| C+R. FVG + RSI(2) | 1 % | 5 | 1 | (-7.0 %) | +55.5 % | 16.9 % | 8 / 4 |
| C+R. FVG + RSI(2) | 1.25 % | 7 | 3 | (-0.8 %) | +71.4 % | 20.7 % | 11 / 5 |
| C+R. FVG + RSI(2) | 1.5 % | 6 | 4 | (-5.4 %) | +88.0 % | 24.3 % | 13 / 8 |
| C+R. FVG + RSI(2) | 2 % | 12 | 10 | (+0.8 %) | +90.7 % | 23.6 % | 13 / 12 |

| Variante | Meilleur % en 2026 | Meilleur % en 2025 |
|---|---|---|
| A. Combo actuel | 0.3 % | 0.75 % |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 0.75 % |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 1.25 % |
| R. RSI(2) US500 journalier | 0.3 % | 0.3 % |
| C+R. FVG + RSI(2) | 0.75 % | 1.25 % |

## 4. 2026 — dates de passage / perte

### A. Combo actuel — risque 0.3 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-15 | 195 | 294 | RÉUSSI |
| 2 | 2026-07-15 | 2026-09-18 | 65 | 115 | en cours (-2.7 %) |

### A. Combo actuel — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-02-11 | 41 | 65 | RATÉ |
| 2 | 2026-02-11 | 2026-05-06 | 84 | 122 | RÉUSSI |
| 3 | 2026-05-06 | 2026-07-06 | 61 | 90 | RÉUSSI |
| 4 | 2026-07-06 | 2026-08-26 | 51 | 92 | RATÉ |
| 5 | 2026-08-26 | 2026-09-18 | 23 | 38 | en cours (+3.0 %) |

### A. Combo actuel — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-19 | 17 | 25 | RATÉ |
| 2 | 2026-01-19 | 2026-02-05 | 17 | 34 | RATÉ |
| 3 | 2026-02-05 | 2026-02-18 | 13 | 20 | RÉUSSI |
| 4 | 2026-02-18 | 2026-03-11 | 21 | 32 | RATÉ |
| 5 | 2026-03-11 | 2026-03-29 | 18 | 23 | RATÉ |
| 6 | 2026-03-29 | 2026-03-31 | 2 | 4 | RÉUSSI |
| 7 | 2026-03-31 | 2026-04-08 | 7 | 11 | RATÉ |
| 8 | 2026-04-08 | 2026-04-15 | 8 | 10 | RÉUSSI |
| 9 | 2026-04-15 | 2026-05-05 | 20 | 26 | RÉUSSI |
| 10 | 2026-05-05 | 2026-06-02 | 28 | 37 | RÉUSSI |
| 11 | 2026-06-02 | 2026-07-06 | 34 | 54 | RÉUSSI |
| 12 | 2026-07-06 | 2026-07-20 | 14 | 24 | RÉUSSI |
| 13 | 2026-07-20 | 2026-08-19 | 30 | 58 | RATÉ |
| 14 | 2026-08-19 | 2026-08-27 | 8 | 11 | RATÉ |
| 15 | 2026-08-27 | 2026-09-09 | 13 | 21 | RATÉ |
| 16 | 2026-09-09 | 2026-09-11 | 2 | 4 | RÉUSSI |
| 17 | 2026-09-11 | 2026-09-18 | 7 | 14 | en cours (-1.5 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1.25 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 15 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-30 | 10 | 7 | RÉUSSI |
| 3 | 2026-01-30 | 2026-05-20 | 110 | 42 | RÉUSSI |
| 4 | 2026-05-20 | 2026-06-02 | 13 | 7 | RÉUSSI |
| 5 | 2026-06-02 | 2026-08-14 | 73 | 46 | RÉUSSI |
| 6 | 2026-08-14 | 2026-08-27 | 13 | 8 | RATÉ |
| 7 | 2026-08-27 | 2026-09-16 | 20 | 10 | en cours (-0.7 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-04-21 | 106 | 40 | RÉUSSI |
| 2 | 2026-04-21 | 2026-06-02 | 42 | 23 | RÉUSSI |
| 3 | 2026-06-02 | 2026-09-16 | 106 | 62 | en cours (-1.6 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 15 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-04-21 | 91 | 35 | RÉUSSI |
| 3 | 2026-04-21 | 2026-05-29 | 38 | 20 | RÉUSSI |
| 4 | 2026-05-29 | 2026-06-10 | 11 | 6 | RÉUSSI |
| 5 | 2026-06-10 | 2026-08-28 | 80 | 51 | RATÉ |
| 6 | 2026-08-28 | 2026-09-16 | 19 | 8 | en cours (+1.6 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 16 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 5 | RÉUSSI |
| 3 | 2026-01-28 | 2026-04-21 | 83 | 30 | RÉUSSI |
| 4 | 2026-04-21 | 2026-06-02 | 42 | 21 | RÉUSSI |
| 5 | 2026-06-02 | 2026-06-25 | 23 | 17 | RÉUSSI |
| 6 | 2026-06-25 | 2026-08-28 | 64 | 38 | RATÉ |
| 7 | 2026-08-28 | 2026-09-16 | 19 | 8 | en cours (-7.9 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-28 | 23 | 10 | RÉUSSI |
| 2 | 2026-01-28 | 2026-05-20 | 112 | 43 | RÉUSSI |
| 3 | 2026-05-20 | 2026-06-25 | 36 | 25 | RÉUSSI |
| 4 | 2026-06-25 | 2026-09-16 | 83 | 46 | en cours (-6.1 %) |

### R. RSI(2) US500 journalier — risque 0.3 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-09-17 | 259 | 11 | en cours (+0.9 %) |

### R. RSI(2) US500 journalier — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-09-17 | 259 | 11 | en cours (+1.4 %) |

### R. RSI(2) US500 journalier — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-09-17 | 259 | 11 | en cours (+2.9 %) |

### C+R. FVG + RSI(2) — risque 0.75 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-21 | 19 | 6 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-30 | 10 | 7 | RÉUSSI |
| 3 | 2026-01-30 | 2026-05-01 | 91 | 35 | RÉUSSI |
| 4 | 2026-05-01 | 2026-06-02 | 32 | 19 | RÉUSSI |
| 5 | 2026-06-02 | 2026-08-14 | 73 | 46 | RÉUSSI |
| 6 | 2026-08-14 | 2026-09-03 | 20 | 14 | RATÉ |
| 7 | 2026-09-03 | 2026-09-17 | 14 | 6 | en cours (-2.7 %) |

### C+R. FVG + RSI(2) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-22 | 21 | 9 | RÉUSSI |
| 2 | 2026-01-22 | 2026-04-21 | 89 | 36 | RÉUSSI |
| 3 | 2026-04-21 | 2026-06-10 | 50 | 26 | RÉUSSI |
| 4 | 2026-06-10 | 2026-09-17 | 99 | 63 | en cours (-4.6 %) |

### C+R. FVG + RSI(2) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-21 | 19 | 6 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 5 | RÉUSSI |
| 3 | 2026-01-28 | 2026-04-09 | 71 | 31 | RÉUSSI |
| 4 | 2026-04-09 | 2026-05-20 | 41 | 16 | RÉUSSI |
| 5 | 2026-05-20 | 2026-06-10 | 21 | 12 | RÉUSSI |
| 6 | 2026-06-10 | 2026-08-28 | 79 | 52 | RATÉ |
| 7 | 2026-08-28 | 2026-09-17 | 20 | 11 | en cours (-7.0 %) |
