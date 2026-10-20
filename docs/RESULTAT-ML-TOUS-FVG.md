# Résultat : un modèle appris sur tous les FVG M15

Définitions : `PREREG-ML-TOUS-FVG.md` (SHA-256 `d3ed96e7…ba44`, figé le 2026-10-18 après le « go » de Krystofia), commité avant tout calcul. Code : `scripts/comboFvgV6/comboAP_ml_tous_fvg.mjs`, `comboAP_ml_tous_fvg.py`, `lib/krysBacktestML.js`. Sorties : `data/ml-tous-fvg/` (`SORTIE-TEST.txt`, `SORTIE-SCELLE.txt`, `VERDICT-TEST.json`, `VERDICT-SCELLE.json`, `choix.json`, `controles.json`, les setups et les sélections).

## Verdict : AUCUN GAIN au test, NON CONFIRMÉ sur le scellé

**Contrôles réussis.** F2 redonne 1 222 trades, 129,7 R, pire baisse 27,4 (2011-2022). L'étiquette indépendante donne le même R que le moteur pour 1 220 des 1 222 trades de F2 (99,8 %, seuil 99 %).

**Données.** 22 905 candidats US100 de 2011 à 2025 (13 447 étiquetés, les autres ne sont jamais remplis), plus 12 288 sous scellé.

**Choix sur la validation (2020-2022).** Profondeur 2, 100 itérations, top 20 % des scores : +0,190 R sur 544 setups. C'est le meilleur de 18 combinaisons admissibles ; les autres vont de +0,03 à +0,14. Choisir le meilleur d'une liste gonfle mécaniquement le résultat de validation, et c'est ce qu'on observe plus bas.

### Test US100 2023-2025, moteur filtré (une position à la fois)
| | Trades | Gagnants | R total | R moyen | t |
|---|---|---|---|---|---|
| Modèle | 392 | 24 % | +2,5 | +0,006 | 0,07 |
| F2 | 331 | 29 % | +56,5 | +0,171 | 1,61 |

- Critère 1 (au moins 100 trades) : rempli. Critère 2 (R moyen > 0 et t ≥ 1,96) : non. Critère 3 (mieux que F2) : non. Critère 4 (permutation) : p = 0,51, non.
- Étiquettes indépendantes sur tous les candidats du test : +0,009 R en moyenne ; les retenus +0,005, les écartés +0,009. Le modèle ne distingue rien. Achats +0,073, ventes −0,065 (descriptif).
- Candidats sans score : 0,89 % des décisions (seuil de prudence 5 %).

### Scellé, lu une seule fois
| | Modèle (trades, R moyen, t) | F2 (trades, R moyen) | Permutation p |
|---|---|---|---|
| US100 2026 | 110, +0,243, 1,26 | 87, −0,239 | 0,18 |
| GER40 2023-2026 | 410, −0,137, −1,57 | 446, −0,002 | 0,73 |
| XAUUSD 2023-2026 | 415, −0,036, −0,38 | 392, −0,006 | 0,15 |
| **Regroupé** | **935, −0,047, −0,77** | 925, −0,026 | **0,28** |

Seul US100 2026 est positif (+0,243 R), et il ne passe pas le seuil de significativité. Sur les deux autres marchés le modèle est négatif.

## Ce que cela dit, et ne dit pas
- Avec 18 variables de forme, d'heure, de volatilité et de position dans l'étendue, un modèle appris sur 2011-2019 ne choisit pas mieux que le hasard, ni sur 2023-2025 ni sur d'autres marchés. Le +0,19 R de la validation était en grande partie un effet de sélection.
- Ce n'est pas la preuve qu'aucun tri n'existe. Le modèle ne voit ni les nouvelles, ni le contexte, ni ce que Krystofia lit sur le graphique.
- Les sorties de ce scellé donnent aussi, sans l'avoir cherché, le résultat de **F2 elle-même** sur GER40 et XAUUSD : −0,002 R et −0,006 R, donc près de zéro. C'est le même moteur et les mêmes données que l'étude `PREREG-F2-AUTRES-INSTRUMENTS.md`, qui n'avait pas encore été lancée. Je ne la considère plus comme « jamais vue » : si elle est lancée, son résultat devrait être très proche de celui-ci, et je ne l'invoque pas comme son verdict officiel.
- Puissance faible : écart-type d'environ 1,8 R par trade, quelques centaines de trades.

## Interdit après lecture
Aucune variable, aucune configuration, aucun q, aucune période ni aucun critère ne change. Le scellé est ouvert : il ne sert plus de juge neuf. Un autre modèle demande un nouveau pré-enregistrement avec de nouvelles données mises sous scellé. Simulation seulement ; Krystofia décide.
