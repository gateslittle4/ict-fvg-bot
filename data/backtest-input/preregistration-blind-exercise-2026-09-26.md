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
