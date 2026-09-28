# Recherche de nuit — second tour : les 22 stratégies du Labo, exploration 2011-2018

88 variantes (22 stratégies × 4 marchés), réglages par défaut. Retenue = >= 60 trades, R moyen > 0, t >= 2, deux moitiés positives. Figées (au plus 1 marché par stratégie, 10 au plus) : 5 → `night-lab-frozen.json`.

## Figées pour la validation

1. Anchored VWAP — XAUUSD : 3798 trades, +1.642 R, t 7.17
2. Weekly Liquidity Sweep — US100 : 406 trades, +0.321 R, t 3.43
3. Midnight Open Retracement — XAUUSD : 600 trades, +0.870 R, t 2.89
4. CBDR (Central Bank Dealer Range) — US100 : 689 trades, +0.206 R, t 2.83
5. Judas Swing — US500 : 537 trades, +0.199 R, t 2.48

## Toutes (triées par t)

| Stratégie | Marché | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R |
|---|---|---|---|---|---|---|---|---|---|
| Anchored VWAP | XAUUSD | 3798 | 29 % | +1.642 | +6234.6 | 7.17 | +3886.1 / +2348.5 | 2.16 | 101.5 |
| Anchored VWAP | US100 | 3334 | 30 % | +1.789 | +5962.9 | 6.98 | +1325.9 / +4637.1 | 2.95 | 83.0 |
| Weekly Liquidity Sweep | US100 | 406 | 34 % | +0.321 | +130.5 | 3.43 | +93.9 / +36.5 | 1.47 | 15.5 |
| Midnight Open Retracement | XAUUSD | 600 | 33 % | +0.870 | +521.8 | 2.89 | +148.7 / +373.2 | 1.92 | 58.9 |
| CBDR (Central Bank Dealer Range) | US100 | 689 | 33 % | +0.206 | +142.3 | 2.83 | +76.7 / +65.5 | 1.28 | 31.5 |
| Judas Swing | US500 | 537 | 31 % | +0.199 | +106.7 | 2.48 | +47.1 / +59.7 | 1.27 | 14.5 |
| Asian Range Breakout | XAUUSD | 1113 | 30 % | +0.095 | +105.5 | 1.82 | +26.1 / +79.4 | 1.13 | 40.6 |
| Midnight Open Retracement | US100 | 477 | 32 % | +1.067 | +509.0 | 1.74 | +219.7 / +289.4 | 2.39 | 35.2 |
| Midnight Open Retracement | US500 | 256 | 34 % | +0.374 | +95.8 | 1.73 | +23.0 / +72.7 | 1.51 | 36.4 |
| Weekly Liquidity Sweep | US500 | 396 | 30 % | +0.148 | +58.6 | 1.61 | +29.9 / +28.7 | 1.20 | 25.5 |
| Support HTF (jour/semaine/mois) + renversement | US100 | 27 | 41 % | +0.617 | +16.7 | 1.60 | +0.9 / +15.7 | 2.03 | 3.1 |
| Unicorn Model | US100 | 844 | 29 % | +0.097 | +82.0 | 1.56 | +38.9 / +43.2 | 1.13 | 47.4 |
| Anchored VWAP | EURUSD | 3855 | 31 % | +0.248 | +955.6 | 1.50 | +159.2 / +796.4 | 1.13 | 446.5 |
| NWOG (New Week Opening Gap) | US100 | 314 | 30 % | +0.138 | +43.2 | 1.33 | +7.2 / +36.0 | 1.19 | 17.1 |
| Anchored VWAP | US500 | 2642 | 31 % | +1.948 | +5146.7 | 1.25 | +351.3 / +4795.4 | 3.38 | 69.0 |
| NDOG (New Day Opening Gap) | US500 | 506 | 30 % | +0.095 | +48.3 | 1.17 | +4.1 / +44.1 | 1.12 | 28.1 |
| Asian Range Fade | US100 | 1816 | 28 % | +0.048 | +87.7 | 1.15 | +7.2 / +80.5 | 1.06 | 53.6 |
| NDOG (New Day Opening Gap) | US100 | 676 | 29 % | +0.077 | +52.1 | 1.10 | +1.2 / +50.9 | 1.10 | 55.1 |
| Star Patterns | US500 | 2598 | 27 % | +0.035 | +91.7 | 1.02 | +91.6 / +0.1 | 1.05 | 74.2 |
| Bollinger Squeeze | US100 | 2914 | 26 % | +0.030 | +87.9 | 0.92 | +59.0 / +28.9 | 1.04 | 103.6 |
| Midnight Open Retracement | EURUSD | 552 | 34 % | +0.301 | +165.9 | 0.89 | +151.3 / +14.7 | 1.24 | 83.2 |
| NWOG (New Week Opening Gap) | US500 | 285 | 29 % | +0.094 | +26.9 | 0.88 | -1.4 / +28.4 | 1.12 | 23.5 |
| Asian Range Fade | US500 | 1530 | 28 % | +0.033 | +50.8 | 0.73 | +54.8 / -4.0 | 1.04 | 87.5 |
| OTE (Optimal Trade Entry) | XAUUSD | 2296 | 27 % | +0.026 | +60.1 | 0.71 | +43.0 / +17.1 | 1.03 | 65.5 |
| OTE (Optimal Trade Entry) | US100 | 2634 | 26 % | +0.021 | +54.1 | 0.60 | +66.6 / -12.5 | 1.03 | 144.7 |
| Equal Highs / Equal Lows | US100 | 3143 | 28 % | +0.018 | +56.0 | 0.54 | +44.6 / +11.4 | 1.02 | 125.6 |
| Support HTF (jour/semaine/mois) + renversement | US500 | 26 | 35 % | +0.184 | +4.8 | 0.52 | +8.5 / -3.7 | 1.27 | 9.1 |
| Weekly Liquidity Sweep | EURUSD | 383 | 31 % | +0.049 | +18.6 | 0.52 | +9.4 / +9.2 | 1.06 | 23.5 |
| Judas Swing | US100 | 621 | 27 % | +0.030 | +18.3 | 0.42 | +20.9 / -2.6 | 1.04 | 32.9 |
| Breaker Block | US100 | 1297 | 27 % | +0.020 | +26.3 | 0.40 | -29.3 / +55.5 | 1.03 | 80.8 |
| Mitigation Block | US100 | 3358 | 27 % | +0.008 | +27.5 | 0.26 | +47.4 / -19.9 | 1.01 | 138.6 |
| CBDR (Central Bank Dealer Range) | XAUUSD | 1107 | 32 % | +0.017 | +18.4 | 0.26 | +56.9 / -38.5 | 1.02 | 87.2 |
| Bollinger Squeeze | XAUUSD | 3592 | 27 % | +0.006 | +20.3 | 0.19 | -24.0 / +44.2 | 1.01 | 73.6 |
| Judas Swing | XAUUSD | 666 | 28 % | +0.011 | +7.5 | 0.16 | +22.3 / -14.7 | 1.01 | 39.3 |
| Judas Swing | EURUSD | 912 | 30 % | +0.009 | +7.8 | 0.14 | +6.9 / +0.9 | 1.01 | 66.6 |
| RSI Divergence | US500 | 2055 | 46 % | +0.001 | +1.1 | 0.02 | -21.5 / +22.6 | 1.00 | 52.1 |
| Gap Continuation (quotidien) | EURUSD | 1 | 0 % | -1.967 | -2.0 | 0.00 | +0.0 / -2.0 | 0.00 | 2.0 |
| NDOG (New Day Opening Gap) | EURUSD | 1 | 100 % | +2.570 | +2.6 | 0.00 | +0.0 / +2.6 | Infinity | 0.0 |
| Gap Continuation (quotidien) | US100 | 663 | 28 % | -0.004 | -2.5 | -0.05 | -25.8 / +23.3 | 1.00 | 70.2 |
| Unicorn Model | US500 | 746 | 27 % | -0.004 | -3.0 | -0.06 | -12.1 / +9.1 | 0.99 | 51.2 |
| Equal Highs / Equal Lows | US500 | 2400 | 28 % | -0.003 | -8.1 | -0.07 | +42.8 / -50.9 | 1.00 | 109.9 |
| Support HTF (jour/semaine/mois) + renversement | EURUSD | 226 | 29 % | -0.020 | -4.5 | -0.17 | -12.9 / +8.4 | 0.98 | 30.4 |
| MACD Trend | US100 | 14055 | 31 % | -0.004 | -56.6 | -0.30 | -91.8 / +35.2 | 0.99 | 216.0 |
| Weekly Liquidity Sweep | XAUUSD | 365 | 27 % | -0.038 | -13.9 | -0.42 | -19.4 / +5.5 | 0.95 | 44.3 |
| Mitigation Block | US500 | 2963 | 27 % | -0.016 | -47.6 | -0.49 | +29.5 / -77.1 | 0.98 | 142.7 |
| Bollinger Squeeze | US500 | 2683 | 26 % | -0.022 | -58.2 | -0.65 | -82.1 / +24.0 | 0.97 | 147.8 |
| Star Patterns | XAUUSD | 2218 | 26 % | -0.026 | -57.5 | -0.69 | -21.8 / -35.7 | 0.97 | 143.7 |
| RSI Divergence | US100 | 2435 | 43 % | -0.015 | -35.5 | -0.71 | +26.4 / -62.0 | 0.96 | 107.8 |
| Unicorn Model | XAUUSD | 876 | 29 % | -0.045 | -39.4 | -0.72 | -8.5 / -30.9 | 0.95 | 69.5 |
| Breaker Block | US500 | 1181 | 26 % | -0.040 | -47.8 | -0.79 | -5.4 / -42.3 | 0.95 | 106.5 |
| CBDR (Central Bank Dealer Range) | US500 | 577 | 26 % | -0.058 | -33.5 | -0.80 | -25.0 / -8.5 | 0.93 | 54.3 |
| Power of Three | US100 | 799 | 25 % | -0.055 | -44.1 | -0.91 | -0.5 / -43.6 | 0.93 | 68.6 |
| DMI Trend | US100 | 2940 | 27 % | -0.035 | -102.1 | -1.29 | -73.5 / -28.6 | 0.92 | 140.7 |
| Power of Three | US500 | 689 | 25 % | -0.083 | -57.0 | -1.29 | +7.9 / -64.9 | 0.89 | 76.3 |
| Asian Range Fade | XAUUSD | 1729 | 27 % | -0.057 | -98.0 | -1.32 | -51.2 / -46.9 | 0.93 | 104.2 |
| RSI Divergence | XAUUSD | 2526 | 46 % | -0.026 | -65.2 | -1.34 | -33.3 / -31.9 | 0.93 | 106.9 |
| OTE (Optimal Trade Entry) | EURUSD | 2583 | 26 % | -0.048 | -124.6 | -1.39 | -153.3 / +28.7 | 0.94 | 160.0 |
| Star Patterns | US100 | 2810 | 25 % | -0.052 | -145.2 | -1.59 | -143.2 / -2.0 | 0.93 | 200.7 |
| OTE (Optimal Trade Entry) | US500 | 2229 | 24 % | -0.060 | -133.7 | -1.65 | -35.4 / -98.2 | 0.92 | 201.6 |
| Gap Continuation (quotidien) | US500 | 505 | 24 % | -0.149 | -75.2 | -1.95 | -9.1 / -66.1 | 0.82 | 85.8 |
| Support HTF (jour/semaine/mois) + renversement | XAUUSD | 180 | 22 % | -0.243 | -43.8 | -2.00 | -2.5 / -41.4 | 0.72 | 58.4 |
| Asian Range Breakout | EURUSD | 1448 | 25 % | -0.097 | -139.8 | -2.20 | -91.0 / -48.9 | 0.88 | 178.5 |
| Asian Range Breakout | US500 | 1354 | 24 % | -0.100 | -135.2 | -2.24 | -31.6 / -103.6 | 0.87 | 150.4 |
| Asian Range Breakout | US100 | 1445 | 24 % | -0.108 | -155.9 | -2.50 | -101.4 / -54.6 | 0.86 | 206.9 |
| DMI Trend | US500 | 2856 | 26 % | -0.069 | -196.0 | -2.54 | -143.7 / -52.2 | 0.85 | 206.7 |
| Power of Three | XAUUSD | 704 | 24 % | -0.184 | -129.5 | -2.66 | -77.0 / -52.4 | 0.79 | 143.6 |
| NWOG (New Week Opening Gap) | XAUUSD | 388 | 25 % | -0.241 | -93.5 | -2.68 | -54.6 / -38.9 | 0.74 | 102.7 |
| Breaker Block | XAUUSD | 1388 | 28 % | -0.157 | -218.6 | -2.99 | -103.6 / -115.0 | 0.83 | 238.0 |
| MACD Trend | US500 | 14413 | 31 % | -0.042 | -610.2 | -3.45 | -247.0 / -363.3 | 0.92 | 688.8 |
| Asian Range Fade | EURUSD | 2143 | 29 % | -0.139 | -297.7 | -3.47 | -179.2 / -118.5 | 0.85 | 311.0 |
| Power of Three | EURUSD | 695 | 25 % | -0.239 | -165.9 | -3.55 | -83.2 / -82.7 | 0.73 | 183.5 |
| NWOG (New Week Opening Gap) | EURUSD | 415 | 28 % | -0.489 | -203.1 | -4.39 | -114.0 / -89.2 | 0.59 | 230.6 |
| MACD Trend | XAUUSD | 14718 | 31 % | -0.052 | -769.0 | -4.48 | -538.0 / -231.1 | 0.89 | 797.2 |
| Mitigation Block | XAUUSD | 4217 | 27 % | -0.139 | -588.2 | -4.72 | -352.9 / -235.3 | 0.85 | 659.8 |
| DMI Trend | XAUUSD | 2961 | 23 % | -0.129 | -381.2 | -5.13 | -213.6 / -167.6 | 0.72 | 383.7 |
| Unicorn Model | EURUSD | 869 | 26 % | -0.350 | -304.1 | -5.19 | -175.5 / -128.5 | 0.67 | 336.6 |
| Star Patterns | EURUSD | 2393 | 24 % | -0.204 | -488.0 | -5.77 | -248.2 / -239.8 | 0.77 | 492.3 |
| Bollinger Squeeze | EURUSD | 3738 | 24 % | -0.162 | -604.5 | -5.78 | -278.6 / -325.9 | 0.81 | 607.2 |
| DMI Trend | EURUSD | 2797 | 25 % | -0.145 | -406.2 | -6.10 | -213.3 / -193.0 | 0.68 | 407.0 |
| RSI Divergence | EURUSD | 2696 | 42 % | -0.112 | -301.0 | -6.18 | -124.2 / -176.8 | 0.74 | 308.1 |
| Gap Continuation (quotidien) | XAUUSD | 983 | 27 % | -0.482 | -473.9 | -6.76 | -189.4 / -284.5 | 0.59 | 473.9 |
| Breaker Block | EURUSD | 1345 | 28 % | -0.390 | -524.1 | -6.84 | -299.2 / -224.8 | 0.65 | 533.1 |
| CBDR (Central Bank Dealer Range) | EURUSD | 1218 | 28 % | -0.426 | -519.1 | -6.89 | -227.8 / -291.3 | 0.62 | 523.2 |
| NDOG (New Day Opening Gap) | XAUUSD | 987 | 26 % | -0.486 | -479.4 | -7.39 | -122.7 / -356.8 | 0.58 | 484.4 |
| Equal Highs / Equal Lows | XAUUSD | 3845 | 29 % | -0.285 | -1094.3 | -8.27 | -406.3 / -688.0 | 0.73 | 1102.7 |
| MACD Trend | EURUSD | 15464 | 29 % | -0.127 | -1962.8 | -11.41 | -990.2 / -972.6 | 0.76 | 1973.6 |
| Mitigation Block | EURUSD | 4326 | 26 % | -0.429 | -1857.3 | -13.56 | -981.5 / -875.8 | 0.61 | 1866.0 |
| Equal Highs / Equal Lows | EURUSD | 4485 | 27 % | -0.854 | -3831.4 | -23.15 | -1722.1 / -2109.3 | 0.43 | 3841.9 |

