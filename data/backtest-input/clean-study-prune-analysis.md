# Élagage du combo actuel : entraînement 2010-2022, test 2023-2025, forward 2026

Même protocole que `clean-study-analysis.md`. Chaque jambe de production à son RRR de production. Règles fixées d'avance : **R1** retire les jambes à R net < 0 sur l'entraînement ; **R2** ne garde que les jambes positives en 2010-2016 ET en 2017-2022. La version et le risque sont choisis sur l'entraînement (FTMO réussis − ratés, à égalité le moins de ratés).

## 1. Jambes de production sur l'entraînement

| Jambe | RRR | Trades | R net | R/trade | t | 2010-2016 | 2017-2022 | R1 | R2 | Test 2023-2025 (info) | Forward 2026 (info) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Silver Bullet US500 | 1:3 | 1130 | +158.3 | +0.140 | 2.59 | +83.8 | +74.5 | garde | garde | -33.3 | +5.6 |
| Weekly Sweep US500 | 1:5 | 577 | +134.5 | +0.233 | 2.29 | +41.2 | +93.3 | garde | garde | -6.3 | -1.3 |
| NWOG US100 | 1:5 | 210 | +71.8 | +0.342 | 1.96 | +9.2 | +62.6 | garde | garde | +4.7 | +21.4 |
| FVG US100 | 1:5 | 1336 | +138.2 | +0.103 | 1.61 | -49.0 | +187.2 | garde | retire | +155.2 | +20.0 |
| FVG US500 | 1:5 | 528 | +76.6 | +0.145 | 1.40 | +36.1 | +40.5 | garde | garde | +6.4 | -14.3 |
| Silver Bullet US100 | 1:3 | 1120 | +77.2 | +0.069 | 1.30 | -16.4 | +93.6 | garde | retire | -4.3 | -8.2 |
| Divergence US100/US500 | 1:3 | 1388 | +57.5 | +0.041 | 0.88 | -30.0 | +87.5 | garde | retire | +50.8 | +2.9 |
| CBDR US100 | 1:3 | 669 | +36.4 | +0.054 | 0.79 | +56.8 | -20.5 | garde | retire | -12.1 | -6.2 |
| FVG XAUUSD | 1:4 | 506 | +14.6 | +0.029 | 0.33 | +12.5 | +2.1 | garde | garde | +35.2 | +30.3 |
| Judas Swing EURUSD | 1:3 | 1318 | -114.5 | -0.087 | -1.78 | -54.5 | -59.9 | retire | retire | +14.0 | -10.5 |

## 2. Choix de la version et du risque sur l'entraînement

| Version | Jambes | Risque | Réussis | Ratés | Réussis − ratés | Durée médiane d'un réussi (jours) |
|---|---|---|---|---|---|---|
| A. Combo actuel | 10 | 0.25 % | 13 | 8 | 5 | 169 |
| A. Combo actuel | 10 | 0.5 % | 39 | 39 | 0 | 51 |
| A. Combo actuel | 10 | 0.75 % | 70 | 85 | -15 | 23 |
| A. Combo actuel | 10 | 1 % | 117 | 140 | -23 | 11 |
| A. Combo actuel | 10 | 1.25 % | 164 | 210 | -46 | 9 |
| A. Combo actuel | 10 | 1.5 % | 196 | 245 | -49 | 7 |
| A-R1. Sans les jambes perdantes | 9 | 0.25 % | 15 | 5 | 10 | 164 |
| A-R1. Sans les jambes perdantes | 9 | 0.5 % | 40 | 32 | 8 | 51 |
| A-R1. Sans les jambes perdantes | 9 | 0.75 % | 67 | 66 | 1 | 25 |
| A-R1. Sans les jambes perdantes | 9 | 1 % | 104 | 115 | -11 | 15 |
| A-R1. Sans les jambes perdantes | 9 | 1.25 % | 149 | 162 | -13 | 10 |
| A-R1. Sans les jambes perdantes | 9 | 1.5 % | 195 | 217 | -22 | 8 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 0.25 % | 11 | 2 | 9 | 323 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 0.5 % | 29 | 14 | 15 | 76 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 0.75 % | 43 | 29 | 14 | 48 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 1 % | 64 | 48 | 16 | 26 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 1.25 % | 85 | 79 | 6 | 17 |
| A-R2. Seulement les jambes positives dans chaque moitié | 5 | 1.5 % | 118 | 111 | 7 | 13 |

