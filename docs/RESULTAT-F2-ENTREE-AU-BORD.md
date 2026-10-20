# Résultat — F2 avec entrée au bord proche du FVG (ENT0), entraînement 2011–2022

Règle et critères : `PREREG-F2-ENTREE-AU-BORD.md` (SHA-256 `43c1f5f4…914b`, 2026-10-07 07:48 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Code : `scripts/comboFvgV6/comboAH_entree_bord.mjs` + test (6 tests passent). Le contrôle F2C se reproduit exactement (1 222 trades, +0,106 R, 129,7 R, baisse 27,4).

## Résultat
| 2011–2022 | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C (entrée à 50 %) | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **ENT0 (entrée au bord)** | 1 300 | 30 % | 125,3 | +0,096 | 1,98 | **35,5** |
| ENT0 2011–2016 (A) | 663 | 29 % | 46,1 | +0,070 | 1,03 | 35,5 |
| ENT0 2017–2022 (B) | 637 | 31 % | 79,2 | +0,124 | 1,77 | 17,7 |

Appariement : 1 159 trades communs (écart moyen −0,090 R, l'entrée au bord fait moins bien sur les mêmes trades), 141 trades seulement dans ENT0 (+0,608 R en moyenne), 63 seulement dans F2C (−0,216 R). TP atteint : 24 % pour F2C, 22 % pour ENT0.

## Critères (tous requis)
| Critère | ENT0 |
|---|---|
| R total ≥ 1,10 × F2C (142,7) | 125,3 : **échec** |
| R moyen > 0 et t ≥ 1,96 | +0,096, t 1,98 : ok (de justesse) |
| A et B > 0, et R total ≥ F2C dans chaque moitié | A 46,1 ≥ 41,3 ok ; B 79,2 < 88,4 : **échec** |
| Pire baisse ≤ 1,25 × F2C (34,3) | 35,5 : **échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 2,23 : ok |

**ENT0 est rejetée** (trois critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (25 %, entrée au marché, TP identique).

## Descriptif 1 — jusqu'où va le prix dans le FVG (2 587 ordres de F2C, non jugé)
| Profondeur atteinte | Ordres |
|---|---|
| Bord proche touché | 1 491 (58 %) |
| ≥ 25 % | 1 416 (55 %) |
| ≥ 50 % | 1 346 (52 %) |
| ≥ 75 % | 1 282 (50 %) |
| 100 % (zone traversée) | 1 228 (47 %) |

**Les trades « manqués » vers le TP ne se rattrapent pas avec une entrée au bord.** Sur les 530 ordres qui vont au TP sans atteindre 50 %, **489 n'ont jamais touché le bord proche** non plus (41 seulement l'ont touché) : le prix part sans revenir dans la zone. Une entrée plus haute ne les capture pas ; il faudrait entrer au marché ou avant le retour, ce qui change la nature de la méthode.

## Descriptif 2 — un signe connu avant le trade (non jugé)
Largeur du FVG rapportée à l'amplitude moyenne des 96 bougies précédentes, en trois groupes égaux :
| Groupe | Ordres | Atteignent 50 % | Touchent le bord |
|---|---|---|---|
| FVG petits (≤ 0,26) | 863 | 60 % | 62 % |
| FVG moyens | 862 | 53 % | 57 % |
| FVG grands (> 0,66) | 862 | 44 % | 54 % |

Plus le FVG est grand, moins souvent le prix atteint 50 %. Une partie de cet effet est mécanique : 50 % d'un grand FVG est plus loin en points. Ce n'est pas un filtre testé, et rien n'indique que ça améliore le R.

## Lecture honnête
1. **L'entrée au bord ne bat pas l'entrée à 50 %** : mêmes ordres de grandeur (+0,096 contre +0,106), plus de baisse (35,5 contre 27,4), et sur les trades communs elle fait moins bien (−0,090 R).
2. **Les trades qui partent sans retracer sont une catégorie à part** : 489 ordres sur 2 587 (19 %) ne reviennent même pas au bord du FVG. Aucune entrée limite dans le FVG ne les prend.
3. **Pour savoir à l'avance** si le prix ira au bord ou à 50 % : on ne peut pas le dire avec certitude. La taille du FVG donne une probabilité (60 % contre 44 %), pas une réponse trade par trade.

## Limites et divulgation
- **Le TP change avec l'entrée** (3 R depuis une entrée plus haute) : ENT0 mélange l'effet de l'entrée et celui du TP. Avec le TP de F2C gardé, le résultat serait différent (non testé).
- Les ordres « manqués » ne sont pas des gagnants perdus : le descriptif mesure seulement jusqu'où le prix est allé.
- Seuil de 1,96 non corrigé pour les comparaisons multiples ; trades corrélés, t un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAH_entree_bord.mjs <data> train` (≈ 20 s). Test : `node --test scripts/comboFvgV6/comboAH_entree_bord.test.mjs`.
