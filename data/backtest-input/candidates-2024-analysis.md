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
| A. Combo actuel | 518 | 25 % | 3.11 | +3.9 | +0.007 | 0.09 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 195 | 22 % | 4.06 | +24.4 | +0.125 | 0.75 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 189 | 21 % | 4.54 | +35.5 | +0.188 | 1.02 |
| R. RSI(2) US500 journalier | 14 | 86 % | 2.01 | +3.2 | +0.230 | 4.10 |
| C+R. FVG + RSI(2) | 203 | 26 % | 3.59 | +38.7 | +0.191 | 1.11 |

### Part de chaque paire dans FVG (variante C, 2024, trades isolés)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 167 | 20 % | +17.5 |
| XAUUSD | 39 | 23 % | +17.9 |

## 3. 2024 — cycles FTMO 1-Step (+10 %) par risque par trade

Critère du « meilleur % » : réussis − ratés, puis le moins de ratés, puis la plus petite baisse. Colonne 2025 : le même critère sur 2025, pour voir si le risque choisi tient sur une autre année.

| Variante | Risque | Réussis | Ratés | En cours | Compte continu 2024 | Pire baisse du compte continu | 2025 : réussis / ratés |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 1 | 1 | (-5.3 %) | +0.2 % | 12.6 % | 2 / 1 |
| A. Combo actuel | 0.5 % | 3 | 4 | (-4.3 %) | -0.6 % | 20.4 % | 4 / 2 |
| A. Combo actuel | 0.75 % | 6 | 9 | (-5.7 %) | -2.8 % | 29.8 % | 10 / 7 |
| A. Combo actuel | 1 % | 9 | 13 | (-5.3 %) | +8.2 % | 32.6 % | 12 / 10 |
| A. Combo actuel | 1.25 % | 12 | 18 | (-8.3 %) | +7.2 % | 39.8 % | 15 / 14 |
| A. Combo actuel | 1.5 % | 13 | 21 | (-4.5 %) | +8.5 % | 44.7 % | 16 / 17 |
| A. Combo actuel | 2 % | 20 | 32 | (-6.3 %) | -16.6 % | 70.4 % | 26 / 32 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 1 | 0 | (-4.7 %) | +7.1 % | 6.0 % | 1 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.5 % | 1 | 0 | (+0.8 %) | +11.5 % | 9.9 % | 3 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.75 % | 3 | 3 | (-0.8 %) | +16.5 % | 14.6 % | 4 / 0 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1 % | 4 | 5 | (-4.5 %) | +20.2 % | 17.5 % | 7 / 3 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.25 % | 9 | 8 | (-8.0 %) | +23.9 % | 21.6 % | 9 / 5 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 1.5 % | 10 | 9 | — | +27.0 % | 25.5 % | 11 / 8 |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 2 % | 12 | 15 | (-8.8 %) | +11.8 % | 45.5 % | 11 / 12 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.3 % | 1 | 0 | (+0.2 %) | +10.6 % | 6.0 % | 2 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 2 | 0 | (-7.4 %) | +17.5 % | 9.9 % | 3 / 0 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.75 % | 4 | 3 | (-0.8 %) | +25.8 % | 14.6 % | 5 / 1 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1 % | 6 | 5 | (-4.5 %) | +32.8 % | 17.5 % | 8 / 4 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.25 % | 8 | 7 | (-8.0 %) | +39.9 % | 21.6 % | 11 / 5 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 1.5 % | 9 | 10 | — | +46.4 % | 25.5 % | 13 / 8 |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 2 % | 13 | 15 | (-8.8 %) | +48.1 % | 45.5 % | 13 / 13 |
| R. RSI(2) US500 journalier | 0.3 % | 0 | 0 | (+1.0 %) | +1.0 % | 0.1 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.5 % | 0 | 0 | (+1.6 %) | +1.6 % | 0.1 % | 0 / 0 |
| R. RSI(2) US500 journalier | 0.75 % | 0 | 0 | (+2.4 %) | +2.4 % | 0.2 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1 % | 0 | 0 | (+3.3 %) | +3.3 % | 0.2 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.25 % | 0 | 0 | (+4.1 %) | +4.1 % | 0.3 % | 0 / 0 |
| R. RSI(2) US500 journalier | 1.5 % | 0 | 0 | (+4.9 %) | +4.9 % | 0.3 % | 0 / 0 |
| R. RSI(2) US500 journalier | 2 % | 0 | 0 | (+6.6 %) | +6.6 % | 0.4 % | 0 / 0 |
| C+R. FVG + RSI(2) | 0.3 % | 1 | 0 | (+0.5 %) | +11.7 % | 5.9 % | 2 / 0 |
| C+R. FVG + RSI(2) | 0.5 % | 2 | 0 | (-7.0 %) | +19.4 % | 9.7 % | 3 / 0 |
| C+R. FVG + RSI(2) | 0.75 % | 4 | 3 | — | +28.9 % | 14.3 % | 5 / 1 |
| C+R. FVG + RSI(2) | 1 % | 6 | 4 | (-4.5 %) | +36.8 % | 17.1 % | 8 / 4 |
| C+R. FVG + RSI(2) | 1.25 % | 8 | 6 | (-7.3 %) | +45.2 % | 21.1 % | 11 / 5 |
| C+R. FVG + RSI(2) | 1.5 % | 9 | 10 | — | +52.1 % | 24.9 % | 13 / 8 |
| C+R. FVG + RSI(2) | 2 % | 14 | 15 | (-8.8 %) | +55.2 % | 44.9 % | 13 / 12 |

