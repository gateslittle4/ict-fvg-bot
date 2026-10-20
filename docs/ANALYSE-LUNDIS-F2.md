# F2 — les lundis sautés (après un vendredi haussier) et le retour du prix (descriptif)

Calculé le 2026-10-06. Question de Krystofia : « ça arrive les lundis avec les continuations de vendredi » (pas de FVG à viser, donc pas un jour d'achat) ; compter les lundis sautés par F2, et si le prix est revenu. **Descriptif : aucun R, aucun filtre, aucune règle modifiée, aucune décision.**

## Définitions (écrites avant le calcul, sauf l'ajout signalé plus bas)
- Jour = date de New York ; session = bougies M15 de 06:00 à 16:00 NY (au moins 30 bougies).
- **Vendredi haussier** : clôture de session > ouverture ET clôture dans le tiers haut de la plage de la session.
- **Ordre posé** : F2 a posé au moins un ordre d'achat ce jour-là (rempli ou non).
- **Sauté faute de cible** : aucun ordre posé ET au moins une zone d'achat valide (balayage H4 ok, FVG d'entrée récent, dans les heures) sans FVG de vente à viser.
- **Sauté pour une autre raison** : aucun ordre posé et aucune zone de ce type.
- **Prix revenu** (lundi) : plus bas de la session du lundi ≤ clôture du vendredi ; ou ≤ plus haut de la session du vendredi (a retesté ce niveau).
- **Ajout après lecture du premier résultat** (signalé : il n'était pas dans la liste de départ) : « zone d'achat valide sans cible » **sans exiger le balayage H4**, parce que ta règle ne parle pas du balayage.

Période : 2011 → 21/09/2026, 3 921 jours analysés (295 lundis après un vendredi haussier). Le simulateur ne voit qu'environ 3 mois de passé : une cible plus vieille n'existe pas dans ces calculs.

## Résultat 1 — dans F2 (balayage H4 exigé)
| Groupe | Jours | Ordre posé | Sauté faute de cible | Sauté pour une autre raison |
|---|---|---|---|---|
| Lundis après vendredi haussier | 295 | 93 (32 %) | **3 (1 %)** | 199 (67 %) |
| Lundis après un autre vendredi | 403 | 182 (45 %) | 2 (0 %) | 219 (54 %) |
| Mardi à vendredi | 3 071 | 1 041 (34 %) | 23 (1 %) | 2 007 (65 %) |

Dans F2, presque aucun lundi n'est sauté *faute de cible* (3 sur 295) : la plupart des jours sautés le sont parce qu'il n'y a pas de balayage du low H4 ou pas de zone d'achat valide, avant même de chercher une cible. Les lundis après un vendredi haussier ont un peu moins d'ordres (32 % contre 45 % après un autre vendredi).

## Résultat 2 — ajout : zone d'achat valide sans cible, sans exiger le balayage H4
| Groupe | Jours | Au moins une zone sans cible | Dont aucun ordre posé |
|---|---|---|---|
| Lundis après vendredi haussier | 295 | **80 (27 %)** | 69 (23 %) |
| Lundis après un autre vendredi | 403 | 51 (13 %) | 45 (11 %) |
| Mardi à vendredi | 3 071 | 560 (18 %) | 500 (16 %) |

Là, ton intuition se voit : après un vendredi haussier, un lundi sur quatre a une zone d'achat valide sans FVG à viser, soit deux fois plus qu'après un autre vendredi (13 %) et plus que mardi-vendredi (18 %). Ces zones sont écartées dans F2, surtout par le balayage H4 exigé en amont : ce n'est donc pas la « cible manquante » qui vide ces lundis, mais elle coexiste avec les autres raisons.

## Le prix est-il revenu ? (lundis après vendredi haussier)
| Sous-groupe | Jours | Revenu à la clôture du vendredi | A retesté le plus haut du vendredi | Lundi clôture > ouverture |
|---|---|---|---|---|
| Tous | 295 | 80 % | 85 % | 57 % |
| Ordre posé | 93 | 100 % | 100 % | 37 % |
| Sauté, autre raison | 199 | 70 % | 78 % | 67 % |
| **Zone sans cible, aucun ordre (ajout)** | **69** | **70 %** | **80 %** | **77 %** |
| Pour comparaison : après un autre vendredi, tous | 403 | 78 % | 97 % | 60 % |

Sur les 69 lundis « zone sans cible, aucun ordre », le prix est revenu à la clôture du vendredi dans 70 % des cas (donc **30 % du temps il ne revient jamais** à ce niveau), et le lundi a fini au-dessus de son ouverture dans **77 %** des cas, contre 57 % pour l'ensemble des lundis après un vendredi haussier. Les lundis où F2 pose un ordre sont ceux où le prix recule d'abord (100 % de retours) et finissent plus souvent en baisse (37 % haussiers).

## Lecture
- Ton observation tient en partie : après une continuation de vendredi, les lundis sans FVG à viser sont plus fréquents (27 % contre 13–18 %), et ces lundis-là ont fini en hausse trois fois sur quatre.
- **Mais** : 69 jours seulement, observation faite après coup (le chiffre de 77 % est ressorti de l'ajout, pas d'une hypothèse écrite d'avance), « revenu à la clôture du vendredi » est facile à atteindre (un lundi qui ouvre en gap vers le bas y est déjà), et je ne sais pas si ces lundis auraient donné un trade gagnant ou perdant : je n'ai mesuré ni R ni entrée.
- Pas de règle tirée de ça. Pour en faire une, il faudrait l'écrire à l'avance (ex. « lundi après vendredi haussier, sans cible : ne pas trader » ou, à l'inverse, « chercher une entrée différente ») et la juger sur 2011–2022 puis 2023–2025. Le sens n'est pas évident : ces lundis étaient surtout haussiers, donc sauter le trade n'est pas forcément ce qu'il faut faire.

## Réserves
- Le simulateur ne voit qu'environ 3 mois de passé ; avec tes 15–30 jours (ou plus) sur un graphique complet, les lundis « sans cible » seraient probablement plus nombreux.
- Définition du vendredi haussier : un seuil choisi (tiers haut), non optimisé ; un autre seuil donnerait d'autres effectifs.
- Aucune lecture de R ni du test 2023–2025 : rien dans cette analyse ne juge une règle.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboP_lundis.mjs <data>` (≈ 1 min). Moteur : `lib/krysBacktestW.js` (copie de `krysBacktest.js` ; ajoute deux rappels d'observation, `onNoTarget` et `onOrder`, sans effet sur les trades). Tests : `node --test scripts/comboFvgV6/comboP_lundis.test.mjs` (4 tests : dates de New York, sessions 06–16, vendredi haussier, classement des jours).
