# Résultat — tri à l'aveugle, lot 7 (10 signaux de F2, graine 20261012)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT7.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt) : je ne l'ai pas calculé.

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Pose | Risque | Date (révélée) |
|---|---|---|---|---|---|
| 1 | prend (si le prix retourne) | stop (−1 R), dans la bougie du remplissage | 09:45 | 6,2 pts | 14/10/2015 |
| 2 | prend (dès 9 h) | stop (−1 R), 1 bougie | 12:45 | 73,0 pts | 02/08/2022 |
| 3 | saute (aurait vendu) | stop (−1 R), 3 bougies | 11:30 | 71,9 pts | 03/03/2021 |
| 4 | prend (dès 8 h 45–9 h) | stop (−1 R), dans la bougie du remplissage | 12:30 | 15,5 pts | 03/01/2020 |
| 5 | saute (aurait vendu) | sortie au temps, +0,99 R | 11:45 | 8,7 pts | 29/01/2013 |
| 6 | saute (aurait vendu) | stop (−1 R), 1 bougie | 13:15 | 4,2 pts | 01/04/2013 |
| 7 | prend (sans FVG M15 à gauche) | **TP, +3,32 R**, 2 bougies | 15:15 | 9,6 pts | 22/11/2019 |
| 8 | saute (aurait vendu) | **TP, +3 R**, 15 bougies | 06:00 | 44,9 pts | 19/08/2021 |
| 9 | je ne sais pas | sortie au temps, +0,73 R | 07:45 | 11,6 pts | 25/07/2013 |
| 10 | prend | stop (−1 R), 2 bougies | 08:45 | 44,4 pts | 11/02/2022 |

Les risques en points ne se comparent pas d'une année à l'autre ; ils sont donnés à titre d'information.

## Bilan (le signal 9, « je ne sais pas », est exclu des deux groupes)
| | Signaux | TP | Sorties au temps | Stops | R total | R moyen |
|---|---|---|---|---|---|---|
| Tu prends (1, 2, 4, 7, 10) | 5 | 1 | 0 | 4 | −0,68 | −0,14 |
| Tu sautes (3, 5, 6, 8) | 4 | 1 | 1 | 2 | +1,99 | +0,50 |
| Sans avis (9) | 1 | 0 | 1 | 0 | +0,73 | — |
| Tous | 10 | 2 | 2 | 6 | +2,04 | +0,20 |

Tu évites **2 des 6 stops** (3 et 6) ; tu laisses passer **1 TP** (le 8) et une sortie au temps positive (le 5). Parmi tes pris, 1 TP sur 5 (le 7), et trois stops (1, 2, 4) touchés dans la bougie du remplissage ou la suivante.

## Sensibilité à mon interprétation
- Signaux 2 et 4 classés « saute » (tu serais entrée plus tôt, non mesuré) : pris = 1, 7, 10 (+1,32 R, moyen +0,44) ; 4 stops sur 6 évités ; le TP du 7 reste chez les pris, celui du 8 chez les sautés.
- Signal 9 classé « prend » : pris = +0,05 R sur 6 ; classé « saute » : sautés = +2,72 R sur 5. Aucun stop n'est concerné.

## Ce que ce lot montre, et ne montre pas
1. Tu dis « j'aurais entré plus tôt » sur les signaux 2 et 4, comme dans les lots 2, 3, 5 et 6 pour d'autres signaux. Le résultat mesuré est celui de F2 (ordre limite posé à 12 h 45 et 12 h 30 ici), pas celui de ton entrée du matin : ces signaux ne testent donc pas ton timing, seulement son absence dans F2. Si ton avantage vient de l'entrée au premier FVG de la journée, F2 ne le capte pas ; c'est la même idée que « premier setup de la journée » notée au lot 5.
2. Les signaux 2, 3, 8 et 10 ont des stops très larges (44 à 73 pts) : trois sont des stops (2 et 10 que tu prends, 3 que tu sautes) et un est un TP (8, que tu sautes en voulant vendre). La taille du stop reste muette sur ces quatre cas.
3. Le signal 5 tombe le 29/01/2013, le même jour que le signal 1 du lot 5 (autres signaux, autres heures). Même limite que pour les lots 4 et 6 : la règle « un signal par jour » ne vaut que dans un lot.
4. Sept lots tirés : le bilan agrégé suivra après le lot 10 selon le protocole ; tu peux arrêter avant en le disant.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261012 10 signaux.json cle.json <cle des lots 1 à 6, séparées par des virgules>`
