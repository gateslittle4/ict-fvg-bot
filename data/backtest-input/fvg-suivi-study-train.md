# Suivre le FVG le plus récent — entraînement 2010-2022

Règles : `data/backtest-input/preregistration-fvg-suivi-2026-09-30.md` (commité avant ce calcul). Script : `scripts/runFvgFollowStudy.js train`. R net de spread et de swap (commission 0), rapporté au risque. Généré le 2026-09-30T04:35 UTC.

## US100 + US500 (verdict)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 34597 | 17 % | -0.009 | -324.6 | -0.33 |
|   dont 2010-2016 | 18143 | 17 % | -0.001 | -11.9 | -0.01 |
|   dont 2017-2022 | 16454 | 17 % | -0.019 | -312.6 | -0.55 |

## US100 (descriptif)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 17660 | 16 % | -0.013 | -226.7 | -0.33 |
|   dont 2010-2016 | 9259 | 16 % | -0.015 | -139.6 | -0.25 |
|   dont 2017-2022 | 8401 | 17 % | -0.010 | -87.0 | -0.22 |

## US500 (descriptif)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 16937 | 17 % | -0.006 | -97.9 | -0.14 |
|   dont 2010-2016 | 8884 | 17 % | +0.014 | +127.7 | 0.22 |
|   dont 2017-2022 | 8053 | 17 % | -0.028 | -225.6 | -0.55 |

## Descriptif

- Toutes paires : sorties par stop 74 %, retournement 26 %, durée 0 % ; durée moyenne 2.4 h
- US100 : sorties par stop 74 %, retournement 26 %, durée 0 % ; durée moyenne 2.4 h
- US500 : sorties par stop 73 %, retournement 27 %, durée 0 % ; durée moyenne 2.5 h

## Comptage

| Paire | Zones actives | Risque < 3 x spread | Ordres | Remplis | Non remplis | Stop franchi |
|---|---|---|---|---|---|---|
| US100 | 26079 | 1502 | 24577 | 17660 | 6833 | 84 |
| US500 | 24606 | 1113 | 23493 | 16937 | 6416 | 140 |

## Verdict (fixé à l'avance)

**ENTRAÎNEMENT ÉCHEC** (R moyen -0.009, t -0.33 (2.6 exigé) ; 2010-2016 -11.9 R, 2017-2022 -312.6 R). Le test 2023-2025 et 2026 ne sont pas lus.

