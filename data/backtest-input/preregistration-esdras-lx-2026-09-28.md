# Pré-enregistrement : règle LX d'Esdras (FVG à gauche + BMS dans son sens + FVG d'entrée), 28/09/2026

Écrit et enregistré **avant tout calcul de performance**. Code : `signalsLX` dans `scripts/lib/esdrasMethod.js`, script `scripts/runEsdrasLX.js`.

## Origine
Règle dite par Esdras après ses premiers trades du simulateur (journal `bot_sim_journal`) : « on a un FVG 15 min à gauche en haut, on a un BMS dans son sens, ensuite on a un FVG 15 min haussier qu'on entre pour cibler le FVG 15 min baissier à gauche » (achat ; l'inverse pour une vente). Précisions du même jour : le FVG visé n'a pas besoin d'être vierge ; un ordre limite posé pendant ses heures peut se remplir en dehors ; il entre au toucher (ordre limite).

## Règle (US100, M15, heure de New York)
1. **BMS** M15 : fermeture au-delà du dernier sommet (creux) confirmé à 1 bougie ; bougie q ; sens du trade = sens du BMS.
2. **FVG d'entrée** : le premier FVG M15 du même sens dont la bougie C est entre q + 1 et q + 4 (formé après le BMS).
3. **Objectif** : parmi les FVG M15 de sens opposé formés au plus 288 bougies avant q, d'au moins 0,1 % du prix de hauteur, pas entièrement remplis au moment de poser l'ordre, le plus proche au-delà de l'entrée ; objectif = bord proche de sa partie encore vide.
4. **Pose de l'ordre** : à la fermeture de la plus tardive des bougies q et C si c'est entre 7 h et 11 h ou entre 18 h et 23 h ; sinon à l'ouverture de la fenêtre suivante (au plus 12 h après), si le prix n'a touché ni l'entrée entre-temps. Ordre limite valable 8 h ; annulé si l'objectif est touché avant ; sortie au plus tard à 17 h NY suivant ; au plus 3 trades remplis par jour, une chose à la fois ; au moins 3R prévus.
5. **Trois variantes de stop** (trois candidates, d'où le seuil t ≥ 2,5) :
   - **LX-A** : stop à la mèche de la bougie A du FVG d'entrée ; entrée au bord proche, ou au milieu du FVG si le bord ne donne pas 3R ;
   - **LX-E** : entrée au bord proche, stop au bord lointain du FVG − 0,5 × sa hauteur ;
   - **LX-M** : entrée au bord proche, stop à mi-chemin entre les deux.
6. Exécution à la minute (M1 HistData), mêmes conventions que les tests précédents : stop d'abord (y compris la minute d'entrée), objectif à partir de la minute suivante, spread et swap du projet.

## Calibrage (fait avant tout calcul de performance)
Le mode `match` de `runEsdrasLX.js` a été lancé sur la séance à l'aveugle du 25 au 27/06/2018 (période d'exploration, bougies M15 du simulateur) et sur les bougies du compte en direct du 24 au 28/09/2026, pour comparer les signaux aux trades d'Esdras. Trois ajustements en sont sortis, tous pour reproduire ses décisions et non un résultat :
- FVG d'entrée formé après le BMS (C ≥ q + 1) ;
- objectif d'au moins 0,1 % du prix ;
- setup formé juste avant la fenêtre pris à son ouverture, et entrée au milieu pour LX-A.

Résultat du calibrage :
- sa vente du 27/09/2026 est reproduite par LX-A (+3,46R) ;
- son achat du 27/06/2018 est reproduit par LX-E (+4,82R, contre +4,96R pour lui) ;
- sa vente manquée du 26-27/06/2018 est reproduite par LX-A (remplie à 1h15, +3,02R) ;
- son achat du 26/06/2018 est trouvé par les trois variantes, avec un stop un peu plus serré que le sien, touché.

Aucune statistique n'a été calculée pendant ce calibrage. Les trades du journal de 2024 appartiennent à la période finale : leurs bougies ont été regardées pour analyser le journal, mais pas pour le calibrage.

## Critères
- **Exploration** US100 2011-2018 (blocs comptés du protocole) : au moins 60 trades, R moyen > 0, t ≥ 2,5, les deux moitiés positives. Chaque variante est jugée séparément.
- Une variante retenue passe ensuite une seule fois en **validation** 2019-2022 (R > 0 et t ≥ 2), puis en **finale** 2023-2024 + 2026 (R > 0 et t ≥ 2), et sur US500 hors échantillon.
- Descriptif seulement : la répartition avec ou sans prise du plus bas (haut) de la veille avant le BMS.
