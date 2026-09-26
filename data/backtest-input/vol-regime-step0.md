# Étape 0 — le robot ne gagne-t-il qu'en marché agité ? (entraînement 2011-2022)

Règles fixées avant lecture : voir l'en-tête de `scripts/runVolRegimeStep0.js`. Rejeu fidèle du bot complet (combo + A + B + RSI(2)), R net de spread et swap. Régime = ATR14 journalier de la paire / moyenne des 100 ATR14 précédents, mesuré avant le jour d'entrée : calme < 0,8, agité > 1,5.

6369 trades 2011-2022 (65 sans ratio : début d'historique, exclus du classement).

## R par trade selon le régime

| Période | Régime | Trades | R moyen | R total | t |
|---|---|---|---|---|---|
| 2011-2016 | calme | 852 | -0.072 | -61.1 | -1.18 |
| 2011-2016 | normal | 2190 | +0.096 | +210.6 | 2.07 |
| 2011-2016 | agité | 208 | +0.232 | +48.3 | 1.52 |
| 2011-2016 | **normal + agité** | 2398 | +0.108 | +258.9 | 2.43 |
| 2017-2022 | calme | 963 | +0.054 | +51.9 | 0.88 |
| 2017-2022 | normal | 1626 | +0.152 | +247.8 | 2.94 |
| 2017-2022 | agité | 465 | +0.188 | +87.3 | 1.91 |
| 2017-2022 | **normal + agité** | 2091 | +0.160 | +335.1 | 3.50 |

## Par stratégie (R moyen calme / normal + agité, 2011-2022)

| Stratégie | Calme : trades, R moyen | Normal + agité : trades, R moyen |
|---|---|---|
| cbdr US100 | 91, +0.366 | 253, +0.043 |
| divergence US100 | 84, -0.046 | 249, -0.084 |
| divergence US500 | 162, -0.047 | 278, +0.132 |
| noise US500 | 415, +0.023 | 892, +0.025 |
| nwog US100 | 40, -0.281 | 140, +0.463 |
| orb5 US100 | 691, -0.028 | 1839, +0.202 |
| rsi2-daily US500 | 18, +0.142 | 41, +0.004 |
| silverbullet US100 | 142, -0.043 | 405, +0.118 |
| silverbullet US500 | 97, -0.058 | 200, +0.206 |
| weeklysweep US500 | 75, -0.008 | 192, +0.103 |

## Part des jours de bourse dans chaque régime (descriptif)

| Période | Paire | Calme | Normal | Agité |
|---|---|---|---|---|
| 2011-2016 | US500 | 27 % | 67 % | 6 % |
| 2011-2016 | US100 | 26 % | 68 % | 7 % |
| 2017-2022 | US500 | 33 % | 53 % | 14 % |
| 2017-2022 | US100 | 28 % | 57 % | 14 % |
| 2023-2025 | US500 | 32 % | 58 % | 10 % |
| 2023-2025 | US100 | 23 % | 68 % | 9 % |
| 2026 (→ 21/09) | US500 | 26 % | 72 % | 1 % |
| 2026 (→ 21/09) | US100 | 15 % | 80 % | 5 % |

## Verdict de l'étape 0 (règle fixée avant lecture)

- 2011-2016 : calme -0.072 R/trade (852), normal + agité +0.108 R/trade (2398) → conforme
- 2017-2022 : calme +0.054 R/trade (963), normal + agité +0.160 R/trade (2091) → NON conforme

**L'hypothèse TOMBE** : la condition n'est pas remplie dans les deux moitiés. Pas de filtre de volatilité à pré-enregistrer.

