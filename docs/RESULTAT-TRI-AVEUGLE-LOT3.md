# Résultat — tri à l'aveugle, lot 3 (10 signaux de F2, graine 20261008)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT3.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt).

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Risque | Date (révélée) |
|---|---|---|---|---|
| 1 | saute | stop (−1 R), 4 bougies | 9,4 pts | 12/06/2015 |
| 2 | saute | **TP, +3 R** | 48,3 pts | 29/06/2020 |
| 3 | prend (buy à 8 h 45) | stop (−1 R), 1 bougie | 7,7 pts | 08/12/2014 |
| 4 | saute | stop (−1 R), 4 bougies | 4,1 pts | 22/03/2012 |
| 5 | saute (stop trop loin) | sortie au temps, +0,91 R | 20,9 pts | 01/04/2016 |
| 6 | saute (aurait vendu à 9 h) | stop (−1 R), 77 bougies | 6,5 pts | 25/07/2014 |
| 7 | prend | stop (−1 R), 76 bougies | 9,2 pts | 27/03/2017 |
| 8 | saute (stop « gigantesque ») | stop (−1 R), 77 bougies | 18,1 pts | 20/06/2012 |
| 9 | saute | stop (−1 R), 5 bougies | 12,3 pts | 02/12/2019 |
| 10 | saute (c'est un sell pour toi) | **TP, +3 R** | 12,3 pts | 29/04/2016 |

Les risques en points ne se comparent pas d'une année à l'autre (le prix de l'indice a été multiplié par près de dix entre 2011 et 2025) ; ils sont donnés à titre d'information seulement.

## Bilan
| | Signaux | TP | Stops | R total | R moyen |
|---|---|---|---|---|---|
| Tu prends (3, 7) | 2 | 0 | 2 | −2,00 | −1,00 |
| Tu sautes (1, 2, 4, 5, 6, 8, 9, 10) | 8 | 2 | 5 | +1,91 | +0,24 |
| Tous | 10 | 2 | 7 | −0,09 | −0,01 |

Tu évites **5 des 7 stops** du lot, mais tu laisses passer **les 2 TP** (2 et 10) et une sortie au temps à +0,91 (5). Tu ne prends que 2 signaux sur 10 ; les deux sont des stops, dont l'un stoppé une bougie après le remplissage (3, dont ton heure d'entrée 8 h 45 n'est pas mesurée ici).

## Sensibilité à mon interprétation
- Signal 3 classé « saute » au lieu de « prend » : un seul signal pris (7, −1 R) ; 6 stops sur 7 évités.
- Signal 8 classé « prend » : pris = 3, 7, 8 (−3 R, moyen −1,00) ; 4 stops sur 7 évités.
- Dans les deux cas, les 2 TP restent dans les sautés.

## Ce que ce lot montre, et ne montre pas
1. Les signaux 6 et 10 sont des cas où tu décris un sell. F2 est un achat : le résultat (stop pour le 6, TP pour le 10) concerne l'achat, pas ton sell. Le signal 10 est celui d'un FVG rouge (la cible de F2) que tu lis comme une entrée à la vente. On ne mesure pas ces sells ici.
2. Tu cites un critère nouveau, **le stop trop loin** (signaux 5 et 8). Sur ce lot, ces deux signaux donnent +0,91 R et −1 R : rien à en conclure, mais la raison est notée avec les autres (order flow, low H4 pris, BMS M15, bougies bearish fortes avant le signal, FVG bearish au-dessus du prix).
3. Ton critère « stop trop loin » est mesurable (stop relatif à l'amplitude récente) ; il l'a déjà été en partie (étude des pertes de F2, signal du quartile de stop non retrouvé hors échantillon). Si tu veux en faire une règle, elle demande sa propre définition et son prérégistrement ; je ne l'ajoute pas à ce protocole.
4. Les trois lots tirés restent trop petits pour se lire ensemble (lot 1 : 0 TP ; lot 2 : 3 TP tous sautés ; lot 3 : 2 TP tous sautés). Le bilan agrégé suivra le protocole.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261008 10 signaux.json cle.json <lot1-cle.json>,<lot2-cle.json>`