| Variante | Meilleur % en 2024 | Meilleur % en 2025 |
|---|---|---|
| A. Combo actuel | 0.3 % | 0.75 % |
| C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels | 0.3 % | 0.75 % |
| C. FVG US100 (1:5) + XAUUSD (1:7) | 0.5 % | 1.25 % |
| R. RSI(2) US500 journalier | 0.3 % | 0.3 % |
| C+R. FVG + RSI(2) | 0.5 % | 1.25 % |

## 4. 2024 — dates de passage / perte

### A. Combo actuel — risque 0.3 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-06-10 | 160 | 210 | RATÉ |
| 2 | 2024-06-10 | 2024-10-09 | 121 | 188 | RÉUSSI |
| 3 | 2024-10-09 | 2024-12-31 | 83 | 122 | en cours (-5.3 %) |

### A. Combo actuel — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-01-22 | 20 | 31 | RÉUSSI |
| 2 | 2024-01-22 | 2024-04-10 | 80 | 110 | RATÉ |
| 3 | 2024-04-10 | 2024-06-12 | 63 | 75 | RATÉ |
| 4 | 2024-06-12 | 2024-09-09 | 89 | 134 | RATÉ |
| 5 | 2024-09-09 | 2024-09-20 | 11 | 20 | RÉUSSI |
| 6 | 2024-09-20 | 2024-10-09 | 19 | 26 | RÉUSSI |
| 7 | 2024-10-09 | 2024-12-16 | 68 | 101 | RATÉ |
| 8 | 2024-12-16 | 2024-12-31 | 15 | 19 | en cours (-4.3 %) |

