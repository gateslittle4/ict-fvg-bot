# Entrée FVG par ordre stop — résultat du pré-enregistrement

Règles : `docs/PREREG_STOP_ORDER.md` (commité avant ce calcul). Script : `scripts/runStopOrderEntryStudy.js`. R net de spread et de swap (commission 0), rapporté au risque réel |exécution − stop|. Généré le 2026-09-26T00:56 UTC.

**Correctif après le premier calcul (colonne limite seulement)** : un ordre LIMIT rempli à un prix déjà au-delà du stop de protection (bougie de signal clôturée sous le stop) sortait « au stop » avec un faux gain de +1 R ; il est maintenant compté sans trade, comme l'ordre stop et l'ordre au marché de l'étude du 23/09. L'exécution STOP, seule soumise au verdict, n'est pas touchée.

## US100 + US500

| Période | Signaux | Exécution | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|---|---|
| Train 2010-2022 | 1864 | Premier contact (référence, non exécutable) | 1864 | 17 % | -0.024 | -44.9 | -0.48 |
| Train 2010-2022 | 1864 | Limite (le bot jusqu'au 23/09) | 1058 | 15 % | -0.073 | -77.2 | -0.97 |
| Train 2010-2022 | 1864 | Stop (hypothèse) | 1738 | 17 % | -0.080 | -138.5 | -1.54 |
|   dont 2010-2016 | 757 | Premier contact (référence, non exécutable) | 757 | 15 % | -0.143 | -108.4 | -1.90 |
|   dont 2010-2016 | 757 | Limite (le bot jusqu'au 23/09) | 463 | 14 % | -0.052 | -24.0 | -0.42 |
|   dont 2010-2016 | 757 | Stop (hypothèse) | 692 | 17 % | -0.136 | -94.4 | -1.72 |
|   dont 2017-2022 | 1107 | Premier contact (référence, non exécutable) | 1107 | 19 % | +0.057 | +63.5 | 0.85 |
|   dont 2017-2022 | 1107 | Limite (le bot jusqu'au 23/09) | 595 | 15 % | -0.089 | -53.1 | -0.96 |
|   dont 2017-2022 | 1107 | Stop (hypothèse) | 1046 | 18 % | -0.042 | -44.1 | -0.62 |
| Test 2023-2025 | 637 | Premier contact (référence, non exécutable) | 637 | 20 % | +0.106 | +67.5 | 1.19 |
| Test 2023-2025 | 637 | Limite (le bot jusqu'au 23/09) | 301 | 15 % | -0.079 | -23.7 | -0.59 |
| Test 2023-2025 | 637 | Stop (hypothèse) | 600 | 16 % | -0.106 | -63.4 | -1.23 |
| Forward 2026 | 151 | Premier contact (référence, non exécutable) | 151 | 17 % | -0.065 | -9.9 | -0.38 |
| Forward 2026 | 151 | Limite (le bot jusqu'au 23/09) | 66 | 3 % | -0.646 | -42.6 | -2.30 |
| Forward 2026 | 151 | Stop (hypothèse) | 146 | 6 % | -0.666 | -97.2 | -5.85 |

## US100

| Période | Signaux | Exécution | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|---|---|
| Train 2010-2022 | 1336 | Premier contact (référence, non exécutable) | 1336 | 16 % | -0.058 | -77.4 | -0.99 |
| Train 2010-2022 | 1336 | Limite (le bot jusqu'au 23/09) | 746 | 14 % | -0.073 | -54.7 | -0.80 |
| Train 2010-2022 | 1336 | Stop (hypothèse) | 1248 | 18 % | -0.080 | -99.7 | -1.30 |
|   dont 2010-2016 | 519 | Premier contact (référence, non exécutable) | 519 | 13 % | -0.253 | -131.4 | -2.94 |
|   dont 2010-2016 | 519 | Limite (le bot jusqu'au 23/09) | 320 | 12 % | -0.138 | -44.0 | -0.91 |
|   dont 2010-2016 | 519 | Stop (hypothèse) | 473 | 16 % | -0.177 | -83.7 | -1.87 |
|   dont 2017-2022 | 817 | Premier contact (référence, non exécutable) | 817 | 19 % | +0.066 | +54.0 | 0.84 |
|   dont 2017-2022 | 817 | Limite (le bot jusqu'au 23/09) | 426 | 16 % | -0.025 | -10.7 | -0.22 |
|   dont 2017-2022 | 817 | Stop (hypothèse) | 775 | 19 % | -0.021 | -16.0 | -0.26 |
| Test 2023-2025 | 454 | Premier contact (référence, non exécutable) | 454 | 21 % | +0.202 | +91.6 | 1.84 |
| Test 2023-2025 | 454 | Limite (le bot jusqu'au 23/09) | 205 | 13 % | -0.200 | -40.9 | -1.33 |
| Test 2023-2025 | 454 | Stop (hypothèse) | 429 | 16 % | -0.126 | -54.2 | -1.25 |
| Forward 2026 | 106 | Premier contact (référence, non exécutable) | 106 | 19 % | +0.072 | +7.6 | 0.33 |
| Forward 2026 | 106 | Limite (le bot jusqu'au 23/09) | 46 | 4 % | -0.488 | -22.4 | -1.21 |
| Forward 2026 | 106 | Stop (hypothèse) | 103 | 5 % | -0.751 | -77.3 | -6.40 |

## US500

| Période | Signaux | Exécution | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|---|---|
| Train 2010-2022 | 528 | Premier contact (référence, non exécutable) | 528 | 19 % | +0.062 | +32.5 | 0.63 |
| Train 2010-2022 | 528 | Limite (le bot jusqu'au 23/09) | 312 | 16 % | -0.072 | -22.5 | -0.57 |
| Train 2010-2022 | 528 | Stop (hypothèse) | 490 | 17 % | -0.079 | -38.8 | -0.82 |
|   dont 2010-2016 | 238 | Premier contact (référence, non exécutable) | 238 | 20 % | +0.097 | +23.1 | 0.66 |
|   dont 2010-2016 | 238 | Limite (le bot jusqu'au 23/09) | 143 | 20 % | +0.140 | +20.0 | 0.68 |
|   dont 2010-2016 | 238 | Stop (hypothèse) | 219 | 18 % | -0.049 | -10.7 | -0.34 |
|   dont 2017-2022 | 290 | Premier contact (référence, non exécutable) | 290 | 18 % | +0.033 | +9.5 | 0.25 |
|   dont 2017-2022 | 290 | Limite (le bot jusqu'au 23/09) | 169 | 12 % | -0.251 | -42.5 | -1.59 |
|   dont 2017-2022 | 290 | Stop (hypothèse) | 271 | 15 % | -0.104 | -28.1 | -0.80 |
| Test 2023-2025 | 183 | Premier contact (référence, non exécutable) | 183 | 16 % | -0.132 | -24.1 | -0.88 |
| Test 2023-2025 | 183 | Limite (le bot jusqu'au 23/09) | 96 | 19 % | +0.179 | +17.2 | 0.66 |
| Test 2023-2025 | 183 | Stop (hypothèse) | 171 | 18 % | -0.054 | -9.2 | -0.33 |
| Forward 2026 | 45 | Premier contact (référence, non exécutable) | 45 | 11 % | -0.390 | -17.5 | -1.48 |
| Forward 2026 | 45 | Limite (le bot jusqu'au 23/09) | 20 | 0 % | -1.009 | -20.2 | -113.43 |
| Forward 2026 | 45 | Stop (hypothèse) | 43 | 9 % | -0.462 | -19.9 | -1.74 |

## Les trades US100 2023-2025 jamais repris par l'ordre limite

- Recomptés avec ce code : **161** (204 dans l'étude du 23/09) — objectif atteint avant le retour : 157, ordre expiré : 4.
- Premier contact sur ces signaux : +225.7 R.
- **Récupérés par l'ordre stop : 161** sur 161, pour +67.8 R (R moyen +0.421).

## Verdict (amendé avant calcul : exécution stop, US100 + US500, ≥ 60 trades, t ≥ 2,6, deux moitiés positives, test > 0)

**ÉCHEC à l'entraînement** (R moyen -0.080, t -1.54 pour 2.6 exigé ; 2010-2016 -94.4 R, 2017-2022 -44.1 R)

Pour mémoire, verdict d'origine (10 trades / test ≥ 30 % du train, remplacé par l'amendement) : rejeté (espérance test -0.106 R).

