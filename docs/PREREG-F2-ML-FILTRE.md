# Pré-enregistrement : un modèle statistique peut-il trier les ordres de F2 ?

Écrit le 2026-10-18, vers 00 h 30 heure de New York, AVANT tout calcul de cette étude. Règle, variables, modèle et critères figés : aucun amendement après lecture des résultats. Origine : la question « as-tu essayé le machine learning, un modèle de régression, l'analyse prédictive ? ». Ce n'est pas une variante de F2 : les ordres de F2 ne changent pas. On teste seulement si un modèle, entraîné sur le passé, sait choisir quels ordres F2 prendre.

## Question
Un modèle de régression entraîné uniquement sur les trades antérieurs prédit-il, au moment où F2 pose un ordre, si cet ordre vaut la peine d'être pris ? Autrement dit : les trades choisis par le modèle ont-ils un meilleur R moyen que l'ensemble des trades de F2, sur des années que le modèle n'a jamais vues ?

## Données et trades
- US100, M1 HistData puis broker, bougies M15 reconstruites comme dans tout le projet (`comboAN_autres_instruments.mjs`, `loadInstrument`).
- Trades : F2C telle quelle (achats, filtre de balayage H4, règles `RULES` de `comboF.mjs`), série continue, années 2011 à 2026 (jusqu'au 21/09/2026). Moteur : `lib/krysBacktestC.js`.
- Contrôle : 2011-2022 doit redonner exactement 1 222 trades, R total 129,7, pire baisse 27,4. Si le contrôle échoue, rien d'autre n'est lu.

## Variables (7), toutes connues à la bougie où l'ordre est posé
1. `ln(risque / ATR14 M15)` : le risque de l'ordre (entrée moins stop) rapporté à l'ATR sur 14 bougies M15 se terminant à la bougie de pose.
2. `ln(RR prévu)` : (TP moins entrée) / risque.
3. Âge du FVG d'entrée en bougies à la pose (0 à 8).
4. Hauteur du FVG d'entrée / risque.
5. Heure de pose 09 h à 11 h 59 New York (0/1).
6. Heure de pose 12 h à 15 h 59 New York (0/1). Référence : 06 h à 08 h 59.
7. Lundi New York (0/1).
Aucune autre variable ne sera ajoutée. Les variables sont centrées et réduites avec la moyenne et l'écart-type de l'échantillon d'entraînement seul.

## Modèle principal (une seule hypothèse)
- Régression linéaire avec pénalité ridge, alpha = 100 (valeur fixée ici, non réglée), cible = R du trade, intercept non pénalisé.
- Validation en avancée (walk-forward) : pour chaque année de test Y de 2017 à 2026, le modèle est entraîné sur les trades dont la sortie a eu lieu avant le 1er janvier de Y, puis prédit les trades de Y (remplis pendant Y).
- Règle de choix : on prend le trade si le R prédit est strictement supérieur au R moyen de l'échantillon d'entraînement. On saute les autres.
- Série jugée : tous les trades de 2017 à 2026, regroupés ("pris" contre "sautés" contre "tous").

## Critères du jugement principal
1. Les trades pris ont un R moyen > 0 et t ≥ 1,96.
2. Le R moyen des pris est supérieur à celui des sautés ET à celui de tous, dans les deux périodes 2017-2021 et 2022-2026.
3. Test de permutation : 10 000 tirages aléatoires (graine 12345) de sous-ensembles de même taille que les trades pris, année par année. La probabilité d'obtenir un R moyen au moins aussi grand que celui des pris doit être ≤ 0,05.
4. Le contrôle US100 est réussi.

Verdict, le premier qui s'applique :
- **Filtre utile** : les quatre critères passent.
- **Compatible, non prouvé** : R moyen des pris > R moyen de tous sur 2017-2026 et probabilité de permutation ≤ 0,10, sans que les quatre critères passent.
- **Aucun gain** : tout le reste.

## Descriptif prévu (non jugé)
- R moyen, taux de gagnants, nombre de trades, R total des pris, des sautés et de tous, par année et par période.
- Coefficients du ridge entraîné sur 2011-2022 et sur tout l'échantillon, pour voir quelles variables pèsent.
- Deux autres modèles, dans le même cadre en avancée, sans jugement : régression logistique (cible = trade gagnant, C = 1, règle : probabilité prédite supérieure à la fréquence de gain d'entraînement) et arbres boostés peu profonds (`HistGradientBoostingRegressor`, profondeur 2, 100 itérations, taux 0,05, même règle que le ridge).
- Le rang de chaque année de test selon l'écart pris moins tous.

## Divulgations
- **Sélection de F2.** F2 a été retenue parmi plusieurs variantes sur US100, et 2023-2025 a déjà été lu. Son R moyen est probablement gonflé. Le modèle hérite de ce biais : il trie des trades déjà sélectionnés.
- **Puissance faible.** L'écart-type d'un trade est d'environ 1,8 R. Sur environ 1 500 à 1 700 trades de test, l'erreur type de la moyenne de tous est d'environ 0,045 R, et celle d'une moitié d'environ 0,06 R. Seul un gain assez grand peut être détecté. Un résultat "non prouvé" ne réfute rien.
- **Trades supprimés.** Sauter un trade peut libérer la position pour un autre ordre que F2 aurait raté. Cette interaction n'est pas simulée : on filtre la liste fixe des trades de F2. L'effet réel d'un tri en direct peut différer.
- **Variables limitées.** Le modèle ne voit que ces 7 variables. Il ne voit ni les nouvelles, ni le contexte que Krystofia lit sur le graphique, ni la tendance daily. L'étude du 06/10 suggère que son tri apportait peut-être plus que F2 seule : ce test ne peut pas le vérifier.
- **Un seul instrument.** US100 seulement. Les trades d'un même mois sont corrélés ; le t est un peu flatteur.
- **Hasard.** Avec quelques variables et des centaines de trades, un modèle peut trouver un motif qui n'existe pas. Le test hors échantillon en avancée et la permutation sont là pour ça, mais ils ne l'éliminent pas.
- **Coûts.** Spread et marge de stop comme dans tout le projet (échelle prix/8 200).

## Ce qui est interdit après lecture
Aucun changement de variable, d'alpha, de règle de choix, de période, de modèle principal ni de critère. Aucune variante voisine, quel que soit le résultat. Tout autre modèle ou toute autre variable demande un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement : aucun ordre réel, et aucune décision de trade n'est prise ici ; Krystofia décide.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAO_ml_extraction.mjs data docs/DONNEES-F2-ML.csv` puis `python3 scripts/comboFvgV6/comboAO_ml_analyse.py docs/DONNEES-F2-ML.csv docs/SORTIE-F2-ML.txt`. Le script d'extraction refuse de tourner si ce fichier a été modifié.
