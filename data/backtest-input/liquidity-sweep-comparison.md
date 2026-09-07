# Filtre de confluence "liquidity sweep" (ICT) — ICT FVG (M15)

⚠ Un signal n'est gardé que si un balayage de liquidité (mèche au-delà d'un pivot swing confirmé, puis clôture qui revient de l'autre côté) a eu lieu dans les 10 bougies M15 précédentes, dans le même sens que le FVG. Testé sur TRAIN pour chaque config déjà validée hors-échantillon (avec sa meilleure fenêtre NY connue), puis vérifié sur TEST.

## US100 (baseline, structure ON, session 10h-11h, fvg-edge, 1:3)
| | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| TRAIN, liquidity sweep off | 546 | 33.6% | 0.24 | 1.33 |
| TRAIN, liquidity sweep ON | 166 | 39.4% | 0.47 | 1.72 |
| TEST, liquidity sweep off | 269 | 38.4% | 0.46 | 1.68 |
| TEST, liquidity sweep ON | 82 | 41.5% | 0.57 | 1.90 |

## US500 (H1_EMA200, structure ON, session 10h-11h, fvg-edge, 1:3)
| | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| TRAIN, liquidity sweep off | 278 | 36.6% | 0.34 | 1.48 |
| TRAIN, liquidity sweep ON | 70 | 41.4% | 0.53 | 1.80 |
| TEST, liquidity sweep off | 122 | 33.3% | 0.25 | 1.34 |
| TEST, liquidity sweep ON | 26 | 37.5% | 0.51 | 1.78 |
