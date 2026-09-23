# Le FVG d'Esdras v2 (contexte 4h) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md` appliquées telles quelles à US500 (`preregistration-esdras-fvg-v2-us500-2026-09-23.md`) (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgV2Study.js`. M15 US500 seul, règles v1 + creux/sommet 4h pris ou FVG 4h touché dans les 5 jours avec retournement depuis cette zone, cible = liquidité 4h la plus proche (≥ 3R exigé), 8h-12h New York, réglé à la minute.

## Entonnoir de détection

- US500 hist : FVG 60007, impulsion 5858, + BMS 4029, + 8h-12h 1512, + événement 4h dans les 5 jours 1496, + retournement depuis la zone 1165, + prix parti à 2x 429, + cible 4h trouvée 410 (médiane 5.8 R), + cible ≥ 3R 364, ordres remplis 204
- US500 broker : FVG 17840, impulsion 1645, + BMS 1159, + 8h-12h 511, + événement 4h dans les 5 jours 507, + retournement depuis la zone 415, + prix parti à 2x 204, + cible 4h trouvée 196 (médiane 5.9 R), + cible ≥ 3R 173, ordres remplis 90

## R par trade (tous les trades détectés, sans garde-fou)

| Période | Paire | Trades | Gagnants | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | US500 | 204 | 15 % | 9.9 R | +44.9 | +0.220 | 0.92 |
| Test 2023-2025 | US500 | 70 | 13 % | 11.8 R | -9.2 | -0.131 | -0.44 |
| 2026 (→ fin des données) | US500 | 20 | 20 % | 9.2 R | +15.5 | +0.775 | 0.86 |

## Critère pré-enregistré

- Entraînement : 204 trades, R net +44.9, t = 0.92 ; 2010-2016 +7.7 R (92), 2017-2022 +37.2 R (112) → **ÉCHEC à l'entraînement**
- Test 2023-2025 (lu une fois) : 70 trades, R net -9.2, t = -0.44 → non lu comme critère (échec à l'entraînement)

## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step

| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|---|
| 0.25 % | Entraînement 2010-2022 | 204 | +44.9 | +11.1 % | 5.7 % | 1 / 0 |
| 0.25 % | Test 2023-2025 | 70 | -9.2 | -2.4 % | 8.3 % | 0 / 0 |
| 0.25 % | 2026 (→ fin des données) | 20 | +15.5 | +3.8 % | 2.5 % | 0 / 0 |
| 0.5 % | Entraînement 2010-2022 | 204 | +44.9 | +21.7 % | 11.4 % | 3 / 1 |
| 0.5 % | Test 2023-2025 | 70 | -9.2 | -5.0 % | 15.9 % | 0 / 1 |
| 0.5 % | 2026 (→ fin des données) | 20 | +15.5 | +7.6 % | 4.9 % | 1 / 0 |
| 0.75 % | Entraînement 2010-2022 | 204 | +44.9 | +31.5 % | 17.3 % | 4 / 3 |
| 0.75 % | Test 2023-2025 | 70 | -9.2 | -7.7 % | 23.0 % | 0 / 2 |
| 0.75 % | 2026 (→ fin des données) | 20 | +15.5 | +11.4 % | 7.3 % | 1 / 0 |
| 1 % | Entraînement 2010-2022 | 204 | +44.9 | +40.4 % | 23.1 % | 6 / 5 |
| 1 % | Test 2023-2025 | 70 | -9.2 | -10.6 % | 29.5 % | 1 / 3 |
| 1 % | 2026 (→ fin des données) | 20 | +15.5 | +15.0 % | 9.6 % | 2 / 0 |

Risque choisi sur l'entraînement (max réussis − ratés) : **0.5 %**.

## Cycles FTMO en 2026 au risque choisi (0.5 %)

| Cycle | Début | Fin | Trades | Résultat |
|---|---|---|---|---|
| 1 | 2026-01-02 | 2026-03-01 | 9 | RÉUSSI |
| 2 | 2026-03-01 | 2026-08-26 | 11 | en cours (-3.1 %) |

## Par année (R net, tous trades détectés)

| Année | Trades | R net |
|---|---|---|
| 2010 | 0 | +0.0 |
| 2011 | 8 | +9.4 |
| 2012 | 12 | +3.7 |
| 2013 | 23 | -6.5 |
| 2014 | 13 | -7.7 |
| 2015 | 23 | +3.1 |
| 2016 | 13 | +5.7 |
| 2017 | 14 | -1.5 |
| 2018 | 26 | -0.3 |
| 2019 | 23 | +20.9 |
| 2020 | 19 | +8.0 |
| 2021 | 17 | +5.4 |
| 2022 | 13 | +4.7 |
| 2023 | 15 | +2.8 |
| 2024 | 28 | -22.3 |
| 2025 | 27 | +10.3 |
| 2026 | 20 | +15.5 |

## Mois (descriptif, pas un critère) : combien de mois à +25 R ou plus ?

À 1 % de risque par trade, +25 R dans un mois ≈ +25 % du compte.

| Période | Mois avec trades | Mois ≥ +10 R | Mois ≥ +25 R | Meilleur mois | Pire mois |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 105 | 5 | 0 | 2016-07 (+17.7 R) | 2016-08 (-4.0 R) |
| Test 2023-2025 | 31 | 1 | 0 | 2023-09 (+10.8 R) | 2024-08 (-5.0 R) |
| 2026 (→ fin des données) | 7 | 1 | 0 | 2026-02 (+14.2 R) | 2026-07 (-3.0 R) |

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.
- « Stop d'abord » dans une même minute (prudent).
- Détecteur écrit pour cette étude : pas encore le code du bot live.
- US500 : 2e essai de la même règle sur un indice corrélé à US100.
- Le M1 du broker commence le 2023-01-11 : au début du test, les niveaux 4h plus anciens sont inconnus.