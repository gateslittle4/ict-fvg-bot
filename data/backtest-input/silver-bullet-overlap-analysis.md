# Silver Bullet autonome vs mécanismes déjà en production — analyse de chevauchement

Question d'Esdras : intégrer Silver Bullet autonome sur US100/US500/GER40 ajoute-t-il une vraie diversification, ou re-trade-t-il des mouvements déjà capturés par ce qui tourne en production sur ces mêmes symboles ? Reconstruit les VRAIS mécanismes en production (FVG+NWOG sur US100, FVG+Weekly Sweep sur US500, NWOG+Weekly Sweep+Breaker Block sur GER40 — GER40 n'est PAS dans la grille FVG), puis compare, pour chaque trade Silver Bullet, si sa période de détention chevauche celle d'un trade déjà pris en production sur le même symbole. Chevauchement MÊME sens = double exposition au même mouvement ; chevauchement sens OPPOSÉ = deux mécanismes qui se contredisent en même temps. Historique complet disponible par symbole (pas de split train/test ici — ce n'est pas un test d'edge, c'est un test de corrélation).

| Symbole | Trades Silver Bullet | Chevauchement (tout) | Même sens (double exposition) | Sens opposé (contradiction) | Aucun chevauchement |
|---|---|---|---|---|---|
| US100 | 1784 | 423 (23.7%) | 324 (18.2%) | 101 (5.7%) | 1361 (76.3%) |
| US500 | 1777 | 300 (16.9%) | 197 (11.1%) | 119 (6.7%) | 1477 (83.1%) |
| GER40 | 1539 | 312 (20.3%) | 189 (12.3%) | 145 (9.4%) | 1227 (79.7%) |