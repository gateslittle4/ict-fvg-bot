# Résultat — E1 : F2 avec balayage d'equal lows H4 (entraînement 2011–2022)

Règle et critères : `PREREG-F2-EQUAL-LOWS-H4.md` (commité avant tout calcul, SHA `cd81ba67…65ba664`). Aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2016 | 617 | 27 % | 41,3 | +0,067 | 0,92 | 25,8 |
| F2C 2017–2022 | 605 | 30 % | 88,4 | +0,146 | 1,97 | 27,4 |
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **E1 2011–2016** | 130 | 23 % | −12,8 | −0,098 | −0,67 | 25,7 |
| **E1 2017–2022** | 84 | 38 % | 28,1 | +0,335 | 1,68 | 14,0 |
| **E1 2011–2022** | 214 | 29 % | 15,4 | +0,072 | 0,60 | 26,9 |

E1 garde 199 des 1 222 trades de F2C (les 1 023 autres disparaissent, R moyen +0,117) et en ajoute 15 nouveaux (R moyen +0,333).

## Critères (tous requis)
| Critère | Résultat | |
|---|---|---|
| R moyen ≥ F2C + 0,03 | +0,072 contre +0,106 | échec |
| Welch ≥ 1,96 (E1 contre trades retirés) | −0,34 | échec |
| Moitiés A et B > F2C et > 0 | A −0,098 (F2C +0,067) ; B +0,335 (F2C +0,146) | échec (A) |
| Pire baisse ≤ 1,25 × F2C | 26,9 contre 27,4 | ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 0,38 | échec |

**E1 est rejetée.** Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : pas de variante voisine (0,05 %, trois creux, 24 barres, « s'ajoute »).

## Ce que ça dit
1. La définition d'equal low de Krystofia est beaucoup plus rare que le balayage large de F2 : 214 trades en 12 ans (0,38 par semaine en 2023–2025) contre 1 222 (2,14). À elle seule, elle ne laisse pas assez de signaux.
2. Sur ces 214 trades, le résultat est mélangé : négatif en 2011–2016, très bon en 2017–2022 (+0,335 R sur 84 trades, t 1,68). Avec si peu de trades, l'écart entre les deux moitiés est dans l'ordre de grandeur du hasard ; ce n'est pas une raison de reprendre le test avec d'autres valeurs.
3. Les trades que E1 retire ne sont pas moins bons que ceux qu'il garde (+0,117 contre +0,072) : le critère « equal low » ne sépare pas les bons trades des mauvais dans les données d'entraînement.
4. Cela ne dit rien de ton jugement visuel : ton tri à l'aveugle (lots en cours) reste le test de ce que tu vois à l'écran ; E1 n'en est qu'une traduction mécanique en trois paramètres.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboV_eql.mjs <data> train` (≈ 10 s). Tests : `node --test scripts/comboFvgV6/comboV_eql.test.mjs` (6 tests, dont une comparaison avec une implémentation naïve sur données réelles et l'identité avec F2C).
