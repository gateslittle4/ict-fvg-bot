# « Cahier des charges 100 % FVG » de Gemini — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-gemini-fvg-2026-09-30.md` (commit `af34ee6`, avant ce calcul). Script : `scripts/runGeminiFvgStudy.js`, signaux `scripts/lib/geminiFvg.js` (testés). R net de spread et de swap, rapporté au risque réel |exécution − stop|. Entraînement réglé à la bougie M15 (stop d'abord), test et forward à la minute. Généré le 2026-09-30T01:07 UTC.

## US100 + US500

| Période | Trades | Gagnants | Cible moyenne (R) | R moyen | R total | t |
|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 24102 | 25 % | 5.68 | +0.033 | +801.6 | 2.06 |
|   dont 2010-2016 | 12648 | 26 % | 5.25 | +0.023 | +290.9 | 1.07 |
|   dont 2017-2022 | 11454 | 24 % | 6.15 | +0.045 | +510.6 | 1.83 |
| Test 2023-2025 | 5164 | 23 % | 6.16 | -0.021 | -109.0 | -0.61 |
| Forward 2026 | 1339 | 26 % | 6.25 | +0.129 | +172.8 | 1.57 |

## US100

| Période | Trades | Gagnants | Cible moyenne (R) | R moyen | R total | t |
|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 11998 | 24 % | 6.25 | +0.037 | +441.8 | 1.59 |
|   dont 2010-2016 | 6203 | 25 % | 5.93 | +0.010 | +59.9 | 0.30 |
|   dont 2017-2022 | 5795 | 24 % | 6.59 | +0.066 | +381.8 | 1.95 |
| Test 2023-2025 | 2731 | 24 % | 6.52 | +0.018 | +48.2 | 0.35 |
| Forward 2026 | 723 | 25 % | 7.39 | +0.086 | +62.3 | 0.79 |

## US500

| Période | Trades | Gagnants | Cible moyenne (R) | R moyen | R total | t |
|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 12104 | 26 % | 5.11 | +0.030 | +359.8 | 1.32 |
|   dont 2010-2016 | 6445 | 27 % | 4.60 | +0.036 | +231.0 | 1.25 |
|   dont 2017-2022 | 5659 | 25 % | 5.69 | +0.023 | +128.8 | 0.64 |
| Test 2023-2025 | 2433 | 23 % | 5.76 | -0.065 | -157.2 | -1.36 |
| Forward 2026 | 616 | 27 % | 4.91 | +0.179 | +110.5 | 1.43 |

## Par sens (US100 + US500)

| Période | Achats : trades / R total / t | Ventes : trades / R total / t |
|---|---|---|
| Entraînement 2010-2022 | 11570 / +922.5 / 3.54 | 12532 / -120.9 / -0.42 |
| Test 2023-2025 | 2455 / +95.5 / 0.81 | 2709 / -204.5 / -1.52 |
| Forward 2026 | 689 / +156.4 / 1.75 | 650 / +16.4 / 0.25 |

## Verdict (fixé à l'avance)

**ÉCHEC à l'entraînement** (R moyen +0.033, t 2.06 pour 2,6 exigé ; 2010-2016 +290.9 R, 2017-2022 +510.6 R)

Forward 2026 (n'entre pas dans le verdict) : 1339 trades, +172.8 R, t 1.57.
