# Hypothèse « la nuit, les stratégies marchent mieux » — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-night-hypothesis-2026-09-24.md` (commité avant ce calcul). Script : `scripts/runNightHypothesisStudy.js`. 19 jambes hors combo live, exécution réelle du bot (`runCleanStudy.js`, `LIVE_FILL=1`), RRR de production. Nuit = 18:00-02:00 NY, séance = 9:30-16:00 NY, heure d'entrée.

## Par jambe (R moyen par trade, nombre de trades)

| Jambe | Type | Période | Nuit | Londres | Séance NY | 16h-18h | Écart nuit − séance |
|---|---|---|---|---|---|---|---|
| nwog-US500 | retour | Entraînement 2010-2022 | +0.068 (351) | -0.289 (5) | -0.750 (1) | -1.025 (10) | — (pas assez de trades) |
| nwog-US500 | retour | Test 2023-2025 | -0.083 (117) | — | — | — | — (pas assez de trades) |
| nwog-US500 | retour | 2026 | +0.803 (33) | — | — | — | — (pas assez de trades) |
| nwog-XAUUSD | retour | Entraînement 2010-2022 | -0.034 (327) | -0.606 (1) | — | -0.931 (9) | — (pas assez de trades) |
| nwog-XAUUSD | retour | Test 2023-2025 | -0.163 (109) | — | — | — | — (pas assez de trades) |
| nwog-XAUUSD | retour | 2026 | -0.719 (30) | — | — | — | — (pas assez de trades) |
| nwog-EURUSD | retour | Entraînement 2010-2022 | +1.622 (2) | -1.045 (2) | -2.054 (1) | -0.159 (362) | — (pas assez de trades) |
| nwog-EURUSD | retour | Test 2023-2025 | — | — | — | +0.012 (86) | — (pas assez de trades) |
| nwog-EURUSD | retour | 2026 | — | — | — | -0.869 (14) | — (pas assez de trades) |
| judasSwing-US100 | retour | Entraînement 2010-2022 | — | -0.017 (649) | — | — | — (pas assez de trades) |
| judasSwing-US100 | retour | Test 2023-2025 | — | +0.009 (214) | — | — | — (pas assez de trades) |
| judasSwing-US100 | retour | 2026 | — | -0.238 (44) | — | — | — (pas assez de trades) |
| judasSwing-US500 | retour | Entraînement 2010-2022 | — | -0.019 (692) | — | — | — (pas assez de trades) |
| judasSwing-US500 | retour | Test 2023-2025 | — | -0.036 (217) | — | — | — (pas assez de trades) |
| judasSwing-US500 | retour | 2026 | — | -0.348 (48) | — | — | — (pas assez de trades) |
| judasSwing-XAUUSD | retour | Entraînement 2010-2022 | — | +0.002 (705) | — | — | — (pas assez de trades) |
| judasSwing-XAUUSD | retour | Test 2023-2025 | — | -0.027 (209) | — | — | — (pas assez de trades) |
| judasSwing-XAUUSD | retour | 2026 | — | -0.400 (45) | — | — | — (pas assez de trades) |
| judasSwing-EURUSD | retour | Entraînement 2010-2022 | — | -0.039 (1151) | — | — | — (pas assez de trades) |
| judasSwing-EURUSD | retour | Test 2023-2025 | — | +0.047 (232) | — | — | — (pas assez de trades) |
| judasSwing-EURUSD | retour | 2026 | — | -0.286 (41) | — | — | — (pas assez de trades) |
| weeklySweep-US100 | retour | Entraînement 2010-2022 | +0.375 (127) | +0.375 (94) | +0.102 (228) | -0.398 (21) | +0.273 |
| weeklySweep-US100 | retour | Test 2023-2025 | +0.238 (27) | -0.398 (34) | -0.172 (55) | +0.197 (5) | +0.410 |
| weeklySweep-US100 | retour | 2026 | -0.321 (8) | -0.580 (6) | -0.330 (13) | -0.833 (1) | — (pas assez de trades) |
| weeklySweep-XAUUSD | retour | Entraînement 2010-2022 | -0.033 (125) | +0.195 (172) | -0.182 (158) | -0.971 (7) | +0.149 |
| weeklySweep-XAUUSD | retour | Test 2023-2025 | -0.519 (38) | +0.659 (40) | -0.449 (32) | -0.641 (3) | -0.070 |
| weeklySweep-XAUUSD | retour | 2026 | -0.252 (17) | +0.142 (8) | +0.168 (4) | — | — (pas assez de trades) |
| weeklySweep-EURUSD | retour | Entraînement 2010-2022 | -0.321 (97) | +0.132 (200) | -0.275 (142) | -0.315 (30) | -0.046 |
| weeklySweep-EURUSD | retour | Test 2023-2025 | +0.328 (19) | +0.223 (43) | +0.213 (39) | +0.387 (4) | +0.115 |
| weeklySweep-EURUSD | retour | 2026 | +0.585 (3) | -0.011 (9) | +1.027 (4) | -0.780 (5) | — (pas assez de trades) |
| breakerBlock-US100 | retour | Entraînement 2010-2022 | -0.272 (176) | -0.205 (398) | +0.012 (556) | +0.268 (42) | -0.284 |
| breakerBlock-US100 | retour | Test 2023-2025 | +0.247 (66) | +0.115 (133) | -0.390 (162) | +0.468 (10) | +0.637 |
| breakerBlock-US100 | retour | 2026 | -1.070 (13) | -0.007 (39) | -1.227 (22) | +1.190 (3) | +0.157 |
| breakerBlock-US500 | retour | Entraînement 2010-2022 | -0.123 (215) | -0.242 (404) | -0.213 (546) | -0.708 (46) | +0.090 |
| breakerBlock-US500 | retour | Test 2023-2025 | -0.127 (49) | -0.377 (129) | +0.091 (138) | -0.909 (14) | -0.217 |
| breakerBlock-US500 | retour | 2026 | +0.085 (23) | -0.385 (32) | -0.087 (36) | -1.092 (1) | +0.172 |
| breakerBlock-XAUUSD | retour | Entraînement 2010-2022 | +0.133 (234) | -0.029 (460) | -0.038 (372) | -0.212 (30) | +0.172 |
| breakerBlock-XAUUSD | retour | Test 2023-2025 | +0.082 (88) | +0.024 (140) | +0.094 (101) | -0.643 (7) | -0.012 |
| breakerBlock-XAUUSD | retour | 2026 | +0.015 (28) | -0.083 (38) | +0.247 (24) | -0.948 (1) | -0.232 |
| breakerBlock-EURUSD | retour | Entraînement 2010-2022 | -0.373 (232) | -0.160 (594) | -0.032 (357) | +0.180 (53) | -0.341 |
| breakerBlock-EURUSD | retour | Test 2023-2025 | -0.046 (41) | -0.116 (128) | +0.248 (72) | -1.259 (11) | -0.294 |
| breakerBlock-EURUSD | retour | 2026 | +0.069 (8) | +0.580 (20) | -0.787 (24) | -1.256 (4) | — (pas assez de trades) |
| cbdr-US500 | retour | Entraînement 2010-2022 | +0.102 (53) | -0.288 (141) | -0.101 (263) | — | +0.203 |
| cbdr-US500 | retour | Test 2023-2025 | +0.042 (20) | +0.027 (34) | -0.183 (62) | — | +0.225 |
| cbdr-US500 | retour | 2026 | -0.284 (4) | +1.049 (7) | +0.150 (16) | — | — (pas assez de trades) |
| cbdr-XAUUSD | retour | Entraînement 2010-2022 | +0.110 (103) | -0.186 (470) | -0.079 (295) | — | +0.189 |
| cbdr-XAUUSD | retour | Test 2023-2025 | +0.067 (45) | +0.078 (116) | +0.281 (82) | — | -0.214 |
| cbdr-XAUUSD | retour | 2026 | +0.008 (11) | +0.290 (21) | +0.475 (17) | — | -0.467 |
| cbdr-EURUSD | retour | Entraînement 2010-2022 | -0.264 (102) | -0.178 (607) | -0.172 (271) | — | -0.092 |
| cbdr-EURUSD | retour | Test 2023-2025 | -0.614 (9) | +0.051 (124) | -0.168 (64) | — | — (pas assez de trades) |
| cbdr-EURUSD | retour | 2026 | +0.568 (2) | +0.489 (19) | +0.728 (12) | — | — (pas assez de trades) |
| silverBullet-XAUUSD | continuation | Entraînement 2010-2022 | +0.066 (48) | — | -0.043 (696) | +0.297 (9) | +0.109 |
| silverBullet-XAUUSD | continuation | Test 2023-2025 | -0.093 (13) | — | -0.079 (171) | +0.156 (3) | -0.013 |
| silverBullet-XAUUSD | continuation | 2026 | +1.100 (2) | — | +0.002 (46) | +3.038 (1) | — (pas assez de trades) |
| silverBullet-EURUSD | continuation | Entraînement 2010-2022 | -0.452 (29) | — | -0.153 (758) | -0.622 (13) | — (pas assez de trades) |
| silverBullet-EURUSD | continuation | Test 2023-2025 | -0.222 (10) | — | -0.216 (172) | -1.112 (5) | -0.005 |
| silverBullet-EURUSD | continuation | 2026 | -1.587 (2) | — | -0.543 (35) | -1.529 (1) | — (pas assez de trades) |

