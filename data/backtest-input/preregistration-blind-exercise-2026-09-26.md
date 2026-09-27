# PRÉ-ENREGISTREMENT (écrit AVANT de lire une seule réponse) — Exercice à l'aveugle v3 : l'œil d'Esdras bat-il le hasard ?

Date : 2026-09-26. Page : https://claude.ai/artifact/778pZta9Q3BGw3LcxggAGE (collection `answers`). Cas : `data/blind/setups.json` v3.
- 300 FVG M15 US100, 2011-2018, dates cachées : 200 le matin (`a001`…, 3 h-11 h NY), 100 le soir (`b001`…, 19 h-23 h NY).
- Règle confirmée par Esdras (`data/blind/regle-fvg.html`) : la bougie C forme le FVG, la bougie D se ferme hors de la zone, et le
  graphique s'arrête là.
- Résultats mécaniques calculés avant ses réponses et jamais montrés : `data/backtest-input/blind-outcomes.json`.

## Mesure principale (fixée maintenant)
- **Exécution** : limite au bord proche ; stop sous la mèche de la bougie A ; objectif 3R ; ordre annulé si l'objectif est touché
  avant, ou à 11 h NY (3 h NY le soir). Clé `meche_3R`.
- **Grandeur mesurée** : écart = R moyen de ses « je pose l'ordre » − R moyen de ses « je laisse », sur les ordres remplis.
  - Test de permutation : 10 000 tirages des étiquettes oui/non sur les cas remplis.
  - Intervalle de confiance à 90 % par bootstrap.
- **Verdict** :
  - au moins 40 « oui » remplis et 40 « non » remplis sinon NON CONCLUANT ;
  - **l'œil ajoute quelque chose** si l'écart est > 0 avec p < 0,05 (unilatéral) ET si le R moyen de ses « oui » est > 0 ;
  - sinon : pas démontré.
- **Seuil de lecture** : premier point à 150 réponses (100 matin + 50 soir), résultat final à la fin. Arrêt anticipé seulement si,
  à 150 réponses, p < 0,01.

## Descriptif (ne décide rien)
- Les autres exécutions : stop sous la zone ; 2R et 4R.
- Le matin et le soir séparément.
- Chaque raison cochée : R des « oui » avec cette raison.

## Et si l'œil ajoute quelque chose
Les caractéristiques qui séparent ses « oui » de ses « non » seront écrites en règle et pré-enregistrées. Cette règle sera testée une
seule fois sur 2023-2026, années gardées intactes (jamais lues par la recherche de nuit).

## Amendement du 27/09 (écrit AVANT toute lecture des résultats) — version 4 : tout recommencer
- **Le problème** : à 212 réponses (200 matin, 12 soir), Esdras a dit qu'il croyait que « vente » pouvait vouloir dire « achat pour de vrai ».
  Sur une partie des ventes, ses « je pose l'ordre » voulaient donc parfois dire « j'achèterais ». On ne peut pas savoir lesquelles.
- **Décision** : les réponses v3 (collection `answers`) sont écartées en entier. Elles sont gardées dans la base, mais ne comptent pas.
  Aucun résultat mécanique n'a été croisé avec elles.
- **Les cas restent les mêmes** (`setups.json` v3, a001-a200 et b001-b100) : il n'a jamais vu ce qui s'est passé après D.
- **Les nouvelles réponses** vont dans la collection `answers4`. La page affiche désormais :
  - « ACHAT » ou « VENTE » avec le prix de l'ordre ;
  - un bouton « J'achète ici » ou « Je vends ici » ;
  - une nouvelle raison « J'aurais pris l'autre sens ».
- **Mesure, verdict et seuil de lecture inchangés** (150 réponses : 100 matin + 50 soir).
- **Précision (27/09, avant toute réponse v4)** : à la demande d'Esdras, la page a trois boutons, Achat, Vente et Rien. C'est lui qui
  choisit le sens.
  - `take` = vrai seulement s'il choisit le sens du FVG. C'est la mesure principale, inchangée.
  - Choisir le sens inverse compte comme « non » pour ce trade. Ce choix (`side`) est analysé en descriptif seulement.
- **Ordre d'affichage** : a001-a100 et b001-b050 d'abord, pour atteindre le premier point de lecture ; puis le reste.
- **Échauffement (27/09, avant toute réponse v4)** : Esdras tradait en 2025 et craint d'avoir perdu la main. En descriptif, je
  sépare ses 50 premières réponses v4 des suivantes (même mesure). Si l'écart grandit avec le temps, c'est de la rouille, pas une
  absence d'œil. Le verdict principal ne change pas.
- **Retour aux deux boutons (27/09, après 1 seule réponse v4, sans résultat lu)** : Esdras préfère que le sens soit donné. La page
  affiche en gros ACHAT ou VENTE, avec deux boutons, « J'achète » ou « Je vends », et « Je laisse ». La raison « J'aurais pris
  l'autre sens » revient.
  - Sa réponse a001, donnée avec les trois boutons, est gardée : son champ `take` a le même sens.
  - Mesure inchangée.
