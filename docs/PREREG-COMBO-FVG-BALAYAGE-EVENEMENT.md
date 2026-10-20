# Pré-enregistrement — Balayage H4 « événementiel » (idée de Krystofia, 06/10/2026)

Écrit le 2026-10-06 (07:34 UTC), AVANT le calcul. Une seule hypothèse, venue de l'observation d'un trade (2 oct. 2026) que F2 avait raté. Le trade lui-même n'est pas utilisé pour régler quoi que ce soit.

## Règle testée (G1)
Même chose que F2 (achats, 06:00–16:00 NY, âge du FVG d'entrée ≤ 8, entrée 50 %, stop c1 − 3 pts, TP max(½ cible, 3R), échelle prix/8200), mais la fenêtre de 32 bougies (W) du balayage est REMPLACÉE par une validité par événement :
- Un balayage = une bougie dont le low passe sous le low des 6 dernières barres H4 complètes. Il ouvre un épisode « achat valable ».
- L'épisode reste valable jusqu'au PREMIER de ces événements :
  1. le prix touche le plus proche FVG M15 baissier non rempli au-dessus (relevé au moment du balayage, sans limite d'âge) ;
  2. le prix touche le plus proche FVG H4 baissier non rempli au-dessus (relevé au moment du balayage) ;
  3. le prix touche le high de la plage des 6 barres H4 (« high H4 »).
- Si le prix continue dans le sens opposé (nouveau plus bas sous le low de la plage), un nouveau balayage ouvre un nouvel épisode, qui remplace l'ancien.
- Un FVG d'achat est autorisé si l'épisode est valable à la bougie c3.
Comparaison : F2 (W = 32), +0,106 R par trade sur 2011–2022, t = 2,04, 2,08 trades par semaine.

## Critères de réussite (tous requis)
1. Au moins 1,5 trade par semaine sur 2023–2025.
2. Entraînement 2011–2022 : t ≥ 2,5 (quatrième hypothèse sur ces données), et moyenne > 0 dans 2011–2016 ET dans 2017–2022.
3. Moyenne 2011–2022 supérieure à « achats sans filtre » (+0,025).
4. Test 2023–2025 : moyenne > 0 (bloc non vierge). 2026 : rapporté, pas un critère.
Sinon : « non validée », sans autre essai sur ces données.

## Empreintes (SHA-256)
- comboG.mjs : 1ffb0e4a24b75ac59d5080b52865035656fd533c7b7530abab67f2b3032e8cb5
- comboG.test.mjs : 0ef3390d863b1b38b5c753dd74a50376266768e06887e2285dfa2fd446ce618e (2 tests, OK)
