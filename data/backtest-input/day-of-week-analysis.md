# Analyse exploratoire : le jour de la semaine influence-t-il le résultat ?

⚠ Découpage a posteriori des trades du setup DÉJÀ validé (mêmes filtres, rien ne change dans le moteur), par jour de la semaine côté heure de New York (approximation EST fixe, sans ajustement DST - les trades sont de toute façon concentrés dans la fenêtre 10h-11h NY). Train (2019-2023) vs test (2024-2025) - un jour qui a l'air bon uniquement sur train et pas sur test est probablement du bruit, pas un vrai edge.

## US100
### TRAIN (2019-2023)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 6 | 16.7% | -0.39 | -2.4 |
| Mardi | 14 | 50.0% | 0.92 | 12.8 |
| Mercredi | 12 | 58.3% | 1.24 | 14.8 |
| Jeudi | 17 | 41.2% | 0.56 | 9.4 |
| Vendredi | 19 | 52.6% | 1.01 | 19.1 |

### TEST (2024-2025)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 11 | 45.5% | 0.72 | 7.9 |
| Mardi | 8 | 50.0% | 0.88 | 7.0 |
| Mercredi | 3 | 66.7% | 1.56 | 4.7 |
| Jeudi | 5 | 20.0% | -0.25 | -1.2 |
| Vendredi | 11 | 45.5% | 0.76 | 8.4 |

## US500
### TRAIN (2019-2023)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 8 | 12.5% | -0.68 | -5.4 |
| Mardi | 9 | 88.9% | 2.46 | 22.2 |
| Mercredi | 17 | 41.2% | 0.53 | 9.1 |
| Jeudi | 23 | 43.5% | 0.62 | 14.2 |
| Vendredi | 14 | 35.7% | 0.33 | 4.6 |

### TEST (2024-2025)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 6 | 16.7% | -0.45 | -2.7 |
| Mardi | 4 | 75.0% | 1.93 | 7.7 |
| Mercredi | 5 | 66.7% | 1.73 | 8.7 |
| Jeudi | 7 | 71.4% | 1.75 | 12.2 |
| Vendredi | 8 | 12.5% | -0.62 | -5.0 |
