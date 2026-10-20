# Résultat — F2 avec tendance daily par PD arrays (TD2), entraînement 2011–2022

Règle et critères : `PREREG-F2-TENDANCE-DAILY-PD.md` (SHA-256 `b6d43570…9634`, 2026-10-07 06:32 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R, A +0,067 (617), B +0,146 (605)). Code : `scripts/comboFvgV6/comboAD_dailyPD.mjs` (+ test, 8 tests passent).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **TD2** 2011–2016 | 298 | 30 % | 44,6 | +0,150 | 1,37 | 16,8 |
| **TD2** 2017–2022 | 280 | 36 % | 106,1 | +0,379 | 3,32 | 13,5 |
| **TD2** 2011–2022 | 578 | 33 % | 150,7 | **+0,261** | 3,30 | 16,8 |

Retirés (trades de F2C pris quand la daily n'était pas haussière) : 644 trades (53 %), R moyen **−0,033**. Ajoutés : 0.

## Critères (tous requis)
| Critère | TD2 |
|---|---|
| R moyen ≥ F2C + 0,03 | +0,261 contre +0,106 : ok |
| Welch ≥ 1,96 (TD2 contre retirés) | 2,81 : ok |
| Moitiés A et B > F2C et > 0 | A +0,150 (F2C +0,067), B +0,379 (F2C +0,146) : ok |
| Pire baisse ≤ 34,3 | 16,8 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | **0,97 : échec** |

**TD2 est rejetée, sur un seul critère : le rythme (0,97 pour 1,0 requis, soit environ 150 trades en 155 semaines).** Le test 2023–2025 n'a pas été lu. Le seuil de 1,0 était écrit d'avance, le même que pour les études précédentes ; le baisser maintenant que je connais le résultat serait exactement ce que le protocole interdit. Comme écrit d'avance, on s'arrête : aucune variante voisine (FVG sans rejet, seulement le low, seulement le FVG, autre pivot, autre alignement).

## Descriptif (non jugé)
- Sur F2C 2011–2022 : les trades pris quand la daily est haussière font **+0,261 R** (578) ; quand elle est baissière **−0,033 R** (644) ; aucun en état neutre.
- Part du temps en tendance haussière : 45 % à 68 % selon l'année. L'état change 26 à 48 fois par an (bien plus souvent que TD1, qui changeait 7 à 17 fois par an).
- Événements daily cumulés (nov. 2010 → 2022) : low pris et rejeté 262, FVG haussier touché et rejeté 427, high pris et rejeté 299, FVG baissier touché et rejeté 270.

## Lecture honnête
1. **C'est la variante qui sépare le mieux les achats de F2 de toutes celles testées** : +0,261 contre −0,033 pour ce qu'elle retire, dans les deux moitiés d'années, avec une pire baisse de 16,8 contre 27,4 R. Elle perd pourtant sur le rythme, par 0,03.
2. **À prendre avec prudence.** (a) C'est la seizième variante environ testée sur F2 avec le même seuil de 1,96 : le Welch de 2,81 ne résiste pas forcément à une correction pour comparaisons multiples (une correction de Bonferroni sur 16 tests exigerait environ 2,9). (b) 2023–2025 n'est pas vierge pour F2 (son R global a été lu). (c) La tendance change d'état 30 à 40 fois par an : c'est plutôt un signal de direction récente de la daily (dernier rejet d'un niveau) qu'une tendance lente.
3. **Ce que ce test ne mesure pas** : tes achats sur plusieurs jours de suite (la fenêtre reste de 32 bougies), la cible lointaine « jusqu'au prochain PD array opposé » (non codée comme cible), et ta lecture à l'œil de la daily.
4. Cette règle est une traduction de ta phrase par mes définitions (dernier creux confirmé, FVG strict à 3 barres, rejet par la clôture, mort par remplissage complet) que tu as validées sur le principe ; d'autres définitions pourraient donner autre chose.

## Chemins honnêtes pour la suite (à ta décision)
- **Arrêter ici** : TD2 est rejetée sur le rythme ; F2 reste inchangée.
- **Lecture exploratoire de 2023–2025 pour TD2**, avec un critère écrit avant : elle ne pourrait jamais compter comme « passe » (TD2 est rejetée), seulement comme indice ; elle consommerait la lecture vierge de 2023–2025.
- **Suivre F2 et TD2 côte à côte sur des signaux en temps réel après le 21/09/2026** : seule confirmation propre, elle demande du temps.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs.
- Le rythme de 0,97 est calculé sur le nombre de trades de 2023–2025 sans lire leur R.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAD_dailyPD.mjs <data> train`. Tests : `node --test scripts/comboFvgV6/comboAD_dailyPD.test.mjs`.
