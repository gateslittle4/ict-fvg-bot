# Résultat — PS1 : F2 limité au premier setup rempli de la journée (entraînement 2011–2022)

Règle et critères : `PREREG-F2-PREMIER-SETUP-JOUR.md` (SHA-256 `d3c8295c…131169`, 2026-10-06 20:49 heure de New York) et son addendum (`PREREG-F2-PREMIER-SETUP-JOUR-ADDENDUM.md`, écrit avant tout résultat : un seul achat retenu par journée quand plusieurs se remplissent à la même bougie). Aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2016 | 617 | 27 % | 41,3 | +0,067 | 0,92 | 25,8 |
| F2C 2017–2022 | 605 | 30 % | 88,4 | +0,146 | 1,97 | 27,4 |
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **PS1 2011–2016** | 383 | 27 % | 22,7 | +0,059 | 0,64 | 22,0 |
| **PS1 2017–2022** | 385 | 31 % | 70,1 | +0,182 | 1,95 | 23,6 |
| **PS1 2011–2022** | 768 | 29 % | 92,8 | +0,121 | 1,84 | 23,6 |

PS1 garde 768 des 1 222 trades de F2C (63 %) ; les 454 retirés ont un R moyen de +0,081 ; aucun trade n'est ajouté.

## Critères (tous requis)
| Critère | Résultat | |
|---|---|---|
| R moyen ≥ F2C + 0,03 | +0,121 contre +0,106 (gain +0,015) | échec |
| Welch ≥ 1,96 (PS1 contre trades retirés) | 0,37 | échec |
| Moitiés A et B > F2C et > 0 | A +0,059 (F2C +0,067) ; B +0,182 (F2C +0,146) | échec (A) |
| Pire baisse ≤ 1,25 × F2C | 23,6 contre 27,4 | ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,27 | ok |

**PS1 est rejetée.** Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (deux premiers setups, premier avant 9 h, premier achat seulement, journée terminée si l'ordre n'est pas rempli).

## Ce que ça dit
1. Le premier setup de la journée n'est pas meilleur que les suivants dans ces données : +0,121 R pour les trades gardés contre +0,081 pour ceux qui sont retirés, un écart que le hasard explique facilement (Welch 0,37). Ton souvenir (« c'est comme ça que je faisais beaucoup de RRR ») n'est pas contredit sur ton trading réel, qui comprend des ventes, des entrées plus tôt et ton jugement ; il n'apparaît simplement pas dans la forme mécanique de F2.
2. La règle réduit un peu les pertes de baisse (pire baisse de 27,4 à 23,6 R), mais pour cela il faut 37 % de trades en moins, avec le même R moyen par trade : ce n'est pas un gain suffisant selon les critères écrits.

## Descriptif (non jugé, n'entre dans aucun critère)
- 1 829 journées avec au moins un remplissage (achat ou vente miroir) sur 2011–2022 ; 1 222 achats F2C et 1 579 ventes en miroir.
- Achats retirés parce qu'un **autre achat** s'est rempli avant : 356, R moyen **+0,012**. Achats retirés parce qu'une **vente** s'est remplie avant : 98, R moyen **+0,333**. Autrement dit, un achat qui vient après une vente du même jour n'est pas moins bon ; il est même meilleur dans ces 98 cas. Ces deux chiffres reposent sur peu de trades et ne sont pas jugés.
- Ventes qui seraient le premier remplissage de leur journée : 1 061, R moyen +0,118. La méthode de vente est une transposition en miroir de F2, jamais validée seule : ce chiffre ne dit pas qu'elle fonctionne, seulement qu'elle n'est pas nulle sur cet échantillon. Toute règle qui impliquerait de trader ces ventes demanderait son propre pré-enregistrement.

## Limites
- Un trade retiré pourrait libérer la position pour un ordre que F2C avait ignoré ; non simulé.
- 2023–2025 n'est pas vierge pour F2 ; non lu ici (PS1 rejetée à l'entraînement).
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboW_premier.mjs <data> train` (≈ 20 s). Tests : `node --test scripts/comboFvgV6/comboW_premier.test.mjs` (5 tests, dont une vérification en force brute du premier remplissage sur 2016).
