# Résultat — F2 avec filtre de direction du matin (D930 et D06), entraînement 2011–2022

Règle et critères : `PREREG-F2-DIRECTION-MATIN.md` (SHA-256 `f7f55033…d325`, 2026-10-06 20:56 heure de New York), commité avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **D930** 2011–2016 | 475 | 25 % | −3,0 | −0,006 | −0,08 | 28,3 |
| **D930** 2017–2022 | 461 | 30 % | 58,6 | +0,127 | 1,51 | 27,0 |
| **D930** 2011–2022 | 936 | 27 % | 55,6 | +0,059 | 1,01 | 28,3 |
| **D06** 2011–2016 | 419 | 26 % | 12,9 | +0,031 | 0,35 | 23,8 |
| **D06** 2017–2022 | 400 | 30 % | 53,3 | +0,133 | 1,47 | 28,3 |
| **D06** 2011–2022 | 819 | 28 % | 66,2 | +0,081 | 1,28 | 28,3 |

| | Retirés (F2C absents) | Ajoutés (absents de F2C) |
|---|---|---|
| D930 | 314 trades, R moyen **+0,220** | 28 trades, R moyen −0,180 |
| D06 | 462 trades, R moyen **+0,126** | 59 trades, R moyen −0,090 |

## Critères (tous requis)
| Critère | D930 | D06 |
|---|---|---|
| R moyen ≥ F2C + 0,03 | +0,059 : échec | +0,081 : échec |
| Welch ≥ 1,96 (variante contre retirés) | −1,33 : échec | −0,43 : échec |
| Moitiés A et B > F2C et > 0 | A −0,006, B +0,127 : échec | A +0,031, B +0,133 : échec |
| Pire baisse ≤ 1,25 × F2C | 28,3 : ok | 28,3 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,57 : ok | 1,38 : ok |

**Les deux sont rejetées.** Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (08 h, 08 h 30, clôture de la veille, seuil en points, minuit).

## Ce que ça dit
1. **Les trades que le filtre retire sont meilleurs que ceux qu'il garde** : +0,220 R (D930) et +0,126 R (D06) pour les achats posés quand le prix est *sous* l'ouverture de référence, contre +0,059 et +0,081 pour les achats qui suivent le mouvement du matin. Le Welch est négatif dans les deux cas : le filtre va dans le mauvais sens.
2. Cela rejoint ce que les études de l'heure avaient montré : sur 2011–2022, F2 gagne surtout en achetant des creux H4 balayés, c'est-à-dire souvent *contre* le mouvement du matin, pas en le suivant. Les ordres qui suivent la continuation de 9 h 30 sont les moins bons.
3. Ce n'est pas un jugement sur ton trading manuel : tu lis aussi l'order flow du jour, les ventes, des entrées plus tôt, et tu places ton stop toi-même. Cette étude dit seulement que, appliquée à F2 telle qu'elle est, la règle « suivre le mouvement du matin » n'améliore pas les achats.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs, ce qui rend les rejets plus solides.
- Les filtres changent aussi les ordres qui se remplissent ensuite (position libérée) : ces trades ajoutés sont inclus dans le calcul.
- Le « prix de pose » est la clôture de la bougie de pose ; une autre mesure de la direction (tendance H4, structure de marché, order flow à ta façon) n'est pas testée.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboX_direction.mjs <data> train` (≈ 20 s). Tests : `node --test scripts/comboFvgV6/comboX_direction.test.mjs` (5 tests : filtre sur données synthétiques, identité avec F2C, vérification indépendante de la règle sur données réelles).
