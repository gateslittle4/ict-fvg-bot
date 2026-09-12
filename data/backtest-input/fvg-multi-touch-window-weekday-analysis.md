# US100 multi-contact — fenêtre horaire (8h-12h / 10h-11h / journée entière) et jour de la semaine

Question directe d'Esdras (2026-09-12) : "est-ce qu'on doit attendre 10-11h pour que le prix frappe le FVG ? Fais le test pour 8h-12h et 10-11h vs toute la journée... ensuite fais le test pour les jours de la semaine le plus profitable aussi." Tout tourne sur US100 multi-contact (`MultiTouchFvgEngine`, config production verbatim à part la fenêtre testée), net de coûts. 3 fenêtres discrètes seulement — pas une recherche sur toutes les fenêtres possibles, pour ne pas retomber dans le piège du surajustement déjà documenté ailleurs dans ce projet.

## 1. Fenêtre horaire

| Fenêtre | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|
| 08h-12h | 448 | 0.86 | 201 | 1.10 | ✅ tient |
| 10h-11h (production) | 180 | 1.10 | 93 | 1.40 | ✅ tient |
| toute la journée (pas de fenêtre) | 1125 | 0.39 | 511 | 0.49 | ✅ tient |

| Fenêtre | R total train | R total test | Drawdown max train (R) | Drawdown max test (R) |
|---|---|---|---|---|
| 08h-12h | 387.47 | 220.48 | 12.61 | 8.89 |
| 10h-11h (production) | 198.45 | 130.65 | 10.86 | 6.82 |
| toute la journée (pas de fenêtre) | 435.31 | 252.42 | 24.02 | 23.36 |

**Fenêtre la plus profitable sur données jamais vues (test 2024-2025)** : **10h-11h (production)** (espérance test 1.40R). La suite (jour de la semaine) est calculée sur cette fenêtre.

## 2. Jour de la semaine

⚠ Découpage a posteriori des trades de la fenêtre "10h-11h (production)" par jour d'entrée, heure de New York réelle (DST prise en compte, `getRealNyWeekday()`). Purement exploratoire : les échantillons par jour sont petits (environ un cinquième d'un total déjà modeste) — un jour qui a l'air bon UNIQUEMENT sur train ou UNIQUEMENT sur test est probablement du bruit, pas un vrai signal. Pas de filtre proposé ici, juste un état des lieux.

### TRAIN (2019-2023)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 20 | 45.0% | 1.56 | 31.20 |
| Mardi | 29 | 41.4% | 1.37 | 39.70 |
| Mercredi | 38 | 34.2% | 0.92 | 35.14 |
| Jeudi | 52 | 32.7% | 0.83 | 43.14 |
| Vendredi | 41 | 39.0% | 1.20 | 49.27 |

### TEST (2024-2025)
| Jour (NY) | Trades | Win rate | R moyen | R total |
|---|---|---|---|---|
| Lundi | 23 | 39.1% | 1.24 | 28.44 |
| Mardi | 17 | 52.9% | 2.06 | 35.09 |
| Mercredi | 11 | 36.4% | 1.07 | 11.80 |
| Jeudi | 20 | 40.0% | 1.28 | 25.69 |
| Vendredi | 22 | 40.9% | 1.35 | 29.62 |

Aucun jour n'est négatif à la fois sur train et sur test — pas de pattern jour-de-semaine assez solide pour justifier un filtre, sur cette fenêtre.