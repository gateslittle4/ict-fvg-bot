# Momentum intraday publié sur US100 / US500 — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-intraday-momentum-2026-09-23.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runIntradayMomentumStudy.js` (règles dans `scripts/lib/intradayMomentum.js`, testées). A en R par trade ; B et C en rendement net par trade, % du nominal. Réglé à la minute, bid + spread par défaut au niveau de prix, pas de swap.

## Séances et trades

- US100 : 4053 séances ; A 4013 trades, B 4070, C 3832
- US500 : 4051 séances ; A 3908 trades, B 4053, C 3821

## Critère pré-enregistré (jambes principales)

| Jambe | Entraînement : trades, moyenne, t | 2010-2016 | 2017-2022 | Test 2023-2025 : trades, moyenne | Verdict |
|---|---|---|---|---|---|
| A. Range d'ouverture 5 min — US100 (principale) | 3062, +0.147 R, t 3.22 | +203.4 R | +247.0 R | 766, +0.139 R (total +106.4) | **CANDIDATE** (démo/alerte d'abord) |
| B. Noise area — US500 (principale) | 3112, +0.018 %, t 2.43 | +18.9 % | +38.2 % | 732, +0.021 % (total +15.7) | **CANDIDATE** (démo/alerte d'abord) |
| C. Dernière demi-heure — US500 (principale) | 2906, -0.010 %, t -1.98 | +4.3 % | -33.5 % | 736, +0.001 % (total +1.1) | ÉCHEC à l'entraînement |

## Toutes les jambes par période (moyenne par trade, total, t) — contrôles de robustesse compris

| Jambe | Période | Trades | Gagnants | Moyenne | Total | t | Total à 2 × spread |
|---|---|---|---|---|---|---|---|
| A-US100 | Entraînement 2010-2022 | 3062 | 23 % | +0.147 R | +450.4 R | 3.22 | +384.1 R (t 2.80) |
| A-US100 | Test 2023-2025 | 766 | 24 % | +0.139 R | +106.4 R | 1.55 | +101.4 R (t 1.49) |
| A-US100 | 2026 (→ fin des données) | 185 | 26 % | -0.153 R | -28.3 R | -1.17 | -32.9 R (t -1.37) |
| B-US500 | Entraînement 2010-2022 | 3112 | 37 % | +0.018 % | +57.1 % | 2.43 | +47.0 % (t 2.00) |
| B-US500 | Test 2023-2025 | 732 | 41 % | +0.021 % | +15.7 % | 1.53 | +13.3 % (t 1.30) |
| B-US500 | 2026 (→ fin des données) | 209 | 34 % | -0.024 % | -4.9 % | -1.11 | -5.6 % (t -1.27) |
| C-US500 | Entraînement 2010-2022 | 2906 | 48 % | -0.010 % | -29.1 % | -1.98 | -38.6 % (t -2.62) |
| C-US500 | Test 2023-2025 | 736 | 50 % | +0.001 % | +1.1 % | 0.17 | -1.3 % (t -0.21) |
| C-US500 | 2026 (→ fin des données) | 179 | 48 % | +0.005 % | +0.9 % | 0.42 | +0.4 % (t 0.16) |
| A-US500 | Entraînement 2010-2022 | 2974 | 20 % | +0.079 R | +233.6 R | 1.67 | +158.1 R (t 1.15) |
| A-US500 | Test 2023-2025 | 757 | 18 % | +0.034 R | +25.7 R | 0.36 | -5.6 R (t -0.08) |
| A-US500 | 2026 (→ fin des données) | 177 | 21 % | -0.166 R | -29.4 R | -1.16 | -41.2 R (t -1.79) |
| B-US100 | Entraînement 2010-2022 | 3152 | 39 % | +0.033 % | +104.8 % | 3.76 | +98.5 % (t 3.53) |
| B-US100 | Test 2023-2025 | 737 | 43 % | +0.048 % | +35.0 % | 2.17 | +33.5 % (t 2.08) |
| B-US100 | 2026 (→ fin des données) | 181 | 38 % | +0.005 % | +1.0 % | 0.16 | +0.6 % (t 0.10) |
| C-US100 | Entraînement 2010-2022 | 2917 | 50 % | -0.003 % | -10.0 % | -0.63 | -15.8 % (t -1.00) |
| C-US100 | Test 2023-2025 | 736 | 48 % | -0.013 % | -9.5 % | -1.27 | -11.0 % (t -1.47) |
| C-US100 | 2026 (→ fin des données) | 179 | 53 % | +0.027 % | +4.9 % | 1.52 | +4.5 % (t 1.41) |

## Par année (jambes principales, total)

| Année | A-US100 | B-US500 | C-US500 |
|---|---|---|---|
| 2010 | -0.7 R (33) | -0.5 % (5) | -0.6 % (29) |
| 2011 | +15.2 R (248) | +9.6 % (275) | +3.2 % (247) |
| 2012 | -2.3 R (250) | +5.4 % (257) | +1.3 % (242) |
| 2013 | +74.1 R (246) | +2.5 % (278) | +4.9 % (241) |
| 2014 | +16.6 R (247) | +2.9 % (262) | +0.8 % (242) |
| 2015 | -15.3 R (251) | +4.5 % (270) | -2.3 % (242) |
| 2016 | +115.8 R (251) | -5.4 % (261) | -3.0 % (245) |
| 2017 | -24.1 R (249) | -3.9 % (271) | -2.6 % (242) |
| 2018 | +81.7 R (257) | +20.4 % (253) | -2.3 % (247) |
| 2019 | +62.6 R (258) | +0.9 % (248) | -2.7 % (228) |
| 2020 | +56.7 R (258) | -4.8 % (220) | -6.1 % (230) |
| 2021 | +28.0 R (257) | +9.4 % (235) | -9.4 % (236) |
| 2022 | +42.1 R (257) | +16.2 % (277) | -10.3 % (235) |
| 2023 | +21.9 R (250) | +8.9 % (228) | +3.8 % (240) |
| 2024 | +24.5 R (259) | +4.5 % (263) | -1.0 % (249) |
| 2025 | +60.1 R (257) | +2.3 % (241) | -1.6 % (247) |
| 2026 | -28.3 R (185) | -4.9 % (209) | +0.9 % (179) |

## Compte 10 000 $ et FTMO 1-Step (descriptif, jambes principales)

A : risque par trade (levier plafonné à 4x). B et C : cible de volatilité journalière (nominal = capital × min(4, cible / σ14)). Garde-fou du bot (3 trades/jour, pause 30 min, −2 %/jour), une position à la fois.

| Jambe | Taille | Période | Compte continu | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|
| A-US100 | 0.25 % risque | Entraînement 2010-2022 | +181.3 % | 13.1 % | 12 / 3 (en cours +1.4 %) |
| A-US100 | 0.25 % risque | Test 2023-2025 | +29.8 % | 8.2 % | 2 / 0 (en cours +6.9 %) |
| A-US100 | 0.25 % risque | 2026 (→ fin des données) | -6.8 % | 9.4 % | 0 / 0 (en cours -6.8 %) |
| A-US100 | 0.5 % risque | Entraînement 2010-2022 | +548.0 % | 22.8 % | 25 / 12 (en cours -5.9 %) |
| A-US100 | 0.5 % risque | Test 2023-2025 | +50.4 % | 12.7 % | 5 / 2 (en cours +0.4 %) |
| A-US100 | 0.5 % risque | 2026 (→ fin des données) | -12.5 % | 16.7 % | 0 / 1 (en cours -7.1 %) |
| A-US100 | 1 % risque | Entraînement 2010-2022 | +1855.0 % | 32.3 % | 46 / 26 (en cours +0.9 %) |
| A-US100 | 1 % risque | Test 2023-2025 | +64.5 % | 19.2 % | 9 / 9 (en cours +7.4 %) |
| A-US100 | 1 % risque | 2026 (→ fin des données) | -16.9 % | 24.5 % | 1 / 3 (en cours -3.4 %) |
| B-US500 | 0.5 % vol | Entraînement 2010-2022 | +48.3 % | 9.3 % | 4 / 0 (en cours +0.8 %) |
| B-US500 | 0.5 % vol | Test 2023-2025 | +14.0 % | 4.9 % | 1 / 0 (en cours +3.0 %) |
| B-US500 | 0.5 % vol | 2026 (→ fin des données) | -2.7 % | 3.2 % | 0 / 0 (en cours -2.7 %) |
| B-US500 | 1 % vol | Entraînement 2010-2022 | +115.6 % | 17.6 % | 8 / 1 (en cours +3.6 %) |
| B-US500 | 1 % vol | Test 2023-2025 | +29.2 % | 9.6 % | 3 / 0 (en cours -3.9 %) |
| B-US500 | 1 % vol | 2026 (→ fin des données) | -5.4 % | 6.3 % | 0 / 0 (en cours -5.4 %) |
| B-US500 | 2 % vol | Entraînement 2010-2022 | +353.9 % | 28.7 % | 19 / 8 (en cours +8.3 %) |
| B-US500 | 2 % vol | Test 2023-2025 | +55.5 % | 16.4 % | 5 / 1 (en cours -4.2 %) |
| B-US500 | 2 % vol | 2026 (→ fin des données) | -9.7 % | 11.8 % | 0 / 1 (en cours -1.5 %) |
| C-US500 | 0.5 % vol | Entraînement 2010-2022 | -16.9 % | 22.5 % | 0 / 2 (en cours -5.9 %) |
| C-US500 | 0.5 % vol | Test 2023-2025 | +0.2 % | 3.2 % | 0 / 0 (en cours +0.2 %) |
| C-US500 | 0.5 % vol | 2026 (→ fin des données) | +0.1 % | 2.1 % | 0 / 0 (en cours +0.1 %) |
| C-US500 | 1 % vol | Entraînement 2010-2022 | -31.6 % | 40.5 % | 1 / 5 (en cours -1.2 %) |
| C-US500 | 1 % vol | Test 2023-2025 | +0.3 % | 6.5 % | 0 / 0 (en cours +0.3 %) |
| C-US500 | 1 % vol | 2026 (→ fin des données) | +0.1 % | 4.3 % | 0 / 0 (en cours +0.1 %) |
| C-US500 | 2 % vol | Entraînement 2010-2022 | -52.1 % | 63.2 % | 2 / 10 (en cours -5.1 %) |
| C-US500 | 2 % vol | Test 2023-2025 | +0.7 % | 12.2 % | 1 / 2 (en cours -5.0 %) |
| C-US500 | 2 % vol | 2026 (→ fin des données) | +0.4 % | 8.1 % | 0 / 0 (en cours +0.4 %) |

## Verdict

- A. Range d'ouverture 5 min — US100 (principale) : **CANDIDATE** (démo/alerte d'abord)
- B. Noise area — US500 (principale) : **CANDIDATE** (démo/alerte d'abord)
- C. Dernière demi-heure — US500 (principale) : ÉCHEC à l'entraînement

Au moins une candidate : suivi en démo / alerte avant tout argent réel (pré-enregistrement).

## Limites

- HistData (entraînement) ≠ prix du broker ; spread par défaut, pas de glissement (sensibilité à 2 × le spread ci-dessus).
- B : VWAP remplacé par la moyenne des prix typiques (pas de volume) ; stops seulement aux contrôles de demi-heure.
- CFD ≠ ETF de l'article (QQQ/SPY) ; 3 jambes principales testées (≈ 7 % de chances qu'une passe par hasard).
