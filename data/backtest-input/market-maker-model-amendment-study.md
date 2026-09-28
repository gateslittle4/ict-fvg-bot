# Market Maker Buy / Sell Model — AMENDEMENT (consolidation 12 H1 dans 4 ATR) — résultat

Amendement : `data/backtest-input/preregistration-market-maker-model-amendment-2026-09-25.md` (commité avant ce calcul ; seuil choisi sur le nombre de consolidations seul : 939 / 916 sur 2011-2022). Les R de la version stricte avaient été vus (déclaré).

Règles : `data/backtest-input/preregistration-market-maker-model-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runMarketMakerModelStudy.js`, règles `scripts/lib/marketMakerModel.js` (testées). R par trade, réglé à la minute, spread par défaut.

| Paire | Période | Trades | Gagnants | Achats / ventes | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|---|
| US100 + US500 | Entraînement 2011-2022 | 404 | 19 % | 130 / 274 | 5.7 R | +16.0 | +0.039 | 0.31 |
| US100 + US500 | 2011-2016 | 204 | 19 % | 70 / 134 | 5.2 R | +14.6 | +0.072 | 0.38 |
| US100 + US500 | 2017-2022 | 200 | 19 % | 60 / 140 | 6.1 R | +1.3 | +0.007 | 0.04 |
| US100 + US500 | Test 2023-2025 | 103 | 21 % | 24 / 79 | 6.4 R | +3.3 | +0.032 | 0.14 |
| US100 + US500 | 2026 (→ 21/09) | 24 | 8 % | 6 / 18 | 6.7 R | -19.1 | -0.795 | -4.77 |
| US100 | Entraînement 2011-2022 | 216 | 19 % | 64 / 152 | 5.8 R | +9.6 | +0.045 | 0.25 |
| US100 | 2011-2016 | 102 | 18 % | 36 / 66 | 5.2 R | -5.6 | -0.055 | -0.21 |
| US100 | 2017-2022 | 114 | 19 % | 28 / 86 | 6.3 R | +15.2 | +0.133 | 0.53 |
| US100 | Test 2023-2025 | 48 | 17 % | 10 / 38 | 6.3 R | -1.8 | -0.037 | -0.10 |
| US100 | 2026 (→ 21/09) | 12 | 17 % | 3 / 9 | 6.7 R | -6.5 | -0.538 | -1.69 |
| US500 | Entraînement 2011-2022 | 188 | 19 % | 66 / 122 | 5.5 R | +6.3 | +0.034 | 0.19 |
| US500 | 2011-2016 | 102 | 20 % | 34 / 68 | 5.2 R | +20.2 | +0.198 | 0.72 |
| US500 | 2017-2022 | 86 | 17 % | 32 / 54 | 5.8 R | -13.9 | -0.161 | -0.75 |
| US500 | Test 2023-2025 | 55 | 25 % | 14 / 41 | 6.4 R | +5.1 | +0.093 | 0.29 |
| US500 | 2026 (→ 21/09) | 12 | 0 % | 3 / 9 | 6.7 R | -12.6 | -1.052 | -20.12 |

## Verdict (US100 + US500, critère pré-enregistré)

Entraînement : 404 trades, +0.039 R/trade, t 0.31, 2011-2016 +14.6 R, 2017-2022 +1.3 R ; test 2023-2025 : 103 trades, +3.3 R → **ÉCHEC à l'entraînement**

## Sorties (toutes périodes)

- target : 88
- stop : 430
- time : 13

## Limites

- UNE traduction mécanique d'un modèle visuel ; HistData ≠ prix du broker ; spread par défaut, pas de glissement ; bougies H1/M15 en heures UTC (les week-ends comptent comme des bougies manquantes).
