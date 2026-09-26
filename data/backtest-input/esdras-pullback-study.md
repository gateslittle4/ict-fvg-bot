# Repli dans la tendance le matin (règle tirée des trades d'Esdras) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-esdras-pullback-2026-09-26.md` (commité avant ce calcul). Script : `scripts/runEsdrasPullbackStudy.js`, règle `scripts/lib/pullbackRule.js`. R net du spread, rapporté à 1 ATR horaire.

## US100 (principale)

| Période | Trades | Gagnants | R moyen | R total | t | Sorties objectif / stop / temps |
|---|---|---|---|---|---|---|
| Entraînement 2011-2022 | 6386 | 33 % | -0.042 | -270.8 | -2.36 | 809 / 3810 / 1767 |
|   dont 2011-2016 | 3228 | 32 % | -0.054 | -173.6 | -2.09 | 427 / 1981 / 820 |
|   dont 2017-2022 | 3158 | 34 % | -0.031 | -97.2 | -1.23 | 382 / 1829 / 947 |
| Test 2023-2024 | 1110 | 34 % | -0.040 | -44.5 | -0.93 | 147 / 668 / 295 |
| 2025 (année de l'idée, descriptif) | 522 | 31 % | -0.070 | -36.4 | -1.14 | 64 / 307 / 151 |
| 2026 (→ 21/09, descriptif) | 357 | 39 % | +0.039 | +14.0 | 0.53 | 36 / 194 / 127 |

Par année (US100) : 2010 -11 · 2011 -37 · 2012 -59 · 2013 -29 · 2014 -29 · 2015 -29 · 2016 +10 · 2017 +4 · 2018 -19 · 2019 -3 · 2020 -3 · 2021 -80 · 2022 +3 · 2023 -19 · 2024 -25 · 2025 -36 · 2026 +14

## US500 (contrôle, descriptif)

| Période | Trades | Gagnants | R moyen | R total | t | Sorties objectif / stop / temps |
|---|---|---|---|---|---|---|
| Entraînement 2011-2022 | 6122 | 35 % | -0.007 | -44.0 | -0.39 | 791 / 3569 / 1762 |
|   dont 2011-2016 | 3115 | 33 % | -0.011 | -32.8 | -0.39 | 438 / 1894 / 783 |
|   dont 2017-2022 | 3007 | 36 % | -0.004 | -11.1 | -0.14 | 353 / 1675 / 979 |
| Test 2023-2024 | 1086 | 31 % | -0.083 | -90.6 | -1.93 | 136 / 672 / 278 |
| 2025 (année de l'idée, descriptif) | 529 | 32 % | -0.086 | -45.5 | -1.42 | 62 / 322 / 145 |
| 2026 (→ 21/09, descriptif) | 387 | 37 % | +0.011 | +4.1 | 0.15 | 48 / 214 / 125 |

Par année (US500) : 2010 +14 · 2011 +36 · 2012 -43 · 2013 -12 · 2014 -5 · 2015 +3 · 2016 -11 · 2017 +0 · 2018 +36 · 2019 -30 · 2020 -10 · 2021 -37 · 2022 +30 · 2023 -42 · 2024 -49 · 2025 -46 · 2026 +4

## Verdict (critère pré-enregistré, US100)

**ÉCHEC à l'entraînement** (R moyen -0.042, t -2.36, 2011-2016 -173.6 R, 2017-2022 -97.2 R)

