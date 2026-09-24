# Filtre « journées de tendance » pour A et B — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-trend-day-filter-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runTrendDayFilterStudy.js`. Filtre actif si la part de journées de tendance des 20 séances précédentes ≥ sa médiane des 250 séances précédentes (historique HistData collé avant le premier jour du broker). A en R, B en % du nominal.

## Critère pré-enregistré

| Stratégie | Entraînement : actif (n, moyenne) / inactif (n, moyenne) | Écart, t | 2010-2016 | 2017-2022 | Trades gardés | Test 2023-2025 : écart | Verdict |
|---|---|---|---|---|---|---|---|
| A-US100 | 1653, +0.139 R / 1149, +0.191 R | -0.052, t -0.53 | -0.105 | -0.007 | 59 % | -0.143 (t -0.80) | **REJETÉ à l'entraînement** |
| B-US500 | 1560, +0.019 % / 1292, +0.016 % | +0.003, t 0.20 | -0.003 | +0.007 | 55 % | +0.000 (t 0.00) | **REJETÉ à l'entraînement** |

## Par période

| Stratégie | Période | Sans filtre (n, total, moyenne) | Filtre actif (n, total, moyenne) | Filtre inactif (n, total, moyenne) |
|---|---|---|---|---|
| A-US100 | Entraînement 2010-2022 | 2802, +449.3 R, +0.160 | 1653, +229.6 R, +0.139 | 1149, +219.8 R, +0.191 |
| A-US100 | Test 2023-2025 | 766, +106.4 R, +0.139 | 391, +27.0 R, +0.069 | 375, +79.4 R, +0.212 |
| A-US100 | 2026 (→ fin des données) | 185, -28.3 R, -0.153 | 123, -27.3 R, -0.222 | 62, -1.1 R, -0.017 |
| B-US500 | Entraînement 2010-2022 | 2852, +49.0 %, +0.017 | 1560, +28.9 %, +0.019 | 1292, +20.0 %, +0.016 |
| B-US500 | Test 2023-2025 | 732, +15.7 %, +0.021 | 412, +8.8 %, +0.021 | 320, +6.9 %, +0.021 |
| B-US500 | 2026 (→ fin des données) | 209, -4.9 %, -0.024 | 119, -3.9 %, -0.033 | 90, -1.0 %, -0.011 |

## Limites

- Journées de tendance de 2022 calculées sur HistData pour amorcer le filtre au début du broker (2023).
- Trades des jours sans décision possible (moins de 270 séances d'historique) exclus des deux groupes.
- Un seul seuil (médiane glissante), aucun autre essayé.
