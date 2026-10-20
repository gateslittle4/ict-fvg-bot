# Résultat — FVG formé 4 h–7 h, testé 7 h–10 h, entrée au bord, stop serré, 5 R, ré-entrées (FM3), entraînement 2011–2022

Règle et critères : `PREREG-FVG-4-7-BORD-STOP-SERRE-REENTREE.md` (SHA-256 `9e9eb8ae…654b`, 2026-10-08 04:48 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture (le hash du fichier a été revérifié avant le calcul). Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R). Code : `scripts/comboFvgV6/comboAM_fvg_bord.mjs` + moteur `lib/krysBacktestE.js` + `comboAM_fvg_bord.test.mjs` (17 tests passent, dont : le moteur E sans options redonne exactement les trades du moteur C ; chaque sortie réelle est recalculée bougie par bougie à part du moteur ; toutes les ré-entrées suivent un stop de même sens, à l'ouverture suivante, entre 7 h 00 et 9 h 45).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| **FM3** 2011–2016 | 1 782 | 14 % | −286,6 | −0,161 | −3,29 | 317,6 |
| **FM3** 2017–2022 | 1 974 | 14 % | −381,1 | **−0,193** | −4,21 | 390,7 |
| **FM3** 2011–2022 | 3 756 | 14 % | −667,7 | **−0,178** | **−5,32** | **708,3** |

## Critères (tous requis)
| Critère | FM3 |
|---|---|
| R moyen > 0 et t ≥ 1,96 | −0,178, t −5,32 : **échec** |
| Deux moitiés > 0 | A −0,161, B −0,193 : **échec** |
| Pire baisse ≤ 34,3 R | 708,3 : **échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 5,94 : ok (nombre de trades seulement) |

**FM3 est rejetée** (palier : rejetée ; le R moyen est même significativement négatif). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (autre cible, autre stop, autre profondeur, autre nombre de ré-entrées, autres heures), et l'idée « plage matinale » est close.

## Descriptif prévu (non jugé), 2011–2022
- Trades d'origine : 1 869, −0,115 R (t −2,35). Ré-entrées : 1 887, **−0,240 R** (t −5,27). Les ré-entrées font plus que doubler le nombre de trades et aggravent la perte : chacune redémarre un trade au même endroit, avec un stop encore plus serré.
- Achats : 2 041, −0,204 R. Ventes : 1 715, −0,147 R. Aucun côté ne se détache.
- 13,3 % des trades atteignent 5 R, 85,8 % sortent sur leur stop, 0,8 % au temps. Pour qu'une cible à 5 R soit à l'équilibre il faut gagner un trade sur six, soit 16,7 %, avant même les coûts.
- Distance médiane du stop : 3,4 points bruts, soit 5,5 points à l'échelle 8 200 (les quartiles à cette échelle sont 3,2 et 9,4).
- Avec le spread doublé : −0,278 R (t −8,85).
- Repère F2C : +0,106 R.
- Par année : 11 années sur 12 sont négatives (2011 : +0,015 ; les autres entre −0,12 et −0,33).

## Ajouts après coup (non prévus au pré-enregistrement, descriptifs seulement, ne servent à rien juger)
- **Sans spread** (diagnostic) : −0,044 R (t −1,23), 16 % de gagnants. Sans aucun coût, la règle tombe à peu près à zéro, comme on s'y attend d'une entrée sans information avec une cible à 5 R : elle n'a donc pas d'avantage caché que les coûts masqueraient. Avec le spread de la règle, la perte passe à −0,178 : environ 0,13 R par trade partent en coûts, parce que le stop est très serré par rapport au spread.
- 17,0 % des trades ont un risque ≤ 4 fois le spread (indicateur de fragilité que j'ai ajouté ; non prévu).
- 49,6 % des stops sont touchés dans la bougie même de l'entrée (37 % pour les ordres d'origine, 62 % pour les ré-entrées).

## Lecture honnête
1. **Ta méthode, telle que je peux l'écrire, n'a pas d'avantage mesurable** : 13 % de trades à 5 R, pas 1 sur 6. Ton impression de « 5 R souvent » peut venir des FVG que tu choisis à l'œil et des jours que tu réduis, que ce test ne peut pas reproduire ; elle ne vient pas de la règle écrite appliquée à tous les FVG du matin.
2. **Les coûts pèsent beaucoup sur un stop aussi serré.** Le spread supposé (0,6 point à 8 200, soit environ 2,3 points à 31 000) est le même pour tous les tests de ce projet. Si ton broker est moins cher, la perte est plus petite ; mais le plafond est le résultat sans spread (≈ 0), pas un gain.
3. **Ce que le test ne mesure pas** : ton choix du FVG à l'œil, la réduction des trades aux plus hauts, la gestion à la main, le contexte H4/daily, l'entrée sur un timeframe plus bas. Ta stratégie réelle peut contenir ce que cette règle écrite n'a pas ; je n'ai aucun moyen de le tester sans une règle chiffrée.
4. **Trois lectures de la même idée sur les mêmes données** (FM1, FM2 erronée, FM3) : aucune n'a d'avantage. Le seul résultat positif du projet reste F2 (+0,106 R sur 2011–2022), lui aussi modeste et non confirmé en direct.

## Limites
- Définitions de « formé », « testé », du stop et de la ré-entrée choisies par moi à partir de tes deux exemples et de tes réponses (voir le pré-enregistrement).
- Bougies M15 : l'ordre des mouvements dans une bougie est inconnu ; conventions pessimistes (stop d'abord, cible seulement à partir de la bougie suivante). Avec des stops serrés ces conventions comptent plus que d'habitude.
- Les trades sont corrélés (une ré-entrée suit un stop au même endroit) ; le t de −5,3 exagère un peu la certitude.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAM_fvg_bord.mjs <data> train`. Tests : `node --max-old-space-size=6144 --test scripts/comboFvgV6/comboAM_fvg_bord.test.mjs`. Les ajouts après coup viennent d'un script de diagnostic jetable (spread nul, part des stops dans la bougie d'entrée) qui n'est pas dans le dossier.
