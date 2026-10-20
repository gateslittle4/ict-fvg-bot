# Résultat — PD1 : F2 avec premium/discount (niveau H4 balayé → bord bas du FVG cible), entraînement 2011–2022

Règle et critères : `PREREG-F2-PREMIUM-DISCOUNT.md` (SHA-256 `0f3f3e9f…877b`, 2026-10-06 20:59 heure de New York), commité avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2016 | 617 | 27 % | 41,3 | +0,067 | 0,92 | 25,8 |
| F2C 2017–2022 | 605 | 30 % | 88,4 | +0,146 | 1,97 | 27,4 |
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **PD1 2011–2016** | 439 | 26 % | 6,4 | +0,015 | 0,17 | 38,4 |
| **PD1 2017–2022** | 426 | 31 % | 85,5 | +0,201 | 2,17 | 29,7 |
| **PD1 2011–2022** | 865 | 28 % | 91,9 | +0,106 | 1,69 | 38,4 |

PD1 retire 439 trades de F2C (36 %, R moyen +0,067) et en **ajoute 82** (R moyen −0,101) : en refusant des ordres à premium, d'autres ordres, jusque-là bloqués par une position ouverte, se remplissent et sont en moyenne perdants.

## Critères (tous requis)
| Critère | Résultat | |
|---|---|---|
| R moyen ≥ F2C + 0,03 | +0,106 contre +0,106 (gain 0,000) | échec |
| Welch ≥ 1,96 (PD1 contre trades retirés) | 0,37 | échec |
| Moitiés A et B > F2C et > 0 | A +0,015 (F2C +0,067) ; B +0,201 (F2C +0,146) | échec (A) |
| Pire baisse ≤ 1,25 × F2C (34,3) | 38,4 | échec |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,52 | ok |

**PD1 est rejetée.** Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (autre équilibre, plus bas de la mèche, milieu du FVG cible).

## Descriptif (non jugé)
Parmi les 1 222 ordres de F2C, 787 sont à discount (R moyen **+0,127**) et 435 à premium (**+0,068**) selon cette définition ; 36 % sont à premium. Le sens est celui que tu attends (discount meilleur que premium), mais l'écart est petit et, comme le montre le Welch de 0,37, il ne se distingue pas du hasard sur ces effectifs.

## Ce que ça dit
1. Sur 2011–2022, acheter plus bas dans la fourchette n'apporte pas de gain mesurable : l'effet « discount » existe peut-être, mais il est trop faible pour compenser les trades que le filtre retire et ceux qu'il ajoute.
2. La moitié 2011–2016 est à peine positive (+0,015) et la pire baisse monte à 38,4 R : la règle rend F2 plus irrégulière, pas plus régulière.
3. Les trois résultats de cette série (heure, direction du matin, premium/discount) vont dans le même sens : aucun filtre simple d'entrée ne sépare nettement les bons achats de F2 des mauvais. Ce n'est pas un jugement sur ton trading manuel, qui combine l'order flow, la structure, le sens et ton propre stop.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs, ce qui rend les rejets plus solides.
- Les ordres ajoutés (82) viennent d'ordres libérés par la position ; ils sont simulés comme dans le reste de l'étude.
- Un seul équilibre (50 %) et une seule définition du bas ont été testés, comme annoncé.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboY_pd.mjs <data> train` (≈ 15 s). Tests : `node --test scripts/comboFvgV6/comboY_pd.test.mjs` (3 tests : niveaux de balayage, identité avec F2C, vérification indépendante de la règle sur données réelles).
