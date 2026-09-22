# Le VRAI moteur (LiveStrategyEngine) sur tout l'historique M1 réel : règlement M15 (comme la page du site) contre M1 exact

Un `warmUp()` du vrai moteur sur EURUSD/XAUUSD (dès 2022-05) et US100/US500/GER40 (dès 2023-01), M15 reconstruits du M1 réel sans trous ; liste canonique de trades (garde-fous permissifs), réglée soit comme le moteur (M15, « stop d'abord ») soit à la minute (M1 exact), puis rejeu dans le vrai `GuardrailEngine` (3 trades/jour, pause 30 min, arrêt du jour). Coûts : spreads par défaut du moteur, sans commission/swap/glissement, sans le correctif de géométrie d'ordre. **GER40 est inclus ici pour mesurer sa contribution ; le bot ne le traite plus.** Objectif : réconcilier le simulateur des backtests précédents avec le vrai moteur.

## Risque 0.3 % par trade

| Variante | Règlement | Trades | Vétos | R net (tous trades pris) | Compte 10 000 $ | Pire baisse |
|---|---|---|---|---|---|---|
| 5 paires (GER40 inclus) | M15 (moteur) | 2739 | 966 | -17.6 R | -9.9% | 28.0 % |
| 5 paires (GER40 inclus) | M1 exact | 2729 | 976 | +96.5 R | +26.8% | 23.5 % |
| Production (sans GER40) | M15 (moteur) | 2085 | 508 | +101.4 R | +30.4% | 19.0 % |
| Production (sans GER40) | M1 exact | 2071 | 522 | +227.7 R | +90.3% | 11.4 % |

## Risque 0.5 % par trade

| Variante | Règlement | Trades | Vétos | R net (tous trades pris) | Compte 10 000 $ | Pire baisse |
|---|---|---|---|---|---|---|
| 5 paires (GER40 inclus) | M15 (moteur) | 2739 | 966 | -17.6 R | -20.5% | 43.6 % |
| 5 paires (GER40 inclus) | M1 exact | 2729 | 976 | +96.5 R | +40.1% | 36.8 % |
| Production (sans GER40) | M15 (moteur) | 2085 | 508 | +101.4 R | +49.2% | 30.2 % |
| Production (sans GER40) | M1 exact | 2071 | 522 | +227.7 R | +179.6% | 18.6 % |

## Détail (5 paires, M1 exact, 0,5 %)

### Par paire

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US500 | 538 | +18.8 | +0.035 |
| US100 | 824 | +138.8 | +0.168 |
| XAUUSD | 151 | +48.8 | +0.323 |
| EURUSD | 364 | -12.7 | -0.035 |
| GER40 | 852 | -97.1 | -0.114 |

### Par mécanisme

| Mécanisme | Trades | R net | R / trade |
|---|---|---|---|
| breakerblock | 416 | -94.6 | -0.227 |
| cbdr | 172 | -33.7 | -0.196 |
| divergence | 253 | +51.6 | +0.204 |
| fvg | 619 | +186.2 | +0.301 |
| judaswing | 364 | -12.7 | -0.035 |
| nwog | 192 | -5.9 | -0.031 |
| silverbullet | 499 | -5.4 | -0.011 |
| weeklysweep | 214 | +11.0 | +0.051 |

### Par année

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2022 | 85 | -16.5 | -0.194 |
| 2023 | 710 | +21.6 | +0.030 |
| 2024 | 691 | -19.5 | -0.028 |
| 2025 | 698 | +54.0 | +0.077 |
| 2026 | 545 | +57.0 | +0.105 |

## Détail (5 paires, M15 du moteur, 0,5 %)

### Par paire

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US500 | 540 | +7.8 | +0.014 |
| US100 | 830 | +52.5 | +0.063 |
| XAUUSD | 151 | +48.9 | +0.324 |
| EURUSD | 364 | -12.7 | -0.035 |
| GER40 | 854 | -114.1 | -0.134 |

### Par mécanisme

| Mécanisme | Trades | R net | R / trade |
|---|---|---|---|
| breakerblock | 420 | -104.7 | -0.249 |
| cbdr | 171 | -60.6 | -0.355 |
| divergence | 258 | +46.6 | +0.181 |
| fvg | 628 | +125.8 | +0.200 |
| judaswing | 364 | -12.7 | -0.035 |
| nwog | 192 | -11.8 | -0.062 |
| silverbullet | 490 | -16.0 | -0.033 |
| weeklysweep | 216 | +16.0 | +0.074 |

### Par année

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2022 | 85 | -16.5 | -0.195 |
| 2023 | 712 | +5.2 | +0.007 |
| 2024 | 694 | -43.5 | -0.063 |
| 2025 | 701 | +22.2 | +0.032 |
| 2026 | 547 | +15.0 | +0.027 |

## Mécanisme × paire (M1 exact, 0,5 %) : trades / R net / R par trade

| Mécanisme | US500 | US100 | XAUUSD | EURUSD | GER40 |
|---|---|---|---|---|---|
| breakerblock | — | — | — | — | 416 / -94.6 / -0.23 |
| cbdr | — | 172 / -33.7 / -0.20 | — | — | — |
| divergence | 136 / +13.5 / +0.10 | 117 / +38.1 / +0.33 | — | — | — |
| fvg | 137 / -2.5 / -0.02 | 331 / +139.8 / +0.42 | 151 / +48.8 / +0.32 | — | — |
| judaswing | — | — | — | 364 / -12.7 / -0.03 | — |
| nwog | — | 42 / +10.0 / +0.24 | — | — | 150 / -15.9 / -0.11 |
| silverbullet | 172 / -13.7 / -0.08 | 162 / -15.5 / -0.10 | — | — | 165 / +23.7 / +0.14 |
| weeklysweep | 93 / +21.4 / +0.23 | — | — | — | 121 / -10.4 / -0.09 |

## Mécanisme × paire (M15 du moteur, 0,5 %) : trades / R net / R par trade

| Mécanisme | US500 | US100 | XAUUSD | EURUSD | GER40 |
|---|---|---|---|---|---|
| breakerblock | — | — | — | — | 420 / -104.7 / -0.25 |
| cbdr | — | 171 / -60.6 / -0.35 | — | — | — |
| divergence | 136 / +13.5 / +0.10 | 122 / +33.1 / +0.27 | — | — | — |
| fvg | 140 / -8.5 / -0.06 | 337 / +85.3 / +0.25 | 151 / +48.9 / +0.32 | — | — |
| judaswing | — | — | — | 364 / -12.7 / -0.03 | — |
| nwog | — | 42 / +10.0 / +0.24 | — | — | 150 / -21.8 / -0.15 |
| silverbullet | 169 / -22.5 / -0.13 | 158 / -15.3 / -0.10 | — | — | 163 / +21.8 / +0.13 |
| weeklysweep | 95 / +25.3 / +0.27 | — | — | — | 121 / -9.3 / -0.08 |

## Breaker Block et CBDR par année (M1 exact, 0,5 %, R net / trades)

| Mécanisme + paire | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|
| breakerblock US100 | — | — | — | — | — |
| breakerblock US500 | — | — | — | — | — |
| breakerblock GER40 | — | -55.5 / 109 | -3.2 / 100 | -27.6 / 118 | -8.4 / 89 |
| cbdr US100 | — | -11.2 / 47 | -16.6 / 44 | -2.8 / 40 | -3.1 / 41 |

## Limites

- Rejeu de garde-fous sur des trades pris comme des signaux indépendants : le moteur ne « voit » pas les vétos (netting et blocages internes reposent sur ses propres clôtures M15).
- Même remarque sur le niveau absolu : coûts partiels (pas de commission, swap, glissement réel ; géométrie d'ordre au marché non corrigée dans ce calcul).
- Le règlement M1 remplit l'entrée au niveau du signal dans sa bougie M15 (le moteur l'a validée) ; aucune donnée ne dit si l'ordre réel serait passé.