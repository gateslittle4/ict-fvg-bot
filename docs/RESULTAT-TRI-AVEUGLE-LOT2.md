# Résultat — tri à l'aveugle, lot 2 (10 signaux de F2, graine 20261007)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT2.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien** ; ce qui suit décrit le lot. Le bilan agrégé des lots 1 à 10 ne sera lu qu'après le lot 10 (ou quand tu décides d'arrêter).

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Date (révélée) |
|---|---|---|---|
| 1 | saute (aurait pris un sell) | sortie au temps, +0,02 R | 19/09/2016 |
| 2 | saute | **TP, +3 R** | 02/07/2018 |
| 3 | prend (« je pense ») | stop (−1 R), après 9 bougies | 16/10/2014 |
| 4 | saute | stop (−1 R), dans la bougie du remplissage | 17/07/2018 |
| 5 | prend (à 8 h 15) | stop (−1 R), 1 bougie après le remplissage | 08/07/2020 |
| 6 | prend | stop (−1 R), après 77 bougies | 30/01/2012 |
| 7 | prend (stop plus court) | sortie au temps, **+1,71 R** | 24/09/2020 |
| 8 | saute | **TP, +3 R** | 06/12/2018 |
| 9 | prend (à 10 h 45) | stop (−1 R), 1 bougie après le remplissage | 04/04/2018 |
| 10 | saute (« je laisse ») | **TP, +3 R** | 09/11/2016 |

## Bilan
| | Signaux | TP | Stops | R total | R moyen |
|---|---|---|---|---|---|
| Tu prends (3, 5, 6, 7, 9) | 5 | 0 | 4 | −2,29 | −0,46 |
| Tu sautes (1, 2, 4, 8, 10) | 5 | 3 | 1 | +8,02 | +1,60 |
| Tous | 10 | 3 | 5 | +5,73 | +0,57 |

Dans ce lot, ton tri a fait l'inverse de ce que tu cherches : tu évites **1 stop sur 5** (le signal 4) et tu laisses passer **les 3 TP** du lot (2, 8, 10). Avec 30 % de TP attendus dans F2, un lot à 3 TP est un tirage ordinaire ; mais que les trois tombent dans les « sautés » est un aléa de 10 signaux, pas une loi.

## Sensibilité à mon interprétation de tes réponses
Mes classements pour 1, 5, 9 et 10 sont des interprétations (écrites avant la révélation). Aucune ne change la conclusion du lot :
- Signaux 5 et 9 classés « saute » au lieu de « prend » : les pris deviennent 3, 6, 7 (R total −0,29, moyen −0,10) ; les stops évités passent à 3 sur 5 ; les 3 TP restent tous dans les sautés.
- Signal 10 (« je laisse ») classé « prend » : les pris gagnent un TP (R total +0,71 sur 6) ; 2 TP sur 3 restent sautés.
- Signal 1 classé « prend » : +0,02 R de plus chez les pris, rien d'autre ne bouge.

## Ce que ce lot montre, et ne montre pas
1. Les deux lots ensemble ne se lisent pas encore : le bilan agrégé arrive après le lot 10 (protocole figé). Ce qu'on peut dire, c'est que les deux lots tirés tombent chacun d'un côté opposé (lot 1 : zéro TP ; lot 2 : trois TP, tous sautés), ce qui illustre pourquoi 10 signaux ne suffisent pas.
2. Trois de tes « prends » (5 et 9, et en partie 3) ont été touchés dans la bougie du remplissage ou juste après : sur ces signaux, tu aurais entré à une autre heure que la pose de F2 (8 h 15, 10 h 45). Le résultat mesuré ici est celui de F2, pas celui de ton entrée ; ces deux signaux ne testent donc pas vraiment ton timing.
3. Signal 7 : ton stop plus court n'est pas mesuré (F2 sort au temps à +1,71 R avec son stop). Avec un stop plus court, ce trade aurait pu être stoppé ou gagner davantage ; on ne le sait pas.
4. Tes raisons gardent la même famille qu'au lot 1 : order flow du jour, low H4 pris, BMS M15, grandes bougies bearish, proximité d'un high.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261007 10 signaux.json cle.json <lot1-cle.json>` régénère le même tirage.
