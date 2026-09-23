# 3e jambe pour FVG US100 1:5 + XAUUSD 1:7 : broker M1 exact 2023-2026

Même moteur et même règlement que `candidates-2026-analysis.md` (`--troisieme`). Chaque jambe = une stratégie du bot sur une paire, config de production, aucun réglage refait. « Avec C » = C et la jambe dans le **même moteur** (une seule position par paire, comme en production) et le **même garde-fou** (3 trades/jour partagés, pause 30 min), donc la jambe peut prendre la place d'un trade FVG.

**Classement sur l'entraînement (< 2025)**, 2025-2026 lu ensuite : classer sur toutes les années choisirait la jambe qui a eu de la chance sur les années mêmes où on la juge. 2026 = 1er janvier → 18 septembre.

## 1. Chaque jambe seule (trades isolés, R net avec spread + swap)

| Jambe | 2023 | 2024 | 2025 | 2026 | Total | Trades | Win rate | R/trade | t |
|---|---|---|---|---|---|---|---|---|---|
| *Réf. FVG US100 1:5* | +64.1 | +17.5 | +58.3 | +19.5 | **+159.5** | 551 | 23 % | +0.289 | 2.51 |
| *Réf. FVG XAUUSD 1:7* | +6.5 | +17.9 | +21.4 | +40.1 | **+85.9** | 144 | 25 % | +0.597 | 2.22 |
| Divergence US100/US500 | +17.9 | +0.4 | +21.7 | +2.7 | **+42.7** | 416 | 29 % | +0.103 | 1.12 |
| NWOG US100 | -2.4 | +5.8 | +0.4 | +21.4 | **+25.1** | 56 | 25 % | +0.448 | 1.28 |
| RSI(2) US500 | -0.5 | +3.2 | +1.8 | +2.9 | **+7.4** | 35 | 89 % | +0.212 | 3.94 |
| Weekly Sweep US500 | -5.3 | +1.3 | -6.6 | -1.3 | **-11.9** | 174 | 17 % | -0.069 | -0.40 |
| Silver Bullet US500 | +3.6 | -7.8 | -35.3 | +5.4 | **-34.1** | 398 | 24 % | -0.086 | -0.79 |
| Judas Swing EURUSD | -13.7 | +19.1 | +6.6 | -10.4 | **+1.7** | 305 | 30 % | +0.005 | 0.09 |
| Silver Bullet US100 | -6.5 | -12.4 | +9.6 | -8.4 | **-17.7** | 429 | 25 % | -0.041 | -0.10 |
| FVG US500 | +1.8 | -22.8 | +22.2 | -14.6 | **-13.5** | 226 | 18 % | -0.060 | -0.38 |
| CBDR US100 | -10.1 | -12.5 | +4.0 | -6.5 | **-25.1** | 280 | 25 % | -0.090 | -0.87 |

## 2. C + la jambe (même moteur, même garde-fou) : R net par année

| Variante | 2023 | 2024 | 2025 | 2026 | Total | Écart avec C |
|---|---|---|---|---|---|---|
| **C seul** | +67.4 | +35.5 | +71.7 | +52.2 | **+226.7** | — |
| C + Divergence US100/US500 | +89.6 | +30.8 | +102.0 | +43.6 | **+266.0** | +39.3 |
| C + NWOG US100 | +62.5 | +42.5 | +76.2 | +73.6 | **+254.9** | +28.1 |
| C + RSI(2) US500 | +66.9 | +38.7 | +73.5 | +55.1 | **+234.2** | +7.4 |
| C + Weekly Sweep US500 | +62.1 | +37.9 | +66.1 | +50.9 | **+216.9** | -9.8 |
| C + Silver Bullet US500 | +78.8 | +24.0 | +39.5 | +61.0 | **+203.3** | -23.5 |
| C + Judas Swing EURUSD | +54.7 | +49.7 | +82.6 | +41.8 | **+228.9** | +2.1 |
| C + Silver Bullet US100 | +49.4 | +24.8 | +83.4 | +47.5 | **+205.1** | -21.6 |
| C + FVG US500 | +73.1 | +11.8 | +79.8 | +34.0 | **+198.7** | -28.1 |
| C + CBDR US100 | +57.0 | +15.2 | +76.0 | +34.8 | **+183.0** | -43.8 |

## 3. FTMO 1-Step (+10 %) : réussis / ratés, cycles remis à zéro le 1er janvier, total des années

Pire baisse = pire baisse du compte continu sur une année (au risque indiqué).

| Variante | 0.5 % : réussis / ratés | 0.75 % : réussis / ratés | 1 % : réussis / ratés | 0.5 % : pire baisse | 0.75 % : pire baisse | 1 % : pire baisse |
|---|---|---|---|---|---|---|
| **C seul** | 11 / 0 | 17 / 5 | 26 / 12 | 9.9 % | 14.6 % | 17.5 % |
| C + Divergence US100/US500 | 12 / 1 | 20 / 5 | 30 / 13 | 11.4 % | 16.7 % | 21.7 % |
| C + NWOG US100 | 11 / 0 | 19 / 6 | 28 / 12 | 9.5 % | 14.0 % | 20.2 % |
| C + RSI(2) US500 | 11 / 0 | 17 / 5 | 26 / 11 | 9.7 % | 14.3 % | 18.3 % |
| C + Weekly Sweep US500 | 9 / 1 | 19 / 9 | 29 / 18 | 11.8 % | 17.2 % | 21.4 % |
| C + Silver Bullet US500 | 11 / 4 | 20 / 10 | 29 / 19 | 14.7 % | 21.6 % | 26.1 % |
| C + Judas Swing EURUSD | 12 / 1 | 19 / 6 | 29 / 17 | 13.0 % | 18.9 % | 22.1 % |
| C + Silver Bullet US100 | 12 / 3 | 18 / 8 | 26 / 14 | 16.3 % | 23.7 % | 26.9 % |
| C + FVG US500 | 12 / 2 | 19 / 11 | 27 / 18 | 14.4 % | 20.9 % | 23.9 % |
| C + CBDR US100 | 10 / 2 | 15 / 9 | 24 / 17 | 13.9 % | 20.3 % | 26.5 % |

### Hors classement seulement (2025-2026)

| Variante | 0.5 % | 0.75 % | 1 % | R net |
|---|---|---|---|---|
| **C seul** | 6 / 0 | 9 / 2 | 13 / 5 | +123.9 |
| C + Divergence US100/US500 | 6 / 0 | 11 / 2 | 15 / 4 | +145.6 |
| C + NWOG US100 | 7 / 0 | 11 / 3 | 16 / 5 | +149.8 |
| C + RSI(2) US500 | 6 / 0 | 10 / 2 | 13 / 5 | +128.5 |
| C + Weekly Sweep US500 | 5 / 0 | 9 / 4 | 14 / 8 | +117.0 |
| C + Silver Bullet US500 | 5 / 2 | 10 / 5 | 13 / 7 | +100.5 |
| C + Judas Swing EURUSD | 7 / 1 | 10 / 3 | 15 / 9 | +124.4 |
| C + Silver Bullet US100 | 7 / 1 | 10 / 2 | 15 / 5 | +131.0 |
| C + FVG US500 | 7 / 1 | 11 / 7 | 14 / 10 | +113.8 |
| C + CBDR US100 | 6 / 1 | 9 / 5 | 14 / 8 | +110.8 |
