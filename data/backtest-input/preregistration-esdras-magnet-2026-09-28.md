# Pré-enregistrement : le FVG 15 min à gauche est-il un aimant ? (28/09/2026)

Écrit et enregistré **avant tout calcul**. Script : `scripts/runEsdrasMagnet.js`.

## Hypothèse d'Esdras
« Le FVG 15 min à gauche est comme une attirance pour le prix. » On la teste seule, sans entrée, sans stop et sans gestion : **après un BMS M15, le FVG opposé à gauche est-il atteint plus souvent qu'un niveau quelconque placé à la même distance ?**

## Définitions (US100, données M1 HistData, bougies M15, heure du moteur)
- **Événement** : chaque BMS M15 (fermeture au-delà du dernier sommet/creux à 1 bougie, `bmsIdx`), sens d = sens du BMS, bougie q, prix de départ = clôture de q, ATR = ATR M15 (14) à q.
- **FVG à gauche** (même définition que LX/LY) :
  - FVG M15 de sens opposé à d, formé au plus 288 bougies avant q ;
  - hauteur d'au moins 0,1 % du prix ;
  - pas entièrement rempli à la clôture de q ;
  - niveau = bord proche de sa partie encore vide, au-delà du prix de départ dans le sens d ;
  - on retient le plus proche.
- **Distance** r = |niveau − prix de départ| / ATR.
- **Excursion** : plus grand déplacement dans le sens d pendant les **24 h** qui suivent la clôture de q, en ATR (m). Le niveau est « atteint » si m ≥ r.
- **Référence (niveau quelconque)** : pour une distance r, la probabilité de base p(r) = part des BMS **du même sens** (tous, avec ou sans FVG) dont l'excursion atteint r ATR.
- **Aimant** : pour chaque événement avec FVG à gauche, écart = (atteint ? 1 : 0) − p(r). La moyenne des écarts mesure l'attraction. On calcule d'abord la moyenne par jour, puis le t sur les jours, parce que les événements d'un même jour ne sont pas indépendants.

## Critères
- **Exploration** US100 2011-2018 (blocs comptés du protocole) : l'aimant « existe » si l'écart moyen est d'**au moins +3 points de pourcentage** avec **t ≥ 2,5**.
- S'il existe, **validation** 2019-2022 une seule fois (écart > 0 et t ≥ 2), puis US500 hors échantillon.
- Descriptif :
  - écart par tranche de distance (0-2, 2-4, 4-8, ≥ 8 ATR) ;
  - horizon de 8 h ;
  - comparaison avec les BMS sans aucun FVG à gauche.
