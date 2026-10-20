# Résultat — tri à l'aveugle, lot 6 (10 signaux de F2, graine 20261011)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT6.md`, commité avant l'ouverture de la clé, signaux 1 et 9 précisés après relance). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt) : je ne l'ai pas calculé.

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Pose | Risque | Date (révélée) |
|---|---|---|---|---|---|
| 1 | prend (stop trop loin) | **TP, +3 R**, 50 bougies | 11:00 | 5,7 pts | 20/09/2012 |
| 2 | saute | stop (−1 R), 18 bougies | 10:30 | 10,0 pts | 21/01/2019 |
| 3 | saute | stop (−1 R), 1 bougie | 06:15 | 11,3 pts | 11/02/2016 |
| 4 | saute | stop (−1 R), dans la bougie du remplissage | 10:30 | 4,1 pts | 03/09/2013 |
| 5 | prend (dès 7 h 30) | stop (−1 R), dans la bougie du remplissage | 09:15 | 8,0 pts | 03/11/2011 |
| 6 | saute | stop (−1 R), 29 bougies | 11:15 | 28,7 pts | 18/06/2018 |
| 7 | prend | **TP, +3 R**, 94 bougies | 07:45 | 49,8 pts | 15/08/2019 |
| 8 | prend | stop (−1 R), 7 bougies | 06:00 | 3,1 pts | 07/02/2013 |
| 9 | saute (aurait vendu) | stop (−1 R), 1 bougie | 12:00 | 7,9 pts | 29/01/2014 |
| 10 | saute | stop (−1 R), 8 bougies | 06:00 | 95,9 pts | 17/03/2020 |

Les risques en points ne se comparent pas d'une année à l'autre ; ils sont donnés à titre d'information.

## Bilan
| | Signaux | TP | Stops | R total | R moyen |
|---|---|---|---|---|---|
| Tu prends (1, 5, 7, 8) | 4 | 2 | 2 | +4,00 | +1,00 |
| Tu sautes (2, 3, 4, 6, 9, 10) | 6 | 0 | 6 | −6,00 | −1,00 |
| Tous | 10 | 2 | 8 | −2,00 | −0,20 |

Dans ce lot, ton tri a fait ce que tu cherches : tu évites **6 des 8 stops** et tu ne perds **aucun gagnant** (les 2 TP, 1 et 7, sont dans tes « pris »). C'est le lot le plus favorable à ton tri jusqu'ici ; il est aussi le plus mauvais pour F2 (8 stops sur 10). Un lot ne fait pas une tendance.

## Sensibilité à mon interprétation
- Signal 5 classé « saute » (tu serais entrée à 7 h 30, non mesuré) : pris = 1, 7, 8 (+5 R, moyen +1,67) ; 7 stops sur 8 évités.
- Signal 1 classé « saute » (à cause du stop trop loin) : pris = 5, 7, 8 (+1 R, moyen +0,33) ; le TP du signal 1 serait perdu.
- Signal 9 classé « prend » : un stop de plus chez les pris (+3 R sur 5, moyen +0,60) ; 5 stops sur 8 évités.

## Ce que ce lot montre, et ne montre pas
1. Les signaux 1 (stop de 5,7 pts, TP) et 7 (stop de 49,8 pts, TP après 94 bougies) sont deux TP avec des stops très différents. Tu as refusé le 10 (95,9 pts, le plus large du lot, mars 2020) : il a été stoppé en 8 bougies. Une fois de plus, la taille du stop seule ne tranche rien sur quelques signaux.
2. Le signal 9 tombe le 29/01/2014, le même jour que le signal 3 du lot 3 (autres signaux, autres heures). Même limite que pour le lot 4 : la règle « un signal par jour » ne vaut que dans un lot.
3. Les signaux 5 et 4 ont été stoppés dans la bougie même du remplissage : sur ces deux-là, un stop plus large ou une autre heure d'entrée aurait changé le résultat ; ton entrée dès 7 h 30 pour le 5 n'est pas mesurée.
4. Six lots tirés : le bilan agrégé suivra après le lot 10 selon le protocole ; tu peux arrêter avant en le disant.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261011 10 signaux.json cle.json <cle des lots 1 à 5, séparées par des virgules>`