## Test principal (H1)

- Jambes retenues à l'entraînement (≥ 30 trades de nuit ET de séance) : 11 (weeklySweep-US100, weeklySweep-XAUUSD, weeklySweep-EURUSD, breakerBlock-US100, breakerBlock-US500, breakerBlock-XAUUSD, breakerBlock-EURUSD, cbdr-US500, cbdr-XAUUSD, cbdr-EURUSD, silverBullet-XAUUSD).
- Entraînement : écart combiné nuit − séance +0.007 R/trade (erreur type 0.065), **z = 0.11** ; écart positif pour 7/11 jambes.
- Test 2023-2025 (10 jambes avec ≥ 10 trades par session) : écart combiné +0.040 R/trade, z = 0.30.
- 2026 (descriptif, 4 jambes) : écart combiné -0.078 R/trade, z = -0.23.
- Verdict : **H1 NON SOUTENUE à l'entraînement**

## Test secondaire (H2, descriptif) : retour vs continuation, entraînement

- retour : 10 jambe(s), écart combiné +0.001 R/trade, z = 0.01
- continuation : 1 jambe(s), écart combiné +0.109 R/trade, z = 0.42

## Limites

- Plusieurs mécanismes ne tradent que dans une fenêtre horaire : peu de jambes comparables.
- Spread constant ; exécution du bot simulée (`LIVE_FILL=1`) sur bougies M15 reconstruites.
- Un écart, même solide, ne dit pas pourquoi (calme, algorithmes, autre).
