# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : le schéma des captures d'Esdras (FVG H4, FVG M15, objectif le FVG non testé à gauche)

Date : 2026-09-27. Captures du 24-25/09/2026 :
- le prix revient dans un FVG H4 haussier ;
- un FVG M15 haussier se forme en bas (entrée) ;
- l'objectif est le FVG M15 baissier laissé à gauche par la baisse, jamais retouché ;
- confirmation par la tendance H4 et une prise de liquidité suivie d'un BMS.

Règle écrite pour un achat. Tout est inversé pour une vente.

## Base (LD0)
- **Le FVG d'entrée** : un FVG M15 haussier (A, B, C). La bougie D ne touche pas la zone, et sa fermeture tombe entre 7 h et 11 h ou
  entre 20 h et 23 h NY.
- **L'objectif** : le FVG M15 **baissier non testé** le plus proche au-dessus de l'entrée (on vise son bas). Il doit remplir trois
  conditions :
  - formé au moins 8 bougies M15 (2 h) avant la bougie C ;
  - formé au plus 192 bougies (2 jours) avant ;
  - jamais touché jusqu'à la fermeture de D.

  S'il n'y en a pas, pas de trade.
- **Entrée, stop et gestion** : comme sa méthode.
  - échelle bord / milieu / mèche de A, avec au moins 3R jusqu'à l'objectif ;
  - ordre annulé à 11 h, ou le lendemain à 7 h pour le soir, ou si l'objectif est touché avant ;
  - sortie à l'objectif, au stop ou à 17 h NY ;
  - au plus 3 trades remplis par jour.

## Confirmations (LD3 = LD0 + les trois)
- **(a) FVG H4** : dans les 16 dernières bougies M15, le prix est entré dans un FVG H4 haussier encore valide (pas refermé en dessous),
  et il ferme au-dessus de son bas à la fermeture de D.
- **(b) Tendance H4** : le dernier BMS H4 est haussier. Un BMS H4 est une fermeture H4 au-dessus du dernier sommet H4 confirmé.
- **(c) Liquidité puis BMS** : dans les 32 dernières bougies M15, deux choses se suivent :
  - le prix passe sous le plus bas de la veille ;
  - ensuite, un BMS M15 haussier se produit.

## Critères
Deux candidates : LD0 et LD3. LDa, LDb et LDc (chaque confirmation seule) sont données en descriptif et ne décident rien.
1. **Exploration US100 2011-2018**. Une candidate est retenue si elle remplit toutes ces conditions :
   - au moins 60 trades, R moyen > 0, **t ≥ 2,5** ;
   - les deux moitiés positives.
2. **Si retenue, US500** (les trois périodes additionnées) : R moyen > 0 et t ≥ 2.
3. **En descriptif** : US100 2019-2022 et 2023-2026.

Aucun réglage : 8 bougies, 192, 16, 32 et « plus bas de la veille » sont fixés ici.

## Résultat (27/09) : LD0 et LD3 REJETÉES dès l'exploration US100 2011-2018
| | Trades | R moyen | t | Sans les 5 meilleurs |
|---|---|---|---|---|
| **LD0** (FVG M15 vers le FVG à gauche) | 1 629 | +0,040 | 0,56 | −47 R |
| **LD3** (+ FVG H4 + tendance H4 + liquidité puis BMS) | 20 | −0,784 | −3,09 | −16 R |
| LDa (+ FVG H4, descriptif) | 751 | +0,086 | 0,85 | −16 R |
| LDb (+ tendance H4, descriptif) | 470 | +0,051 | 0,38 | −51 R |
| LDc (+ liquidité puis BMS, descriptif) | 460 | +0,015 | 0,12 | −64 R |

- **LD3** : les trois confirmations ensemble, avec au moins 3R jusqu'à un FVG à gauche proche, n'arrivent que 20 fois en 8 ans.
- US500 et les autres périodes ne sont pas lus. Détails : `esdras-left-US100-explore.md`.
