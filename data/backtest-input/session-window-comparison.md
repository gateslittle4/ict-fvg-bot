# Comparaison de fenêtres de session NY — ICT FVG (M15)

⚠ Méthode : chaque fenêtre candidate est testée sur TRAIN (avant 2024-01-01T00:00:00Z) pour les deux configs déjà validées hors-échantillon (biais HTF + structure ICT selon le cas, swing, 1:3). La meilleure fenêtre par R net sur TRAIN est ensuite réévaluée sur TEST (après cette date, jamais utilisé pour choisir) — même logique que train-test-validation.md, pour ne pas se faire piéger par une fenêtre qui coller juste par hasard aux années de train.

## US100 (baseline, structure ON, fvg-edge, 1:3)
### Sur TRAIN, chaque fenêtre candidate
| Fenêtre NY | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| 08h-12h (référence, celle validée jusqu'ici) | 1790 | 31.0% | 0.13 | 1.17 |
| 08h-09h30 (pré-ouverture NY) | 584 | 27.4% | -0.04 | 0.96 |
| 09h30-11h (ouverture Wall Street + 1h30) | 808 | 33.3% | 0.22 | 1.30 |
| 09h-10h30 (autour de l'ouverture) | 723 | 28.7% | 0.03 | 1.04 |
| 10h-11h («Silver Bullet» ICT) | 546 | 33.6% | 0.24 | 1.33 |
| 07h-10h (overlap Londres-NY) | 1160 | 28.7% | 0.02 | 1.02 |

### Meilleure fenêtre sur TRAIN (10h-11h («Silver Bullet» ICT)), réévaluée sur TEST
| | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| 10h-11h («Silver Bullet» ICT) (TRAIN) | 546 | 33.6% | 0.24 | 1.33 |
| 10h-11h («Silver Bullet» ICT) (TEST) | 269 | 38.4% | 0.46 | 1.68 |
| Référence 08h-12h (TEST) | 820 | 34.6% | 0.30 | 1.41 |

## US500 (H1_EMA200, structure ON, fvg-edge, 1:3)
### Sur TRAIN, chaque fenêtre candidate
| Fenêtre NY | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| 08h-12h (référence, celle validée jusqu'ici) | 891 | 34.2% | 0.24 | 1.32 |
| 08h-09h30 (pré-ouverture NY) | 269 | 31.6% | 0.11 | 1.13 |
| 09h30-11h (ouverture Wall Street + 1h30) | 389 | 36.2% | 0.31 | 1.43 |
| 09h-10h30 (autour de l'ouverture) | 339 | 33.8% | 0.22 | 1.29 |
| 10h-11h («Silver Bullet» ICT) | 278 | 36.6% | 0.34 | 1.48 |
| 07h-10h (overlap Londres-NY) | 528 | 30.1% | 0.05 | 1.06 |

### Meilleure fenêtre sur TRAIN (10h-11h («Silver Bullet» ICT)), réévaluée sur TEST
| | Signaux viables | Win rate net | R net | Profit factor (net) |
|---|---|---|---|---|
| 10h-11h («Silver Bullet» ICT) (TRAIN) | 278 | 36.6% | 0.34 | 1.48 |
| 10h-11h («Silver Bullet» ICT) (TEST) | 122 | 33.3% | 0.25 | 1.34 |
| Référence 08h-12h (TEST) | 375 | 29.8% | 0.08 | 1.10 |
