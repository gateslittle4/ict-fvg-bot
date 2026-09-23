# Le FVG d'Esdras (« deuxième vague » ICT) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-fvg-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runEsdrasFvgStudy.js`. M15 US100 + XAUUSD, impulsion ≥ 2×ATR14 + BOS, prix parti à ≥ 2× la hauteur de la zone avant le retour, LIMIT au bord (ask), stop au bord opposé, cible 4R, 8h-12h New York, réglé à la minute.

## Entonnoir de détection

- US100 hist : FVG 60659, impulsion 6100, + BOS 4384, + 8h-12h 1848, + prix parti à 2x 710, ordres remplis 322
- XAUUSD hist : FVG 61787, impulsion 5961, + BOS 4469, + 8h-12h 1408, + prix parti à 2x 402, ordres remplis 163
- US100 broker : FVG 18277, impulsion 1673, + BOS 1210, + 8h-12h 599, + prix parti à 2x 282, ordres remplis 144
- XAUUSD broker : FVG 20649, impulsion 1637, + BOS 1193, + 8h-12h 427, + prix parti à 2x 153, ordres remplis 82

## R par trade (tous les trades détectés, sans garde-fou)

| Période | Paire | Trades | Gagnants | R net | R/trade | t |
|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | US100 | 322 | 21 % | +23.0 | +0.071 | 0.62 |
| Entraînement 2010-2022 | XAUUSD | 163 | 14 % | -48.0 | -0.294 | -2.15 |
| Entraînement 2010-2022 | les deux | 485 | 19 % | -25.0 | -0.052 | -0.58 |
| Test 2023-2025 | US100 | 123 | 20 % | -3.0 | -0.024 | -0.14 |
| Test 2023-2025 | XAUUSD | 53 | 15 % | -13.0 | -0.245 | -0.99 |
| Test 2023-2025 | les deux | 176 | 18 % | -16.0 | -0.091 | -0.62 |
| 2026 (→ fin des données) | US100 | 21 | 5 % | -16.0 | -0.762 | -3.20 |
| 2026 (→ fin des données) | XAUUSD | 22 | 14 % | -7.0 | -0.318 | -0.85 |
| 2026 (→ fin des données) | les deux | 43 | 9 % | -23.0 | -0.535 | -2.39 |

## Critère pré-enregistré

- Entraînement : 485 trades, R net -25.0, t = -0.58 ; 2010-2016 -26.0 R (216), 2017-2022 +1.0 R (269) → **ÉCHEC à l'entraînement**
- Test 2023-2025 (lu une fois) : 176 trades, R net -16.0, t = -0.62 → non lu comme critère (échec à l'entraînement)

## Compte (garde-fou du bot, une position par paire) et FTMO 1-Step

| Risque | Période | Trades pris | R net | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|---|
| 0.25 % | Entraînement 2010-2022 | 483 | -23.0 | -6.1 % | 11.1 % | 1 / 1 |
| 0.25 % | Test 2023-2025 | 176 | -16.0 | -4.1 % | 12.5 % | 0 / 1 |
| 0.25 % | 2026 (→ fin des données) | 43 | -23.0 | -5.6 % | 5.6 % | 0 / 0 |
| 0.5 % | Entraînement 2010-2022 | 483 | -23.0 | -12.9 % | 21.1 % | 2 / 5 |
| 0.5 % | Test 2023-2025 | 176 | -16.0 | -8.5 % | 23.4 % | 1 / 2 |
| 0.5 % | 2026 (→ fin des données) | 43 | -23.0 | -11.0 % | 11.0 % | 0 / 1 |
| 0.75 % | Entraînement 2010-2022 | 483 | -23.0 | -20.0 % | 30.1 % | 4 / 9 |
| 0.75 % | Test 2023-2025 | 176 | -16.0 | -12.9 % | 33.1 % | 2 / 5 |
| 0.75 % | 2026 (→ fin des données) | 43 | -23.0 | -16.1 % | 16.1 % | 0 / 1 |
| 1 % | Entraînement 2010-2022 | 483 | -23.0 | -27.4 % | 38.1 % | 8 / 13 |
| 1 % | Test 2023-2025 | 176 | -16.0 | -17.5 % | 41.6 % | 3 / 6 |
| 1 % | 2026 (→ fin des données) | 43 | -23.0 | -20.9 % | 20.9 % | 0 / 2 |

Risque choisi sur l'entraînement (max réussis − ratés) : **0.25 %**.

## Cycles FTMO en 2026 au risque choisi (0.25 %)

| Cycle | Début | Fin | Trades | Résultat |
|---|---|---|---|---|
| 1 | 2026-01-14 | 2026-09-17 | 43 | en cours (-5.6 %) |

## Par année (R net, tous trades détectés)

| Année | Trades | R net |
|---|---|---|
| 2010 | 15 | -10.0 |
| 2011 | 27 | -22.0 |
| 2012 | 22 | -2.0 |
| 2013 | 45 | +0.0 |
| 2014 | 30 | +30.0 |
| 2015 | 46 | -11.0 |
| 2016 | 31 | -11.0 |
| 2017 | 39 | -9.0 |
| 2018 | 40 | +5.0 |
| 2019 | 34 | +6.0 |
| 2020 | 47 | -12.0 |
| 2021 | 60 | +10.0 |
| 2022 | 49 | +1.0 |
| 2023 | 45 | +10.0 |
| 2024 | 65 | -40.0 |
| 2025 | 66 | +14.0 |
| 2026 | 43 | -23.0 |

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement ni de swap.
- « Stop d'abord » dans une même minute (prudent).
- Détecteur écrit pour cette étude : pas encore le code du bot live.