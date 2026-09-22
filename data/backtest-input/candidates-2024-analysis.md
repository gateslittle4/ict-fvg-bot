# Candidates 2024 : FVG US100+XAUUSD, RSI(2) US500, les deux ensemble, contre le combo actuel

Vrai `LiveStrategyEngine` (FVG, combo) et vraie classe `DailyAlertEngine` (RSI(2)) sur `data/real-m1-full` reconstruit en M15, règlement M1 exact, spread + **swap réel du broker** (relevé du 2026-09-22). FTMO 1-Step réel (`buildEffectiveConfig` : +10 %, perte max 10 % trailing fin de journée, perte quotidienne), simulé **par événements** (P&L à la sortie : dates exactes). Garde-fou du bot (3 trades/jour, pause 30 min) partagé entre toutes les stratégies d'une variante. Limites : perte quotidienne sur P&L clôturé (pas l'équité flottante), pas de commission (≈ 0 sur les trades réels) ni de glissement réel, taux de swap d'aujourd'hui appliqués au passé, 2024 = année complète.

**Attention : 2024 fait partie de l'entraînement (< 2025)** sur lequel FVG seul, le retrait de US500 et les RRR ont été choisis. Ce n'est donc PAS une année indépendante : elle dit si l'idée tenait déjà cette année-là, pas si elle marchera. La colonne 2025 reste, elle, hors échantillon.

## 1. Meilleur RRR pour FVG (choisi sur l'entraînement, 2024 lu ensuite)

Par paire, trades isolés (sans garde-fou), R net avec spread + swap. Le netting est par paire, donc le RRR d'une paire ne change pas les trades de l'autre.

| Paire | RRR | Trades entr. | Gagnants entr. | R net entraînement | R net 2025 | R net 2024 | R/trade 2024 |
|---|---|---|---|---|---|---|---|
| US100 | 1:2 | 312 | 35 % | -14.8 | +9.0 | -17.8 | -0.103 |
| US100 | 1:3 | 308 | 28 % | +1.3 | +31.0 | -17.3 | -0.100 |
| US100 | 1:4 | 302 | 25 % | +36.9 | +45.5 | +3.4 | +0.020 |
| US100 | 1:5 (actuel) | 295 | 23 % | +81.7 | +58.3 | +17.5 | +0.105 |
| US100 | 1:6 | 287 | 18 % | +39.3 | +82.4 | -11.4 | -0.069 |
| US100 | 1:7 | 287 | 15 % | +9.6 | +112.5 | -26.6 | -0.161 |
| XAUUSD | 1:2 | 131 | 40 % | +11.7 | +19.6 | +12.3 | +0.242 |
| XAUUSD | 1:3 | 121 | 30 % | +2.5 | +9.7 | +9.8 | +0.209 |
| XAUUSD | 1:4 (actuel) | 117 | 27 % | +11.3 | +12.3 | +6.8 | +0.151 |
| XAUUSD | 1:5 | 115 | 25 % | +15.4 | +11.3 | +4.3 | +0.098 |
| XAUUSD | 1:6 | 110 | 23 % | +14.6 | +15.4 | +12.4 | +0.310 |
| XAUUSD | 1:7 | 108 | 22 % | +17.1 | +21.4 | +17.9 | +0.459 |

**RRR retenu sur l'entraînement : US100 1:5, XAUUSD 1:7** (actuellement 1:5 et 1:4).

## 2. 2024 — trades (garde-fou du bot, compte continu)

| Variante | Trades | Win rate | RRR réalisé (gain moy. / perte moy.) | R net | R/trade | t |
|---|---|---|---|---|---|---|
| A. Combo actuel | 482 | 26 % | 3.12 | +44.5 | +0.092 | 1.01 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 161 | 26 % | 4.08 | +56.6 | +0.351 | 1.81 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 155 | 25 % | 4.57 | +67.7 | +0.437 | 2.01 |
| R. RSI(2) US500 journalier | 14 | 86 % | 2.01 | +3.2 | +0.230 | 4.10 |
| C+R. FVG + RSI(2) | 169 | 30 % | 3.61 | +70.9 | +0.419 | 2.11 |

### Part de chaque paire dans FVG (variante C, 2024, trades isolés)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 167 | 20 % | +17.5 |
| XAUUSD | 39 | 23 % | +17.9 |

## 3. 2024 — cycles FTMO 1-Step (+10 %) par risque par trade

Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.

| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2024 | Pire baisse du compte continu | 2025 : réussis / ratés |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 1 | 0 | (+2.2 %) | +13.2 % | 9.3 % | 3 / 0 |
| A. Combo actuel | 0.5 % | 4 | 4 | (-1.5 %) | +21.8 % | 15.2 % | 6 / 1 |
| A. Combo actuel | 0.75 % | 8 | 6 | (-4.2 %) | +31.9 % | 22.2 % | 9 / 2 |
| A. Combo actuel | 1 % | 11 | 10 | (-5.6 %) | +44.6 % | 25.1 % | 15 / 9 |
| A. Combo actuel | 1.25 % | 13 | 14 | (-6.4 %) | +54.1 % | 30.8 % | 18 / 12 |
| A. Combo actuel | 1.5 % | 15 | 19 | (-9.1 %) | +70.1 % | 33.1 % | 20 / 13 |
| A. Combo actuel | 2 % | 23 | 26 | (-6.0 %) | +54.5 % | 57.4 % | 30 / 24 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 2 | 0 | (-2.8 %) | +17.9 % | 4.5 % | 2 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.5 % | 3 | 0 | (-3.5 %) | +31.0 % | 7.4 % | 4 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.75 % | 4 | 1 | (-6.0 %) | +48.5 % | 11.0 % | 5 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 7 | 2 | (-9.1 %) | +70.9 % | 13.6 % | 7 / 1 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 8 | 5 | (-1.3 %) | +92.4 % | 16.9 % | 9 / 1 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 9 | 5 | (-3.1 %) | +115.3 % | 20.1 % | 11 / 3 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 2 % | 15 | 12 | (-8.1 %) | +74.8 % | 34.4 % | 14 / 7 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.3 % | 2 | 0 | (-2.1 %) | +21.8 % | 4.5 % | 2 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 3 | 0 | (-3.1 %) | +38.0 % | 7.4 % | 4 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.75 % | 5 | 1 | (-4.6 %) | +60.3 % | 11.0 % | 6 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 7 | 2 | (-7.2 %) | +88.6 % | 13.6 % | 8 / 1 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 8 | 4 | (-1.3 %) | +117.0 % | 16.9 % | 11 / 2 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.5 % | 9 | 7 | (-3.1 %) | +147.9 % | 20.1 % | 12 / 4 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 2 % | 16 | 12 | (-8.1 %) | +131.4 % | 34.4 % | 14 / 7 |
| R. RSI(2) US500 journalier | 0.3 % | 0 | 0 | (+1.0 %) | +1.0 % | 0.1 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.5 % | 0 | 0 | (+1.6 %) | +1.6 % | 0.1 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.75 % | 0 | 0 | (+2.4 %) | +2.4 % | 0.2 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1 % | 0 | 0 | (+3.3 %) | +3.3 % | 0.2 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.25 % | 0 | 0 | (+4.1 %) | +4.1 % | 0.3 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.5 % | 0 | 0 | (+4.9 %) | +4.9 % | 0.3 % | 0 / 0 |
| R. RSI(2) US500 journalier | 2 % | 0 | 0 | (+6.6 %) | +6.6 % | 0.4 % | 0 / 0 |
| C+R. FVG + RSI(2) | 0.3 % | 2 | 0 | (-1.9 %) | +23.0 % | 4.3 % | 2 / 0 |
| C+R. FVG + RSI(2) | 0.5 % | 3 | 0 | (+4.1 %) | +40.3 % | 7.2 % | 4 / 0 |
| C+R. FVG + RSI(2) | 0.75 % | 6 | 1 | (-6.5 %) | +64.2 % | 10.7 % | 6 / 0 |
| C+R. FVG + RSI(2) | 1 % | 7 | 2 | (-6.5 %) | +94.8 % | 13.2 % | 7 / 0 |
| C+R. FVG + RSI(2) | 1.25 % | 8 | 4 | — | +125.8 % | 16.4 % | 11 / 2 |
| C+R. FVG + RSI(2) | 1.5 % | 9 | 7 | (-3.1 %) | +158.5 % | 19.5 % | 12 / 4 |
| C+R. FVG + RSI(2) | 2 % | 15 | 11 | (-7.0 %) | +143.9 % | 33.6 % | 14 / 6 |

| Variante | Meilleur % en 2024 | Meilleur % en 2025 |
|---|---|---|
| A. Combo actuel | 0.75 % | 0.75 % |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 1.25 % |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 1.25 % |
| R. RSI(2) US500 journalier | 0.3 % | 0.3 % |
| C+R. FVG + RSI(2) | 0.75 % | 1.25 % |

## 4. 2024 — dates de passage / perte

