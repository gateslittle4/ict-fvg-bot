# FVG « 15 min » vers FVG « à gauche » — entraînement 2010-2022

Règles : `data/backtest-input/preregistration-fvg-a-gauche-2026-09-29.md` (commité avant ce calcul). Script : `scripts/runFvgGaucheStudy.js train`. R net de spread et de swap (commission 0), rapporté au risque réel. Généré le 2026-09-30T02:10 UTC.

## US100 + US500 (verdict)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 4934 | 11 % | -0.070 | -345.0 | -1.15 |
|   dont 2010-2016 | 2445 | 11 % | -0.015 | -37.4 | -0.16 |
|   dont 2017-2022 | 2489 | 11 % | -0.124 | -307.6 | -1.62 |

## US100 (descriptif)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 2471 | 11 % | -0.085 | -209.2 | -0.94 |
|   dont 2010-2016 | 1230 | 10 % | -0.133 | -164.0 | -1.06 |
|   dont 2017-2022 | 1241 | 11 % | -0.036 | -45.1 | -0.28 |

## US500 (descriptif)

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Entraînement 2010-2022 | 2463 | 12 % | -0.055 | -135.8 | -0.67 |
|   dont 2010-2016 | 1215 | 13 % | +0.104 | +126.7 | 0.73 |
|   dont 2017-2022 | 1248 | 11 % | -0.210 | -262.4 | -2.53 |

## Contrôle (descriptif) : mêmes ordres, cible fixe à 3 R au lieu du FVG « à gauche »

| Période | Trades | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| Cible « à gauche » | 4934 | 11 % | -0.070 | -345.0 | -1.15 |
| Cible fixe 3 R | 4934 | 22 % | -0.153 | -757.1 | -6.49 |

## Comptage des déclencheurs

| Paire | Déclencheurs | Hors fenêtre | Occupé | Sans cible | Cible < 2 R | Ordres | Remplis | Cible avant remplissage | Stop franchi | Expirés |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | 63557 | 54963 | 1316 | 3410 | 419 | 3449 | 2471 | 804 | 11 | 163 |
| US500 | 63270 | 54724 | 1340 | 3382 | 414 | 3410 | 2463 | 734 | 33 | 180 |

## Verdict (fixé à l'avance)

**ENTRAÎNEMENT ÉCHEC** (R moyen -0.070, t -1.15 (2.6 exigé) ; 2010-2016 -37.4 R, 2017-2022 -307.6 R). Le test 2023-2025 et 2026 ne sont pas lus.

