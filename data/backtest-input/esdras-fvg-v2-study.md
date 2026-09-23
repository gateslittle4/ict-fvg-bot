# Le FVG d'Esdras v2 (contexte 4h) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgV2Study.js`. M15 US100 seul, règles v1 + creux/sommet 4h pris ou FVG 4h touché dans les 5 jours avec retournement depuis cette zone, cible = liquidité 4h la plus proche (≥ 3R exigé), 8h-12h New York, réglé à la minute.

## Entonnoir de détection

- US100 hist : FVG 60659, impulsion 6100, + BMS 4384, + 8h-12h 1848, + événement 4h dans les 5 jours 1829, + retournement depuis la zone 1446, + prix parti à 2x 548, + cible 4h trouvée 525 (médiane 5.4 R), + cible ≥ 3R 463, ordres remplis 241
- US100 broker : FVG 18277, impulsion 1673, + BMS 1210, + 8h-12h 599, + événement 4h dans les 5 jours 588, + retournement depuis la zone 477, + prix parti à 2x 224, + cible 4h trouvée 219 (médiane 6.3 R), + cible ≥ 3R 197, ordres remplis 109

## R par trade (tous les trades détectés, sans garde-fou)

| Période | Paire | Trades | Gagnants | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | US100 | 241 | 12 % | 10.9 R | +6.2 | +0.026 | 0.12 |
| Test 2023-2025 | US100 | 96 | 7 % | 16.8 R | -46.6 | -0.486 | -2.48 |
| 2026 (→ fin des données) | US100 | 13 | 0 % | 13.7 R | -13.0 | -1.000 | 0.00 |

## Critère pré-enregistré

- Entraînement : 241 trades, R net +6.2, t = 0.12 ; 2010-2016 -65.2 R (98), 2017-2022 +71.4 R (143) → **ÉCHEC à l'entraînement**
- Test 2023-2025 (lu une fois) : 96 trades, R net -46.6, t = -2.48 → non lu comme critère (échec à l'entraînement)

## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step

| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|---|
| 0.25 % | Entraînement 2010-2022 | 241 | +6.2 | +0.7 % | 17.0 % | 1 / 1 |
| 0.25 % | Test 2023-2025 | 96 | -46.6 | -11.1 % | 13.0 % | 0 / 1 |
| 0.25 % | 2026 (→ fin des données) | 13 | -13.0 | -3.2 % | 3.2 % | 0 / 0 |
| 0.5 % | Entraînement 2010-2022 | 241 | +6.2 | -0.1 % | 31.3 % | 3 / 3 |
| 0.5 % | Test 2023-2025 | 96 | -46.6 | -21.2 % | 24.4 % | 0 / 3 |
| 0.5 % | 2026 (→ fin des données) | 13 | -13.0 | -6.3 % | 6.3 % | 0 / 0 |
| 0.75 % | Entraînement 2010-2022 | 241 | +6.2 | -2.3 % | 43.2 % | 6 / 9 |
| 0.75 % | Test 2023-2025 | 96 | -46.6 | -30.2 % | 34.4 % | 1 / 4 |
| 0.75 % | 2026 (→ fin des données) | 13 | -13.0 | -9.3 % | 9.3 % | 0 / 0 |
| 1 % | Entraînement 2010-2022 | 241 | +6.2 | -5.8 % | 53.1 % | 7 / 10 |
| 1 % | Test 2023-2025 | 96 | -46.6 | -38.4 % | 43.2 % | 1 / 6 |
| 1 % | 2026 (→ fin des données) | 13 | -13.0 | -12.2 % | 12.2 % | 0 / 1 |

Risque choisi sur l'entraînement (max réussis − ratés) : **0.25 %**.

## Cycles FTMO en 2026 au risque choisi (0.25 %)

| Cycle | Début | Fin | Trades | Résultat |
|---|---|---|---|---|
| 1 | 2026-01-22 | 2026-07-31 | 13 | en cours (-3.2 %) |

## Par année (R net, tous trades détectés)

| Année | Trades | R net |
|---|---|---|
| 2010 | 1 | -1.0 |
| 2011 | 10 | -10.0 |
| 2012 | 8 | -8.0 |
| 2013 | 20 | -6.2 |
| 2014 | 13 | +0.2 |
| 2015 | 30 | -30.0 |
| 2016 | 16 | -10.2 |
| 2017 | 23 | +2.9 |
| 2018 | 29 | +37.4 |
| 2019 | 16 | +11.0 |
| 2020 | 23 | +14.4 |
| 2021 | 25 | +17.9 |
| 2022 | 27 | -12.2 |
| 2023 | 28 | -12.8 |
| 2024 | 32 | -32.0 |
| 2025 | 36 | -1.8 |
| 2026 | 13 | -13.0 |

## Mois (descriptif, pas un critère) : combien de mois à +25 R ou plus ?

À 1 % de risque par trade, +25 R dans un mois ≈ +25 % du compte.

| Période | Mois avec trades | Mois ≥ +10 R | Mois ≥ +25 R | Meilleur mois | Pire mois |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 111 | 6 | 1 | 2020-05 (+27.8 R) | 2017-06 (-5.0 R) |
| Test 2023-2025 | 34 | 1 | 0 | 2025-02 (+13.3 R) | 2023-12 (-5.0 R) |
| 2026 (→ fin des données) | 5 | 0 | 0 | 2026-01 (-1.0 R) | 2026-03 (-4.0 R) |

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.
- « Stop d'abord » dans une même minute (prudent).
- Détecteur écrit pour cette étude : pas encore le code du bot live.
- US100 choisi après la v1 (biais de sélection déclaré dans le pré-enregistrement).
- Le M1 du broker commence le 2023-01-11 : au début du test, les niveaux 4h plus anciens sont inconnus.