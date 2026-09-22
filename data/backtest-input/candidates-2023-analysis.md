# Candidates 2023 : FVG US100+XAUUSD, RSI(2) US500, les deux ensemble, contre le combo actuel

Vrai `LiveStrategyEngine` (FVG, combo) et vraie classe `DailyAlertEngine` (RSI(2)) sur `data/real-m1-full` reconstruit en M15, règlement M1 exact, spread + **swap réel du broker** (relevé du 2026-09-22). FTMO 1-Step réel (`buildEffectiveConfig` : +10 %, perte max 10 % trailing fin de journée, perte quotidienne), simulé **par événements** (P&L à la sortie : dates exactes). Garde-fou du bot (3 trades/jour, pause 30 min) partagé entre toutes les stratégies d'une variante. Limites : perte quotidienne sur P&L clôturé (pas l'équité flottante), pas de commission (≈ 0 sur les trades réels) ni de glissement réel, taux de swap d'aujourd'hui appliqués au passé, 2023 = année complète.

**Attention : 2023 fait partie de l'entraînement (< 2025)** sur lequel FVG seul, le retrait de US500 et les RRR ont été choisis. Ce n'est donc PAS une année indépendante : elle dit si l'idée tenait déjà cette année-là, pas si elle marchera. La colonne 2025 reste, elle, hors échantillon.

## 1. Meilleur RRR pour FVG (choisi sur l'entraînement, 2023 lu ensuite)

Par paire, trades isolés (sans garde-fou), R net avec spread + swap. Le netting est par paire, donc le RRR d'une paire ne change pas les trades de l'autre.

| Paire | RRR | Trades entr. | Gagnants entr. | R net entraînement | R net 2025 | R net 2023 | R/trade 2023 |
|---|---|---|---|---|---|---|---|
| US100 | 1:2 | 312 | 35 % | -14.8 | +9.0 | +3.0 | +0.022 |
| US100 | 1:3 | 308 | 28 % | +1.3 | +31.0 | +18.5 | +0.137 |
| US100 | 1:4 | 302 | 25 % | +36.9 | +45.5 | +33.5 | +0.252 |
| US100 | 1:5 (actuel) | 295 | 23 % | +81.7 | +58.3 | +64.1 | +0.501 |
| US100 | 1:6 | 287 | 18 % | +39.3 | +82.4 | +50.7 | +0.419 |
| US100 | 1:7 | 287 | 15 % | +9.6 | +112.5 | +36.1 | +0.296 |
| XAUUSD | 1:2 | 131 | 40 % | +11.7 | +19.6 | +3.5 | +0.069 |
| XAUUSD | 1:3 | 121 | 30 % | +2.5 | +9.7 | +2.8 | +0.057 |
| XAUUSD | 1:4 (actuel) | 117 | 27 % | +11.3 | +12.3 | +10.7 | +0.227 |
| XAUUSD | 1:5 | 115 | 25 % | +15.4 | +11.3 | +20.4 | +0.444 |
| XAUUSD | 1:6 | 110 | 23 % | +14.6 | +15.4 | +10.5 | +0.234 |
| XAUUSD | 1:7 | 108 | 22 % | +17.1 | +21.4 | +6.5 | +0.148 |

**RRR retenu sur l'entraînement : US100 1:5, XAUUSD 1:7** (actuellement 1:5 et 1:4).

## 2. 2023 — trades (garde-fou du bot, compte continu)

| Variante | Trades | Win rate | RRR réalisé (gain moy. / perte moy.) | R net | R/trade | t |
|---|---|---|---|---|---|---|
| A. Combo actuel | 554 | 27 % | 3.16 | +72.6 | +0.131 | 1.46 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 167 | 29 % | 3.91 | +77.6 | +0.464 | 2.34 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 163 | 26 % | 4.19 | +67.4 | +0.413 | 2.00 |
| R. RSI(2) US500 journalier | 1 | 0 % | — (aucune perte) | -0.5 | -0.463 | 0.00 |
| C+R. FVG + RSI(2) | 164 | 26 % | 4.21 | +66.9 | +0.408 | 1.98 |