- **Entrée après prise de liquidité (27/09, avant lecture)** : Esdras attendait parfois que le prix prenne un sommet ou un creux proche
  du FVG avant d'entrer. Il a une nouvelle raison à cocher : « J'attends qu'un high/low proche soit pris ».
  - En descriptif seulement, sur ses « oui » cochés ainsi, je compare l'ordre au bord et une entrée après la prise du creux M15 le plus
    proche sous la zone (au-dessus pour une vente). Cette entrée se fait au retour dans la zone, avec le même stop et le même objectif.
  - Le verdict principal ne change pas.

## Amendement du 27/09 (avant toute réponse sur ces cas) — version 5 : nouveaux cas
- **Règle précisée par Esdras** : la bougie juste avant A ne doit pas toucher la zone, comme la bougie D juste après C. Dans les cas v3,
  environ la moitié des FVG ne respectaient pas ça (a058, par exemple).
- **Nouveaux cas** : `setups.json` v5, construits par le même script avec ce filtre en plus. Ce sont 200 cas du matin (`c001`…) et
  100 du soir (`d001`…), toujours sur 2011-2018, un par jour.
  - Les résultats mécaniques sont recalculés dans `blind-outcomes.json` v5 ; le v3 reste dans l'historique git.
- **Les réponses** vont dans la collection `answers5`. Toutes les réponses précédentes (v3 `answers`, v4 `answers4` : 1 réponse) sont
  écartées.
- **Mesure, verdict, seuil (100 matin + 50 soir) et descriptifs inchangés.** Cela comprend :
  - l'échauffement : 50 premières réponses contre les suivantes ;
  - la prise de liquidité ;
  - la taille du FVG ;
  - le rang.

## Amendement du 27/09 (avant toute lecture des résultats) — version 6 : retour aux cas v3, réponses d'achat reprises
- **Pourquoi** : Esdras ne peut pas refaire 150 graphiques. Il confirme que, sur les cas ACHAT, « je pose l'ordre » voulait bien dire
  acheter ; sa confusion ne portait que sur les ventes. Ses réponses v3 le montrent aussi : il disait oui à 45 % des achats dans le sens
  de la tendance sur 40 h, contre 26 % à contre-tendance.
- **Cas** : retour à `setups.json` v3 et `blind-outcomes.json` v3. Les fichiers v5 sont gardés à part (`setups-v5.json`,
  `blind-outcomes-v5.json`) et ne servent pas.
- **Réponses** : collection `answers6`.
  - Ses 121 réponses v3 sur des cas ACHAT y sont recopiées telles quelles : 110 du matin, 11 du soir.
  - Ses réponses v3 sur les ventes (91) restent écartées.
  - Les cas restants (soir d'abord) sont répondus sur la page au sens clairement affiché.
- **Premier point de lecture** : 100 réponses du matin (ici 110 achats) et 50 du soir, soit encore 39 réponses du soir.
  - Au matin, la mesure principale ne porte donc que sur des achats.
  - Mesure, verdict et seuils de remplissage inchangés.
- **Nouveaux descriptifs** : séparation selon que la bougie juste avant A touche la zone ou non (règle précisée v5).
- **Raisons ajoutées** : « Liquidité prise + BMS » et « Higher highs / lower lows ». En descriptif, comme les autres raisons.
- **Trades contraires (27/09, avant lecture)** : Esdras changeait parfois de sens après un BMS. En descriptif, sur ses « Je laisse » cochés
  « J'aurais pris l'autre sens », je mesure le mouvement du prix entre la fermeture de D et l'heure de sortie, en ATR H1, compté dans le
  sens inverse du FVG. Je le compare à ses autres « Je laisse » et à l'ensemble des cas. Le chiffre est aussi donné avec la raison
  « Liquidité prise + BMS » quand elle est cochée. Le verdict principal ne change pas.

## Amendement du 27/09 (écrit AVANT toute lecture des résultats) — lecture intermédiaire pour ne pas gaspiller son temps
- **Pourquoi** : Esdras ne veut pas remplir 39 cas de plus si rien n'en sortira. Le matin est déjà au complet : 110 achats repris.
- **Lecture intermédiaire** : maintenant, sur ses 110 réponses d'achat du matin (`answers6`, ids a…), avec la mesure principale (`meche_3R`,
  ordres remplis, écart oui − non, permutation unilatérale sur 10 000 tirages).
- **Arrêt pour futilité** : on arrête l'exercice si l'une de ces conditions est vraie :
  - l'écart oui − non est ≤ 0 ;
  - le R moyen de ses « oui » est ≤ 0.

  Le verdict est alors « l'œil n'ajoute rien de démontré sur les achats du matin ». Tous les chiffres lui sont donnés.
- **Sinon, il continue jusqu'à 150.**
  - Pendant ce temps, on ne lui donne pas les chiffres intermédiaires, seulement « continue ».
  - Le verdict final à 150 exige p < 0,025 (unilatéral) au lieu de 0,05, pour tenir compte de la lecture intermédiaire. Les autres
    conditions ne changent pas : au moins 40 remplis de chaque côté, R moyen des « oui » > 0.
- **S'il y a moins de 25 ordres remplis d'un côté à la lecture intermédiaire** : pas de décision, il continue.