### A. Combo actuel — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-02 | 2024-01-09 | 8 | 11 | RÉUSSI |
| 2 | 2024-01-09 | 2024-02-07 | 29 | 50 | RATÉ |
| 3 | 2024-02-07 | 2024-02-15 | 8 | 15 | RÉUSSI |
| 4 | 2024-02-15 | 2024-03-07 | 21 | 22 | RATÉ |
| 5 | 2024-03-07 | 2024-04-09 | 33 | 41 | RATÉ |
| 6 | 2024-04-09 | 2024-05-07 | 28 | 34 | RATÉ |
| 7 | 2024-05-07 | 2024-05-07 | 0 | 2 | RÉUSSI |
| 8 | 2024-05-07 | 2024-06-03 | 27 | 25 | RATÉ |
| 9 | 2024-06-03 | 2024-06-12 | 9 | 19 | RATÉ |
| 10 | 2024-06-12 | 2024-06-20 | 7 | 10 | RÉUSSI |
| 11 | 2024-06-20 | 2024-07-24 | 35 | 55 | RATÉ |
| 12 | 2024-07-24 | 2024-08-05 | 12 | 16 | RATÉ |
| 13 | 2024-08-05 | 2024-08-14 | 9 | 17 | RÉUSSI |
| 14 | 2024-08-14 | 2024-08-30 | 16 | 26 | RATÉ |
| 15 | 2024-08-30 | 2024-09-24 | 25 | 36 | RÉUSSI |
| 16 | 2024-09-24 | 2024-10-07 | 13 | 17 | RÉUSSI |
| 17 | 2024-10-07 | 2024-10-15 | 8 | 8 | RÉUSSI |
| 18 | 2024-10-15 | 2024-10-28 | 13 | 19 | RATÉ |
| 19 | 2024-10-28 | 2024-11-11 | 14 | 20 | RÉUSSI |
| 20 | 2024-11-11 | 2024-11-19 | 7 | 13 | RATÉ |
| 21 | 2024-11-19 | 2024-12-09 | 21 | 33 | RATÉ |
| 22 | 2024-12-09 | 2024-12-18 | 9 | 18 | RATÉ |
| 23 | 2024-12-18 | 2024-12-31 | 13 | 16 | en cours (-5.3 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.3 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-11-11 | 307 | 169 | RÉUSSI |
| 2 | 2024-11-11 | 2024-12-31 | 50 | 25 | en cours (-4.7 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-08-21 | 225 | 128 | RÉUSSI |
| 2 | 2024-08-21 | 2024-12-31 | 132 | 67 | en cours (+0.8 %) |

### C0. FVG US100 (1:5) + XAUUSD (1:4) — RRR actuels — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-02-05 | 27 | 12 | RATÉ |
| 2 | 2024-02-05 | 2024-04-15 | 70 | 26 | RATÉ |
| 3 | 2024-04-15 | 2024-06-11 | 57 | 34 | RATÉ |
| 4 | 2024-06-11 | 2024-06-25 | 14 | 11 | RÉUSSI |
| 5 | 2024-06-25 | 2024-07-09 | 14 | 12 | RÉUSSI |
| 6 | 2024-07-09 | 2024-08-12 | 34 | 24 | RATÉ |
| 7 | 2024-08-12 | 2024-08-23 | 11 | 8 | RÉUSSI |
| 8 | 2024-08-23 | 2024-11-11 | 80 | 42 | RÉUSSI |
| 9 | 2024-11-11 | 2024-12-20 | 39 | 20 | RATÉ |
| 10 | 2024-12-20 | 2024-12-31 | 11 | 4 | en cours (-4.5 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 0.5 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-08-16 | 220 | 123 | RÉUSSI |
| 2 | 2024-08-16 | 2024-11-11 | 87 | 41 | RÉUSSI |
| 3 | 2024-11-11 | 2024-12-31 | 50 | 24 | en cours (-7.4 %) |

### C. FVG US100 (1:5) + XAUUSD (1:7) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-09 | 2024-02-05 | 27 | 12 | RATÉ |
| 2 | 2024-02-05 | 2024-04-15 | 70 | 26 | RATÉ |
| 3 | 2024-04-15 | 2024-06-11 | 57 | 34 | RATÉ |
| 4 | 2024-06-11 | 2024-06-25 | 14 | 11 | RÉUSSI |
| 5 | 2024-06-25 | 2024-07-09 | 14 | 12 | RÉUSSI |
| 6 | 2024-07-09 | 2024-07-18 | 9 | 8 | RÉUSSI |
| 7 | 2024-07-18 | 2024-08-14 | 27 | 17 | RATÉ |
| 8 | 2024-08-14 | 2024-08-21 | 7 | 2 | RÉUSSI |
| 9 | 2024-08-21 | 2024-09-20 | 30 | 23 | RÉUSSI |
| 10 | 2024-09-20 | 2024-11-13 | 54 | 18 | RÉUSSI |
| 11 | 2024-11-13 | 2024-12-20 | 37 | 19 | RATÉ |
| 12 | 2024-12-20 | 2024-12-31 | 11 | 4 | en cours (-4.5 %) |

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

### C+R. FVG + RSI(2) — risque 0.5 % (meilleur en 2024)

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-07-18 | 197 | 110 | RÉUSSI |
| 2 | 2024-07-18 | 2024-11-11 | 116 | 66 | RÉUSSI |
| 3 | 2024-11-11 | 2024-12-31 | 50 | 26 | en cours (-7.0 %) |

### C+R. FVG + RSI(2) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2024-01-03 | 2024-02-05 | 33 | 14 | RATÉ |
| 2 | 2024-02-05 | 2024-04-17 | 72 | 28 | RATÉ |
| 3 | 2024-04-17 | 2024-05-13 | 26 | 17 | RÉUSSI |
| 4 | 2024-05-13 | 2024-06-11 | 29 | 17 | RATÉ |
| 5 | 2024-06-11 | 2024-06-25 | 14 | 11 | RÉUSSI |
| 6 | 2024-06-25 | 2024-07-09 | 14 | 12 | RÉUSSI |
| 7 | 2024-07-09 | 2024-07-18 | 9 | 8 | RÉUSSI |
| 8 | 2024-07-18 | 2024-08-26 | 39 | 26 | RÉUSSI |
| 9 | 2024-08-26 | 2024-11-11 | 77 | 40 | RÉUSSI |
| 10 | 2024-11-11 | 2024-12-20 | 39 | 21 | RATÉ |
| 11 | 2024-12-20 | 2024-12-31 | 11 | 4 | en cours (-4.5 %) |