### Part de chaque paire dans FVG (variante C, 2023, trades isolés)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 128 | 27 % | +64.1 |
| XAUUSD | 44 | 23 % | +6.5 |

## 3. 2023 — cycles FTMO 1-Step (+10 %) par risque par trade

Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.

| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2023 | Pire baisse du compte continu | 2025 : réussis / ratés |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 2 | 0 | (+0.2 %) | +22.8 % | 6.5 % | 2 / 1 |
| A. Combo actuel | 0.5 % | 6 | 4 | (+5.0 %) | +39.0 % | 10.7 % | 4 / 2 |
| A. Combo actuel | 0.75 % | 7 | 6 | (+6.3 %) | +57.6 % | 15.6 % | 10 / 7 |
| A. Combo actuel | 1 % | 11 | 9 | (+4.4 %) | +99.8 % | 21.5 % | 12 / 10 |
| A. Combo actuel | 1.25 % | 18 | 16 | (+3.0 %) | +128.8 % | 26.1 % | 15 / 14 |
| A. Combo actuel | 1.5 % | 21 | 20 | (+9.5 %) | +170.6 % | 29.2 % | 16 / 17 |
| A. Combo actuel | 2 % | 27 | 36 | (+7.5 %) | +27.6 % | 47.9 % | 26 / 32 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 2 | 0 | (+0.8 %) | +25.5 % | 3.2 % | 1 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.5 % | 3 | 0 | (+7.1 %) | +45.1 % | 5.3 % | 3 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.75 % | 5 | 0 | (+0.1 %) | +72.9 % | 7.9 % | 4 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 7 | 1 | (-1.2 %) | +89.5 % | 10.4 % | 7 / 3 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 9 | 2 | (+3.9 %) | +118.5 % | 12.9 % | 9 / 5 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 12 | 6 | (-1.7 %) | +154.2 % | 15.5 % | 11 / 8 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 2 % | 15 | 8 | (-2.3 %) | +138.9 % | 22.6 % | 11 / 12 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.3 % | 2 | 0 | (-0.3 %) | +21.7 % | 3.3 % | 2 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 3 | 0 | (+0.8 %) | +38.0 % | 5.5 % | 3 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.75 % | 4 | 0 | — | +60.3 % | 8.2 % | 5 / 1 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 7 | 2 | (+1.5 %) | +71.4 % | 10.8 % | 8 / 4 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 9 | 3 | (+5.1 %) | +92.8 % | 13.3 % | 11 / 5 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.5 % | 9 | 5 | (+8.3 %) | +119.0 % | 15.7 % | 13 / 8 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 2 % | 13 | 8 | (-2.3 %) | +87.7 % | 22.0 % | 13 / 13 |
| R. RSI(2) US500 journalier | 0.3 % | 0 | 0 | (-0.1 %) | -0.1 % | 0.1 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.5 % | 0 | 0 | (-0.2 %) | -0.2 % | 0.2 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.75 % | 0 | 0 | (-0.3 %) | -0.3 % | 0.3 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1 % | 0 | 0 | (-0.5 %) | -0.5 % | 0.5 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.25 % | 0 | 0 | (-0.6 %) | -0.6 % | 0.6 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.5 % | 0 | 0 | (-0.7 %) | -0.7 % | 0.7 % | 0 / 0 |
| R. RSI(2) US500 journalier | 2 % | 0 | 0 | (-0.9 %) | -0.9 % | 0.9 % | 0 / 0 |
| C+R. FVG + RSI(2) | 0.3 % | 2 | 0 | (-0.3 %) | +21.6 % | 3.3 % | 2 / 0 |
| C+R. FVG + RSI(2) | 0.5 % | 3 | 0 | (+0.8 %) | +37.6 % | 5.5 % | 3 / 0 |
| C+R. FVG + RSI(2) | 0.75 % | 3 | 0 | (+9.9 %) | +59.7 % | 8.2 % | 5 / 1 |
| C+R. FVG + RSI(2) | 1 % | 7 | 2 | (+1.5 %) | +70.7 % | 10.8 % | 8 / 4 |
| C+R. FVG + RSI(2) | 1.25 % | 9 | 3 | (+5.1 %) | +91.8 % | 13.3 % | 11 / 5 |
| C+R. FVG + RSI(2) | 1.5 % | 9 | 5 | (+8.3 %) | +117.6 % | 15.7 % | 13 / 8 |
| C+R. FVG + RSI(2) | 2 % | 13 | 8 | (-2.3 %) | +87.7 % | 22.0 % | 13 / 12 |

