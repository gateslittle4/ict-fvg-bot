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
| A. Combo actuel | 373 | 25 % | 3.36 | +39.8 | +0.107 | 0.99 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 102 | 27 % | 4.37 | +50.5 | +0.495 | 1.98 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 102 | 25 % | 5.29 | +64.2 | +0.630 | 2.18 |
| R. RSI(2) US500 journalier | 11 | 100 % | — (aucune perte) | +2.9 | +0.260 | 4.12 |
| C+R. FVG + RSI(2) | 113 | 33 % | 3.79 | +67.1 | +0.594 | 2.28 |

### Part de chaque paire dans FVG (variante C, 2026, trades isolés)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 106 | 21 % | +19.5 |
| XAUUSD | 28 | 32 % | +40.1 |

## 3. 2026 — cycles FTMO 1-Step (+10 %) par risque par trade

Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.

| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2026 | Pire baisse du compte continu | 2025 : réussis / ratés |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 1 | 0 | (+1.0 %) | +11.9 % | 7.6 % | 3 / 0 |
| A. Combo actuel | 0.5 % | 2 | 1 | (+2.4 %) | +19.6 % | 12.4 % | 6 / 1 |
| A. Combo actuel | 0.75 % | 3 | 2 | (+0.4 %) | +28.8 % | 18.1 % | 9 / 2 |
| A. Combo actuel | 1 % | 8 | 8 | (-3.7 %) | +49.7 % | 22.5 % | 15 / 9 |
| A. Combo actuel | 1.25 % | 10 | 9 | (-4.7 %) | +63.8 % | 27.5 % | 18 / 12 |
| A. Combo actuel | 1.5 % | 16 | 12 | (-7.9 %) | +75.8 % | 32.2 % | 20 / 13 |
| A. Combo actuel | 2 % | 22 | 23 | (-4.4 %) | +115.4 % | 32.1 % | 30 / 24 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 1 | 0 | (+5.4 %) | +16.0 % | 3.2 % | 2 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.5 % | 2 | 0 | (+4.0 %) | +27.6 % | 5.2 % | 4 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.75 % | 4 | 0 | (-7.8 %) | +43.3 % | 7.8 % | 5 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 5 | 1 | — | +60.2 % | 10.3 % | 7 / 1 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 6 | 1 | (-2.8 %) | +78.4 % | 12.7 % | 9 / 1 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 8 | 2 | (-4.9 %) | +97.9 % | 15.1 % | 11 / 3 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 2 % | 9 | 4 | (-8.6 %) | +133.1 % | 16.4 % | 14 / 7 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.3 % | 2 | 0 | (-1.2 %) | +20.8 % | 4.9 % | 2 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 3 | 0 | (-0.3 %) | +36.4 % | 8.0 % | 4 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.75 % | 5 | 1 | (-0.8 %) | +58.0 % | 11.8 % | 6 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 6 | 1 | (-5.0 %) | +82.1 % | 15.5 % | 8 / 1 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 7 | 1 | (-9.9 %) | +108.8 % | 19.0 % | 11 / 2 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.5 % | 9 | 3 | (-1.5 %) | +138.3 % | 22.4 % | 12 / 4 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 2 % | 10 | 6 | (-7.9 %) | +191.8 % | 19.3 % | 14 / 7 |
| R. RSI(2) US500 journalier | 0.3 % | 0 | 0 | (+0.9 %) | +0.9 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.5 % | 0 | 0 | (+1.4 %) | +1.4 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.75 % | 0 | 0 | (+2.2 %) | +2.2 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1 % | 0 | 0 | (+2.9 %) | +2.9 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.25 % | 0 | 0 | (+3.6 %) | +3.6 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.5 % | 0 | 0 | (+4.4 %) | +4.4 % | 0.0 % | 0 / 0 |
| R. RSI(2) US500 journalier | 2 % | 0 | 0 | (+5.9 %) | +5.9 % | 0.0 % | 0 / 0 |
| C+R. FVG + RSI(2) | 0.3 % | 2 | 0 | (+0.4 %) | +21.8 % | 4.7 % | 2 / 0 |
| C+R. FVG + RSI(2) | 0.5 % | 3 | 0 | (+0.6 %) | +38.3 % | 7.8 % | 4 / 0 |
| C+R. FVG + RSI(2) | 0.75 % | 5 | 1 | (-0.5 %) | +61.4 % | 11.4 % | 6 / 0 |
| C+R. FVG + RSI(2) | 1 % | 6 | 1 | (-4.6 %) | +86.2 % | 15.0 % | 7 / 0 |
| C+R. FVG + RSI(2) | 1.25 % | 7 | 1 | (-8.7 %) | +114.7 % | 18.4 % | 11 / 2 |
| C+R. FVG + RSI(2) | 1.5 % | 9 | 3 | (+0.6 %) | +146.3 % | 21.6 % | 12 / 4 |
| C+R. FVG + RSI(2) | 2 % | 10 | 6 | (-7.2 %) | +199.0 % | 19.3 % | 14 / 6 |

