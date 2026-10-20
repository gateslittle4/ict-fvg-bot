# F2 — que fait le prix après le stop ? (descriptif)

Calculé le 2026-10-06. Question de Krystofia : les trades perdants de F2 sont-ils des stops touchés suivis d'un retour du prix dans le sens prévu (stop « chassé »), ou le prix ne revient-il jamais ? Analyse **descriptive** : aucun filtre, aucune règle de F2 changée, aucun critère. Rien n'est décidé sur cette base.

## Composition des trades (F2, achats US100)
| Bloc | Trades | Stops | TP | Sorties au temps |
|---|---|---|---|---|
| 2011–2016 | 617 | 447 (72 %) | 145 | 25 |
| 2017–2022 | 605 | 421 (70 %) | 144 | 40 |
| 2023–2025 | 325 | 230 (71 %) | 80 | 15 |
| 2026 (au 21/09) | 87 | 70 (80 %) | 15 | 2 |

Les perdants sont donc presque tous des stops (chacun = −1 R). Les sorties au temps sont rares (≈ 4 %).

## Après le stop : horizon 1 jour (96 bougies M15)
| Bloc | Le prix revient à l'entrée | Ne revient jamais à l'entrée | Atteint le TP | Atteint le TP sans passer 0,5 R sous le stop | Idem sans passer 1 R sous le stop |
|---|---|---|---|---|---|
| 2011–2016 | 81 % | 19 % | 35 % | 11 % | 16 % |
| 2017–2022 | 84 % | 16 % | 44 % | 16 % | 23 % |
| 2023–2025 | 83 % | 17 % | 40 % | 9 % | 17 % |
| 2026 | 83 % | 17 % | 29 % | 10 % | 11 % |

## Après le stop : horizon 5 jours (480 bougies M15)
| Bloc | Revient à l'entrée | Ne revient jamais | Atteint le TP | Sans passer 0,5 R sous le stop | Sans passer 1 R sous le stop |
|---|---|---|---|---|---|
| 2011–2016 | 92 % | 8 % | 70 % | 13 % | 19 % |
| 2017–2022 | 94 % | 6 % | 73 % | 17 % | 26 % |
| 2023–2025 | 96 % | 4 % | 75 % | 10 % | 20 % |
| 2026 | 94 % | 6 % | 56 % | 11 % | 13 % |

## Profil des stops
- 15 à 18 % des stops tombent dans la bougie M15 même du remplissage (10 % en 2026) ; durée médiane remplissage → stop : 4 bougies (1 heure).
- Stop et TP dans la même bougie : 0 à 1 % des cas. La convention pessimiste « le stop passe avant le TP » n'explique donc pas les pertes.

## Lecture
Le scénario « stop touché de justesse puis le prix repart vers le TP » existe mais reste minoritaire : environ 10 à 17 % des stops (jusqu'à 26 % en 2017–2022 pour 1 R) voient le TP atteint sans que le prix soit descendu de 0,5 R sous le stop. Dans la grande majorité des cas, après le stop le prix continue nettement plus bas avant de remonter, ou ne remonte pas.

Le prix ne revient jamais à l'entrée dans 16–19 % des cas sur 1 jour. Mais le prix qui revient à l'entrée ne dit pas que le trade aurait gagné : un rebond après la chute n'est pas un stop chassé.

## Réserves
- Les chiffres à 5 jours sont gonflés par la dérive haussière de l'indice : un niveau situé à 3 R au-dessus finit souvent par être touché dans la semaine, sans lien avec le setup. Pas de comparaison avec un point d'entrée aléatoire n'a été faite ici ; ce serait nécessaire pour dire que ce « retour » vient du setup.
- Le test « stop élargi » est un contrefactuel simplifié : il ne mesure que « le TP est-il atteint avant que le prix descende de 0,5 R / 1 R plus bas », pas le R réel d'un trade à stop plus large (un stop plus large agrandit le risque, donc réduit le R de chaque gain).
- Le groupe de 2023–2025 n'a servi ici qu'à décrire la structure des stops, pas à juger un filtre. Les 87 trades de 2026 sont peu nombreux.
- M15 uniquement ; le rejeu M1 de F2 donnait les mêmes résultats d'ensemble.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboK_stops.mjs <dossier data>` ; tests : `node --test scripts/comboFvgV6/comboK_stops.test.mjs` (5 tests : retour direct au TP, creusement puis TP, jamais de retour, horizon, TP dans la même bougie).
