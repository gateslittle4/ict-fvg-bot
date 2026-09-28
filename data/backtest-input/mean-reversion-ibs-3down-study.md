# Retour à la moyenne journalier (IBS, 3 baisses de suite) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-mean-reversion-ibs-3down-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runMeanReversionStudy.js`, règles `scripts/lib/meanReversion.js` (testées). Achat à l'ask à l'ouverture, sorties au bid, stop 3 ATR vérifié à la minute, swap du courtier. R = distance au stop.

## IBS < 0,2 (sortie IBS > 0,8)

| Paire | Période | Trades | Gagnants | Gain moyen | Perte moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|---|
| US100 + US500 | Entraînement 2011-2022 | 547 | 71 % | +0.26 | -0.43 | +32.8 | +0.060 | 3.42 |
| US100 + US500 | 2011-2016 | 250 | 71 % | +0.25 | -0.49 | +8.9 | +0.036 | 1.30 |
| US100 + US500 | 2017-2022 | 297 | 71 % | +0.27 | -0.38 | +23.9 | +0.080 | 3.55 |
| US100 + US500 | Test 2023-2025 | 170 | 71 % | +0.26 | -0.34 | +13.9 | +0.082 | 2.99 |
| US100 + US500 | 2026 (→ 21/09) | 41 | 68 % | +0.30 | -0.41 | +3.1 | +0.075 | 1.12 |
| US100 | Entraînement 2011-2022 | 280 | 70 % | +0.26 | -0.42 | +16.8 | +0.060 | 2.45 |
| US100 | 2011-2016 | 125 | 68 % | +0.25 | -0.47 | +2.2 | +0.018 | 0.45 |
| US100 | 2017-2022 | 155 | 72 % | +0.27 | -0.38 | +14.6 | +0.094 | 3.06 |
| US100 | Test 2023-2025 | 88 | 70 % | +0.26 | -0.31 | +7.7 | +0.088 | 2.38 |
| US100 | 2026 (→ 21/09) | 20 | 65 % | +0.27 | -0.31 | +1.4 | +0.069 | 0.82 |
| US500 | Entraînement 2011-2022 | 267 | 72 % | +0.26 | -0.44 | +16.0 | +0.060 | 2.38 |
| US500 | 2011-2016 | 125 | 74 % | +0.25 | -0.53 | +6.7 | +0.054 | 1.40 |
| US500 | 2017-2022 | 142 | 70 % | +0.26 | -0.38 | +9.3 | +0.066 | 1.96 |
| US500 | Test 2023-2025 | 82 | 71 % | +0.26 | -0.36 | +6.1 | +0.075 | 1.84 |
| US500 | 2026 (→ 21/09) | 21 | 71 % | +0.32 | -0.51 | +1.7 | +0.080 | 0.77 |

Sorties : signal 692, time 10, stop 56

## 3 baisses de suite (sortie 1re hausse)

| Paire | Période | Trades | Gagnants | Gain moyen | Perte moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|---|
| US100 + US500 | Entraînement 2011-2022 | 201 | 70 % | +0.21 | -0.33 | +9.1 | +0.045 | 1.89 |
| US100 + US500 | 2011-2016 | 102 | 75 % | +0.20 | -0.22 | +10.1 | +0.099 | 3.65 |
| US100 + US500 | 2017-2022 | 99 | 65 % | +0.21 | -0.41 | -1.0 | -0.010 | -0.26 |
| US100 + US500 | Test 2023-2025 | 67 | 67 % | +0.17 | -0.20 | +3.0 | +0.045 | 1.69 |
| US100 + US500 | 2026 (→ 21/09) | 21 | 71 % | +0.27 | -0.13 | +3.3 | +0.156 | 2.87 |
| US100 | Entraînement 2011-2022 | 100 | 70 % | +0.21 | -0.35 | +3.9 | +0.039 | 1.11 |
| US100 | 2011-2016 | 51 | 73 % | +0.22 | -0.29 | +4.0 | +0.078 | 1.65 |
| US100 | 2017-2022 | 49 | 67 % | +0.20 | -0.41 | -0.0 | -0.000 | -0.01 |
| US100 | Test 2023-2025 | 32 | 66 % | +0.15 | -0.22 | +0.8 | +0.024 | 0.62 |
| US100 | 2026 (→ 21/09) | 11 | 73 % | +0.27 | -0.08 | +1.9 | +0.176 | 2.65 |
| US500 | Entraînement 2011-2022 | 101 | 70 % | +0.20 | -0.31 | +5.2 | +0.051 | 1.57 |
| US500 | 2011-2016 | 51 | 78 % | +0.19 | -0.14 | +6.2 | +0.121 | 4.38 |
| US500 | 2017-2022 | 50 | 62 % | +0.22 | -0.41 | -1.0 | -0.020 | -0.34 |
| US500 | Test 2023-2025 | 35 | 69 % | +0.18 | -0.19 | +2.2 | +0.064 | 1.76 |
| US500 | 2026 (→ 21/09) | 10 | 70 % | +0.27 | -0.19 | +1.3 | +0.134 | 1.48 |

Sorties : signal 277, time 0, stop 12

## Verdict (US100 + US500 réunis, critère pré-enregistré, t ≥ 2,2)

- IBS < 0,2 (sortie IBS > 0,8) : entraînement 547 trades, +0.060 R/trade, t 3.42, 2011-2016 +8.9 R, 2017-2022 +23.9 R ; test 170 trades +13.9 R → **CANDIDATE** (mode alerte avant tout réel, décision d'Esdras)
- 3 baisses de suite (sortie 1re hausse) : entraînement 201 trades, +0.045 R/trade, t 1.89, 2011-2016 +10.1 R, 2017-2022 -1.0 R ; test 67 trades +3.0 R → **ÉCHEC à l'entraînement**

## IBS en détail (US100 + US500, descriptif)

R par an : 2011 −0,9 · 2012 +1,9 · 2013 +6,6 · 2014 +2,0 · 2015 −1,3 · 2016 +0,7 · 2017 +7,0 · 2018 −1,3 · 2019 +5,2 · 2020 +9,2 · 2021 +6,5 · 2022 −2,8 · 2023 +5,3 · 2024 +2,6 · 2025 +6,0 · 2026 +3,1.
Total +49,7 R en 758 trades (~49 par an), pire baisse 4,7 R, pire trade −1,07 R, durée moyenne 2,6 jours.
En argent (composé) : 0,3 % de risque par trade -> +16 % en 15,5 ans (pire baisse 1,4 %) ; 1 % -> +63 % (pire baisse 4,7 %). Avantage réel mais petit par trade : le stop à 3 ATR est loin, les gains moyens font +0,26 R.

## Limites

- HistData ≠ prix du broker ; spread par défaut, pas de glissement ; achats seulement ; même famille que RSI(2) déjà en live (chevauchement possible sur US500).
