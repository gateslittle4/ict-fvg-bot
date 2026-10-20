# PROJET de pré-enregistrement : un modèle appris sur tous les FVG M15, jugé une seule fois

Statut : **DÉFINITIF et figé.** Écrit le 2026-10-18, vers 00 h 30 heure de New York, avant tout calcul. Validé par Krystofia le 2026-10-18 à 00 h 25 (heure de Port-au-Prince, qui est aussi celle de New York à cette date) avec le message « go ». Le SHA-256 de ce fichier est vérifié par les scripts avant tout calcul ; plus rien ne change. Origine : « peut-on essayer le machine learning ? ». Ce n'est pas une variante de F2 : c'est un modèle appris sur beaucoup plus d'exemples que les seuls trades de F2.

## Question
Un modèle appris sur le passé reconnaît-il, parmi tous les FVG M15 valides (achats et ventes, avec ou sans balayage H4), ceux qui atteignent leur objectif avant leur stop ? Les trades qu'il choisirait, exécutés par le moteur du projet, gagnent-ils de l'argent sur des années et des marchés qu'il n'a jamais vus ?

## Données et découpage (US100 pour l'apprentissage)
- Bougies M15 reconstruites du M1 comme dans tout le projet (HistData puis broker), heure NY, coûts et marge de stop mis à l'échelle (prix de l'année / 8 200).
- **Apprentissage : 2011 à 2019.** Le modèle ne voit que ces années pour s'ajuster.
- **Validation : 2020 à 2022.** Sert à choisir une configuration parmi une liste fixée plus bas, et le seuil de sélection. Rien d'autre.
- **Test : 2023 à 2025, US100.** Jugé une fois, avec le modèle et le seuil choisis sur la validation, sans réajustement. À noter : ces années ont déjà été lues pour d'autres études (F2, etc.), mais ce modèle n'a jamais vu leurs résultats.
- **Mis sous scellé : 2026 (US100, jusqu'au 21/09) et GER40 + XAUUSD de 2023 à 2026.** Personne n'y touche pendant la mise au point. Ils sont lus une seule fois, après le verdict du test, avec le même modèle et le même seuil.

## Exemples (les « setups »)
- Chaque ordre que le moteur `krysBacktestC` poserait sur un FVG valide, dans les deux sens, sans filtre de balayage, avec les règles de F2 pour le reste (06 h à 16 h NY, âge au plus 8, entrée 50 %, stop = c1 plus marge de 3, TP = le plus loin entre la moitié du FVG cible et 3R, cible obligatoire, sortie au temps à 96 bougies, spread 0,6).
- Étiquette : le R que cet ordre donnerait **pris seul**, sans l'effet « une position à la fois » (simulateur indépendant, mêmes conventions pessimistes que le moteur : stop d'abord). Les ordres jamais remplis n'ont pas d'étiquette et sont écartés.
- Contrôle du simulateur : sur les trades que le moteur exécute réellement en F2 (achats avec balayage, aucune position ouverte au moment du remplissage), le R du simulateur doit être identique dans au moins 99 % des cas. Sinon l'étude s'arrête.
- Contrôle de F2 : 2011-2022 doit redonner 1 222 trades et 129,7 R.

## Variables (18), toutes connues à la bougie de pose, sans regard vers l'avant
Sens (achat ou vente) ; ln(risque / ATR14) ; ln(RR prévu) ; âge du FVG ; hauteur du FVG / risque ; distance de l'objectif / ATR ; hauteur du FVG cible / ATR ; heure de pose 09 h à 12 h (0/1) ; 12 h à 16 h (0/1) ; lundi ; vendredi ; balayage H4 dans le sens du trade au plus 32 bougies avant la formation (0/1) ; nombre de bougies depuis ce balayage (plafonné à 96) ; position de l'entrée dans l'étendue des 96 dernières bougies (0 à 1) ; position dans l'étendue des 480 dernières bougies ; rendement sur 96 bougies / ATR ; rendement sur 480 bougies / ATR ; ATR14 relatif à sa médiane des 2 000 dernières bougies. Aucune autre variable.

## Modèle et réglage
- `HistGradientBoostingRegressor`, cible = R plafonné à +8 pour l'apprentissage seulement (le R réel sert à l'évaluation), `min_samples_leaf` = 200, `l2_regularization` = 1, taux 0,05, graine 0.
- Six configurations, rien d'autre n'est essayé : profondeur {2, 3, 4} × nombre d'itérations {100, 300}.
- Sélection : on prend les setups dont le score est dans le meilleur q % ; q ∈ {5, 10, 20, 30, 50}. On garde le couple (configuration, q) qui donne le meilleur R moyen **sur la validation**, parmi ceux qui retiennent au moins 300 setups. Le seuil de score τ est celui du modèle appris sur 2011-2019 qui correspond à ce q sur la validation.
- Pas de réajustement ensuite : le modèle appris sur 2011-2019 est figé pour le test et le scellé.

