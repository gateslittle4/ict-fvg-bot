# Recherche de nuit — VALIDATION 2019-2022 (lecture unique)

Règles figées : `data/backtest-input/night-frozen-rules.json` (commitées avant cette lecture). Script : `scripts/runNightHidden.js validation`. Généré le 2026-09-26T05:17 UTC.
Critère fixé avant : R moyen > 0 et t ≥ 2 → passe au final ; sinon rejetée.

| Règle | Marché | Trades | Gagnants | R moyen | R total | t | 2019-20 / 2021-22 | PF | Pire creux R | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 FVG M15 âge 5-12, 9h30-11h, 4 h en faveur, marché, stop derrière la zone, 3R | US100 | 363 | 29 % | -0.079 | -28.7 | -1.00 | -35.2 / +6.5 | 0.88 | 47.3 | rejetée |
| A2 FVG M15 âge 5-12, 3h-9h30, tendance 20 j, marché, stop 1 ATR, 2R | XAUUSD | 757 | 37 % | +0.026 | +19.7 | 0.53 | +6.5 / +13.2 | 1.04 | 22.8 | rejetée |
| B1 FVG M15 âge 5-12, 9h30-11h, aucun, marché, stop derrière la zone, 3R | US100 | 439 | 28 % | -0.095 | -41.6 | -1.31 | -47.2 / +5.6 | 0.86 | 54.3 | rejetée |
| C1 FVG M15 âge 5-12, 9h30-11h, aucun, marché, stop derrière la zone, 3R + réentrée sur le même FVG après un stop | US100 | 502 | 29 % | -0.078 | -39.3 | -1.15 | -43.9 / +4.7 | 0.89 | 52.9 | rejetée |
| C2 FVG M15 âge 5-12, 9h30-11h, 4 h en faveur, marché, stop derrière la zone, 3R + réentrée sur le même FVG après un stop | US100 | 412 | 29 % | -0.095 | -39.0 | -1.29 | -36.5 / -2.4 | 0.86 | 55.6 | rejetée |
| D1a Limite au creux nuit 18h-3h, sortie 3h, 0.25 ATR, 2R, achat, au marché après le toucher | US100 | 1370 | 49 % | +0.017 | +23.9 | 0.75 | +32.7 / -8.8 | 1.05 | 23.2 | rejetée |
| D1b Limite au creux 3h-9h30, sortie 9h30, 0.5 ATR, 1R, achat, au marché après le toucher | US100 | 2162 | 50 % | -0.016 | -34.0 | -0.82 | +4.3 / -38.3 | 0.96 | 63.8 | rejetée |
| D2a Écart d'ouverture 9h30 écart >= 0.5 ATR, sortie 11h, les deux | US100 | 797 | 40 % | +0.078 | +61.9 | 1.50 | +48.3 / +13.6 | 1.13 | 30.0 | rejetée |
| D3a Lundi : achat 9h31 -> 16h, stop 1 ATR | US100 | 205 | 30 % | +0.307 | +63.0 | 1.80 | +55.6 / +7.4 | 1.43 | 13.7 | rejetée |
| D3b Mardi : achat 9h31 -> 16h, stop 1 ATR | US100 | 208 | 20 % | -0.093 | -19.4 | -0.65 | -2.3 / -17.1 | 0.88 | 41.0 | rejetée |

## Par année

- A1 FVG M15 âge 5-12, 9h30-11h, 4 h en faveur, marché, stop derrière la zone, 3R : 2018 +25.3 (105) · 2019 -15.1 (90) · 2020 -20.2 (105) · 2021 +4.4 (80) · 2022 +2.2 (88)
- A2 FVG M15 âge 5-12, 3h-9h30, tendance 20 j, marché, stop 1 ATR, 2R : 2018 +3.4 (183) · 2019 +9.8 (185) · 2020 -3.3 (187) · 2021 +14.7 (197) · 2022 -1.5 (188)
- B1 FVG M15 âge 5-12, 9h30-11h, aucun, marché, stop derrière la zone, 3R : 2018 +36.7 (129) · 2019 -26.1 (109) · 2020 -21.2 (118) · 2021 +7.9 (105) · 2022 -2.3 (107)
- C1 FVG M15 âge 5-12, 9h30-11h, aucun, marché, stop derrière la zone, 3R + réentrée sur le même FVG après un stop : 2018 +36.5 (147) · 2019 -24.9 (123) · 2020 -19.0 (135) · 2021 +7.2 (122) · 2022 -2.6 (122)
- C2 FVG M15 âge 5-12, 9h30-11h, 4 h en faveur, marché, stop derrière la zone, 3R + réentrée sur le même FVG après un stop : 2018 +22.2 (118) · 2019 -18.5 (102) · 2020 -18.0 (118) · 2021 +0.7 (92) · 2022 -3.1 (100)
- D1a Limite au creux nuit 18h-3h, sortie 3h, 0.25 ATR, 2R, achat, au marché après le toucher : 2018 +18.9 (321) · 2019 +6.1 (348) · 2020 +26.7 (376) · 2021 -8.5 (335) · 2022 -0.3 (311)
- D1b Limite au creux 3h-9h30, sortie 9h30, 0.5 ATR, 1R, achat, au marché après le toucher : 2018 -3.0 (508) · 2019 +22.2 (517) · 2020 -17.8 (430) · 2021 +0.9 (592) · 2022 -39.2 (623)
- D2a Écart d'ouverture 9h30 écart >= 0.5 ATR, sortie 11h, les deux : 2018 +38.4 (213) · 2019 +5.3 (211) · 2020 +42.9 (197) · 2021 +12.3 (203) · 2022 +1.3 (186)
- D3a Lundi : achat 9h31 -> 16h, stop 1 ATR : 2018 +2.6 (52) · 2019 +15.6 (52) · 2020 +39.9 (51) · 2021 +16.8 (51) · 2022 -9.4 (51)
- D3b Mardi : achat 9h31 -> 16h, stop 1 ATR : 2018 +22.3 (51) · 2019 +17.0 (52) · 2020 -19.3 (52) · 2021 -1.1 (52) · 2022 -16.0 (52)

