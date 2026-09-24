# Achat de nuit (clôture → ouverture) sur US100 / US500 — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-overnight-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runOvernightStudy.js`. Achat à la clôture 15:59 NY (ask), vente à l'ouverture 9:30 suivante (bid), tous les jours, spread par défaut + swap du broker en % du prix. Rendement net par trade en % du nominal.

## Critère pré-enregistré

| Indice | Entraînement : nuits, moyenne nette, t | 2010-2016 | 2017-2022 | Test 2023-2025 : nuits, moyenne | Verdict |
|---|---|---|---|---|---|
| US100 | 3098, +0.023 %, t 1.71 | +36.8 % | +35.9 % | 766, +0.052 % (total +40.0 %) | **ÉCHEC à l'entraînement** |
| US500 | 3097, +0.010 %, t 0.79 | +2.9 % | +27.7 % | 765, +0.026 % (total +19.6 %) | **ÉCHEC à l'entraînement** |

## Par période (moyenne par nuit, total, t) et contrôles bruts de dérive

| Indice | Période | Nuits | Gagnantes | Nette | Total net | t | Nette à 2 × spread | Nette sans week-ends | Nuit brute | Séance brute | 24 h brut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| US100 | Entraînement 2010-2022 | 3098 | 55 % | +0.023 % | +72.7 % | 1.71 | +0.021 % (t 1.57) | +0.034 % (t 2.27) | +0.040 % | +0.021 % | +0.061 % |
| US100 | Test 2023-2025 | 766 | 56 % | +0.052 % | +40.0 % | 1.86 | +0.050 % (t 1.79) | +0.047 % (t 1.59) | +0.068 % | +0.043 % | +0.110 % |
| US100 | 2026 (→ fin des données) | 184 | 53 % | +0.041 % | +7.5 % | 0.62 | +0.039 % (t 0.59) | +0.025 % (t 0.34) | +0.058 % | +0.038 % | +0.096 % |
| US500 | Entraînement 2010-2022 | 3097 | 53 % | +0.010 % | +30.6 % | 0.79 | +0.007 % (t 0.53) | +0.020 % (t 1.51) | +0.027 % | +0.016 % | +0.043 % |
| US500 | Test 2023-2025 | 765 | 55 % | +0.026 % | +19.6 % | 1.20 | +0.022 % (t 1.05) | +0.020 % (t 0.87) | +0.043 % | +0.033 % | +0.075 % |
| US500 | 2026 (→ fin des données) | 184 | 55 % | +0.023 % | +4.2 % | 0.55 | +0.019 % (t 0.47) | +0.008 % (t 0.19) | +0.041 % | +0.022 % | +0.063 % |

Contrôles bruts (sans coûts) : « Nuit brute » = clôture → ouverture ; « Séance brute » = ouverture → clôture du lendemain ; « 24 h brut » = clôture → clôture. Si la nuit ne rapporte pas plus que sa part des 24 h, l'achat de nuit ne fait que suivre la hausse générale.

## Par année (total net)

| Année | US100 | US500 |
|---|---|---|
| 2010 | +3.2 % | +0.8 % |
| 2011 | +1.6 % | +2.4 % |
| 2012 | +7.7 % | +0.0 % |
| 2013 | +9.7 % | +5.3 % |
| 2014 | +10.1 % | +4.6 % |
| 2015 | +7.8 % | -4.8 % |
| 2016 | -3.4 % | -5.4 % |
| 2017 | +15.6 % | +7.5 % |
| 2018 | +10.0 % | +8.5 % |
| 2019 | +8.9 % | +9.0 % |
| 2020 | +21.5 % | +11.6 % |
| 2021 | +9.8 % | +9.9 % |
| 2022 | -29.8 % | -18.9 % |
| 2023 | +2.9 % | -3.1 % |
| 2024 | +24.4 % | +17.3 % |
| 2025 | +12.7 % | +5.4 % |
| 2026 | +7.5 % | +4.2 % |

## Compte 10 000 $ et FTMO 1-Step (descriptif)

Nominal = capital × min(4, cible / σ14) ; garde-fou du bot.

| Indice | Cible de vol. | Période | Compte continu | Pire baisse | FTMO réussis / ratés |
|---|---|---|---|---|---|
| US100 | 0.5 % | Entraînement 2010-2022 | +38.4 % | 9.5 % | 4 / 0 (en cours -5.7 %) |
| US100 | 1 % | Entraînement 2010-2022 | +78.0 % | 18.2 % | 11 / 6 (en cours -7.8 %) |
| US100 | 0.5 % | Test 2023-2025 | +28.1 % | 6.4 % | 2 / 0 (en cours +5.8 %) |
| US100 | 1 % | Test 2023-2025 | +59.8 % | 10.9 % | 5 / 1 (en cours +5.9 %) |
| US100 | 0.5 % | 2026 (→ fin des données) | +1.2 % | 5.2 % | 0 / 0 (en cours +1.2 %) |
| US100 | 1 % | 2026 (→ fin des données) | +2.9 % | 10.2 % | 1 / 1 (en cours +0.5 %) |
| US500 | 0.5 % | Entraînement 2010-2022 | +0.0 % | 20.8 % | 2 / 2 (en cours -3.2 %) |
| US500 | 1 % | Entraînement 2010-2022 | -9.7 % | 36.0 % | 7 / 10 (en cours +2.1 %) |
| US500 | 0.5 % | Test 2023-2025 | +18.8 % | 7.5 % | 1 / 0 (en cours +7.8 %) |
| US500 | 1 % | Test 2023-2025 | +38.5 % | 12.7 % | 4 / 1 (en cours -0.1 %) |
| US500 | 0.5 % | 2026 (→ fin des données) | -0.1 % | 6.1 % | 0 / 0 (en cours -0.1 %) |
| US500 | 1 % | 2026 (→ fin des données) | +2.1 % | 9.7 % | 1 / 1 (en cours +0.5 %) |

## Limites

- Swap relevé en 2026 appliqué à tout le passé (taux proches de 0 en 2010-2015 et 2020-2021 : coût réel plus faible alors).
- Spread d'ouverture à 9:30 souvent plus large que le spread par défaut (voir la colonne 2 × spread).
- HistData ≠ prix du broker ; CFD ≠ actions ; 2 indices très corrélés.
