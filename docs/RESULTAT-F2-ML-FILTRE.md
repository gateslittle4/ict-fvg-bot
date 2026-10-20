# Résultat : un modèle statistique trie-t-il les ordres de F2 ?

Définitions : `PREREG-F2-ML-FILTRE.md` (SHA-256 `b2870bd2…502f`, 2026-10-18, vers 00 h 30 heure de New York), commité avant tout calcul. Code : `scripts/comboFvgV6/comboAO_ml_extraction.mjs` et `comboAO_ml_analyse.py`. Sortie complète : `SORTIE-F2-ML.txt`. Données : `DONNEES-F2-ML.csv` (1 640 trades, 7 variables). Contrôle réussi : 2011-2022 redonne 1 222 trades, 129,7 R, pire baisse 27,4.

## Verdict : AUCUN GAIN

Modèle principal : régression ridge, entraînée sur le passé seulement, testée année par année de 2017 à 2026 (1 023 trades de test).

| | Trades | Gagnants | R total | R moyen | t |
|---|---|---|---|---|---|
| Tous les trades de F2 | 1 023 | 29 % | 124,1 | +0,121 | 2,11 |
| Pris par le modèle | 505 | 30 % | 81,8 | +0,162 | 1,96 |
| Sautés par le modèle | 518 | 28 % | 42,3 | +0,082 | 1,02 |

Les quatre critères :
1. Pris : R moyen > 0 et t ≥ 1,96 : **rempli**, de justesse (le t des pris est surtout celui de F2 elle-même, qui est positive sans filtre).
2. Pris > sautés et > tous dans les deux périodes : **non rempli**. 2017-2021 : pris +0,264 contre sautés +0,034. 2022-2026 : pris +0,076 contre sautés +0,133. Le gain disparaît, puis s'inverse, dans la période récente.
3. Permutation (10 000 tirages) : probabilité d'obtenir au moins +0,162 par hasard avec le même nombre de trades : **0,20**. Non rempli (seuil 0,05).
4. Contrôle : rempli.

## Descriptif (non jugé)
- Pris > sautés dans 7 années sur 10.
- Régression logistique : pris +0,176 R, sautés +0,066 R (même sens que le ridge).
- Arbres boostés : pris +0,035 R, sautés **+0,215 R** (sens inverse). Deux modèles sur trois vont dans un sens, le troisième dans l'autre : signe d'un effet faible ou inexistant.
- Coefficients du ridge très petits (au plus environ 0,1 R par écart-type de variable). Les plus grands : heure de pose entre 12 h et 16 h (+), hauteur du FVG relative au risque (moins). L'âge du FVG et le RR prévu changent de signe entre les deux échantillons.

## Ce que cela dit, et ne dit pas
- Avec ces 7 variables, un modèle ne sait pas choisir de façon fiable parmi les ordres de F2. Le gain apparent de 2017-2021 ne se retrouve pas en 2022-2026, et le hasard le produit une fois sur cinq.
- Ce n'est pas une preuve que le tri est impossible. Le modèle ne voit que la forme du FVG et l'heure. Il ne voit pas les nouvelles ni le contexte que Krystofia lit sur le graphique. L'étude du 06/10 sur ses trades de 2025 suggère que son tri apporte plus que F2 seule : ce test ne le vérifie pas.
- Puissance faible (écart-type d'environ 1,8 R par trade) : un petit gain réel resterait invisible.
- Les trades sautés ne libèrent pas la position dans cette simulation. L'effet d'un tri en direct peut différer.

## Interdit après lecture
Aucune variable, aucun alpha, aucune règle de choix, aucune période ni aucun modèle ne sera modifié pour améliorer ce résultat. Un autre modèle ou d'autres variables demandent un nouveau pré-enregistrement et comptent comme un essai de plus. Simulation seulement ; Krystofia décide.
