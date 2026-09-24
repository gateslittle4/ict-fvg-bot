# Sweep + 9:30 + FVG — variantes simplifiées (amendement pré-enregistré)

Règles : amendement de `preregistration-ny-open-sweep-fvg-2026-09-24.md` (commité avant ce calcul, `9f5690d`). Critère : entraînement ≥ 60 trades, t ≥ 2,6, deux moitiés positives, puis test ≥ 30 trades et > 0. 2025 descriptif.

## US100 (principale)

| Variante | Entraînement 2010-2022 | 2010-2016 | 2017-2022 | Test 2023-2025 | **2025 seul** | 2026 | Verdict |
|---|---|---|---|---|---|---|---|
| Complète (référence) | 77 tr., 39 %, +29.2 R (t 1.36) | +2.4 R | +26.9 R | 7 tr., 14 %, -3.7 R (t -1.10) | 5 tr., 0 %, -5.0 R (t 0.00) | 3 tr., 0 %, -3.0 R (t 0.00) | référence (échec, t < 2) |
| V1 sans sweep | 129 tr., 36 %, +40.0 R (t 1.58) | +21.1 R | +18.9 R | 23 tr., 43 %, +9.0 R (t 1.01) | 12 tr., 42 %, +7.0 R (t 0.92) | 4 tr., 25 %, +1.3 R (t 0.25) | échec entraînement |
| V2 sans plancher | 116 tr., 37 %, +41.2 R (t 1.58) | +1.9 R | +39.3 R | 21 tr., 24 %, -6.6 R (t -1.17) | 11 tr., 9 %, -7.3 R (t -2.33) | 5 tr., 20 %, -2.8 R (t -2.09) | échec entraînement |
| V3 sans cassure pré-ouverture | 96 tr., 35 %, +23.3 R (t 1.04) | +7.0 R | +16.4 R | 12 tr., 33 %, +8.7 R (t 0.76) | 7 tr., 29 %, +7.4 R (t 0.66) | 6 tr., 17 %, -2.6 R (t -0.75) | échec entraînement |
| V4 sans sweep ni plancher | 181 tr., 35 %, +45.2 R (t 1.53) | +20.8 R | +24.5 R | 39 tr., 36 %, +4.1 R (t 0.40) | 18 tr., 33 %, +4.7 R (t 0.57) | 7 tr., 43 %, +3.6 R (t 0.68) | échec entraînement |
| V5 FVG de 9:30 seul | 349 tr., 33 %, +39.8 R (t 1.10) | +13.6 R | +26.1 R | 84 tr., 38 %, +29.4 R (t 1.58) | 36 tr., 42 %, +20.8 R (t 1.45) | 14 tr., 29 %, +0.0 R (t 0.01) | échec entraînement |

## US500 (contrôle)

| Variante | Entraînement 2010-2022 | 2010-2016 | 2017-2022 | Test 2023-2025 | **2025 seul** | 2026 | Verdict |
|---|---|---|---|---|---|---|---|
| Complète (référence) | 66 tr., 30 %, +6.3 R (t 0.43) | -4.4 R | +10.7 R | 10 tr., 30 %, +3.2 R (t 0.42) | 5 tr., 40 %, +1.7 R (t 0.35) | 3 tr., 33 %, -0.4 R (t -0.14) | référence (échec, t < 2) |
| V1 sans sweep | 114 tr., 28 %, +6.6 R (t 0.32) | +0.5 R | +6.1 R | 14 tr., 29 %, +4.6 R (t 0.52) | 6 tr., 50 %, +6.1 R (t 0.98) | 6 tr., 17 %, -3.4 R (t -1.28) | échec entraînement |
| V2 sans plancher | 91 tr., 31 %, +2.0 R (t 0.12) | -12.4 R | +14.4 R | 18 tr., 44 %, +16.7 R (t 1.62) | 6 tr., 50 %, +5.9 R (t 0.96) | 4 tr., 25 %, -1.4 R (t -0.52) | échec entraînement |
| V3 sans cassure pré-ouverture | 118 tr., 29 %, +4.1 R (t 0.21) | -12.2 R | +16.3 R | 21 tr., 19 %, -4.0 R (t -0.47) | 10 tr., 30 %, +0.4 R (t 0.08) | 7 tr., 29 %, -0.5 R (t -0.13) | échec entraînement |
| V4 sans sweep ni plancher | 151 tr., 30 %, +9.6 R (t 0.41) | -2.1 R | +11.6 R | 25 tr., 36 %, +15.1 R (t 1.29) | 7 tr., 57 %, +10.3 R (t 1.49) | 7 tr., 14 %, -4.4 R (t -1.66) | échec entraînement |
| V5 FVG de 9:30 seul | 388 tr., 30 %, +21.4 R (t 0.61) | -22.4 R | +43.8 R | 87 tr., 29 %, +13.0 R (t 0.74) | 26 tr., 38 %, +13.4 R (t 1.29) | 22 tr., 18 %, -4.9 R (t -0.60) | échec entraînement |

