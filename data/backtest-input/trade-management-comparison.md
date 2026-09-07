# Gestion active de trade (breakeven / prise partielle) vs 1:3 fixe — US100 / US500

⚠ Mêmes signaux/entrées/stops exacts que le setup validé (docs/STRATEGY.md) - seule la GESTION de la position ouverte change. "breakeven" : une fois +1R atteint en notre faveur, le stop remonte à l'entrée (un renversement devient nul au lieu de -1R). "partiel" : la moitié de la position est prise à +1R, stop du reste à breakeven, le reste vise toujours 1:3. Criblé sur TRAIN, confirmé sur TEST (jamais utilisé pour choisir).

## US100 (H4_EMA200, structure ON, session 10h-11h, fvg-edge, 1:3, sweep ON)
| Gestion | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) |
|---|---|---|---|---|---|
| 1:3 fixe (actuel) | 68/38 | 47.1%/44.7% | 0.79/0.70 | 2.37/2.19 | 5.79/5.40 |
| Breakeven à +1R | 66/38 | 42.4%/44.7% | 0.71/0.73 | 2.37/2.29 | 4.79/5.40 |
| Partiel 50% à +1R + breakeven | 66/38 | 42.4%/44.7% | 0.62/0.72 | 2.19/2.27 | 4.65/5.40 |
| Pyramide : +1 lot à +1R + breakeven (2x risque) (pyramidés : 17/2) | 66/38 | 42.4%/44.7% | 0.90/0.76 | 2.42/2.28 | 5.80/5.40 |
| Pyramide (stops indépendants, sans breakeven) (pyramidés : 18/2) | 68/38 | 47.1%/44.7% | 1.00/0.73 | 2.53/2.18 | 6.80/5.40 |

## US500 (H1_EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, sweep ON)
| Gestion | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) |
|---|---|---|---|---|---|
| 1:3 fixe (actuel) | 71/30 | 43.7%/42.9% | 0.63/0.70 | 1.99/2.16 | 7.03/10.42 |
| Breakeven à +1R | 69/28 | 36.2%/42.3% | 0.56/0.76 | 2.17/2.42 | 9.07/10.42 |
| Partiel 50% à +1R + breakeven | 69/28 | 36.2%/42.3% | 0.56/0.50 | 2.24/1.96 | 7.07/10.42 |
| Pyramide : +1 lot à +1R + breakeven (2x risque) (pyramidés : 24/11) | 69/28 | 36.2%/42.3% | 0.53/1.24 | 1.72/3.02 | 13.81/10.42 |
| Pyramide (stops indépendants, sans breakeven) (pyramidés : 25/11) | 71/30 | 43.7%/42.9% | 0.58/1.19 | 1.72/2.86 | 11.41/10.42 |
