# 1:3 fixe vs cible étendue (1:4 / 1:5) — mêmes signaux/entrées/stops, seule la cible change

⚠ Même config validée par instrument (docs/STRATEGY.md), seul le multiple R:R de la cible change (3 actuel / 4 / 5, fixés avant tout résultat). Rappel du seuil de rentabilité mécanique avant coûts : 1:3 → 25% de gains nécessaires, 1:4 → 20%, 1:5 → 16.7% - un taux de gain plus bas à 1:4/1:5 n'est donc pas en soi un problème, seule l'espérance en R compte. Criblé sur TRAIN, confirmé sur TEST (jamais utilisé pour choisir).

## US100 (H4_EMA200, structure ON, session 10h-11h, fvg-edge)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 68/38 | 47.1%/44.7% | 0.79/0.70 | 2.37/2.19 | 5.79/5.40 | ✅ tient |
| 1:4 | 68/38 | 44.1%/44.7% | 1.12/1.15 | 2.83/2.95 | 5.79/5.40 | ✅ tient |
| 1:5 | 68/38 | 41.2%/42.1% | 1.38/1.44 | 3.16/3.33 | 5.79/5.40 | ✅ tient |

## US500 (H1_EMA50, structure ON, session 10h-11h, fvg-edge)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 71/30 | 43.7%/42.9% | 0.63/0.70 | 1.99/2.16 | 7.03/10.42 | ✅ tient |
| 1:4 | 70/30 | 37.1%/40.7% | 0.74/0.97 | 2.04/2.60 | 8.96/10.42 | ✅ tient |
| 1:5 | 70/30 | 35.7%/37.0% | 1.02/1.13 | 2.42/2.78 | 8.96/10.42 | ✅ tient |

## XAUUSD (H4_EMA20, structure ON, session 7h-10h, swing)
| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |
|---|---|---|---|---|---|---|
| 1:3 | 85/42 | 44.6%/38.1% | 0.70/0.48 | 2.17/1.74 | 6.80/6.20 | ✅ tient |
| 1:4 | 82/41 | 39.2%/32.5% | 0.88/0.61 | 2.37/1.88 | 6.80/6.20 | ✅ tient |
| 1:5 | 79/40 | 33.8%/25.6% | 0.95/0.52 | 2.39/1.69 | 8.04/9.27 | ✅ tient |
