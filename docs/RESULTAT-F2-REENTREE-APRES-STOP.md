# Résultat — F2 avec réentrée au marché après un stop (REE), entraînement 2011–2022

Règle et critères : `PREREG-F2-REENTREE-APRES-STOP.md` (SHA-256 `f6824c57…58b6`, 2026-10-07 07:11 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Code : `scripts/comboFvgV6/comboAF_reentree.mjs` + moteur `lib/krysBacktestD.js` (copie du moteur C avec l'option de réentrée) + test (10 tests passent, dont l'identité avec le moteur C sans l'option). Le contrôle F2C se reproduit exactement (1 222 trades, +0,106 R, 129,7 R, baisse 27,4).

## Ce qui a été testé
Après un stop de F2, si la bougie qui prend le stop n'est **pas** une grande bougie baissière (corps ≥ 2 × l'amplitude moyenne des 96 bougies précédentes — seuil choisi par moi, tu n'avais pas donné de chiffre), achat au marché à l'ouverture de la bougie suivante, même TP, stop sous le plus bas de la bougie du stop − 3 pts. Une seule réentrée par trade d'origine.

## Résultat
| 2011–2022 | Trades | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|
| F2C (contrôle) | 1 222 | 129,7 | +0,106 | 2,04 | 27,4 |
| REE entier | 1 597 | 182,4 | +0,114 | 2,04 | **37,1** |
| dont les 398 réentrées seules | 398 | 49,5 | +0,124 | **0,78** | 28,5 |
| Réentrées 2011–2016 (A) | 198 | 1,6 | +0,008 | 0,04 | |
| Réentrées 2017–2022 (B) | 200 | 47,9 | +0,240 | 0,94 | |

Flux : 868 stops de F2C ; 229 exclus parce que la bougie du stop était une grande baissière ; 621 réentrées armées ; 398 réellement prises. Le moteur n'a pas enregistré pourquoi les 223 autres n'ont pas été prises. Issue des réentrées : TP 71 (18 %), stop 324, temps 3 ; RR visé moyen 11,2 (F2C : 3,3), parce que le nouveau stop est très proche de l'entrée. Trades de F2C absents de REE (déplacés par une réentrée) : 26 (+0,106 R en moyenne).

## Critères (tous requis)
| Critère | REE |
|---|---|
| Réentrées : R moyen > 0 et t ≥ 1,96 | +0,124 mais t **0,78** : échec |
| Réentrées > 0 dans A et B | A +0,008, B +0,240 : ok (A est quasi nul) |
| R total et R moyen sans dilution | 182,4 > 129,7 et +0,114 ≥ +0,106 : ok |
| Pire baisse ≤ 1,25 × celle de F2C (34,3) | **37,1 : échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 2,63 : ok |

**REE est rejetée** (deux critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine.

## Descriptif (non jugé)
Sans le filtre « grande bougie baissière », les réentrées sont 549 pour +0,053 R en moyenne, contre 398 pour +0,124 R avec le filtre. Le filtre écarte donc des réentrées moins bonnes, mais ce n'est pas jugé et ne change pas le verdict.

## Lecture honnête
1. **Les réentrées ajoutent un peu de R total (+49,5 sur 2011–2022), mais le résultat ne se distingue pas du hasard** (t 0,78). Elles gagnent rarement (18 %) et rapportent gros quand elles gagnent (RR visé ~11) : c'est un profil très dispersé, d'où le t faible.
2. **Tout vient de la seconde moitié** : 2011–2016 est à zéro (+0,008), 2017–2022 à +0,240. Un effet qui n'existe que sur une moitié n'est pas une base solide.
3. **La baisse maximale augmente** (27,4 → 37,1 R), au-delà du plafond fixé.
4. Ça répond à ta question de départ : sur les stops où le prix revient ensuite vers le TP, rentrer à nouveau au marché ne capture pas ce mouvement de façon fiable avec cette règle. Une autre façon de rentrer (attendre une confirmation, ordre limite sous un nouveau FVG) serait une autre hypothèse, à pré-enregistrer à part.

## Limites
- Le seuil de 2 × est de moi ; une autre définition de « grande bougie » donnerait d'autres chiffres (non testé, car interdit après un échec).
- Une seule réentrée par trade, et aucune attente de plusieurs bougies (tu n'avais pas donné de durée).
- Les trades sont corrélés ; les t sont un peu flatteurs. Seuil de 1,96 non corrigé pour les comparaisons multiples.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAF_reentree.mjs <data> train` (≈ 15 s). Tests : `node --test scripts/comboFvgV6/comboAF_reentree.test.mjs`.