### A. Combo actuel — risque 0.75 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-01-09 | 8 | 11 | RÉUSSI |
| 2 | 2024-01-09 | 2024-02-13 | 35 | 54 | RÉUSSI |
| 3 | 2024-02-13 | 2024-03-26 | 41 | 45 | RATÉ |
| 4 | 2024-03-26 | 2024-06-06 | 72 | 81 | RATÉ |
| 5 | 2024-06-06 | 2024-07-11 | 35 | 54 | RÉUSSI |
| 6 | 2024-07-11 | 2024-08-04 | 24 | 33 | RATÉ |
| 7 | 2024-08-04 | 2024-08-18 | 14 | 22 | RÉUSSI |
| 8 | 2024-08-18 | 2024-09-03 | 16 | 23 | RATÉ |
| 9 | 2024-09-03 | 2024-09-24 | 21 | 29 | RÉUSSI |
| 10 | 2024-09-24 | 2024-10-08 | 14 | 17 | RÉUSSI |
| 11 | 2024-10-08 | 2024-10-21 | 13 | 13 | RÉUSSI |
| 12 | 2024-10-21 | 2024-10-31 | 10 | 18 | RATÉ |
| 13 | 2024-10-31 | 2024-11-11 | 11 | 12 | RÉUSSI |
| 14 | 2024-11-11 | 2024-12-12 | 31 | 47 | RATÉ |
| 15 | 2024-12-12 | 2024-12-31 | 19 | 24 | en cours (-4.2 %) |

### A. Combo actuel — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-01-11 | 10 | 17 | RÉUSSI |
| 2 | 2024-01-11 | 2024-05-07 | 117 | 143 | RATÉ |
| 3 | 2024-05-07 | 2024-06-13 | 37 | 43 | RATÉ |
| 4 | 2024-06-13 | 2024-06-20 | 7 | 12 | RÉUSSI |
| 5 | 2024-06-20 | 2024-09-11 | 83 | 120 | RATÉ |
| 6 | 2024-09-11 | 2024-09-24 | 13 | 22 | RÉUSSI |
| 7 | 2024-09-24 | 2024-10-15 | 21 | 22 | RÉUSSI |
| 8 | 2024-10-15 | 2024-12-30 | 76 | 104 | RATÉ |
| 9 | 2024-12-30 | 2024-12-31 | 1 | 3 | en cours (-1.5 %) |

