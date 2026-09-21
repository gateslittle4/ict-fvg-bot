# Le VRAI moteur (LiveStrategyEngine) sur tout l'historique M1 réel : règlement M15 (comme la page du site) contre M1 exact

Un `warmUp()` du vrai moteur sur EURUSD/XAUUSD (dès 2022-05) et US100/US500/GER40 (dès 2023-01), M15 reconstruits du M1 réel sans trous ; liste canonique de trades (garde-fous permissifs), réglée soit comme le moteur (M15, « stop d'abord ») soit à la minute (M1 exact), puis rejeu dans le vrai `GuardrailEngine` (3 trades/jour, pause 30 min, arrêt du jour). Coûts : spreads par défaut du moteur, sans commission/swap/glissement, sans le correctif de géométrie d'ordre. **GER40 est inclus ici pour mesurer sa contribution ; le bot ne le traite plus.** Objectif : réconcilier le simulateur des backtests précédents avec le vrai moteur.

## Risque 0.3 % par trade

| Variante | Règlement | Trades | Vétos | R net (tous trades pris) | Compte 10 000 $ | Pire baisse |
|---|---|---|---|---|---|---|
| 5 paires (GER40 inclus) | M15 (moteur) | 2693 | 912 | -32.4 R | -13.8% | 31.6 % |
| 5 paires (GER40 inclus) | M1 exact | 2683 | 922 | +91.7 R | +25.0% | 27.0 % |
| Production (sans GER40) | M15 (moteur) | 2037 | 456 | +88.9 R | +25.7% | 17.0 % |
| Production (sans GER40) | M1 exact | 2022 | 471 | +220.3 R | +86.1% | 12.2 % |

## Risque 0.5 % par trade

| Variante | Règlement | Trades | Vétos | R net (tous trades pris) | Compte 10 000 $ | Pire baisse |
|---|---|---|---|---|---|---|
| 5 paires (GER40 inclus) | M15 (moteur) | 2693 | 912 | -32.4 R | -26.1% | 48.3 % |
| 5 paires (GER40 inclus) | M1 exact | 2683 | 922 | +91.7 R | +36.9% | 41.6 % |
| Production (sans GER40) | M15 (moteur) | 2037 | 456 | +88.9 R | +40.3% | 27.5 % |
| Production (sans GER40) | M1 exact | 2022 | 471 | +220.3 R | +169.6% | 19.6 % |

## Détail (5 paires, M1 exact, 0,5 %)

### Par paire

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US500 | 484 | +6.2 | +0.013 |
| US100 | 828 | +158.5 | +0.191 |
| XAUUSD | 154 | +45.8 | +0.297 |
| EURUSD | 364 | -12.7 | -0.035 |
| GER40 | 853 | -106.1 | -0.124 |

### Par mécanisme

| Mécanisme | Trades | R net | R / trade |
|---|---|---|---|
| breakerblock | 424 | -96.9 | -0.229 |
| cbdr | 175 | -28.9 | -0.165 |
| divergence | 117 | +38.1 | +0.326 |
| fvg | 648 | +183.7 | +0.283 |
| judaswing | 364 | -12.7 | -0.035 |
| nwog | 192 | -5.9 | -0.031 |
| silverbullet | 527 | +20.9 | +0.040 |
| weeklysweep | 236 | -6.6 | -0.028 |

### Par année

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2022 | 85 | -16.5 | -0.194 |
| 2023 | 687 | +21.6 | +0.031 |
| 2024 | 680 | -29.7 | -0.044 |
| 2025 | 691 | +47.6 | +0.069 |
| 2026 | 540 | +68.8 | +0.127 |

## Détail (5 paires, M15 du moteur, 0,5 %)

### Par paire

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US500 | 487 | -7.8 | -0.016 |
| US100 | 834 | +68.2 | +0.082 |
| XAUUSD | 154 | +45.9 | +0.298 |
| EURUSD | 364 | -12.7 | -0.035 |
| GER40 | 854 | -126.0 | -0.148 |

### Par mécanisme

| Mécanisme | Trades | R net | R / trade |
|---|---|---|---|
| breakerblock | 428 | -107.0 | -0.250 |
| cbdr | 174 | -59.9 | -0.344 |
| divergence | 122 | +33.1 | +0.271 |
| fvg | 658 | +122.2 | +0.186 |
| judaswing | 364 | -12.7 | -0.035 |
| nwog | 192 | -11.8 | -0.062 |
| silverbullet | 519 | +9.2 | +0.018 |
| weeklysweep | 236 | -5.5 | -0.023 |

### Par année

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2022 | 85 | -16.5 | -0.195 |
| 2023 | 689 | -8.9 | -0.013 |
| 2024 | 683 | -53.6 | -0.079 |
| 2025 | 694 | +15.8 | +0.023 |
| 2026 | 542 | +30.8 | +0.057 |

## Mécanisme × paire (M1 exact, 0,5 %) : trades / R net / R par trade

| Mécanisme | US500 | US100 | XAUUSD | EURUSD | GER40 |
|---|---|---|---|---|---|
| breakerblock | — | — | — | — | 424 / -96.9 / -0.23 |
| cbdr | — | 175 / -28.9 / -0.17 | — | — | — |
| divergence | — | 117 / +38.1 / +0.33 | — | — | — |
| fvg | 166 / -5.1 / -0.03 | 328 / +143.0 / +0.44 | 154 / +45.8 / +0.30 | — | — |
| judaswing | — | — | — | 364 / -12.7 / -0.03 | — |
| nwog | — | 42 / +10.0 / +0.24 | — | — | 150 / -15.9 / -0.11 |
| silverbullet | 202 / +2.5 / +0.01 | 166 / -3.6 / -0.02 | — | — | 159 / +22.1 / +0.14 |
| weeklysweep | 116 / +8.8 / +0.08 | — | — | — | 120 / -15.4 / -0.13 |

## Mécanisme × paire (M15 du moteur, 0,5 %) : trades / R net / R par trade

| Mécanisme | US500 | US100 | XAUUSD | EURUSD | GER40 |
|---|---|---|---|---|---|
| breakerblock | — | — | — | — | 428 / -107.0 / -0.25 |
| cbdr | — | 174 / -59.9 / -0.34 | — | — | — |
| divergence | — | 122 / +33.1 / +0.27 | — | — | — |
| fvg | 170 / -12.1 / -0.07 | 334 / +88.4 / +0.26 | 154 / +45.9 / +0.30 | — | — |
| judaswing | — | — | — | 364 / -12.7 / -0.03 | — |
| nwog | — | 42 / +10.0 / +0.24 | — | — | 150 / -21.8 / -0.15 |
| silverbullet | 201 / -4.5 / -0.02 | 162 / -3.4 / -0.02 | — | — | 156 / +17.1 / +0.11 |
| weeklysweep | 116 / +8.8 / +0.08 | — | — | — | 120 / -14.3 / -0.12 |

## Breaker Block et CBDR par année (M1 exact, 0,5 %, R net / trades)

| Mécanisme + paire | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|
| breakerblock US100 | — | — | — | — | — |
| breakerblock US500 | — | — | — | — | — |
| breakerblock GER40 | — | -50.6 / 110 | -7.3 / 104 | -29.6 / 120 | -9.4 / 90 |
| cbdr US100 | — | -9.4 / 49 | -17.7 / 45 | -2.8 / 40 | +0.9 / 41 |

## Limites

- Rejeu de garde-fous sur des trades pris comme des signaux indépendants : le moteur ne « voit » pas les vétos (netting et blocages internes reposent sur ses propres clôtures M15).
- Même remarque sur le niveau absolu : coûts partiels (pas de commission, swap, glissement réel ; géométrie d'ordre au marché non corrigée dans ce calcul).
- Le règlement M1 remplit l'entrée au niveau du signal dans sa bougie M15 (le moteur l'a validée) ; aucune donnée ne dit si l'ordre réel serait passé.