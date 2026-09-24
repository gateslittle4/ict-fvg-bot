# Retour à la moyenne la nuit (idée « nuit calme » d'Esdras) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-calm-night-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runCalmNightStudy.js`. Nuit : moyenne depuis 18:00 NY, contrôles M15 20:00-01:00, sortie 02:00 ; séance : moyenne depuis 9:30, contrôles 10:00-15:00, sortie 16:00. Écart ≥ 1,5 × ATR14 (M15) → pari de retour vers la moyenne, stop 1,5 × ATR, un trade par fenêtre, spread par défaut. Détail d'exécution : si l'ouverture de la minute suivante a déjà dépassé la moyenne, pas de trade.

## Critère pré-enregistré (nuit, jambes principales)

| Indice | Entraînement : trades, R moyen, t | 2010-2016 | 2017-2022 | Test 2023-2025 : trades, R moyen | Nuit − séance (entraînement / test) | Verdict |
|---|---|---|---|---|---|---|
| US100 | 2704, -0.019 R, t -0.93 | -37.0 R | -13.3 R | 667, -0.039 R (total -26.0) | +0.035 / +0.012 | **ÉCHEC à l'entraînement** |
| US500 | 2595, -0.029 R, t -1.43 | -36.9 R | -38.8 R | 650, -0.094 R (total -60.8) | +0.032 / +0.005 | **ÉCHEC à l'entraînement** |

## Toutes les jambes (nuit et séance, contrôles compris)

| Indice | Fenêtre | Période | Trades | Gagnants | R moyen | Total | t | Sorties à l'objectif / stop / fin de fenêtre |
|---|---|---|---|---|---|---|---|---|
| US100 | Nuit | Entraînement 2010-2022 | 2704 | 45 % | -0.019 | -50.2 | -0.93 | 935 / 1278 / 491 |
| US100 | Nuit | Test 2023-2025 | 667 | 45 % | -0.039 | -26.0 | -1.00 | 216 / 305 / 146 |
| US100 | Nuit | 2026 (→ fin des données) | 164 | 45 % | +0.027 | +4.4 | 0.32 | 63 / 75 / 26 |
| US100 | Séance NY | Entraînement 2010-2022 | 2719 | 43 % | -0.054 | -146.5 | -2.67 | 984 / 1383 / 352 |
| US100 | Séance NY | Test 2023-2025 | 656 | 43 % | -0.051 | -33.4 | -1.25 | 235 / 331 / 90 |
| US100 | Séance NY | 2026 (→ fin des données) | 152 | 51 % | +0.060 | +9.2 | 0.71 | 58 / 68 / 26 |
| US500 | Nuit | Entraînement 2010-2022 | 2595 | 45 % | -0.029 | -75.6 | -1.43 | 827 / 1204 / 564 |
| US500 | Nuit | Test 2023-2025 | 650 | 44 % | -0.094 | -60.8 | -2.39 | 199 / 319 / 132 |
| US500 | Nuit | 2026 (→ fin des données) | 166 | 46 % | -0.002 | -0.3 | -0.03 | 63 / 73 / 30 |
| US500 | Séance NY | Entraînement 2010-2022 | 2688 | 43 % | -0.061 | -164.1 | -3.00 | 957 / 1382 / 349 |
| US500 | Séance NY | Test 2023-2025 | 672 | 41 % | -0.098 | -65.9 | -2.44 | 228 / 352 / 92 |
| US500 | Séance NY | 2026 (→ fin des données) | 151 | 39 % | -0.142 | -21.5 | -1.69 | 49 / 84 / 18 |
| XAUUSD | Nuit | Entraînement 2010-2022 | 3049 | 44 % | -0.049 | -150.8 | -2.54 | 1107 / 1598 / 344 |
| XAUUSD | Nuit | Test 2023-2025 | 718 | 44 % | -0.034 | -24.2 | -0.83 | 291 / 386 / 41 |
| XAUUSD | Nuit | 2026 (→ fin des données) | 173 | 42 % | -0.039 | -6.8 | -0.46 | 67 / 95 / 11 |
| XAUUSD | Séance NY | Entraînement 2010-2022 | 2243 | 48 % | -0.007 | -15.6 | -0.35 | 565 / 840 / 838 |
| XAUUSD | Séance NY | Test 2023-2025 | 522 | 49 % | -0.003 | -1.4 | -0.07 | 131 / 185 / 206 |
| XAUUSD | Séance NY | 2026 (→ fin des données) | 137 | 47 % | -0.074 | -10.1 | -0.94 | 32 / 59 / 46 |
| EURUSD | Nuit | Entraînement 2010-2022 | 3066 | 41 % | -0.133 | -409.2 | -7.14 | 1051 / 1700 / 315 |
| EURUSD | Nuit | Test 2023-2025 | 714 | 38 % | -0.179 | -127.9 | -4.65 | 241 / 419 / 54 |
| EURUSD | Nuit | 2026 (→ fin des données) | 176 | 39 % | -0.186 | -32.7 | -2.50 | 58 / 96 / 22 |
| EURUSD | Séance NY | Entraînement 2010-2022 | 2437 | 47 % | -0.046 | -113.1 | -2.62 | 563 / 868 / 1006 |
| EURUSD | Séance NY | Test 2023-2025 | 587 | 45 % | -0.071 | -41.9 | -1.96 | 152 / 216 / 219 |
| EURUSD | Séance NY | 2026 (→ fin des données) | 138 | 46 % | -0.102 | -14.1 | -1.38 | 31 / 54 / 53 |

## Limites

- Spread constant (relevé réel de 4 jours : pas plus large la nuit, compte démo).
- Paramètres choisis a priori, un seul essai ; 2 indices très corrélés.
- HistData ≠ prix du broker.
