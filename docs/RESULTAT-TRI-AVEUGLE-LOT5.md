# Résultat — tri à l'aveugle, lot 5 (10 signaux de F2, graine 20261010)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT5.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt) : je ne l'ai pas calculé.

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Pose | Risque | Date (révélée) |
|---|---|---|---|---|---|
| 1 | prend | stop (−1 R), dans la bougie du remplissage | 08:30 | 3,0 pts | 29/01/2013 |
| 2 | prend (buy dès 11 h 15) | stop (−1 R), 33 bougies | 13:00 | 9,2 pts | 01/03/2013 |
| 3 | saute (aurait vendu) | **TP, +3 R** | 10:00 | 8,0 pts | 29/01/2014 |
| 4 | prend | stop (−1 R), 8 bougies | 10:00 | 8,8 pts | 04/06/2015 |
| 5 | saute | sortie au temps, **+2,14 R** | 14:00 | 28,2 pts | 30/07/2018 |
| 6 | saute (aurait vendu) | sortie au temps, +0,60 R | 14:00 | 17,2 pts | 01/11/2011 |
| 7 | saute | stop (−1 R), 1 bougie | 08:00 | 10,5 pts | 22/09/2011 |
| 8 | saute (contexte manquant) | sortie au temps, **+1,78 R** | 10:15 | 99,5 pts | 22/06/2022 |
| 9 | saute (stop trop loin) | stop (−1 R), 14 bougies | 15:15 | 18,5 pts | 13/11/2019 |
| 10 | saute (dans un FVG H4) | **TP, +3 R** | 07:15 | 23,3 pts | 28/11/2022 |

Les risques en points ne se comparent pas d'une année à l'autre ; ils sont donnés à titre d'information.

## Bilan
| | Signaux | TP | Sorties au temps | Stops | R total | R moyen |
|---|---|---|---|---|---|---|
| Tu prends (1, 2, 4) | 3 | 0 | 0 | 3 | −3,00 | −1,00 |
| Tu sautes (3, 5, 6, 7, 8, 9, 10) | 7 | 2 | 3 | 2 | +8,52 | +1,22 |
| Tous | 10 | 2 | 3 | 5 | +5,52 | +0,55 |

Tu évites **2 des 5 stops** du lot ; tu laisses passer **les 2 TP** (3 et 10) et les 3 sorties au temps, toutes positives (+2,14, +0,60, +1,78). Les trois signaux pris sont trois stops, dont le signal 1, touché dans la bougie même du remplissage (stop de 3,0 pts, le plus petit du lot).

## Sensibilité à mon interprétation
- Signal 2 classé « saute » au lieu de « prend » : deux pris (1 et 4, −2 R) ; 3 stops sur 5 évités. Les gagnants restent tous dans les sautés.

## Ce que ce lot montre, et ne montre pas
1. Le signal 9 est une illustration de ta raison « stop trop loin » : refusé, il a été stoppé. Mais le signal 8, qui a le stop le plus large du lot (99,5 pts en 2022, environ 0,8 % du prix), a rapporté +1,78 R. Sur ces deux signaux, la taille du stop ne distingue pas les bons des mauvais ; deux cas ne prouvent rien dans un sens ni dans l'autre.
2. Le signal 2 : tu serais entrée plus tôt (11 h 15). Le résultat mesuré est celui de F2, posé à 13 h 00.
3. Deux critères nouveaux apparaissent dans tes raisons : « premier setup de la journée » (plus puissant que le setup inverse du soir) et « FVG H4 contre le trade ». Ils sont mesurables. Je ne les ajoute pas à ce protocole ; chacun demanderait sa propre définition et son propre pré-enregistrement.
4. Tu peux arrêter le tri quand tu veux (et le dire) : je lirais alors le bilan agrégé des lots passés, comme prévu au protocole. Sinon je continue jusqu'au lot 10.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261010 10 signaux.json cle.json <cle des lots 1 à 4, séparées par des virgules>`