| Variante | Meilleur % en 2023 | Meilleur % en 2025 |
|---|---|---|
| A. Combo actuel | 0.3 % | 0.75 % |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 0.75 % |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 1.25 % |
| R. RSI(2) US500 journalier | 0.3 % | 0.3 % |
| C+R. FVG + RSI(2) | 1.25 % | 1.25 % |

## 4. 2023 — dates de passage / perte

### A. Combo actuel — risque 0.3 % (meilleur en 2023)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-02 | 2023-07-19 | 198 | 294 | RÉUSSI |
| 2 | 2023-07-19 | 2023-09-08 | 51 | 80 | RÉUSSI |
| 3 | 2023-09-08 | 2024-01-02 | 116 | 179 | en cours (+0.2 %) |

### A. Combo actuel — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-02 | 2023-02-15 | 44 | 52 | RATÉ |
| 2 | 2023-02-15 | 2023-03-17 | 30 | 43 | RÉUSSI |
| 3 | 2023-03-17 | 2023-04-04 | 18 | 27 | RATÉ |
| 4 | 2023-04-04 | 2023-04-13 | 9 | 13 | RÉUSSI |
| 5 | 2023-04-13 | 2023-06-15 | 63 | 112 | RÉUSSI |
| 6 | 2023-06-15 | 2023-07-10 | 25 | 31 | RATÉ |
| 7 | 2023-07-10 | 2023-07-18 | 8 | 15 | RÉUSSI |
| 8 | 2023-07-18 | 2023-08-25 | 37 | 61 | RÉUSSI |
| 9 | 2023-08-25 | 2023-10-27 | 63 | 113 | RÉUSSI |
| 10 | 2023-10-27 | 2023-12-06 | 40 | 54 | RATÉ |
| 11 | 2023-12-06 | 2024-01-02 | 27 | 35 | en cours (+5.0 %) |

