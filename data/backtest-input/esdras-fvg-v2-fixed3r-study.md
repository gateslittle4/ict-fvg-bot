# Le FVG d'Esdras v2 (contexte 4h) — cible fixe 3R — US100 — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-fvg-v2-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgV2Study.js`. M15 US100 seul, règles v1 + creux/sommet 4h pris ou FVG 4h touché dans les 5 jours avec retournement depuis cette zone, **cible fixe 3R** (`preregistration-esdras-fvg-v2-fixed3r-2026-09-23.md`), 8h-12h New York, réglé à la minute.

## Entonnoir de détection

- US100 hist : FVG 60659, impulsion 6100, + BMS 4384, + 8h-12h 1848, + événement 4h dans les 5 jours 1829, + retournement depuis la zone 1446, + prix parti à 2x 549, + cible 4h trouvée 549 (médiane 3.0 R), + cible ≥ 3R 549, ordres remplis 265
- US100 broker : FVG 18277, impulsion 1673, + BMS 1210, + 8h-12h 599, + événement 4h dans les 5 jours 588, + retournement depuis la zone 477, + prix parti à 2x 224, + cible 4h trouvée 224 (médiane 3.0 R), + cible ≥ 3R 224, ordres remplis 114

## R par trade (tous les trades détectés, sans garde-fou)

| Période | Paire | Trades | Gagnants | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | US100 | 265 | 25 % | 3.0 R | +3.0 | +0.011 | 0.11 |
| Test 2023-2025 | US100 | 99 | 22 % | 3.0 R | -11.0 | -0.111 | -0.66 |
| 2026 (→ fin des données) | US100 | 15 | 7 % | 3.0 R | -11.0 | -0.733 | -2.75 |

## Critère pré-enregistré

- Entraînement : 265 trades, R net +3.0, t = 0.11 ; 2010-2016 -6.0 R (110), 2017-2022 +9.0 R (155) → **ÉCHEC à l'entraînement**
- Test 2023-2025 (lu une fois) : 99 trades, R net -11.0, t = -0.66 → non lu comme critère (échec à l'entraînement)

## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step

| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|---|
| 0.25 % | Entraînement 2010-2022 | 264 | +4.0 | +0.8 % | 6.2 % | 0 / 0 |
| 0.25 % | Test 2023-2025 | 99 | -11.0 | -2.8 % | 7.2 % | 0 / 0 |
| 0.25 % | 2026 (→ fin des données) | 15 | -11.0 | -2.7 % | 3.2 % | 0 / 0 |
| 0.5 % | Entraînement 2010-2022 | 264 | +4.0 | +1.0 % | 12.2 % | 1 / 1 |
| 0.5 % | Test 2023-2025 | 99 | -11.0 | -5.7 % | 14.0 % | 0 / 1 |
| 0.5 % | 2026 (→ fin des données) | 15 | -11.0 | -5.4 % | 6.3 % | 0 / 0 |
| 0.75 % | Entraînement 2010-2022 | 264 | +4.0 | +0.8 % | 18.0 % | 0 / 1 |
| 0.75 % | Test 2023-2025 | 99 | -11.0 | -8.6 % | 20.3 % | 0 / 2 |
| 0.75 % | 2026 (→ fin des données) | 15 | -11.0 | -8.0 % | 9.3 % | 0 / 0 |
| 1 % | Entraînement 2010-2022 | 264 | +4.0 | +0.1 % | 23.6 % | 2 / 3 |
| 1 % | Test 2023-2025 | 99 | -11.0 | -11.6 % | 26.2 % | 0 / 2 |
| 1 % | 2026 (→ fin des données) | 15 | -11.0 | -10.5 % | 12.2 % | 0 / 1 |

Risque choisi sur l'entraînement (max réussis − ratés) : **0.25 %**.

## Cycles FTMO en 2026 au risque choisi (0.25 %)

| Cycle | Début | Fin | Trades | Résultat |
|---|---|---|---|---|
| 1 | 2026-01-21 | 2026-07-31 | 15 | en cours (-2.7 %) |

## Par année (R net, tous trades détectés)

| Année | Trades | R net |
|---|---|---|
| 2010 | 1 | -1.0 |
| 2011 | 11 | -7.0 |
| 2012 | 8 | +0.0 |
| 2013 | 25 | -1.0 |
| 2014 | 18 | +14.0 |
| 2015 | 30 | -6.0 |
| 2016 | 17 | -5.0 |
| 2017 | 23 | -7.0 |
| 2018 | 31 | -3.0 |
| 2019 | 16 | +4.0 |
| 2020 | 26 | -6.0 |
| 2021 | 30 | +18.0 |
| 2022 | 29 | +3.0 |
| 2023 | 29 | +3.0 |
| 2024 | 33 | -25.0 |
| 2025 | 37 | +11.0 |
| 2026 | 15 | -11.0 |

## Mois (descriptif, pas un critère) : combien de mois à +25 R ou plus ?

À 1 % de risque par trade, +25 R dans un mois ≈ +25 % du compte.

| Période | Mois avec trades | Mois ≥ +10 R | Mois ≥ +25 R | Meilleur mois | Pire mois |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 117 | 0 | 0 | 2014-01 (+6.0 R) | 2017-06 (-5.0 R) |
| Test 2023-2025 | 34 | 0 | 0 | 2025-02 (+5.0 R) | 2024-09 (-5.0 R) |
| 2026 (→ fin des données) | 5 | 0 | 0 | 2026-07 (+1.0 R) | 2026-03 (-4.0 R) |

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.
- « Stop d'abord » dans une même minute (prudent).
- Détecteur écrit pour cette étude : pas encore le code du bot live.
- US100 choisi après la v1 (biais de sélection déclaré dans le pré-enregistrement).
- Le M1 du broker commence le 2023-01-11 : au début du test, les niveaux 4h plus anciens sont inconnus.