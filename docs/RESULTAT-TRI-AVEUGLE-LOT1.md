# Résultat — tri à l'aveugle, lot 1 (10 signaux de F2, graine 20261006)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT1.md`, sauvegardé avant) et après `PREREG-TRI-A-L-AVEUGLE-F2.md`. Pour le signal 5, ton dernier mot a été « oui » (prendre). **Dix signaux ne prouvent rien** ; ce qui suit décrit le lot.

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Date (révélée) |
|---|---|---|---|
| 1 | saute | stop (−1 R) | 24/10/2017 |
| 2 | saute | stop (−1 R) | 29/09/2021 |
| 3 | **prend** | stop (−1 R), dans la bougie même du remplissage | 25/07/2013 |
| 4 | saute | stop (−1 R) | 01/09/2022 |
| 5 | **prend** | sortie au temps, **+0,16 R** (96 bougies) | 23/01/2020 |
| 6 | saute | stop (−1 R) | 15/09/2014 |
| 7 | **prend** | stop (−1 R), dans la bougie même du remplissage | 08/09/2021 |
| 8 | **prend** | stop (−1 R) | 27/11/2015 |
| 9 | saute | stop (−1 R) | 22/08/2019 |
| 10 | **prend** | stop (−1 R) | 14/10/2019 |

## Bilan
| | Signaux | Gagnants | R total | R moyen |
|---|---|---|---|---|
| Tu prends | 5 | 0 TP (1 sortie au temps à +0,16) | −3,84 | −0,77 |
| Tu sautes | 5 | 0 | −5,00 | −1,00 |
| Tous | 10 | 0 TP | −8,84 | −0,88 |

Tu aurais évité **5 des 9 stops** du lot. Mais le lot ne contient **aucun gagnant** (aucun TP) : on ne sait donc pas si ton tri retire aussi des gagnants. Avec 24 % de TP dans F2, la probabilité de tomber sur 0 TP en 10 trades est d'environ 7 % : c'est un lot malchanceux, qui ne dit rien sur ta capacité à trier. Sur les quatre stops que tu prends, deux ont été touchés dans la bougie du remplissage (signaux 3 et 7).

## Où F2 et toi ne parlez pas de la même chose
Signal 1 : tu vois « aucun H4 pris, le H4 de 8 h a été raté ». F2 a compté un balayage parce qu'à 09:45 une mèche est descendue à 6059,0, soit **1,7 point** sous le plus bas des six dernières barres H4 complètes (6060,7, celui de la barre H4 de 12 h de la veille, 21 heures plus tôt). Pour F2, n'importe quelle mèche sous ce plus bas compte, même minuscule et ancienne ; la barre de 8 h, encore en formation, n'a pas pu compter. Toi, tu cherches un low H4 récent et net. Une seule observation, mais c'est probablement la différence principale entre ton « H4 pris » et celui de F2.

## Raisons qui reviennent dans tes réponses
Order flow H4 (haussier ou baissier), balayage d'un low ou d'un high H4, réaction à un FVG H4, BMS en M15, FVG M15 à gauche. F2 ne regarde aucun de ces éléments, sauf le balayage sous sa définition large. Tes cinq « sauter » invoquent surtout l'order flow H4 baissier (2, 4, 6), le high H4 pris (9), et l'absence de balayage net (1).

## Ce que ça veut dire
1. Avec ce lot, on ne peut rien conclure : un lot sans aucun gagnant ne teste pas si tu retires des gagnants. Il montre seulement que, dans ce tirage, tes critères auraient écarté 5 stops sur 9.
2. Le format marche : tes raisons sont claires et se répètent, ce qui permet de les écrire.
3. Pour un vrai résultat, il faut environ 100 signaux, soit 9 lots de plus (ou des signaux en temps réel jugés avant leur résultat).

## Limites
- Prix relatifs, pas de date, 160 bougies M15 et 40 H4 : certaines choses que tu utilises d'habitude (contexte plus ancien, niveaux ronds) manquaient.
- Les signaux jugés sont ceux qui se sont remplis ; en temps réel, tu jugerais aussi ceux qui ne se remplissent jamais.
- Le signal 5 était une hésitation, tranchée par « oui » après relance : noté comme tel.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261006 10 signaux.json cle.json` régénère exactement le même tirage. Le détail du balayage du signal 1 : `node scripts/comboFvgV6/chk_balayage_signal.mjs <data> 2017:164392`.
