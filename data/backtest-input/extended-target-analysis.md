# 1:3 fixe vs cible étendue (1:4 / 1:5 / 1:6 / 1:7) — mêmes signaux/entrées/stops, seule la cible change

⚠ Même config validée par instrument (docs/STRATEGY.md), seul le multiple R:R de la cible change (3 actuel / 4 / 5 / 6 / 7, fixés avant tout résultat). Rappel du seuil de rentabilité mécanique avant coûts : 1:3 → 25% de gains nécessaires, 1:4 → 20%, 1:5 → 16.7%, 1:6 → 14.3%, 1:7 → 12.5% - un taux de gain plus bas à cible étendue n'est donc pas en soi un problème, seule l'espérance en R compte. Criblé sur TRAIN, confirmé sur TEST (jamais utilisé pour choisir).

## US100 (H4_EMA200, structure ON, session 10h-11h, fvg-edge)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 166/39 | 42.2%/46.2% | 0.57/0.79 | 1.89/2.41 | 9.87/5.24 | ✅ tient |
| 1:4 | 166/39 | 35.5%/46.2% | 0.66/1.25 | 1.92/3.23 | 14.51/5.24 | ✅ tient |
| 1:5 | 166/39 | 33.1%/43.6% | 0.87/1.56 | 2.17/3.65 | 18.70/5.24 | ✅ tient |
| 1:6 | 164/39 | 30.1%/39.5% | 1.01/1.79 | 2.31/3.92 | 18.70/5.24 | ✅ tient |
| 1:7 | 163/39 | 26.9%/39.5% | 1.10/2.18 | 2.38/4.54 | 19.02/5.24 | ✅ tient |

## US500 (H1_EMA50, structure ON, session 10h-11h, fvg-edge)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 153/31 | 36.2%/44.8% | 0.33/0.80 | 1.46/2.44 | 12.34/9.89 | ✅ tient |
| 1:4 | 152/31 | 32.5%/42.9% | 0.50/1.09 | 1.67/2.96 | 12.44/9.89 | ✅ tient |
| 1:5 | 152/31 | 30.5%/39.3% | 0.71/1.29 | 1.91/3.18 | 11.44/9.89 | ✅ tient |
| 1:6 | 150/31 | 25.7%/39.3% | 0.69/1.64 | 1.83/3.78 | 14.43/9.89 | ✅ tient |
| 1:7 | 149/31 | 23.8%/35.7% | 0.80/1.74 | 1.93/3.78 | 18.05/9.89 | ✅ tient |

## XAUUSD (H4_EMA20, structure ON, session 7h-10h, swing)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 309/42 | 39.0%/38.1% | 0.47/0.48 | 1.72/1.74 | 21.84/6.20 | ✅ tient |
| 1:4 | 302/41 | 32.8%/32.5% | 0.55/0.61 | 1.77/1.88 | 19.84/6.20 | ✅ tient |
| 1:5 | 295/40 | 28.2%/25.6% | 0.62/0.52 | 1.82/1.69 | 25.31/9.27 | ✅ tient |
| 1:6 | 293/40 | 23.2%/23.1% | 0.60/0.60 | 1.76/1.77 | 26.39/9.27 | ✅ tient |
| 1:7 | 288/40 | 18.3%/23.1% | 0.54/0.82 | 1.65/2.05 | 35.86/9.27 | ✅ tient |

## GBPUSD (H4_EMA20, structure ON, session 7h-10h, swing)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 486/166 | 27.5%/28.3% | 0.08/0.09 | 1.11/1.13 | 26.84/14.16 | ✅ tient |
| 1:4 | 449/154 | 19.8%/23.4% | 0.01/0.22 | 1.02/1.30 | 45.67/12.85 | ✅ tient |
| 1:5 | 423/152 | 13.7%/20.1% | -0.03/0.35 | 0.96/1.47 | 40.82/11.85 | ⚠️ affaibli |
| 1:6 | 411/147 | 10.8%/17.5% | -0.01/0.45 | 0.98/1.60 | 37.28/13.24 | ⚠️ affaibli |
| 1:7 | 402/144 | 7.8%/12.5% | -0.08/0.35 | 0.91/1.45 | 47.31/21.05 | ⚠️ affaibli |