| Variante | Meilleur % en 2026 | Meilleur % en 2025 |
|---|---|---|
| A. Combo actuel | 1.5 % | 0.75 % |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 1.25 % |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 1.25 % |
| R. RSI(2) US500 journalier | 0.3 % | 0.3 % |
| C+R. FVG + RSI(2) | 1.25 % | 1.25 % |

## 4. 2026 — dates de passage / perte

### A. Combo actuel — risque 1.5 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-06 | 4 | 5 | RÉUSSI |
| 2 | 2026-01-06 | 2026-01-13 | 7 | 9 | RATÉ |
| 3 | 2026-01-13 | 2026-01-29 | 16 | 27 | RATÉ |
| 4 | 2026-01-29 | 2026-02-05 | 7 | 11 | RATÉ |
| 5 | 2026-02-05 | 2026-02-12 | 7 | 8 | RÉUSSI |
| 6 | 2026-02-12 | 2026-03-03 | 19 | 28 | RATÉ |
| 7 | 2026-03-03 | 2026-03-05 | 2 | 3 | RÉUSSI |
| 8 | 2026-03-05 | 2026-03-11 | 6 | 8 | RATÉ |
| 9 | 2026-03-11 | 2026-03-15 | 4 | 5 | RÉUSSI |
| 10 | 2026-03-15 | 2026-03-18 | 3 | 5 | RÉUSSI |
| 11 | 2026-03-18 | 2026-03-26 | 8 | 13 | RATÉ |
| 12 | 2026-03-26 | 2026-04-01 | 6 | 9 | RÉUSSI |
| 13 | 2026-04-01 | 2026-04-08 | 7 | 9 | RATÉ |
| 14 | 2026-04-08 | 2026-04-15 | 7 | 8 | RÉUSSI |
| 15 | 2026-04-15 | 2026-04-27 | 11 | 13 | RÉUSSI |
| 16 | 2026-04-27 | 2026-05-27 | 30 | 35 | RATÉ |
| 17 | 2026-05-27 | 2026-06-01 | 5 | 4 | RÉUSSI |
| 18 | 2026-06-01 | 2026-06-02 | 1 | 3 | RÉUSSI |
| 19 | 2026-06-02 | 2026-06-17 | 15 | 19 | RÉUSSI |
| 20 | 2026-06-17 | 2026-07-02 | 15 | 17 | RÉUSSI |
| 21 | 2026-07-02 | 2026-07-15 | 13 | 18 | RÉUSSI |
| 22 | 2026-07-15 | 2026-07-22 | 7 | 12 | RATÉ |
| 23 | 2026-07-22 | 2026-08-04 | 13 | 21 | RÉUSSI |
| 24 | 2026-08-04 | 2026-08-11 | 7 | 9 | RÉUSSI |
| 25 | 2026-08-11 | 2026-08-18 | 7 | 11 | RATÉ |
| 26 | 2026-08-18 | 2026-08-24 | 6 | 7 | RATÉ |
| 27 | 2026-08-24 | 2026-09-08 | 15 | 20 | RATÉ |
| 28 | 2026-09-08 | 2026-09-16 | 8 | 11 | RÉUSSI |
| 29 | 2026-09-16 | 2026-09-18 | 2 | 5 | en cours (-7.9 %) |

