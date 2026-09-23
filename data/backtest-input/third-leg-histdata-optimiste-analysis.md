# 3e jambe pour FVG US100 1:5 + XAUUSD 1:7 : HistData 2011-2018 (borne optimiste)

Même moteur et même règlement que `candidates-histdata-analysis.md` (`--troisieme`). Chaque jambe = une stratégie du bot sur une paire, config de production, aucun réglage refait. « Avec C » = C et la jambe dans le **même moteur** (une seule position par paire, comme en production) et le **même garde-fou** (3 trades/jour partagés, pause 30 min), donc la jambe peut prendre la place d'un trade FVG.

**2011-2018 n'a servi à aucun choix** (ni FVG, ni les autres stratégies, mises au point sur 2019+). Règlement M15 : lire les deux bornes (`third-leg-histdata-analysis.md` / `-optimiste`), le vrai chiffre est entre les deux.

## 1. Chaque jambe seule (trades isolés, R net avec spread + swap)

| Jambe | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total | Trades | Win rate | R/trade | t |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| *Réf. FVG US100 1:5* | -25.1 | +5.5 | -20.0 | -21.6 | +55.1 | +6.5 | +21.5 | +125.4 | **+147.2** | 680 | 24 % | +0.216 | 2.07 |
| *Réf. FVG XAUUSD 1:7* | +1.3 | -5.2 | +31.1 | +24.0 | +38.9 | +8.0 | -6.5 | -20.9 | **+70.6** | 277 | 22 % | +0.255 | 1.60 |
| FVG US500 | +3.5 | +12.3 | +2.8 | +29.0 | +33.2 | +10.8 | +16.1 | +22.8 | **+130.5** | 273 | 28 % | +0.478 | 1.79 |
| Weekly Sweep US500 | -10.8 | +29.4 | -5.9 | -12.4 | +33.2 | -9.7 | +26.8 | +11.2 | **+61.8** | 366 | 22 % | +0.169 | 1.33 |
| CBDR US100 | +12.0 | -8.4 | +7.0 | +6.5 | +12.9 | +7.2 | +2.6 | -4.3 | **+35.5** | 353 | 32 % | +0.101 | 1.04 |
| NWOG US100 | +0.5 | -7.2 | -1.2 | -0.4 | +10.4 | -0.8 | -7.7 | +26.9 | **+20.6** | 114 | 23 % | +0.181 | 0.77 |
| Silver Bullet US500 | -10.9 | -27.1 | +16.8 | +17.4 | +0.2 | -25.4 | -1.1 | +42.3 | **+12.3** | 627 | 30 % | +0.020 | 0.22 |
| Judas Swing EURUSD | -2.8 | -5.0 | +20.7 | -2.5 | +14.0 | -38.3 | +7.8 | +15.0 | **+8.8** | 741 | 29 % | +0.012 | 0.15 |
| RSI(2) US500 | +0.0 | +0.8 | +1.0 | +0.5 | -0.2 | +0.5 | +2.7 | -1.4 | **+3.8** | 65 | 71 % | +0.059 | 1.09 |
| Silver Bullet US100 | -1.6 | -2.9 | +0.2 | +16.6 | -22.6 | -19.7 | -19.3 | +31.8 | **-17.5** | 612 | 29 % | -0.029 | -0.17 |
| Divergence US100/US500 | -21.2 | -61.3 | -19.5 | -8.0 | -28.3 | -46.7 | -10.4 | +19.4 | **-176.0** | 923 | 26 % | -0.191 | -3.35 |

## 2. C + la jambe (même moteur, même garde-fou) : R net par année

| Variante | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total | Écart avec C |
|---|---|---|---|---|---|---|---|---|---|---|
| **C seul** | -15.7 | -5.9 | +9.2 | +4.7 | +92.7 | +7.7 | +19.7 | +95.2 | **+207.6** | — |
| C + FVG US500 | -20.6 | +6.4 | -1.4 | +17.0 | +111.4 | +20.7 | +36.9 | +111.9 | **+282.4** | +74.8 |
| C + Weekly Sweep US500 | -25.3 | +23.4 | -1.5 | -7.7 | +125.9 | -0.9 | +46.5 | +107.5 | **+267.9** | +60.3 |
| C + CBDR US100 | -2.4 | -17.9 | +19.2 | +10.1 | +105.1 | +15.2 | +23.7 | +73.9 | **+226.9** | +19.3 |
| C + NWOG US100 | -13.9 | -14.6 | +9.2 | +4.3 | +103.1 | +6.9 | +4.5 | +123.3 | **+222.8** | +15.2 |
| C + Silver Bullet US500 | -28.2 | -30.8 | +19.7 | +17.6 | +91.8 | -13.4 | +16.2 | +138.9 | **+211.8** | +4.2 |
| C + Judas Swing EURUSD | -18.5 | -12.4 | +29.9 | +0.6 | +109.9 | -28.4 | +28.6 | +110.2 | **+219.9** | +12.3 |
| C + RSI(2) US500 | -15.7 | -5.1 | +10.2 | +5.2 | +92.4 | +8.1 | +22.4 | +93.9 | **+211.4** | +3.8 |
| C + Silver Bullet US100 | -25.9 | -3.1 | +20.1 | +22.2 | +74.4 | -9.5 | +3.8 | +130.9 | **+212.9** | +5.3 |
| C + Divergence US100/US500 | -30.8 | -53.1 | -3.4 | -3.1 | +55.6 | -43.4 | +4.2 | +94.5 | **+20.4** | -187.1 |

## 3. FTMO 1-Step (+10 %) : réussis / ratés, cycles remis à zéro le 1er janvier, total des années

Pire baisse = pire baisse du compte continu sur une année (au risque indiqué).

| Variante | 0.5 % : réussis / ratés | 0.75 % : réussis / ratés | 1 % : réussis / ratés | 0.5 % : pire baisse | 0.75 % : pire baisse | 1 % : pire baisse |
|---|---|---|---|---|---|---|
| **C seul** | 11 / 5 | 20 / 11 | 32 / 24 | 13.6 % | 19.9 % | 25.9 % |
| C + FVG US500 | 15 / 7 | 27 / 15 | 42 / 32 | 18.8 % | 27.1 % | 34.7 % |
| C + Weekly Sweep US500 | 18 / 8 | 29 / 18 | 39 / 29 | 23.6 % | 33.4 % | 41.3 % |
| C + CBDR US100 | 13 / 6 | 21 / 14 | 36 / 23 | 19.3 % | 27.8 % | 35.5 % |
| C + NWOG US100 | 12 / 6 | 19 / 12 | 34 / 28 | 14.9 % | 21.8 % | 28.3 % |
| C + Silver Bullet US500 | 16 / 10 | 27 / 21 | 41 / 36 | 21.4 % | 30.8 % | 38.6 % |
| C + Judas Swing EURUSD | 13 / 9 | 27 / 20 | 41 / 36 | 18.9 % | 27.2 % | 38.9 % |
| C + RSI(2) US500 | 12 / 5 | 20 / 11 | 31 / 22 | 13.6 % | 19.6 % | 25.4 % |
| C + Silver Bullet US100 | 13 / 7 | 26 / 20 | 35 / 33 | 18.4 % | 26.4 % | 32.8 % |
| C + Divergence US100/US500 | 8 / 12 | 20 / 28 | 32 / 45 | 29.3 % | 39.6 % | 50.7 % |
