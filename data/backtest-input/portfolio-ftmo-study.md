# Combo + A + B et A + B seuls, challenges FTMO 1-Step (descriptif)

Même simulation et mêmes configurations que `risk-brake-ftmo-study.md` (pré-enregistré pour le combo seul). **Descriptif** : demandé après ce résultat, rien n'est choisi ici. Script : `scripts/runPortfolioFtmoStudy.js`. A : risque X % par trade (levier ≤ 4x) ; B : cible de volatilité X % par jour ; combo : risque X % par trade. Une seule position par paire, garde-fou FTMO du projet, cycles enchaînés.

## Combo + A + B (même compte)

| Configuration | 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d'un réussi | 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |
|---|---|---|---|---|
| fixe 0.25 % | 18 / 5 (+13) | 139 j | 3 / 1 | 0 / 0 (-1.6 %) |
| fixe 0.3 % | 22 / 9 (+13) | 122 j | 4 / 1 | 1 / 1 (-3.6 %) |
| fixe 0.5 % | 38 / 24 (+14) | 60 j | 7 / 6 | 1 / 2 (+3.3 %) |
| fixe 0.75 % | 69 / 52 (+17) | 26 j | 15 / 16 | 4 / 5 (+5.6 %) |
| fixe 1 % | 89 / 75 (+14) | 20 j | 21 / 24 | 5 / 5 (+0.7 %) |
| frein 0.5 % → 0.25 % à −4 % | 23 / 9 (+14) | 86 j | 4 / 1 | 1 / 1 (-3.6 %) |
| frein 0.5 % → 0.25 % à −5 % | 24 / 11 (+13) | 87 j | 4 / 2 | 1 / 1 (-5.1 %) |
| frein 0.75 % → 0.375 % à −4 % | 38 / 25 (+13) | 56 j | 7 / 6 | 2 / 1 (-4.5 %) |
| frein 0.75 % → 0.375 % à −5 % | 43 / 29 (+14) | 45 j | 8 / 7 | 2 / 2 (-5.5 %) |

## A + B seuls

| Configuration | 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d'un réussi | 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |
|---|---|---|---|---|
| fixe 0.25 % | 13 / 3 (+10) | 206 j | 3 / 0 | 0 / 1 (-0.6 %) |
| fixe 0.3 % | 15 / 3 (+12) | 174 j | 4 / 0 | 0 / 1 (-2.4 %) |
| fixe 0.5 % | 30 / 14 (+16) | 80 j | 7 / 3 | 0 / 2 (-0.5 %) |
| fixe 0.75 % | 46 / 26 (+20) | 48 j | 8 / 6 | 0 / 3 (-2.4 %) |
| fixe 1 % | 57 / 36 (+21) | 31 j | 13 / 9 | 0 / 4 (-5.3 %) |
| frein 0.5 % → 0.25 % à −4 % | 20 / 7 (+13) | 112 j | 3 / 0 | 0 / 1 (-3.8 %) |
| frein 0.5 % → 0.25 % à −5 % | 23 / 9 (+14) | 90 j | 2 / 0 | 0 / 1 (-5.1 %) |
| frein 0.75 % → 0.375 % à −4 % | 32 / 15 (+17) | 62 j | 5 / 2 | 0 / 2 (-2.0 %) |
| frein 0.75 % → 0.375 % à −5 % | 34 / 16 (+18) | 66 j | 7 / 4 | 0 / 2 (-4.0 %) |

## Combo seul (rappel, avec position unique par paire)

| Configuration | 2010-2022 : réussis / ratés (réussis − ratés) | Durée médiane d'un réussi | 2023-2025 : réussis / ratés | 2026 : réussis / ratés (cycle en cours) |
|---|---|---|---|---|
| fixe 0.25 % | 11 / 3 (+8) | 251 j | 1 / 1 | 0 / 1 (+6.0 %) |
| fixe 0.3 % | 13 / 5 (+8) | 283 j | 1 / 2 | 0 / 1 (+5.0 %) |
| fixe 0.5 % | 24 / 14 (+10) | 105 j | 3 / 5 | 1 / 2 (+2.3 %) |
| fixe 0.75 % | 49 / 42 (+7) | 37 j | 10 / 15 | 2 / 3 (-2.2 %) |
| fixe 1 % | 72 / 66 (+6) | 25 j | 13 / 20 | 3 / 6 (+1.3 %) |
| frein 0.5 % → 0.25 % à −4 % | 16 / 7 (+9) | 113 j | 2 / 3 | 0 / 1 (-1.2 %) |
| frein 0.5 % → 0.25 % à −5 % | 15 / 8 (+7) | 121 j | 2 / 3 | 0 / 1 (-0.7 %) |
| frein 0.75 % → 0.375 % à −4 % | 28 / 17 (+11) | 53 j | 4 / 5 | 2 / 3 (-0.8 %) |
| frein 0.75 % → 0.375 % à −5 % | 28 / 19 (+9) | 60 j | 7 / 9 | 1 / 3 (+6.5 %) |

## Limites

- Descriptif, demandé après le résultat du combo seul : aucune configuration n'est choisie ici.
- 1 réussi = 1 raté (coût d'un échec non chiffré) ; trades du combo fixés par le rejeu (garde-fou à 0,3 %).
- B : « X % » = cible de volatilité journalière (pas de stop), donc pas exactement le même risque qu'un trade à X %.
