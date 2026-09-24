# Frein de risque contre risque fixe, challenges FTMO 1-Step, combo live — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-risk-brake-ftmo-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runRiskBrakeFtmoStudy.js`. Trades du combo live au rejeu fidèle 2010-2026 ; seule la taille change. Cycles FTMO 1-Step enchaînés (garde-fou FTMO du projet).

| Configuration | Entraînement 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d'un réussi | Test 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |
|---|---|---|---|---|
| fixe 0.25 % | 11 / 3 (+8) | 251 j | 1 / 1 | 0 / 1 (+6.0 %) |
| fixe 0.3 % | 13 / 5 (+8) | 286 j | 1 / 2 | 0 / 1 (+5.0 %) |
| fixe 0.5 % | 24 / 13 (+11) | 124 j | 3 / 5 | 1 / 2 (+2.3 %) |
| fixe 0.75 % | 49 / 42 (+7) | 37 j | 10 / 14 | 2 / 3 (-2.2 %) |
| fixe 1 % | 72 / 66 (+6) | 25 j | 13 / 20 | 3 / 6 (+1.3 %) |
| frein 0.5 % → 0.25 % à −4 % | 15 / 7 (+8) | 113 j | 2 / 3 | 0 / 1 (-1.2 %) |
| frein 0.5 % → 0.25 % à −5 % | 15 / 8 (+7) | 121 j | 2 / 3 | 0 / 1 (-0.7 %) |
| frein 0.75 % → 0.375 % à −4 % | 27 / 17 (+10) | 46 j | 4 / 5 | 2 / 3 (-0.8 %) |
| frein 0.75 % → 0.375 % à −5 % | 29 / 19 (+10) | 56 j | 7 / 9 | 1 / 3 (+6.5 %) |

## Choix sur l'entraînement (réussis − ratés, à égalité le moins de ratés)

- Meilleur risque fixe : **fixe 0.5 %** (24 / 13).
- Meilleure configuration au total : **fixe 0.5 %**.
- Verdict : **le frein n'est PAS retenu** (il ne bat pas le meilleur risque fixe).
- Configuration choisie, lue une fois : test 2023-2025 3 réussis / 5 ratés ; 2026 1 / 2 (cycle en cours +2.3 %).

## Limites

- 1 réussi compte autant que 1 raté (coût d'un échec FTMO non chiffré).
- Trades fixes du rejeu (garde-fou appliqué au rejeu à 0,3 %) ; tranches recollées.
