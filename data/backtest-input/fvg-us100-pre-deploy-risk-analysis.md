# US100 multi-contact — avant déploiement : stop/target, streaks, pyramide, risque fixe vs dynamique

Question directe d'Esdras (2026-09-12) avant tout déploiement du multi-contact US100 (`MultiTouchFvgEngine`, validé plus tôt ce soir, toujours pas déployé). Les 4 comparaisons ci-dessous tournent sur EXACTEMENT la même séquence de trades (multi-contact US100, config production verbatim, net de coûts), pour rester comparables entre elles.

## 1. Mécanique stop/target (rappel, ce n'est pas un chiffre à calculer)

- **Entrée** : bord de la zone FVG (ordre LIMIT, prix de ré-entrée ICT), pas le prix de marché.
- **Stop** : mode `fvg-edge` — bord opposé de la zone + 10% de marge de la hauteur de la zone (`computeStop()`, backtestEngine.js).
- **Target** : entrée + RR × distance, avec RR = **5** (valeur production actuelle, lue depuis `CONFIG.fvg.perSymbol.US100`).
- **Fixe ou flexible** : FIXE — les trois sont posés à l'entrée et jamais retouchés ensuite (pas de trailing, pas de mise à breakeven), comme partout ailleurs dans ce projet.

## 2. Streaks (trades gagnants/perdants d'affilée), période complète 2019-2025

n = 273 trades (train + test, multi-contact, sans pyramide)

| | Max d'affilée | Moyenne par série | Nombre de séries |
|---|---|---|---|
| Gagnants | 7 | 1.8 | 60 |
| Perdants | 10 | 2.7 | 61 |

Distribution des séries de pertes : `{"1":20,"2":17,"3":7,"4":6,"5":6,"6":2,"7":1,"9":1,"10":1}` (longueur → nombre de fois observée). À 0.5% de risque/trade, la pire série déjà vue (10 pertes d'affilée) correspond à environ 5.0% du compte perdus d'affilée dans le pire cas historique.

## 3. Pyramidal (unités indépendantes) vs non pyramidal

| Période | Mode | Trades | Espérance (R) | R total | Drawdown max (R) | Trades pyramidés |
|---|---|---|---|---|---|---|
| Train | sans pyramide | 180 | 1.10 | 198.45 | 10.86 | — |
| Train | **avec pyramide** | 180 | 1.33 | 239.45 | 11.33 | 44 |
| Test | sans pyramide | 93 | 1.40 | 130.65 | 6.82 | — |
| Test | **avec pyramide** | 93 | 1.76 | 163.65 | 7.82 | 17 |

Gain en R total : 21% en train, 25% en test. Coût : drawdown max en R légèrement plus haut (6.82R → 7.82R en test) — le second lot déploie du risque supplémentaire une fois le mouvement déjà en faveur, mais le stop de l'unité ORIGINALE n'est jamais déplacé (voir le commentaire de `runBacktestPyramidIndependentStops` dans backtestEngine.js).

## 4. Risque fixe vs risque dynamique (réduit après pertes consécutives)

Règle testée : 0.5% de risque/trade normalement, réduit à 0.25% (moitié) après 2 pertes consécutives, restauré à 0.5% dès le prochain gain. Appliqué à la MÊME séquence de trades multi-contact (sans pyramide) — seul le sizing change, pas la sélection des trades. Croissance composée (% du capital courant, pas du capital de départ).

| Période | Mode | Compte final | Drawdown max | Risque moyen réel |
|---|---|---|---|---|
| Train | fixe | 164.1% | 5.3% | 0.50% |
| Train | **dynamique** | 119.0% | 3.2% | 0.40% |
| Test | fixe | 89.8% | 3.4% | 0.50% |
| Test | **dynamique** | 70.5% | 2.4% | 0.42% |

**Ce n'est pas un gain gratuit** : réduire le risque après 2 pertes réduit bien le drawdown max (train 5.3% → 3.2%, test 3.4% → 2.4%), mais coûte de la croissance totale du compte (train 164.1% → 119.0%, test 89.8% → 70.5%), puisque le sizing réduit s'applique aussi aux trades qui, après coup, auraient été des gagnants juste après la série de pertes.