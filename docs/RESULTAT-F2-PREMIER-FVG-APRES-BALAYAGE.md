# Résultat — F2 avec « premier FVG après le balayage H4 » (FB1), entraînement 2011–2022

Règle et critères : `PREREG-F2-PREMIER-FVG-APRES-BALAYAGE.md` (SHA-256 `830342c2…8705`, 2026-10-06 21:37 heure de New York), commité avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R). Code : `scripts/comboFvgV6/comboAB_premier_fvg.mjs` (+ test, 3 tests passent).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **FB1** 2011–2016 | 286 | 29 % | 37,0 | +0,129 | 1,20 | 16,7 |
| **FB1** 2017–2022 | 285 | 33 % | 72,8 | +0,255 | 2,28 | 22,5 |
| **FB1** 2011–2022 | 571 | 31 % | 109,8 | +0,192 | 2,47 | 22,5 |

Retirés (trades de F2C absents de FB1) : 720 trades (59 %), R moyen **+0,083**. Ajoutés (absents de F2C, par effet de position libérée) : 69 trades, R moyen +0,573.
Descriptif sur F2C : 502 trades (41 %) sont le premier FVG de leur épisode (R moyen +0,140) ; 720 sont des FVG suivants (R moyen +0,083) ; rang moyen 2,45.

## Critères (tous requis)
| Critère | FB1 |
|---|---|
| R moyen ≥ F2C + 0,03 | +0,192 contre +0,106 : ok |
| Welch ≥ 1,96 (FB1 contre retirés) | **1,06 : échec** |
| Moitiés A et B > F2C et > 0 | A +0,129 (F2C +0,067), B +0,255 (F2C +0,146) : ok |
| Pire baisse ≤ 1,25 × F2C | 22,5 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,10 : ok |

**FB1 est rejetée** : un seul critère manque, le test t de Welch (1,06 pour 1,96). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (deux premiers FVG, premier FVG tradable, premier FVG du jour, M5/M1, autre `li`).

## Lecture honnête
- C'est la variante la mieux placée de toutes celles testées sur F2 en ce qui concerne le R moyen, la baisse maximale et les deux moitiés. Le rapport R total / pire baisse est de 4,88 contre 4,73 pour F2C.
- Mais l'écart avec les trades retirés (+0,192 contre +0,083) est faible par rapport au bruit : avec 571 et 720 trades, seule une différence d'environ 0,2 R se détecte. Le t de Welch de 1,06 dit que cet écart peut très bien être du hasard.
- Le R total baisse (109,8 contre 129,7) : on prend moitié moins de trades.
- Les 69 trades ajoutés (+0,573) viennent de positions libérées par le retrait d'autres trades ; ce n'est pas un effet de la règle elle-même et on ne peut pas les juger séparément.
- Rien dans ce test ne dit si ton « premier FVG » correspond à ton trading réel (entrée sur M5/M1, jugement du contexte).

## Pour la suite (décision de Krystofia)
Rien à lire sur 2023–2025 sans ton accord. Une confirmation propre demanderait des données nouvelles (après le 21/09/2026) : suivre FB1 et F2 côte à côte sur les signaux réels.
