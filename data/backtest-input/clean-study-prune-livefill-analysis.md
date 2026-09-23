# Élagage du combo actuel : entraînement 2010-2022, test 2023-2025, forward 2026

Même protocole que `clean-study-analysis.md`. Chaque jambe de production à son RRR de production. Règles fixées d'avance : **R1** retire les jambes à R net < 0 sur l'entraînement ; **R2** ne garde que les jambes positives en 2010-2016 ET en 2017-2022. La version et le risque sont choisis sur l'entraînement (FTMO réussis − ratés, à égalité le moins de ratés).

## 1. Jambes de production sur l'entraînement

| Jambe | RRR | Trades | R net | R/trade | t | 2010-2016 | 2017-2022 | R1 | R2 | Test 2023-2025 (info) | Forward 2026 (info) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NWOG US100 | 1:5 | 185 | +87.9 | +0.475 | 2.52 | +16.7 | +71.2 | garde | garde | -3.5 | +21.5 |
| Weekly Sweep US500 | 1:5 | 515 | +106.3 | +0.206 | 1.92 | +34.1 | +72.3 | garde | garde | +24.4 | -6.1 |
| Silver Bullet US500 | 1:3 | 968 | +96.9 | +0.100 | 1.80 | +55.0 | +41.9 | garde | garde | -7.1 | -0.4 |
| Divergence US100/US500 | 1:3 | 1356 | +97.8 | +0.072 | 1.53 | -17.4 | +115.2 | garde | retire | +32.4 | +3.3 |
| Silver Bullet US100 | 1:3 | 953 | +51.7 | +0.054 | 0.98 | -38.7 | +90.4 | garde | retire | +15.2 | -1.7 |
| CBDR US100 | 1:3 | 488 | +20.6 | +0.042 | 0.52 | +59.3 | -38.7 | garde | retire | -7.4 | +7.9 |
| Judas Swing EURUSD | 1:3 | 1151 | -45.0 | -0.039 | -0.75 | -15.1 | -29.8 | retire | retire | +10.9 | -11.7 |
| FVG XAUUSD | 1:4 | 441 | -75.1 | -0.170 | -1.98 | -30.4 | -44.7 | retire | retire | +1.5 | +16.4 |
| FVG US500 | 1:5 | 421 | -168.5 | -0.400 | -4.43 | -49.5 | -119.0 | retire | retire | -50.2 | -33.2 |
| FVG US100 | 1:5 | 1012 | -487.8 | -0.482 | -8.91 | -249.6 | -238.2 | retire | retire | -155.3 | -53.2 |

## 2. Choix de la version et du risque sur l'entraînement

| Version | Jambes | Risque | Réussis | Ratés | Réussis − ratés | Durée médiane d'un réussi (jours) |
|---|---|---|---|---|---|---|
| A. Combo actuel | 10 | 0.25 % | 2 | 13 | -11 | 654 |
| A. Combo actuel | 10 | 0.5 % | 17 | 42 | -25 | 77 |
| A. Combo actuel | 10 | 0.75 % | 40 | 93 | -53 | 24 |
| A. Combo actuel | 10 | 1 % | 69 | 132 | -63 | 16 |
| A. Combo actuel | 10 | 1.25 % | 102 | 190 | -88 | 12 |
| A. Combo actuel | 10 | 1.5 % | 121 | 237 | -116 | 9 |
| A-R1. Sans les jambes perdantes | 6 | 0.25 % | 11 | 2 | 9 | 346 |
| A-R1. Sans les jambes perdantes | 6 | 0.5 % | 24 | 11 | 13 | 99 |
| A-R1. Sans les jambes perdantes | 6 | 0.75 % | 45 | 32 | 13 | 41 |
| A-R1. Sans les jambes perdantes | 6 | 1 % | 66 | 57 | 9 | 23 |
| A-R1. Sans les jambes perdantes | 6 | 1.25 % | 97 | 88 | 9 | 20 |
| A-R1. Sans les jambes perdantes | 6 | 1.5 % | 122 | 126 | -4 | 14 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 0.25 % | 6 | 0 | 6 | 723 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 0.5 % | 14 | 4 | 10 | 254 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 0.75 % | 25 | 14 | 11 | 77 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 1 % | 41 | 25 | 16 | 49 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 1.25 % | 47 | 35 | 12 | 36 |
| A-R2. Seulement les jambes positives dans chaque moitié | 3 | 1.5 % | 67 | 55 | 12 | 21 |

**Retenu sur l'entraînement : A-R2. Seulement les jambes positives dans chaque moitié, risque 1 %** (NWOG US100 1:5, Weekly Sweep US500 1:5, Silver Bullet US500 1:3).

## 3. Entraînement, test, forward