## Jugement principal : test US100 2023-2025
Les trades choisis (score ≥ τ) passent dans le moteur comme filtre, donc avec une seule position à la fois et les coûts réels. Quatre critères :
1. Au moins 100 trades exécutés (sinon le verdict est « non concluant », pas « échec »).
2. R moyen > 0 et t ≥ 1,96.
3. R moyen supérieur à celui de F2 sur les mêmes années.
4. Test de permutation (10 000 tirages, graine 12345) : les setups choisis, pris seuls, battent des sous-ensembles aléatoires de même taille tirés parmi les setups du test, avec p ≤ 0,05.
Plus les deux contrôles ci-dessus.

Verdict : **Modèle utile** si tout passe ; **Compatible, non prouvé** si R moyen > 0, t ≥ 1,0 et p ≤ 0,10 sans que tout passe ; **Non concluant** si moins de 100 trades ; **Aucun gain** sinon.

## Jugement du scellé (une seule lecture, après le test, quel que soit le verdict)
US100 2026, GER40 et XAUUSD 2023-2026, mêmes trades choisis par le même modèle et le même τ, moteur avec les coûts mis à l'échelle. Rapporté séparément et regroupé. **Confirmé** si le regroupé a un R moyen > 0, t ≥ 1,96 et p de permutation ≤ 0,05 ; sinon **Non confirmé**. Un « Modèle utile » non confirmé sur le scellé n'est pas retenu comme règle.

## Précisions d'implémentation (écrites avant tout calcul)
- **Candidats.** Une copie du moteur (`lib/krysBacktestML.js`, option `noFill`) pose tous les ordres sans jamais les remplir, donc sans position ouverte qui masque des FVG. Un ordre est un candidat s'il passe toutes les règles de F2 hors direction et balayage. Les candidats qui n'ont pas 2 000 bougies d'historique avant eux sont écartés (nombre rapporté).
- **Clé d'un candidat** : instrument, année, indice de la bougie de pose, indice de formation du FVG, sens.
- **Balayage.** Pour un achat, dernier balayage du plus bas des 6 dernières barres H4 (vente : du plus haut) connu à la formation du FVG ; la variable « nombre de bougies depuis ce balayage » est (bougie de pose moins bougie du balayage), plafonnée à 96, et vaut 96 s'il n'y en a pas.
- **Étendues** : plus haut et plus bas des 96 puis des 480 dernières bougies, bougie de pose incluse ; position = (entrée moins plus bas) / (plus haut moins plus bas). Rendements : (clôture de la bougie de pose moins clôture 96 ou 480 bougies avant) / ATR14.
- **Seuil τ** : quantile (1 moins q) des scores de **tous** les candidats de la validation, étiquetés ou non. Le R moyen servant au choix est calculé sur les candidats étiquetés retenus.
- **Moteur filtré.** Même moteur que F2 (`krysBacktestC.js`), sens des deux côtés, avec comme filtre « le score du candidat est ≥ τ ». Le jeu de candidats du premier passage est un sur-ensemble de celui du moteur filtré ; tout candidat sans score serait sauté et compté (attendu : zéro).
- **F2 de comparaison** : `runYearF2` de `comboAN_autres_instruments.mjs`, mêmes années.
- **Scellé.** Le script de jugement du test écrit un fichier de verdict ; l'étape du scellé refuse de tourner sans lui et refuse de tourner deux fois (fichier verrou). Les setups du scellé sont extraits en même temps mais ne sont ni affichés ni lus avant cette étape.

## Descriptif prévu (non jugé)
R moyen de tous les setups, des choisis, des écartés, par année et par sens ; variables les plus importantes (importance par permutation sur la validation) ; régression ridge sur les mêmes données (comparaison) ; part des ordres du moteur filtré qui n'avaient pas de score (voir limites) ; chevauchement avec les ordres de F2.

## Limites annoncées
- **Beaucoup d'exemples ne veut pas dire indépendants.** Les setups d'une même journée sont corrélés. Le t du moteur filtré et la permutation en tiennent compte du mieux possible, mais restent un peu flatteurs.
- **Moteur filtré.** Filtrer change la position ouverte, donc les ordres suivants. Quelques ordres du moteur filtré peuvent ne pas avoir été scorés au premier passage (ils sont alors sautés). Leur part sera rapportée ; si elle dépasse 5 %, le verdict est marqué « à interpréter avec prudence ».
- **Biais de sélection.** F2 a été choisie parmi plusieurs variantes, et 2023-2025 a déjà été lu. C'est pourquoi le vrai juge est le scellé.
- **Puissance.** Écart-type d'environ 1,8 R par trade. Un petit avantage réel (+0,1 R) resterait difficile à confirmer sur quelques centaines de trades.
- **Coûts.** Le spread du broker sur GER40 et XAUUSD n'est pas connu ; la mise à l'échelle par le prix est une convention du projet.
- **Ce que le modèle ne voit pas.** Nouvelles, contexte du graphique, jugement de Krystofia.
- **Essais.** C'est un essai de plus. Un échec ne justifie ni un deuxième modèle ni d'autres variables sur les mêmes données.

## Interdit après lecture
Aucun changement de variable, de configuration, de q, de période, de seuil ni de critère. Pas de réajustement après le test. Le scellé n'est pas relu une deuxième fois. Tout autre modèle demande un nouveau pré-enregistrement avec de nouvelles données mises sous scellé. Simulation seulement : aucun ordre réel, aucune décision de trade ; Krystofia décide.
