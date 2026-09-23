# 3e jambe pour FVG US100 1:5 + XAUUSD 1:7 : HistData 2011-2018 (borne pessimiste)

Même moteur et même règlement que `candidates-histdata-analysis.md` (`--troisieme`). Chaque jambe = une stratégie du bot sur une paire, config de production, aucun réglage refait. « Avec C » = C et la jambe dans le **même moteur** (une seule position par paire, comme en production) et le **même garde-fou** (3 trades/jour partagés, pause 30 min), donc la jambe peut prendre la place d'un trade FVG.

**2011-2018 n'a servi à aucun choix** (ni FVG, ni les autres stratégies, mises au point sur 2019+). Règlement M15 : lire les deux bornes (`third-leg-histdata-analysis.md` / `-optimiste`), le vrai chiffre est entre les deux.

## 1. Chaque jambe seule (trades isolés, R net avec spread + swap)

| Jambe | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total | Trades | Win rate | R/trade | t |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| *Réf. FVG US100 1:5* | -55.1 | -27.0 | -30.4 | -61.0 | -52.9 | -17.5 | -14.5 | +23.4 | **-235.0** | 680 | 15 % | -0.346 | -4.53 |
| *Réf. FVG XAUUSD 1:7* | +1.4 | -12.7 | +23.1 | +7.6 | +38.9 | -0.6 | -6.5 | -20.9 | **+30.4** | 277 | 21 % | +0.110 | 0.78 |
| Weekly Sweep US500 | -17.1 | +23.4 | -5.9 | -12.8 | +27.0 | -9.7 | +26.8 | +11.2 | **+42.9** | 366 | 22 % | +0.117 | 0.94 |
| NWOG US100 | -5.5 | -7.2 | -1.2 | -0.4 | +10.4 | -0.8 | -7.7 | +26.9 | **+14.6** | 114 | 22 % | +0.128 | 0.55 |
| RSI(2) US500 | +0.0 | +0.8 | +1.0 | +0.5 | -0.2 | +0.5 | +2.7 | -1.4 | **+3.8** | 65 | 71 % | +0.059 | 1.09 |
| FVG US500 | -8.7 | +0.3 | -8.4 | +5.6 | -8.8 | +4.8 | +10.1 | +4.8 | **-0.3** | 273 | 20 % | -0.001 | -0.80 |
| CBDR US100 | +12.0 | -12.4 | +3.0 | -1.5 | +16.9 | -0.8 | -5.4 | -12.3 | **-0.5** | 353 | 29 % | -0.001 | 0.02 |
| Silver Bullet US500 | -23.2 | -31.1 | +0.8 | +13.4 | -4.1 | -33.4 | -5.2 | +21.2 | **-61.7** | 627 | 27 % | -0.098 | -1.55 |
| Judas Swing EURUSD | -26.8 | -13.0 | +12.7 | -6.5 | +6.0 | -38.3 | -4.2 | +3.0 | **-67.2** | 741 | 26 % | -0.091 | -1.44 |
| Silver Bullet US100 | -14.3 | -5.8 | -7.8 | +16.6 | -22.0 | -31.7 | -18.2 | +11.7 | **-71.5** | 612 | 27 % | -0.117 | -1.67 |
| Divergence US100/US500 | -23.5 | -61.3 | -19.5 | -8.0 | -28.3 | -46.7 | -10.0 | +19.4 | **-178.0** | 923 | 26 % | -0.193 | -3.34 |

## 2. C + la jambe (même moteur, même garde-fou) : R net par année

| Variante | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total | Écart avec C |
|---|---|---|---|---|---|---|---|---|---|---|
| **C seul** | -49.1 | -41.1 | -5.6 | -49.9 | -10.4 | -23.8 | -16.3 | -4.1 | **-200.1** | — |
| C + Weekly Sweep US500 | -65.0 | -17.7 | -16.3 | -62.7 | +16.7 | -32.4 | +10.5 | +8.2 | **-158.7** | +41.4 |
| C + NWOG US100 | -53.3 | -48.3 | -5.5 | -50.3 | +0.1 | -24.6 | -25.5 | +24.0 | **-183.4** | +16.7 |
| C + RSI(2) US500 | -49.1 | -40.3 | -4.6 | -49.4 | -10.6 | -23.3 | -13.6 | -5.4 | **-196.3** | +3.8 |
| C + FVG US500 | -61.5 | -40.8 | -21.3 | -52.8 | -21.6 | -17.9 | -6.2 | -5.4 | **-227.4** | -27.3 |
| C + CBDR US100 | -35.8 | -55.9 | -0.4 | -52.5 | +6.1 | -21.9 | -23.1 | -29.4 | **-213.0** | -12.9 |
| C + Silver Bullet US500 | -73.9 | -70.0 | -7.1 | -41.8 | -15.6 | -55.9 | -27.9 | +16.5 | **-275.7** | -75.6 |
| C + Judas Swing EURUSD | -75.9 | -54.1 | +7.1 | -59.0 | -1.2 | -60.9 | -19.4 | -1.1 | **-264.5** | -64.4 |
| C + Silver Bullet US100 | -60.0 | -44.1 | -5.4 | -33.4 | -29.8 | -42.2 | -27.6 | +15.5 | **-227.0** | -26.9 |
| C + Divergence US100/US500 | -73.6 | -89.5 | -22.3 | -49.5 | -41.5 | -70.9 | -28.7 | +2.2 | **-373.7** | -173.7 |

## 3. FTMO 1-Step (+10 %) : réussis / ratés, cycles remis à zéro le 1er janvier, total des années

Pire baisse = pire baisse du compte continu sur une année (au risque indiqué).

| Variante | 0.5 % : réussis / ratés | 0.75 % : réussis / ratés | 1 % : réussis / ratés | 0.5 % : pire baisse | 0.75 % : pire baisse | 1 % : pire baisse |
|---|---|---|---|---|---|---|
| **C seul** | 1 / 13 | 6 / 27 | 11 / 42 | 26.4 % | 37.1 % | 48.9 % |
| C + Weekly Sweep US500 | 3 / 15 | 13 / 34 | 20 / 50 | 32.1 % | 44.4 % | 57.9 % |
| C + NWOG US100 | 2 / 14 | 7 / 30 | 15 / 45 | 26.7 % | 37.5 % | 49.3 % |
| C + RSI(2) US500 | 0 / 12 | 4 / 26 | 12 / 42 | 26.6 % | 37.4 % | 48.5 % |
| C + FVG US500 | 1 / 16 | 6 / 32 | 15 / 49 | 29.8 % | 41.4 % | 52.5 % |
| C + CBDR US100 | 1 / 16 | 8 / 31 | 15 / 49 | 27.5 % | 38.6 % | 49.7 % |
| C + Silver Bullet US500 | 2 / 20 | 10 / 38 | 16 / 55 | 31.8 % | 43.9 % | 54.3 % |
| C + Judas Swing EURUSD | 2 / 18 | 7 / 38 | 19 / 62 | 34.9 % | 47.7 % | 56.9 % |
| C + Silver Bullet US100 | 2 / 17 | 6 / 35 | 15 / 51 | 30.2 % | 41.9 % | 52.7 % |
| C + Divergence US100/US500 | 1 / 25 | 4 / 43 | 12 / 64 | 39.6 % | 52.4 % | 64.5 % |
