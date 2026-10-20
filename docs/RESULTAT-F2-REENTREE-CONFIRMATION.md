# Résultat — F2 avec réentrée sur confirmation après un stop (CONF), entraînement 2011–2022

Règle et critères : `PREREG-F2-REENTREE-CONFIRMATION.md` (SHA-256 `83c27ca0…78ff`, 2026-10-07 07:16 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Code : `scripts/comboFvgV6/comboAG_reentree_confirmation.mjs` + moteur `lib/krysBacktestD.js` (option `reentry.wait`) + test (9 tests ; avec ceux de REE, 19 passent). Le contrôle F2C se reproduit exactement (1 222 trades, +0,106 R, 129,7 R, baisse 27,4).

## Ce qui a été testé
Après un stop de F2, on surveille 8 bougies (celle du stop comprise). Si une grande bougie baissière apparaît (corps ≥ 2 × l'amplitude moyenne des 96 bougies précédentes, seuil de moi) : on annule. Si une bougie clôture au-dessus du stop d'origine : confirmation, achat au marché à l'ouverture suivante, même TP, stop sous le plus bas de toute la fenêtre − 3 pts. Une seule réentrée par trade d'origine.

## Résultat
| 2011–2022 | Trades | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|
| F2C (contrôle) | 1 222 | 129,7 | +0,106 | 2,04 | 27,4 |
| CONF entier | 1 530 | 176,5 | +0,115 | 2,34 | **38,8** |
| dont les 340 réentrées seules | 340 | 42,6 | +0,125 | **1,01** | 23,7 |
| Réentrées 2011–2016 (A) | 174 | 1,2 | +0,007 | 0,04 | |
| Réentrées 2017–2022 (B) | 166 | 41,4 | +0,249 | 1,35 | |

Flux : 868 stops de F2C ; 843 fenêtres armées ; 215 annulées (grande baissière) ; 61 expirées sans confirmation ; 58 remplacées par un nouveau stop pendant l'attente ; 509 confirmées ; 340 réentrées prises. Le moteur n'a pas enregistré pourquoi 169 confirmations n'ont pas donné de trade (position déjà ouverte, plage horaire, TP déjà dépassé ou risque nul). Issue des réentrées : TP 86 (25 %), stop 245, temps 9 ; RR visé moyen 5,7 (F2C : 3,3) ; la confirmation arrive en moyenne 0,7 bougie après la bougie du stop.

## Critères (tous requis)
| Critère | CONF |
|---|---|
| Réentrées : R moyen > 0 et t ≥ 1,96 | +0,125 mais t **1,01** : échec |
| Réentrées > 0 dans A et B | A +0,007, B +0,249 : ok (A quasi nul) |
| R total et R moyen sans dilution | 176,5 > 129,7 et +0,115 ≥ +0,106 : ok |
| Pire baisse ≤ 1,25 × celle de F2C (34,3) | **38,8 : échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 2,50 : ok |

**CONF est rejetée** (deux critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine.

## Descriptif (non jugé)
Comparaison avec REE (réentrée immédiate, déjà lue) : 398 réentrées à +0,124 R pour REE, 340 à +0,125 R pour CONF. La confirmation n'a donc presque rien changé : mêmes moyennes, même profil (zéro en 2011–2016, +0,25 en 2017–2022), t un peu plus haut (1,01 contre 0,78), sans atteindre le seuil.

## Lecture honnête
1. **Attendre une confirmation ne rend pas la réentrée plus fiable.** La confirmation arrive en moyenne 0,7 bougie après la bougie du stop (0 = la bougie du stop elle-même), donc très vite, et CONF ressemble beaucoup à REE.
2. **Même schéma que REE** : zéro sur 2011–2016, positif sur 2017–2022, pas significatif (t 1,01), baisse maximale plus grande que le plafond (38,8 contre 34,3). Deux règles différentes qui donnent le même verdict renforcent l'idée que rentrer après un stop avec le TP d'origine ne dégage pas d'avantage net dans ces données.
3. **Ce que ça ne dit pas** : ça ne dit rien sur la façon dont tu repérerais, à la main, les cas où le prix repart vraiment (contexte, structure). Le moteur ne fait que des règles mécaniques.

## Limites et divulgation
- Le seuil de 2 ×, la confirmation par clôture au-dessus du stop d'origine et la fenêtre de 8 bougies sont de moi.
- Deuxième hypothèse sur le même sujet après REE : seuil de 1,96 non corrigé pour les comparaisons multiples.
- Après le premier calcul, j'ai ajouté un compteur descriptif (« remplacées ») au moteur pour expliquer 58 fenêtres non classées. Il n'a modifié aucun trade ; les chiffres sont identiques avant et après.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAG_reentree_confirmation.mjs <data> train` (≈ 20 s). Tests : `node --test scripts/comboFvgV6/comboAG_reentree_confirmation.test.mjs scripts/comboFvgV6/comboAF_reentree.test.mjs`.