**Retenu sur l'entraînement : A-R2. Seulement les jambes positives dans chaque moitié, risque 1 %** (FVG US500 1:5, FVG XAUUSD 1:4, NWOG US100 1:5, Weekly Sweep US500 1:5, Silver Bullet US500 1:3).

## 3. Entraînement, test, forward

| Version | Risque | Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d'un réussi (jours) | Pire baisse |
|---|---|---|---|---|---|---|---|---|---|---|
| A. Combo actuel | 0.25 % | Entraînement 2010-2022 | 6370 | 25 % | +318.2 | +0.050 | 2.01 | 13 / 8 | 169 | 26.3 % |
| A. Combo actuel | 0.25 % | Test 2023-2025 | 1634 | 26 % | +233.2 | +0.143 | 2.77 | 5 / 0 | 198 | 8.5 % |
| A. Combo actuel | 0.25 % | Forward 2026 (→ 18 sept.) | 407 | 25 % | +45.5 | +0.112 | 1.08 | 1 / 0 | 199 | 6.9 % |
| A. Combo actuel | 0.5 % | Entraînement 2010-2022 | 6370 | 25 % | +318.2 | +0.050 | 2.01 | 39 / 39 | 51 | 46.6 % |
| A. Combo actuel | 0.5 % | Test 2023-2025 | 1634 | 26 % | +233.2 | +0.143 | 2.77 | 13 / 6 | 22 | 16.3 % |
| A. Combo actuel | 0.5 % | Forward 2026 (→ 18 sept.) | 407 | 25 % | +45.5 | +0.112 | 1.08 | 4 / 2 | 52 | 13.4 % |
| A. Combo actuel | 0.75 % | Entraînement 2010-2022 | 6370 | 25 % | +318.2 | +0.050 | 2.01 | 70 / 85 | 23 | 61.9 % |
| A. Combo actuel | 0.75 % | Test 2023-2025 | 1634 | 26 % | +233.2 | +0.143 | 2.77 | 21 / 13 | 21 | 23.6 % |
| A. Combo actuel | 0.75 % | Forward 2026 (→ 18 sept.) | 407 | 25 % | +45.5 | +0.112 | 1.08 | 5 / 3 | 37 | 19.5 % |
| A. Combo actuel | 1 % | Entraînement 2010-2022 | 5803 | 25 % | +284.3 | +0.049 | 1.87 | 117 / 140 | 11 | 74.3 % |
| A. Combo actuel | 1 % | Test 2023-2025 | 1475 | 26 % | +209.2 | +0.142 | 2.60 | 36 / 28 | 13 | 34.4 % |
| A. Combo actuel | 1 % | Forward 2026 (→ 18 sept.) | 379 | 26 % | +48.8 | +0.129 | 1.19 | 8 / 7 | 11 | 23.3 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Entraînement 2010-2022 | 5320 | 24 % | +425.9 | +0.080 | 2.88 | 15 / 5 | 164 | 20.6 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Test 2023-2025 | 1442 | 25 % | +212.4 | +0.147 | 2.65 | 4 / 0 | 288 | 7.2 % |
| A-R1. Sans les jambes perdantes | 0.25 % | Forward 2026 (→ 18 sept.) | 376 | 25 % | +47.4 | +0.126 | 1.16 | 1 / 0 | 195 | 9.7 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Entraînement 2010-2022 | 5320 | 24 % | +425.9 | +0.080 | 2.88 | 40 / 32 | 51 | 37.7 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Test 2023-2025 | 1442 | 25 % | +212.4 | +0.147 | 2.65 | 11 / 5 | 55 | 14.3 % |
| A-R1. Sans les jambes perdantes | 0.5 % | Forward 2026 (→ 18 sept.) | 376 | 25 % | +47.4 | +0.126 | 1.16 | 4 / 2 | 42 | 18.6 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Entraînement 2010-2022 | 5320 | 24 % | +425.9 | +0.080 | 2.88 | 67 / 66 | 25 | 51.9 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Test 2023-2025 | 1442 | 25 % | +212.4 | +0.147 | 2.65 | 24 / 20 | 15 | 21.1 % |
| A-R1. Sans les jambes perdantes | 0.75 % | Forward 2026 (→ 18 sept.) | 376 | 25 % | +47.4 | +0.126 | 1.16 | 6 / 4 | 28 | 26.8 % |
| A-R1. Sans les jambes perdantes | 1 % | Entraînement 2010-2022 | 4954 | 24 % | +409.0 | +0.083 | 2.85 | 104 / 115 | 15 | 60.9 % |
| A-R1. Sans les jambes perdantes | 1 % | Test 2023-2025 | 1322 | 25 % | +203.6 | +0.154 | 2.63 | 34 / 28 | 12 | 28.8 % |
| A-R1. Sans les jambes perdantes | 1 % | Forward 2026 (→ 18 sept.) | 349 | 26 % | +57.3 | +0.164 | 1.43 | 9 / 7 | 16 | 27.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Entraînement 2010-2022 | 2551 | 25 % | +423.7 | +0.166 | 3.89 | 11 / 2 | 323 | 11.8 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Test 2023-2025 | 666 | 22 % | +4.9 | +0.007 | 0.09 | 0 / 0 | — | 9.1 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.25 % | Forward 2026 (→ 18 sept.) | 187 | 26 % | +48.1 | +0.257 | 1.56 | 1 / 0 | 166 | 4.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Entraînement 2010-2022 | 2551 | 25 % | +423.7 | +0.166 | 3.89 | 29 / 14 | 76 | 22.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Test 2023-2025 | 666 | 22 % | +4.9 | +0.007 | 0.09 | 3 / 4 | 133 | 17.7 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.5 % | Forward 2026 (→ 18 sept.) | 187 | 26 % | +48.1 | +0.257 | 1.56 | 2 / 0 | 109 | 9.2 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Entraînement 2010-2022 | 2551 | 25 % | +423.7 | +0.166 | 3.89 | 43 / 29 | 48 | 32.6 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Test 2023-2025 | 666 | 22 % | +4.9 | +0.007 | 0.09 | 6 / 9 | 67 | 25.8 % |
| A-R2. Seulement les jambes positives dans chaque moitié | 0.75 % | Forward 2026 (→ 18 sept.) | 187 | 26 % | +48.1 | +0.257 | 1.56 | 3 / 1 | 52 | 13.5 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Entraînement 2010-2022 | 2520 | 25 % | +407.3 | +0.162 | 3.76 | 64 / 48 | 26 | 45.4 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Test 2023-2025 | 652 | 23 % | +19.4 | +0.030 | 0.37 | 7 / 16 | 50 | 30.5 % |
| A-R2. Seulement les jambes positives dans chaque moitié **(retenu)** | 1 % | Forward 2026 (→ 18 sept.) | 183 | 26 % | +43.2 | +0.236 | 1.42 | 5 / 2 | 28 | 16.9 % |

**Limites.** Celles de `clean-study-analysis.md` ; en plus, les résultats par jambe du test avaient déjà été lus (annexe de l'étude propre) avant d'écrire ces deux règles : elles restent des règles d'entraînement simples, mais ne sont pas « aveugles » au sens strict.
