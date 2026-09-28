# Pré-enregistrement : « version échelle » LY d'Esdras, 28/09/2026

Écrit et enregistré **avant tout calcul de performance**. Code : `wideZones`, `signalsLY`, `executeLY` dans `scripts/lib/esdrasMethod.js` ; script `scripts/runEsdrasLY.js`.

## Origine
La règle LX (même jour) est rejetée en exploration (−0,045 à −0,085 R). Esdras a ensuite précisé sa façon de faire sur ses séances à l'aveugle du simulateur :
- un FVG existe si « les mèches peuvent se chevaucher, pas leurs corps » (volume imbalance) ;
- il connaît « 3 possibilités de trade » dans le mouvement : la zone la plus proche, puis les suivantes ;
- son stop va au bord de la zone suivante (« si ce FVG tient, le prix n'ira pas chercher le suivant ») ;
- 0,25 % par trade et 2 trades de réserve ;
- l'objectif passe au FVG à gauche suivant quand le premier est déjà touché.

## Règle (US100, M15, heure de New York)
1. **Zones au sens large** : trois bougies A, B, C dont les corps de A et C ne se touchent pas. Zone = [haut de A, bas de C] s'il y a un vrai vide, sinon [haut du corps de A, bas du corps de C] (achat ; l'inverse pour une vente).
2. **BMS M15** (fermeture au-delà du dernier sommet/creux à 1 bougie), bougie q. La jambe part du plus bas (haut) des 48 bougies avant q.
3. **Zones de l'échelle** : zones du sens formées dans la jambe (bougie C entre le bout de la jambe et q + 1), jamais retouchées au moment de poser les ordres, fusionnées si elles se chevauchent, de la plus proche à la plus lointaine du prix.
4. **Échelle** : au plus 3 entrées limite.
   - Entrée k au bord proche de la zone k.
   - Stop k au bord proche de la zone k + 1 ; dernier stop au bout de la jambe.
   - L'entrée suivante ne sert qu'après un stop.
5. **Objectifs en chaîne** :
   - candidats : FVG M15 opposés formés avant q (au plus 288 bougies avant), d'au moins 0,1 % du prix de hauteur, pas entièrement remplis ; niveau = bord proche de leur partie vide ;
   - chaque entrée vise le plus proche qui donne au moins 3R ;
   - si l'objectif est touché avant le remplissage, l'ordre reste et vise le suivant (au moins 3R) ;
   - l'échelle est acceptée si au moins un objectif donne 3R à la première entrée.
6. **Pose des ordres** : à la fermeture de q + 1, si c'est entre 7 h et 11 h ou entre 18 h et 23 h. Sinon, à l'ouverture de la fenêtre suivante, au plus 12 h après.
7. **Gestion des ordres** :
   - ordres valables 8 h, annulés si un signal de l'autre sens apparaît avant leur remplissage ;
   - une chose à la fois, au plus 3 trades remplis par jour ;
   - sortie au plus tard à 17 h NY, à la dernière clôture avant une fermeture de marché (week-end), pas à la réouverture.
8. Exécution à la minute (M1 HistData), conventions habituelles : stop d'abord, y compris la minute d'entrée ; objectif à partir de la minute suivante ; spread et swap du projet.

## Calibrage (avant tout calcul de performance)
Le mode `match` a été lancé sur les séances du simulateur (juin 2017, juin 2018) et sur le compte en direct (24-28/09/2026).
- Son achat du 21/06/2017 est reproduit au centime : entrée 2 à 5 717,23, stop 5 710,98, +3,08R.
- Sa réentrée du 20/06/2017 est reproduite (+3,26R, objectif en chaîne).
- Sa vente du 27/09/2026 est trouvée plus tard (21h15, +3,24R).
- Son achat du 27/06/2018 : la première entrée est stoppée et la deuxième est annulée par un signal contraire.

Les corrections faites pendant ce calibrage portent sur la mécanique :
- annulation des ordres sur un signal contraire ;
- pas de doublon ;
- sortie avant le week-end.

## Critères
- **Exploration** US100 2011-2018 (blocs comptés du protocole) : au moins 60 trades, R moyen > 0, **t ≥ 2,5** (c'est la cinquième famille de règles d'Esdras testée sur ces années, d'où le seuil strict), les deux moitiés positives.
- Si elle est retenue : **validation** 2019-2022 une seule fois (R > 0 et t ≥ 2), puis **finale** 2023-2024 + 2026 (R > 0 et t ≥ 2), et US500 hors échantillon.
- Descriptif : résultat par entrée (1re, 2e, 3e).