| Version | Risque | Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d'un réussi (jours) | Pire baisse |
|---|---|---|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.25 % | Entraînement 2010-2022 | 5649 | 26 % | -261.8 | -0.046 | -1.90 | 2 / 13 | 654 | 52.0 % |
| A. Combo actuel | 0.25 % | Test 2023-2025 | 1395 | 28 % | -79.3 | -0.057 | -1.16 | 0 / 3 | — | 28.8 % |
| A. Combo actuel | 0.25 % | Forward 2026 (→ 18 sept.) | 336 | 25 % | -44.0 | -0.131 | -1.31 | 0 / 1 | — | 14.0 % |
| A. Combo actuel | 0.5 % | Entraînement 2010-2022 | 5641 | 26 % | -259.0 | -0.046 | -1.88 | 17 / 42 | 77 | 79.3 % |
| A. Combo actuel | 0.5 % | Test 2023-2025 | 1394 | 28 % | -78.4 | -0.056 | -1.15 | 3 / 10 | 70 | 50.3 % |
| A. Combo actuel | 0.5 % | Forward 2026 (→ 18 sept.) | 336 | 25 % | -44.0 | -0.131 | -1.31 | 0 / 3 | — | 26.5 % |
| A. Combo actuel | 0.75 % | Entraînement 2010-2022 | 5550 | 26 % | -268.1 | -0.048 | -1.96 | 40 / 93 | 24 | 92.6 % |
| A. Combo actuel | 0.75 % | Test 2023-2025 | 1371 | 28 % | -60.5 | -0.044 | -0.89 | 11 / 21 | 14 | 61.0 % |
| A. Combo actuel | 0.75 % | Forward 2026 (→ 18 sept.) | 333 | 25 % | -50.1 | -0.151 | -1.50 | 0 / 5 | — | 40.4 % |
| A. Combo actuel | 1 % | Entraînement 2010-2022 | 5324 | 27 % | -252.6 | -0.047 | -1.88 | 69 / 132 | 16 | 97.0 % |
| A. Combo actuel | 1 % | Test 2023-2025 | 1298 | 28 % | -44.2 | -0.034 | -0.67 | 17 / 33 | 15 | 67.9 % |
| A. Combo actuel | 1 % | Forward 2026 (→ 18 sept.) | 320 | 25 % | -46.3 | -0.145 | -1.41 | 3 / 9 | 9 | 46.8 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Entraînement 2010-2022 | 3444 | 31 % | +361.3 | +0.105 | 3.28 | 11 / 2 | 346 | 15.3 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Test 2023-2025 | 873 | 32 % | +62.1 | +0.071 | 1.15 | 1 / 0 | 226 | 9.5 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Forward 2026 (→ 18 sept.) | 227 | 30 % | +10.0 | +0.044 | 0.34 | 1 / 1 | 146 | 11.0 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Entraînement 2010-2022 | 3438 | 31 % | +355.5 | +0.103 | 3.23 | 24 / 11 | 99 | 28.5 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Test 2023-2025 | 873 | 32 % | +62.1 | +0.071 | 1.15 | 5 / 5 | 81 | 19.0 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Forward 2026 (→ 18 sept.) | 227 | 30 % | +10.0 | +0.044 | 0.34 | 2 / 2 | 118 | 20.8 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Entraînement 2010-2022 | 3407 | 31 % | +334.4 | +0.098 | 3.06 | 45 / 32 | 41 | 43.5 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Test 2023-2025 | 859 | 32 % | +63.2 | +0.074 | 1.18 | 9 / 8 | 43 | 24.4 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Forward 2026 (→ 18 sept.) | 227 | 30 % | +8.6 | +0.038 | 0.29 | 3 / 3 | 42 | 29.7 % |
| A-R1. Sans les jambes perdantes | 1 % | Entraînement 2010-2022 | 3339 | 31 % | +334.9 | +0.100 | 3.09 | 66 / 57 | 23 | 49.8 % |
| A-R1. Sans les jambes perdantes | 1 % | Test 2023-2025 | 841 | 32 % | +53.7 | +0.064 | 1.01 | 14 / 13 | 40 | 36.2 % |
| A-R1. Sans les jambes perdantes | 1 % | Forward 2026 (→ 18 sept.) | 222 | 30 % | +8.8 | +0.040 | 0.30 | 4 / 4 | 44 | 36.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Entraînement 2010-2022 | 1516 | 31 % | +280.8 | +0.185 | 3.46 | 6 / 0 | 723 | 7.6 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Test 2023-2025 | 349 | 29 % | +23.2 | +0.066 | 0.60 | 1 / 0 | 421 | 6.8 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Forward 2026 (→ 18 sept.) | 104 | 32 % | +18.3 | +0.176 | 0.80 | 0 / 0 | — | 4.4 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Entraînement 2010-2022 | 1514 | 31 % | +279.7 | +0.185 | 3.45 | 14 / 4 | 254 | 14.6 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Test 2023-2025 | 349 | 29 % | +23.2 | +0.066 | 0.60 | 3 / 2 | 217 | 13.6 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Forward 2026 (→ 18 sept.) | 104 | 32 % | +18.3 | +0.176 | 0.80 | 0 / 0 | — | 8.6 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Entraînement 2010-2022 | 1511 | 31 % | +278.7 | +0.184 | 3.44 | 25 / 14 | 77 | 21.2 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Test 2023-2025 | 348 | 29 % | +24.6 | +0.071 | 0.64 | 5 / 6 | 50 | 19.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Forward 2026 (→ 18 sept.) | 103 | 32 % | +19.1 | +0.186 | 0.84 | 2 / 1 | 103 | 12.2 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Entraînement 2010-2022 | 1503 | 31 % | +268.7 | +0.179 | 3.32 | 41 / 25 | 49 | 27.3 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Test 2023-2025 | 347 | 29 % | +21.4 | +0.062 | 0.55 | 6 / 8 | 65 | 25.8 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Forward 2026 (→ 18 sept.) | 103 | 32 % | +19.1 | +0.186 | 0.84 | 3 / 1 | 75 | 16.1 % |

**Limites.** Celles de `clean-study-analysis.md` ; en plus, les résultats par jambe du test avaient déjà été lus (annexe de l'étude propre) avant d'écrire ces deux règles : elles restent des règles d'entraînement simples, mais ne sont pas « aveugles » au sens strict.