### A. Combo actuel — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-01-09 | 8 | 10 | RÉUSSI |
| 2 | 2024-01-09 | 2024-01-23 | 14 | 20 | RÉUSSI |
| 3 | 2024-01-23 | 2024-03-07 | 44 | 60 | RATÉ |
| 4 | 2024-03-07 | 2024-04-09 | 33 | 40 | RATÉ |
| 5 | 2024-04-09 | 2024-06-03 | 55 | 56 | RATÉ |
| 6 | 2024-06-03 | 2024-06-13 | 10 | 18 | RATÉ |
| 7 | 2024-06-13 | 2024-06-17 | 4 | 6 | RÉUSSI |
| 8 | 2024-06-17 | 2024-07-05 | 18 | 29 | RÉUSSI |
| 9 | 2024-07-05 | 2024-07-26 | 21 | 34 | RATÉ |
| 10 | 2024-07-26 | 2024-08-18 | 23 | 30 | RÉUSSI |
| 11 | 2024-08-18 | 2024-08-30 | 12 | 20 | RATÉ |
| 12 | 2024-08-30 | 2024-09-11 | 12 | 14 | RATÉ |
| 13 | 2024-09-11 | 2024-09-20 | 9 | 15 | RÉUSSI |
| 14 | 2024-09-20 | 2024-10-02 | 12 | 15 | RÉUSSI |
| 15 | 2024-10-02 | 2024-10-09 | 7 | 11 | RÉUSSI |
| 16 | 2024-10-09 | 2024-10-21 | 12 | 12 | RÉUSSI |
| 17 | 2024-10-21 | 2024-10-28 | 7 | 10 | RATÉ |
| 18 | 2024-10-28 | 2024-11-11 | 14 | 19 | RÉUSSI |
| 19 | 2024-11-11 | 2024-11-19 | 7 | 12 | RATÉ |
| 20 | 2024-11-19 | 2024-11-29 | 11 | 13 | RÉUSSI |
| 21 | 2024-11-29 | 2024-12-12 | 13 | 20 | RATÉ |
| 22 | 2024-12-12 | 2024-12-31 | 19 | 24 | en cours (-5.6 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-04-12 | 94 | 30 | RATÉ |
| 2 | 2024-04-12 | 2024-05-13 | 31 | 16 | RÉUSSI |
| 3 | 2024-05-13 | 2024-06-13 | 31 | 16 | RATÉ |
| 4 | 2024-06-13 | 2024-06-25 | 12 | 9 | RÉUSSI |
| 5 | 2024-06-25 | 2024-07-09 | 14 | 11 | RÉUSSI |
| 6 | 2024-07-09 | 2024-07-18 | 9 | 8 | RÉUSSI |
| 7 | 2024-07-18 | 2024-08-21 | 34 | 19 | RÉUSSI |
| 8 | 2024-08-21 | 2024-10-02 | 42 | 21 | RÉUSSI |
| 9 | 2024-10-02 | 2024-11-29 | 58 | 23 | RÉUSSI |
| 10 | 2024-11-29 | 2024-12-31 | 32 | 8 | en cours (-9.1 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-07-11 | 184 | 85 | RÉUSSI |
| 2 | 2024-07-11 | 2024-08-21 | 41 | 24 | RÉUSSI |
| 3 | 2024-08-21 | 2024-11-11 | 82 | 35 | RÉUSSI |
| 4 | 2024-11-11 | 2024-12-31 | 50 | 17 | en cours (-3.5 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-04-12 | 94 | 30 | RATÉ |
| 2 | 2024-04-12 | 2024-05-13 | 31 | 16 | RÉUSSI |
| 3 | 2024-05-13 | 2024-06-13 | 31 | 16 | RATÉ |
| 4 | 2024-06-13 | 2024-06-25 | 12 | 9 | RÉUSSI |
| 5 | 2024-06-25 | 2024-07-09 | 14 | 11 | RÉUSSI |
| 6 | 2024-07-09 | 2024-07-18 | 9 | 7 | RÉUSSI |
| 7 | 2024-07-18 | 2024-08-16 | 29 | 15 | RÉUSSI |
| 8 | 2024-08-16 | 2024-09-17 | 32 | 17 | RÉUSSI |
| 9 | 2024-09-17 | 2024-11-11 | 55 | 16 | RÉUSSI |
| 10 | 2024-11-11 | 2024-12-31 | 50 | 17 | en cours (-7.2 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-07-11 | 184 | 85 | RÉUSSI |
| 2 | 2024-07-11 | 2024-08-26 | 46 | 22 | RÉUSSI |
| 3 | 2024-08-26 | 2024-11-13 | 80 | 31 | RÉUSSI |
| 4 | 2024-11-13 | 2024-12-31 | 48 | 16 | en cours (-3.1 %) |

### R. RSI(2) US500 journalier — risque 0.3 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-12-23 | 355 | 14 | en cours (+1.0 %) |

### R. RSI(2) US500 journalier — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-12-23 | 355 | 14 | en cours (+1.6 %) |

### R. RSI(2) US500 journalier — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-12-23 | 355 | 14 | en cours (+3.3 %) |

### C+R. FVG + RSI(2) — risque 0.75 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-05-07 | 124 | 44 | RATÉ |
| 2 | 2024-05-07 | 2024-05-10 | 3 | 4 | RÉUSSI |
| 3 | 2024-05-10 | 2024-07-09 | 60 | 40 | RÉUSSI |
| 4 | 2024-07-09 | 2024-07-26 | 17 | 12 | RÉUSSI |
| 5 | 2024-07-26 | 2024-08-21 | 26 | 13 | RÉUSSI |
| 6 | 2024-08-21 | 2024-10-02 | 42 | 21 | RÉUSSI |
| 7 | 2024-10-02 | 2024-11-29 | 58 | 24 | RÉUSSI |
| 8 | 2024-11-29 | 2024-12-31 | 32 | 9 | en cours (-6.5 %) |

### C+R. FVG + RSI(2) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-07-09 | 188 | 88 | RÉUSSI |
| 2 | 2024-07-09 | 2024-08-01 | 23 | 15 | RÉUSSI |
| 3 | 2024-08-01 | 2024-09-20 | 50 | 30 | RÉUSSI |
| 4 | 2024-09-20 | 2024-12-31 | 102 | 36 | en cours (+4.1 %) |

### C+R. FVG + RSI(2) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-04-17 | 105 | 34 | RATÉ |
| 2 | 2024-04-17 | 2024-05-10 | 23 | 12 | RÉUSSI |
| 3 | 2024-05-10 | 2024-06-13 | 34 | 18 | RATÉ |
| 4 | 2024-06-13 | 2024-06-25 | 12 | 9 | RÉUSSI |
| 5 | 2024-06-25 | 2024-07-09 | 14 | 11 | RÉUSSI |
| 6 | 2024-07-09 | 2024-07-18 | 9 | 7 | RÉUSSI |
| 7 | 2024-07-18 | 2024-08-16 | 29 | 18 | RÉUSSI |
| 8 | 2024-08-16 | 2024-09-17 | 32 | 18 | RÉUSSI |
| 9 | 2024-09-17 | 2024-11-11 | 55 | 18 | RÉUSSI |
| 10 | 2024-11-11 | 2024-12-31 | 50 | 19 | en cours (-6.5 %) |
