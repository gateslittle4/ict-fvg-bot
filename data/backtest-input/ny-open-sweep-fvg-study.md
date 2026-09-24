# Sweep de la nuit + déplacement à 9:30 + FVG — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-ny-open-sweep-fvg-2026-09-24.md` (commité avant ce calcul). Script : `scripts/runNyOpenSweepFvgStudy.js`, règles `scripts/lib/nyOpenSweepFvg.js` (testées). R par trade, réglé à la minute, spread par défaut.

- US100 : 4912 jours, 115 configurations, 87 ordres remplis
- US500 : 4913 jours, 102 configurations, 79 ordres remplis

| Paire | Période | Trades | Gagnants | Achats / ventes | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|---|
| US100 (principale) | Entraînement 2010-2022 | 77 | 39 % | 26 / 51 | 4.4 R | +29.2 | +0.380 | 1.36 |
| US100 (principale) | 2010-2016 | 39 | 31 % | 10 / 29 | 4.7 R | +2.4 | +0.061 | 0.21 |
| US100 (principale) | 2017-2022 | 38 | 47 % | 16 / 22 | 4.1 R | +26.9 | +0.707 | 1.47 |
| US100 (principale) | Test 2023-2025 | 7 | 14 % | 3 / 4 | 3.4 R | -3.7 | -0.525 | -1.10 |
| US100 (principale) | 2026 (→ 21/09) | 3 | 0 % | 2 / 1 | 5.4 R | -3.0 | -1.000 | 0.00 |
| US500 (contrôle) | Entraînement 2010-2022 | 66 | 30 % | 24 / 42 | 4.2 R | +6.3 | +0.096 | 0.43 |
| US500 (contrôle) | 2010-2016 | 30 | 23 % | 9 / 21 | 4.5 R | -4.4 | -0.146 | -0.51 |
| US500 (contrôle) | 2017-2022 | 36 | 36 % | 15 / 21 | 3.9 R | +10.7 | +0.298 | 0.89 |
| US500 (contrôle) | Test 2023-2025 | 10 | 30 % | 4 / 6 | 4.3 R | +3.2 | +0.319 | 0.42 |
| US500 (contrôle) | 2026 (→ 21/09) | 3 | 33 % | 2 / 1 | 3.4 R | -0.4 | -0.122 | -0.14 |

## Verdict (US100, critère pré-enregistré)

Entraînement : 77 trades, +0.380 R/trade, t 1.36, 2010-2016 +2.4 R, 2017-2022 +26.9 R ; test : 7 trades, -3.7 R → **ÉCHEC à l'entraînement**

## Sorties (US100, toutes périodes)

- target : 17
- stop : 55
- close : 15

## Limites

- Idée née d'une seule journée (24/09, hors données) ; HistData ≠ prix du broker ; spread par défaut, pas de glissement.