### A. Combo actuel — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-02 | 2023-02-07 | 36 | 42 | RATÉ |
| 2 | 2023-02-07 | 2023-02-15 | 8 | 10 | RATÉ |
| 3 | 2023-02-15 | 2023-02-27 | 12 | 17 | RÉUSSI |
| 4 | 2023-02-27 | 2023-03-17 | 18 | 26 | RÉUSSI |
| 5 | 2023-03-17 | 2023-03-28 | 11 | 18 | RATÉ |
| 6 | 2023-03-28 | 2023-04-13 | 16 | 22 | RÉUSSI |
| 7 | 2023-04-13 | 2023-05-22 | 39 | 71 | RÉUSSI |
| 8 | 2023-05-22 | 2023-06-15 | 24 | 40 | RÉUSSI |
| 9 | 2023-06-15 | 2023-06-30 | 14 | 17 | RATÉ |
| 10 | 2023-06-30 | 2023-07-07 | 7 | 13 | RATÉ |
| 11 | 2023-07-07 | 2023-07-18 | 11 | 18 | RÉUSSI |
| 12 | 2023-07-18 | 2023-07-19 | 1 | 2 | RÉUSSI |
| 13 | 2023-07-19 | 2023-08-07 | 19 | 29 | RATÉ |
| 14 | 2023-08-07 | 2023-08-16 | 9 | 14 | RÉUSSI |
| 15 | 2023-08-16 | 2023-08-28 | 12 | 19 | RÉUSSI |
| 16 | 2023-08-28 | 2023-09-08 | 11 | 17 | RÉUSSI |
| 17 | 2023-09-08 | 2023-10-09 | 31 | 53 | RATÉ |
| 18 | 2023-10-09 | 2023-10-27 | 18 | 37 | RÉUSSI |
| 19 | 2023-10-27 | 2023-11-08 | 12 | 13 | RATÉ |
| 20 | 2023-11-08 | 2023-11-23 | 15 | 20 | RATÉ |
| 21 | 2023-11-23 | 2024-01-02 | 40 | 53 | en cours (+4.4 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1.25 % (meilleur en 2023)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-03-17 | 66 | 19 | RÉUSSI |
| 2 | 2023-03-17 | 2023-04-06 | 20 | 8 | RÉUSSI |
| 3 | 2023-04-06 | 2023-05-16 | 40 | 17 | RÉUSSI |
| 4 | 2023-05-16 | 2023-05-18 | 2 | 2 | RÉUSSI |
| 5 | 2023-05-18 | 2023-07-04 | 47 | 28 | RÉUSSI |
| 6 | 2023-07-04 | 2023-07-19 | 15 | 7 | RÉUSSI |
| 7 | 2023-07-19 | 2023-09-11 | 54 | 21 | RATÉ |
| 8 | 2023-09-11 | 2023-09-28 | 17 | 12 | RÉUSSI |
| 9 | 2023-09-28 | 2023-09-28 | 0 | 2 | RÉUSSI |
| 10 | 2023-09-28 | 2023-11-23 | 56 | 27 | RATÉ |
| 11 | 2023-11-23 | 2023-12-08 | 15 | 8 | RÉUSSI |
| 12 | 2023-12-08 | 2023-12-28 | 20 | 12 | en cours (+3.9 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-04-09 | 89 | 28 | RÉUSSI |
| 2 | 2023-04-09 | 2023-06-02 | 54 | 27 | RÉUSSI |
| 3 | 2023-06-02 | 2023-08-21 | 80 | 38 | RÉUSSI |
| 4 | 2023-08-21 | 2023-12-28 | 129 | 74 | en cours (+7.1 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-04-05 | 85 | 26 | RÉUSSI |
| 2 | 2023-04-05 | 2023-04-13 | 8 | 5 | RÉUSSI |
| 3 | 2023-04-13 | 2023-05-18 | 35 | 15 | RÉUSSI |
| 4 | 2023-05-18 | 2023-06-27 | 40 | 26 | RÉUSSI |
| 5 | 2023-06-27 | 2023-07-19 | 22 | 11 | RÉUSSI |
| 6 | 2023-07-19 | 2023-09-28 | 71 | 34 | RÉUSSI |
| 7 | 2023-09-28 | 2023-11-23 | 56 | 29 | RATÉ |
| 8 | 2023-11-23 | 2023-12-27 | 34 | 19 | RÉUSSI |
| 9 | 2023-12-27 | 2023-12-28 | 1 | 1 | en cours (-1.2 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1.25 % (meilleur en 2023)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-02-07 | 28 | 8 | RATÉ |
| 2 | 2023-02-07 | 2023-03-08 | 29 | 5 | RÉUSSI |
| 3 | 2023-03-08 | 2023-04-06 | 29 | 14 | RÉUSSI |
| 4 | 2023-04-06 | 2023-05-03 | 27 | 14 | RÉUSSI |
| 5 | 2023-05-03 | 2023-06-02 | 30 | 11 | RÉUSSI |
| 6 | 2023-06-02 | 2023-06-27 | 25 | 18 | RÉUSSI |
| 7 | 2023-06-27 | 2023-07-19 | 22 | 11 | RÉUSSI |
| 8 | 2023-07-19 | 2023-09-08 | 51 | 17 | RATÉ |
| 9 | 2023-09-08 | 2023-09-28 | 20 | 14 | RÉUSSI |
| 10 | 2023-09-28 | 2023-10-26 | 28 | 16 | RÉUSSI |
| 11 | 2023-10-26 | 2023-11-23 | 28 | 12 | RATÉ |
| 12 | 2023-11-23 | 2023-12-03 | 10 | 5 | RÉUSSI |
| 13 | 2023-12-03 | 2024-01-02 | 30 | 15 | en cours (+5.1 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-05-16 | 126 | 44 | RÉUSSI |
| 2 | 2023-05-16 | 2023-06-27 | 42 | 27 | RÉUSSI |
| 3 | 2023-06-27 | 2023-10-26 | 121 | 58 | RÉUSSI |
| 4 | 2023-10-26 | 2024-01-02 | 68 | 34 | en cours (+0.8 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-04-09 | 89 | 28 | RÉUSSI |
| 2 | 2023-04-09 | 2023-05-17 | 38 | 17 | RÉUSSI |
| 3 | 2023-05-17 | 2023-06-22 | 36 | 22 | RÉUSSI |
| 4 | 2023-06-22 | 2023-07-19 | 27 | 14 | RÉUSSI |
| 5 | 2023-07-19 | 2023-09-11 | 54 | 19 | RATÉ |
| 6 | 2023-09-11 | 2023-09-28 | 17 | 12 | RÉUSSI |
| 7 | 2023-09-28 | 2023-10-26 | 28 | 16 | RÉUSSI |
| 8 | 2023-10-26 | 2023-11-23 | 28 | 14 | RATÉ |
| 9 | 2023-11-23 | 2023-12-08 | 15 | 8 | RÉUSSI |
| 10 | 2023-12-08 | 2024-01-02 | 25 | 12 | en cours (+1.5 %) |

### R. RSI(2) US500 journalier — risque 0.3 % (meilleur en 2023)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-10-19 | 2023-10-31 | 12 | 1 | en cours (-0.1 %) |

### R. RSI(2) US500 journalier — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-10-19 | 2023-10-31 | 12 | 1 | en cours (-0.2 %) |

### R. RSI(2) US500 journalier — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-10-19 | 2023-10-31 | 12 | 1 | en cours (-0.5 %) |

### C+R. FVG + RSI(2) — risque 1.25 % (meilleur en 2023)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-02-07 | 28 | 8 | RATÉ |
| 2 | 2023-02-07 | 2023-03-08 | 29 | 5 | RÉUSSI |
| 3 | 2023-03-08 | 2023-04-06 | 29 | 14 | RÉUSSI |
| 4 | 2023-04-06 | 2023-05-03 | 27 | 14 | RÉUSSI |
| 5 | 2023-05-03 | 2023-06-02 | 30 | 11 | RÉUSSI |
| 6 | 2023-06-02 | 2023-06-27 | 25 | 18 | RÉUSSI |
| 7 | 2023-06-27 | 2023-07-19 | 22 | 11 | RÉUSSI |
| 8 | 2023-07-19 | 2023-09-08 | 51 | 17 | RATÉ |
| 9 | 2023-09-08 | 2023-09-28 | 20 | 14 | RÉUSSI |
| 10 | 2023-09-28 | 2023-10-26 | 28 | 16 | RÉUSSI |
| 11 | 2023-10-26 | 2023-11-23 | 28 | 12 | RATÉ |
| 12 | 2023-11-23 | 2023-12-03 | 10 | 5 | RÉUSSI |
| 13 | 2023-12-03 | 2024-01-02 | 30 | 15 | en cours (+5.1 %) |

### C+R. FVG + RSI(2) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-05-16 | 126 | 44 | RÉUSSI |
| 2 | 2023-05-16 | 2023-06-27 | 42 | 27 | RÉUSSI |
| 3 | 2023-06-27 | 2023-10-26 | 121 | 58 | RÉUSSI |
| 4 | 2023-10-26 | 2024-01-02 | 68 | 34 | en cours (+0.8 %) |

### C+R. FVG + RSI(2) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2023-01-10 | 2023-04-09 | 89 | 28 | RÉUSSI |
| 2 | 2023-04-09 | 2023-05-17 | 38 | 17 | RÉUSSI |
| 3 | 2023-05-17 | 2023-06-22 | 36 | 22 | RÉUSSI |
| 4 | 2023-06-22 | 2023-07-19 | 27 | 14 | RÉUSSI |
| 5 | 2023-07-19 | 2023-09-11 | 54 | 19 | RATÉ |
| 6 | 2023-09-11 | 2023-09-28 | 17 | 12 | RÉUSSI |
| 7 | 2023-09-28 | 2023-10-26 | 28 | 16 | RÉUSSI |
| 8 | 2023-10-26 | 2023-11-23 | 28 | 14 | RATÉ |
| 9 | 2023-11-23 | 2023-12-08 | 15 | 8 | RÉUSSI |
| 10 | 2023-12-08 | 2024-01-02 | 25 | 12 | en cours (+1.5 %) |