### A. Combo actuel — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-06-01 | 151 | 208 | RÉUSSI |
| 2 | 2026-06-01 | 2026-07-15 | 44 | 62 | RÉUSSI |
| 3 | 2026-07-15 | 2026-08-27 | 43 | 69 | RATÉ |
| 4 | 2026-08-27 | 2026-09-18 | 22 | 35 | en cours (+2.4 %) |

### A. Combo actuel — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-27 | 26 | 39 | RATÉ |
| 2 | 2026-01-27 | 2026-03-12 | 44 | 69 | RATÉ |
| 3 | 2026-03-12 | 2026-03-18 | 6 | 7 | RÉUSSI |
| 4 | 2026-03-18 | 2026-03-29 | 11 | 16 | RATÉ |
| 5 | 2026-03-29 | 2026-03-31 | 2 | 4 | RÉUSSI |
| 6 | 2026-03-31 | 2026-04-08 | 8 | 11 | RATÉ |
| 7 | 2026-04-08 | 2026-04-15 | 7 | 7 | RÉUSSI |
| 8 | 2026-04-15 | 2026-05-06 | 21 | 24 | RÉUSSI |
| 9 | 2026-05-06 | 2026-06-02 | 27 | 36 | RÉUSSI |
| 10 | 2026-06-02 | 2026-07-15 | 43 | 60 | RÉUSSI |
| 11 | 2026-07-15 | 2026-07-30 | 15 | 28 | RATÉ |
| 12 | 2026-07-30 | 2026-08-05 | 6 | 9 | RÉUSSI |
| 13 | 2026-08-05 | 2026-08-20 | 15 | 22 | RATÉ |
| 14 | 2026-08-20 | 2026-08-28 | 8 | 10 | RATÉ |
| 15 | 2026-08-28 | 2026-09-09 | 12 | 18 | RATÉ |
| 16 | 2026-09-09 | 2026-09-15 | 6 | 8 | RÉUSSI |
| 17 | 2026-09-15 | 2026-09-18 | 3 | 7 | en cours (-3.7 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1.5 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-12 | 7 | 3 | RÉUSSI |
| 2 | 2026-01-12 | 2026-01-22 | 10 | 3 | RÉUSSI |
| 3 | 2026-01-22 | 2026-01-30 | 8 | 4 | RÉUSSI |
| 4 | 2026-01-30 | 2026-04-21 | 81 | 24 | RÉUSSI |
| 5 | 2026-04-21 | 2026-05-20 | 29 | 10 | RÉUSSI |
| 6 | 2026-05-20 | 2026-05-29 | 9 | 7 | RÉUSSI |
| 7 | 2026-05-29 | 2026-06-02 | 4 | 3 | RÉUSSI |
| 8 | 2026-06-02 | 2026-07-29 | 57 | 25 | RATÉ |
| 9 | 2026-07-29 | 2026-08-11 | 13 | 5 | RÉUSSI |
| 10 | 2026-08-11 | 2026-08-28 | 17 | 10 | RATÉ |
| 11 | 2026-08-28 | 2026-09-16 | 19 | 8 | en cours (-4.9 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-30 | 25 | 10 | RÉUSSI |
| 2 | 2026-01-30 | 2026-05-20 | 110 | 35 | RÉUSSI |
| 3 | 2026-05-20 | 2026-09-16 | 119 | 57 | en cours (+4.0 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 15 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-30 | 10 | 5 | RÉUSSI |
| 3 | 2026-01-30 | 2026-05-01 | 91 | 27 | RÉUSSI |
| 4 | 2026-05-01 | 2026-05-29 | 28 | 14 | RÉUSSI |
| 5 | 2026-05-29 | 2026-06-10 | 11 | 5 | RÉUSSI |
| 6 | 2026-06-10 | 2026-09-16 | 99 | 46 | RATÉ |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1.25 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 16 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 3 | RÉUSSI |
| 3 | 2026-01-28 | 2026-03-03 | 34 | 17 | RÉUSSI |
| 4 | 2026-03-03 | 2026-04-21 | 49 | 9 | RÉUSSI |
| 5 | 2026-04-21 | 2026-05-20 | 29 | 11 | RÉUSSI |
| 6 | 2026-05-20 | 2026-06-02 | 13 | 9 | RÉUSSI |
| 7 | 2026-06-02 | 2026-06-25 | 23 | 11 | RÉUSSI |
| 8 | 2026-06-25 | 2026-08-28 | 64 | 29 | RATÉ |
| 9 | 2026-08-28 | 2026-09-16 | 19 | 8 | en cours (-9.9 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 6 | RÉUSSI |
| 2 | 2026-01-22 | 2026-04-09 | 77 | 26 | RÉUSSI |
| 3 | 2026-04-09 | 2026-06-02 | 54 | 20 | RÉUSSI |
| 4 | 2026-06-02 | 2026-09-16 | 106 | 50 | en cours (-0.3 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 16 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 3 | RÉUSSI |
| 3 | 2026-01-28 | 2026-04-09 | 71 | 24 | RÉUSSI |
| 4 | 2026-04-09 | 2026-05-13 | 34 | 9 | RÉUSSI |
| 5 | 2026-05-13 | 2026-06-02 | 20 | 11 | RÉUSSI |
| 6 | 2026-06-02 | 2026-06-24 | 21 | 11 | RÉUSSI |
| 7 | 2026-06-24 | 2026-09-02 | 70 | 33 | RATÉ |
| 8 | 2026-09-02 | 2026-09-16 | 14 | 5 | en cours (-5.0 %) |

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

### C+R. FVG + RSI(2) — risque 1.25 % (meilleur en 2026)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-21 | 19 | 6 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 3 | RÉUSSI |
| 3 | 2026-01-28 | 2026-02-20 | 23 | 14 | RÉUSSI |
| 4 | 2026-02-20 | 2026-04-21 | 60 | 15 | RÉUSSI |
| 5 | 2026-04-21 | 2026-05-20 | 29 | 11 | RÉUSSI |
| 6 | 2026-05-20 | 2026-06-02 | 13 | 9 | RÉUSSI |
| 7 | 2026-06-02 | 2026-06-25 | 23 | 12 | RÉUSSI |
| 8 | 2026-06-25 | 2026-08-28 | 64 | 30 | RATÉ |
| 9 | 2026-08-28 | 2026-09-17 | 20 | 11 | en cours (-8.7 %) |

### C+R. FVG + RSI(2) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-22 | 21 | 8 | RÉUSSI |
| 2 | 2026-01-22 | 2026-04-09 | 77 | 29 | RÉUSSI |
| 3 | 2026-04-09 | 2026-06-02 | 54 | 20 | RÉUSSI |
| 4 | 2026-06-02 | 2026-09-17 | 107 | 56 | en cours (+0.6 %) |

### C+R. FVG + RSI(2) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-21 | 19 | 6 | RÉUSSI |
| 2 | 2026-01-21 | 2026-01-28 | 8 | 3 | RÉUSSI |
| 3 | 2026-01-28 | 2026-04-08 | 69 | 26 | RÉUSSI |
| 4 | 2026-04-08 | 2026-04-21 | 14 | 3 | RÉUSSI |
| 5 | 2026-04-21 | 2026-05-20 | 29 | 11 | RÉUSSI |
| 6 | 2026-05-20 | 2026-06-10 | 21 | 11 | RÉUSSI |
| 7 | 2026-06-10 | 2026-09-02 | 84 | 42 | RATÉ |
| 8 | 2026-09-02 | 2026-09-17 | 15 | 7 | en cours (-4.6 %) |
