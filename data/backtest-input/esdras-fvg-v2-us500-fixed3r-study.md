# Le FVG d'Esdras v2 (contexte 4h) — cible fixe 3R — US500 — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md` appliquées telles quelles à US500 (`preregistration-esdras-fvg-v2-us500-2026-09-23.md`) (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgV2Study.js`. M15 US500 seul, règles v1 + creux/sommet 4h pris ou FVG 4h touché dans les 5 jours avec retournement depuis cette zone, **cible fixe 3R** (`preregistration-esdras-fvg-v2-fixed3r-2026-09-23.md`), 8h-12h New York, réglé à la minute.

## Entonnoir de détection

- US500 hist : FVG 60007, impulsion 5858, + BMS 4029, + 8h-12h 1512, + événement 4h dans les 5 jours 1496, + retournement depuis la zone 1165, + prix parti à 2x 432, + cible 4h trouvée 432 (médiane 3.0 R), + cible ≥ 3R 432, ordres remplis 223
- US500 broker : FVG 17840, impulsion 1645, + BMS 1159, + 8h-12h 511, + événement 4h dans les 5 jours 507, + retournement depuis la zone 415, + prix parti à 2x 204, + cible 4h trouvée 204 (médiane 3.0 R), + cible ≥ 3R 204, ordres remplis 106

## R par trade (tous les trades détectés, sans garde-fou)

| Période | Paire | Trades | Gagnants | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | US500 | 223 | 23 % | 3.0 R | -15.0 | -0.067 | -0.59 |
| Test 2023-2025 | US500 | 80 | 30 % | 3.0 R | +16.0 | +0.200 | 0.97 |
| 2026 (→ fin des données) | US500 | 26 | 35 % | 3.0 R | +10.0 | +0.385 | 1.01 |

## Critère pré-enregistré

- Entraînement : 223 trades, R net -15.0, t = -0.59 ; 2010-2016 -13.0 R (105), 2017-2022 -2.0 R (118) → **ÉCHEC à l'entraînement**
- Test 2023-2025 (lu une fois) : 80 trades, R net +16.0, t = 0.97 → non lu comme critère (échec à l'entraînement)

## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step

| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|---|
| 0.25 % | Entraînement 2010-2022 | 223 | -15.0 | -3.9 % | 8.3 % | 0 / 0 |
| 0.25 % | Test 2023-2025 | 80 | +16.0 | +4.0 % | 2.5 % | 0 / 0 |
| 0.25 % | 2026 (→ fin des données) | 26 | +10.0 | +2.5 % | 1.7 % | 0 / 0 |
| 0.5 % | Entraînement 2010-2022 | 223 | -15.0 | -8.0 % | 16.0 % | 0 / 1 |
| 0.5 % | Test 2023-2025 | 80 | +16.0 | +8.0 % | 4.9 % | 0 / 0 |
| 0.5 % | 2026 (→ fin des données) | 26 | +10.0 | +5.0 % | 3.4 % | 0 / 0 |
| 0.75 % | Entraînement 2010-2022 | 223 | -15.0 | -12.2 % | 23.3 % | 1 / 2 |
| 0.75 % | Test 2023-2025 | 80 | +16.0 | +11.9 % | 7.3 % | 1 / 0 |
| 0.75 % | 2026 (→ fin des données) | 26 | +10.0 | +7.5 % | 5.1 % | 0 / 0 |
| 1 % | Entraînement 2010-2022 | 223 | -15.0 | -16.6 % | 30.2 % | 1 / 5 |
| 1 % | Test 2023-2025 | 80 | +16.0 | +15.8 % | 9.6 % | 1 / 0 |
| 1 % | 2026 (→ fin des données) | 26 | +10.0 | +10.0 % | 6.8 % | 1 / 0 |

Risque choisi sur l'entraînement (max réussis − ratés) : **0.25 %**.

## Cycles FTMO en 2026 au risque choisi (0.25 %)

| Cycle | Début | Fin | Trades | Résultat |
|---|---|---|---|---|
| 1 | 2026-01-02 | 2026-08-26 | 26 | en cours (2.5 %) |

## Par année (R net, tous trades détectés)

| Année | Trades | R net |
|---|---|---|
| 2010 | 0 | +0.0 |
| 2011 | 8 | +0.0 |
| 2012 | 13 | -5.0 |
| 2013 | 24 | -4.0 |
| 2014 | 20 | +0.0 |
| 2015 | 26 | +2.0 |
| 2016 | 14 | -6.0 |
| 2017 | 15 | -11.0 |
| 2018 | 27 | -7.0 |
| 2019 | 23 | +13.0 |
| 2020 | 20 | +0.0 |
| 2021 | 20 | +4.0 |
| 2022 | 13 | -1.0 |
| 2023 | 19 | +5.0 |
| 2024 | 31 | -7.0 |
| 2025 | 30 | +18.0 |
| 2026 | 26 | +10.0 |

## Mois (descriptif, pas un critère) : combien de mois à +25 R ou plus ?

À 1 % de risque par trade, +25 R dans un mois ≈ +25 % du compte.

| Période | Mois avec trades | Mois ≥ +10 R | Mois ≥ +25 R | Meilleur mois | Pire mois |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 109 | 0 | 0 | 2015-05 (+7.0 R) | 2016-08 (-4.0 R) |
| Test 2023-2025 | 31 | 0 | 0 | 2025-08 (+9.0 R) | 2025-07 (-3.0 R) |
| 2026 (→ fin des données) | 7 | 0 | 0 | 2026-02 (+8.0 R) | 2026-01 (-3.0 R) |

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.
- « Stop d'abord » dans une même minute (prudent).
- Détecteur écrit pour cette étude : pas encore le code du bot live.
- US500 : 2e essai de la même règle sur un indice corrélé à US100.
- Le M1 du broker commence le 2023-01-11 : au début du test, les niveaux 4h plus anciens sont inconnus.