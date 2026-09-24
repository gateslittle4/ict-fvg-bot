# Effet de fin de mois (jour −2 → jour +3) sur US100 / US500 — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-turn-of-month-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runTurnOfMonthStudy.js`. Achat à la clôture du jour −2 (ask), vente à la clôture du jour +3 (bid), un trade par mois, spread par défaut + swap du broker. Rendement net par trade en % du nominal.

## Critère pré-enregistré

| Indice | Entraînement : trades, moyenne nette, t | 2010-2016 | 2017-2022 | Test 2023-2025 : trades, moyenne | Verdict |
|---|---|---|---|---|---|
| US500 | 144, +0.079 %, t 0.48 | -0.4 % | +11.8 % | 36, +0.061 % (total +2.2 %) | **ÉCHEC à l'entraînement** |
| US100 | 144, +0.180 %, t 0.92 | +7.3 % | +18.5 % | 36, +0.247 % (total +8.9 %) | **ÉCHEC à l'entraînement** |

## Par période, avec le contrôle de dérive

| Indice | Période | Trades | Gagnants | Nette | Total net | t | Nette à 2 × spread | Contrôle : autres fenêtres de 4 séances (moyenne, n) | Écart fin de mois − contrôle |
|---|---|---|---|---|---|---|---|---|---|
| US500 | Entraînement 2010-2022 | 144 | 55 % | +0.079 % | +11.4 % | 0.48 | +0.076 % (t 0.46) | +0.036 % (2080) | +0.043 % |
| US500 | Test 2023-2025 | 36 | 56 % | +0.061 % | +2.2 % | 0.22 | +0.058 % (t 0.20) | +0.318 % (514) | -0.257 % |
| US500 | 2026 (→ fin des données) | 8 | 63 % | +1.059 % | +8.5 % | 1.52 | +1.056 % (t 1.51) | -0.091 % (123) | +1.150 % |
| US100 | Entraînement 2010-2022 | 144 | 53 % | +0.180 % | +25.9 % | 0.92 | +0.177 % (t 0.91) | +0.112 % (2081) | +0.068 % |
| US100 | Test 2023-2025 | 36 | 61 % | +0.247 % | +8.9 % | 0.67 | +0.245 % (t 0.66) | +0.464 % (515) | -0.217 % |
| US100 | 2026 (→ fin des données) | 8 | 75 % | +1.246 % | +10.0 % | 1.16 | +1.244 % (t 1.16) | -0.018 % (123) | +1.264 % |

Le contrôle chevauche ses propres fenêtres (une par jour) : sa moyenne est descriptive, pas son t.

## Par année (total net)

| Année | US100 | US500 |
|---|---|---|
| 2010 | +4.0 % | +4.4 % |
| 2011 | +1.5 % | -4.5 % |
| 2012 | +6.0 % | +6.3 % |
| 2013 | +3.9 % | -1.1 % |
| 2014 | -2.5 % | -3.4 % |
| 2015 | -3.2 % | -2.6 % |
| 2016 | -2.3 % | +0.4 % |
| 2017 | +5.2 % | +4.3 % |
| 2018 | +0.4 % | -2.9 % |
| 2019 | +2.1 % | +0.3 % |
| 2020 | +17.7 % | +12.5 % |
| 2021 | -4.7 % | -0.6 % |
| 2022 | -2.2 % | -1.8 % |
| 2023 | +7.7 % | +5.9 % |
| 2024 | +0.3 % | -2.9 % |
| 2025 | +0.9 % | -0.8 % |
| 2026 | +10.0 % | +8.5 % |

## Compte 10 000 $ et FTMO 1-Step (descriptif)

Nominal = capital × min(4, cible / σ14) ; garde-fou du bot.

| Indice | Cible de vol. | Période | Compte continu | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|
| US500 | 0.5 % | Entraînement 2010-2022 | +4.4 % | 10.5 % | 1 / 1 (en cours -2.3 %) |
| US500 | 1 % | Entraînement 2010-2022 | +6.5 % | 21.1 % | 5 / 5 (en cours -2.1 %) |
| US500 | 0.5 % | Test 2023-2025 | -1.1 % | 5.6 % | 0 / 0 (en cours -1.1 %) |
| US500 | 1 % | Test 2023-2025 | -2.5 % | 10.9 % | 0 / 1 (en cours +2.6 %) |
| US500 | 0.5 % | 2026 (→ fin des données) | +5.2 % | 1.4 % | 0 / 0 (en cours +5.2 %) |
| US500 | 1 % | 2026 (→ fin des données) | +10.6 % | 2.9 % | 1 / 0 (en cours +0.0 %) |
| US100 | 0.5 % | Entraînement 2010-2022 | +10.1 % | 8.4 % | 1 / 0 (en cours -1.9 %) |
| US100 | 1 % | Entraînement 2010-2022 | +18.6 % | 16.4 % | 4 / 3 (en cours -1.8 %) |
| US100 | 0.5 % | Test 2023-2025 | +0.7 % | 3.8 % | 0 / 0 (en cours +0.7 %) |
| US100 | 1 % | Test 2023-2025 | +1.0 % | 7.5 % | 0 / 0 (en cours +1.0 %) |
| US100 | 0.5 % | 2026 (→ fin des données) | +3.7 % | 2.5 % | 0 / 0 (en cours +3.7 %) |
| US100 | 1 % | 2026 (→ fin des données) | +7.4 % | 5.0 % | 0 / 0 (en cours +7.4 %) |

## Limites

- Swap relevé en 2026 appliqué à tout le passé (surestimé les années à taux zéro).
- Effet publié depuis 1987, possiblement affaibli ; CFD ≠ actions ; 2 indices très corrélés.
- HistData ≠ prix du broker.
