# Résultat — tri à l'aveugle, lot 8 (10 signaux de F2, graine 20261013)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT8.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt) : je ne l'ai pas calculé.

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Pose | Risque | Date (révélée) |
|---|---|---|---|---|---|
| 1 | saute (trop haut) | stop (−1 R), 53 bougies | 14:30 | 31,9 pts | 02/06/2022 |
| 2 | saute (aurait vendu) | stop (−1 R), 1 bougie | 07:00 | 5,8 pts | 15/03/2016 |
| 3 | prend | stop (−1 R), 5 bougies | 07:00 | 5,4 pts | 26/06/2015 |
| 4 | prend | stop (−1 R), 4 bougies | 07:30 | 5,5 pts | 03/06/2013 |
| 5 | saute | stop (−1 R), 4 bougies | 13:15 | 8,6 pts | 12/06/2013 |
| 6 | prend | **TP, +3 R**, 10 bougies | 06:30 | 4,1 pts | 10/12/2012 |
| 7 | saute (dans un FVG H4 bullish) | **TP, +8,59 R**, 6 bougies | 06:45 | 24,6 pts | 20/10/2022 |
| 8 | saute (pas de rejet) | stop (−1 R), dans la bougie du remplissage | 06:30 | 4,8 pts | 26/09/2016 |
| 9 | saute (l'heure) | stop (−1 R), 2 bougies | 12:45 | 5,2 pts | 14/04/2011 |
| 10 | prend (l'heure) | stop (−1 R), 2 bougies | 09:15 | 13,1 pts | 22/04/2015 |

Les risques en points ne se comparent pas d'une année à l'autre ; ils sont donnés à titre d'information.

## Bilan
| | Signaux | TP | Stops | R total | R moyen |
|---|---|---|---|---|---|
| Tu prends (3, 4, 6, 10) | 4 | 1 | 3 | 0,00 | 0,00 |
| Tu sautes (1, 2, 5, 7, 8, 9) | 6 | 1 | 5 | +3,59 | +0,60 |
| Tous | 10 | 2 | 8 | +3,59 | +0,36 |

Tu évites **5 des 8 stops** ; tu laisses passer **un TP**, mais c'est le gros du lot : le signal 7, +8,59 R (la cible du FVG était loin). Sans ce trade, tes sautés feraient −5 R sur 5 signaux et tes pris 0,00 R sur 4 ; avec lui, le lot penche pour les sautés. Un seul trade décide donc du R moyen ; le nombre de stops évités est la mesure la plus stable.

## Sensibilité à mon interprétation
- Signal 10 classé « saute » (stop trop loin, contexte manquant) : pris = 3, 4, 6 (+1,00 R, moyen +0,33) ; 6 stops sur 8 évités.
- Le TP du signal 7 reste chez les sautés dans tous les cas.

## Ce que ce lot montre, et ne montre pas
1. Le signal 7 est celui que tu refuses parce qu'on est dans un FVG H4 bullish, et c'est le plus gros gagnant des huit lots tirés. Le même critère (« FVG H4 ») revient au signal 8 (stoppé dans la bougie du remplissage). Un critère « FVG H4 » ne distingue donc pas bons et mauvais ici. Dans ton texte, le sens du FVG H4 n'est pas précisé : le test d'une règle demanderait de le définir (FVG H4 de quel sens, rempli ou non, à quelle distance).
2. L'heure revient comme raison (9 refusé, 10 pris) : le 9 (12 h 45) est un stop, le 10 (09 h 15) aussi. Le critère d'heure a déjà été testé sur F2 et rejeté ; je ne l'ajoute pas au protocole.
3. Six signaux sur dix sont posés entre 06 h 30 et 07 h 30 (2, 3, 4, 6, 7, 8) : deux TP (6 et 7) et quatre stops. Rien à en conclure avec ces effectifs.
4. Huit lots tirés : le bilan agrégé suivra après le lot 10 selon le protocole ; tu peux arrêter avant en le disant.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261013 10 signaux.json cle.json <cle des lots 1 à 7, séparées par des virgules>`
