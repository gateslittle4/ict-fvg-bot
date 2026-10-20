# Résultat — tri à l'aveugle, lot 4 (10 signaux de F2, graine 20261009)

Révélé le 2026-10-06, après l'enregistrement de tes réponses (`REPONSES-TRI-AVEUGLE-LOT4.md`, commité avant l'ouverture de la clé). **Dix signaux ne prouvent rien.** Le bilan agrégé des lots 1 à 10 reste réservé à la fin du lot 10 (ou à ton arrêt).

## Ce que chaque signal a donné
| Signal | Ta décision | Résultat de F2 | Pose | Date (révélée) |
|---|---|---|---|---|
| 1 | saute | stop (−1 R), 4 bougies | 09:30 | 25/11/2011 |
| 2 | saute (plutôt bearish) | **TP, +3 R** | 12:00 | 18/04/2011 |
| 3 | saute (bearish dès 11 h 30) | stop (−1 R), 72 bougies | 15:15 | 07/03/2014 |
| 4 | saute (12 h 45 pas cool) | stop (−1 R), 7 bougies | 12:45 | 29/01/2019 |
| 5 | saute (préfère 14 h) | stop (−1 R), 5 bougies | 12:15 | 24/08/2015 |
| 6 | saute (mouvement déjà fait) | sortie au temps, **+1,41 R** | 10:15 | 12/08/2013 |
| 7 | saute (sell à 9 h) | sortie au temps, **+1,46 R** | 12:45 | 01/09/2016 |
| 8 | saute (pas bullish) | stop (−1 R), 2 bougies | 12:15 | 18/08/2011 |
| 9 | saute (bearish depuis 7 h 15) | sortie au temps, +0,79 R | 15:00 | 16/03/2011 |
| 10 | saute (pas de trade ce jour) | **TP, +3 R** | 11:45 | 22/03/2012 |

## Bilan
| | Signaux | TP | Sorties au temps | Stops | R total | R moyen |
|---|---|---|---|---|---|---|
| Tu prends | 0 | — | — | — | — | — |
| Tu sautes | 10 | 2 | 3 | 5 | +4,66 | +0,47 |

Tu as sauté les 10 signaux. Tu évites donc les 5 stops, mais tu laisses passer tous les gagnants : 2 TP et 3 sorties au temps positives. Ce lot, bon pour F2 (+0,47 R en moyenne), ne permet aucune comparaison entre « pris » et « sautés » puisqu'il n'y a aucun pris.

## Ce que ce lot montre, et ne montre pas
1. Sur les lots 1 à 4, la part de signaux que tu sautes augmente : 5, 5, 8, puis 10 sur 10. Une partie de ces refus ne porte pas sur la qualité du signal mais sur le sens : tu décris des sells aux signaux 2, 3, 7 et 9. F2 ne prend que des achats ; quand ta lecture de la journée est baissière, tu ne peux pas « prendre » un achat qui t'est présenté. Le tri mesure donc en partie un autre problème (le sens), pas celui des stops.
2. L'heure revient : les signaux 4 et 5 (12 h 45 et 12 h) sont refusés pour leur heure, et le 5 pour son stop très large (63 pts, soit plus de 5 fois le stop moyen des autres signaux du lot ; à relativiser, car il date de 2015). Ton critère d'heure a déjà été testé sur F2 (filtres d'heure et heure tardive, rejetés) ; il n'est pas ajouté à ce protocole.
3. Le signal 10 tombe le 22/03/2012, le même jour que le signal 4 du lot 3 (autre signal, autre heure). La règle « un signal par jour » ne vaut que dans un lot ; je note cette limite.
4. Quatre lots ne se lisent pas encore ensemble.

## Reproduction
`node scripts/comboFvgV6/comboU_aveugle.mjs <data> 20261009 10 signaux.json cle.json <lot1-cle.json>,<lot2-cle.json>,<lot3-cle.json>`
