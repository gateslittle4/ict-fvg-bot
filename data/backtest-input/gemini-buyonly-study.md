# Règle de Gemini, achats seulement, contre placebo — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-gemini-buyonly-2026-09-30.md` (commit `561d856`, avant ce calcul). Script : `scripts/runGeminiBuyOnlyStudy.js`. Placebo : 100 tirages, un achat à une bougie au hasard de la même année par trade réel, mêmes fractions de stop et de cible. R net de spread et de swap. Généré le 2026-09-30T01:15 UTC.

## US100 + US500

| Période | Achats réels | Gagnants | R moyen réel | t | R total | Placebo R moyen (σ) | Écart D | D / σ |
|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 12761 | 27 % | +0.071 | 3.34 | +908.7 | -0.039 (0.019) | +0.110 | 5.7 |
|   dont 2010-2016 | 6639 | 29 % | +0.102 | 3.40 | +677.1 | -0.032 (0.027) | +0.134 | 5.0 |
|   dont 2017-2022 | 6122 | 26 % | +0.038 | 1.25 | +231.6 | -0.047 (0.027) | +0.085 | 3.1 |
| Test 2023-2025 | 2714 | 25 % | +0.035 | 0.75 | +94.6 | +0.000 (0.045) | +0.035 | 0.8 |
| Forward 2026 | 778 | 28 % | +0.213 | 1.81 | +165.3 | -0.042 (0.089) | +0.254 | 2.8 |

## US100

| Période | Achats réels | Gagnants | R moyen réel | t | R total | Placebo R moyen (σ) | Écart D | D / σ |
|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 6368 | 26 % | +0.064 | 2.05 | +409.4 | -0.025 (0.030) | +0.089 | 2.9 |
|   dont 2010-2016 | 3219 | 27 % | +0.088 | 1.93 | +283.9 | -0.018 (0.041) | +0.106 | 2.6 |
|   dont 2017-2022 | 3149 | 25 % | +0.040 | 0.93 | +125.5 | -0.031 (0.044) | +0.071 | 1.6 |
| Test 2023-2025 | 1452 | 24 % | +0.067 | 1.00 | +97.3 | +0.012 (0.069) | +0.055 | 0.8 |
| Forward 2026 | 421 | 27 % | +0.168 | 1.12 | +70.7 | -0.013 (0.133) | +0.181 | 1.4 |

## US500

| Période | Achats réels | Gagnants | R moyen réel | t | R total | Placebo R moyen (σ) | Écart D | D / σ |
|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 6393 | 29 % | +0.078 | 2.69 | +499.3 | -0.053 (0.024) | +0.131 | 5.5 |
|   dont 2010-2016 | 3420 | 30 % | +0.115 | 2.93 | +393.2 | -0.045 (0.033) | +0.159 | 4.9 |
|   dont 2017-2022 | 2973 | 27 % | +0.036 | 0.83 | +106.1 | -0.063 (0.037) | +0.099 | 2.7 |
| Test 2023-2025 | 1262 | 25 % | -0.002 | -0.03 | -2.6 | -0.013 (0.063) | +0.011 | 0.2 |
| Forward 2026 | 357 | 30 % | +0.265 | 1.44 | +94.6 | -0.076 (0.116) | +0.341 | 2.9 |

## Verdict (fixé à l'avance)

**CANDIDAT EXPLORATOIRE** (entraînement t 3.34, 5.7 σ au-dessus du placebo ; test +0.035 R, écart +0.035 R) — démo seulement, jamais de réel sur ce seul rejeu

Forward 2026 (ne décide rien) : 778 achats, +0.213 R/trade, placebo -0.042 R, écart +0.254 R (2.8 σ).
