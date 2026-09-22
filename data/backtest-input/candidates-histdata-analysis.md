# Candidates sur l'historique long HistData (2011-2025) : FVG US100+XAUUSD, RSI(2) US500, contre le combo actuel

Même script que `candidates-2026-analysis.md` (`--histdata`) : vrai `LiveStrategyEngine` et vraie classe `DailyAlertEngine`, garde-fou du bot, FTMO 1-Step réel simulé par événements, spread par défaut + swap réel d'aujourd'hui. **Aucun réglage refait** : RRR figés (C : US100 1:5 / XAUUSD 1:7 ; C0 : RRR actuels 5/4), combo = config de production.

**Ce que vaut ce test.** Les filtres FVG et les RRR ont été mis au point sur 2019-2025 : **2011-2018 n'a jamais servi à aucun choix**, c'est le vrai test hors échantillon. 2019-2025 est montré pour la continuité (déjà vu pendant la mise au point).

**Limites propres à cette source** : prix HistData.com (pas le flux du broker) ; **bougies M15 seulement**, donc règlement M15 avec le stop d'abord quand stop et cible sont touchés dans la même bougie - nettement plus pessimiste que le M1 exact (voir calibration en fin de rapport) : lire les écarts entre variantes plus que les niveaux ; swap d'aujourd'hui (taux proches de 0 en 2011-2021 : coût de l'achat surestimé) ; perte quotidienne FTMO sur le P&L clôturé.

## 1. R net par année (garde-fou du bot, compte continu)

| Année | A : trades | C0 : trades | C : trades | R : trades | C+R : trades | A : R net | C0 : R net | C : R net | R : R net | C+R : R net |
|---|---|---|---|---|---|---|---|---|---|---|
| 2011 | 466 | 95 | 91 | 0 | 91 | -163.3 | -54.9 | -49.1 | +0.0 | -49.1 |
| 2012 | 496 | 128 | 124 | 11 | 135 | -108.3 | -43.0 | -41.1 | +0.8 | -40.3 |
| 2013 | 424 | 99 | 99 | 8 | 107 | -21.9 | -16.7 | -5.6 | +1.0 | -4.6 |
| 2014 | 436 | 137 | 134 | 10 | 144 | -40.6 | -36.2 | -49.9 | +0.5 | -49.4 |
| 2015 | 479 | 111 | 110 | 10 | 120 | -33.0 | -30.9 | -10.4 | -0.2 | -10.6 |
| 2016 | 475 | 111 | 110 | 7 | 117 | -134.9 | -35.4 | -23.8 | +0.5 | -23.3 |
| 2017 | 435 | 118 | 117 | 8 | 125 | -82.5 | -26.6 | -16.3 | +2.7 | -13.6 |
| 2018 | 505 | 137 | 136 | 11 | 147 | +34.5 | +1.4 | -4.1 | -1.4 | -5.4 |
| 2019 (vu) | 497 | 140 | 136 | 8 | 144 | -38.8 | -34.8 | -54.2 | -0.0 | -54.2 |
| 2020 (vu) | 526 | 157 | 154 | 8 | 161 | +52.0 | +45.7 | +43.5 | -1.7 | +42.7 |
| 2021 (vu) | 499 | 152 | 151 | 12 | 163 | -23.8 | -23.3 | -22.2 | +3.9 | -18.3 |
| 2022 (vu) | 505 | 144 | 144 | 2 | 146 | +45.0 | -1.4 | -1.4 | -1.0 | -2.4 |
| 2023 (vu) | 476 | 139 | 134 | 12 | 145 | +20.8 | -20.8 | -38.6 | +0.2 | -38.5 |
| 2024 (vu) | 512 | 175 | 172 | 14 | 186 | +19.6 | -11.1 | -5.7 | +3.7 | -1.9 |
| 2025 (vu) | 522 | 164 | 162 | 10 | 172 | +6.2 | +56.3 | +59.9 | +1.8 | +61.7 |

### Hors échantillon 2011-2018 (jamais vu)

| Variante | Trades | Win rate | RRR réalisé | R net | R/trade | t | Années positives |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 3716 | 23 % | 2.72 | -550.1 | -0.148 | -4.75 | 1 / 8 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 936 | 17 % | 3.47 | -242.3 | -0.259 | -3.88 | 1 / 8 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 921 | 16 % | 4.00 | -200.1 | -0.217 | -2.90 | 0 / 8 |
| R. RSI(2) US500 | 65 | 71 % | 0.59 | +3.8 | +0.059 | 1.09 | 5 / 8 |
| C+R. FVG + RSI(2) | 986 | 20 % | 3.16 | -196.3 | -0.199 | -2.84 | 0 / 8 |

### Part de chaque paire (C, trades isolés, 2011-2018)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 680 | 15 % | -235.0 |
| XAUUSD | 277 | 21 % | +30.4 |

## 2. FTMO 1-Step (+10 %) : réussis / ratés par année (cycles remis à zéro le 1er janvier)

### Risque 0.5 % par trade

| Année | A | C0 | C | R | C+R |
|---|---|---|---|---|---|
| 2011 | 0 / 8 | 0 / 2 | 0 / 2 | 0 / 0 | 0 / 2 |
| 2012 | 0 / 7 | 0 / 2 | 0 / 2 | 0 / 0 | 0 / 2 |
| 2013 | 0 / 3 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2014 | 2 / 5 | 0 / 2 | 0 / 3 | 0 / 0 | 0 / 3 |
| 2015 | 3 / 5 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2016 | 0 / 7 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2017 | 0 / 5 | 0 / 2 | 1 / 2 | 0 / 0 | 0 / 1 |
| 2018 | 2 / 2 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2019 (vu) | 3 / 6 | 0 / 2 | 0 / 3 | 0 / 0 | 0 / 3 |
| 2020 (vu) | 2 / 3 | 3 / 1 | 2 / 1 | 0 / 0 | 2 / 1 |
| 2021 (vu) | 3 / 5 | 0 / 2 | 0 / 2 | 0 / 0 | 0 / 2 |
| 2022 (vu) | 3 / 2 | 1 / 2 | 1 / 2 | 0 / 0 | 1 / 2 |
| 2023 (vu) | 3 / 2 | 0 / 2 | 0 / 2 | 0 / 0 | 0 / 2 |
| 2024 (vu) | 5 / 5 | 1 / 1 | 1 / 1 | 0 / 0 | 1 / 1 |
| 2025 (vu) | 2 / 3 | 2 / 0 | 2 / 0 | 0 / 0 | 2 / 0 |
| **Total 2011-2018** | **7 / 42** | **0 / 12** | **1 / 13** | **0 / 0** | **0 / 12** |

### Risque 1 % par trade

| Année | A | C0 | C | R | C+R |
|---|---|---|---|---|---|
| 2011 | 2 / 17 | 0 / 6 | 0 / 6 | 0 / 0 | 0 / 6 |
| 2012 | 3 / 15 | 1 / 6 | 1 / 6 | 0 / 0 | 1 / 6 |
| 2013 | 3 / 11 | 1 / 3 | 3 / 4 | 0 / 0 | 2 / 3 |
| 2014 | 8 / 15 | 1 / 6 | 1 / 7 | 0 / 0 | 1 / 7 |
| 2015 | 8 / 15 | 0 / 4 | 0 / 4 | 0 / 0 | 1 / 4 |
| 2016 | 4 / 19 | 0 / 4 | 2 / 5 | 0 / 0 | 2 / 5 |
| 2017 | 3 / 14 | 1 / 5 | 1 / 5 | 0 / 0 | 1 / 5 |
| 2018 | 9 / 13 | 3 / 4 | 3 / 5 | 0 / 0 | 4 / 6 |
| 2019 (vu) | 7 / 15 | 1 / 6 | 2 / 8 | 0 / 0 | 2 / 8 |
| 2020 (vu) | 14 / 12 | 6 / 3 | 7 / 4 | 0 / 0 | 7 / 4 |
| 2021 (vu) | 7 / 14 | 2 / 5 | 2 / 4 | 0 / 0 | 2 / 4 |
| 2022 (vu) | 9 / 10 | 3 / 5 | 3 / 5 | 0 / 0 | 2 / 5 |
| 2023 (vu) | 9 / 11 | 1 / 5 | 2 / 7 | 0 / 0 | 1 / 6 |
| 2024 (vu) | 10 / 13 | 3 / 6 | 4 / 6 | 0 / 0 | 4 / 5 |
| 2025 (vu) | 8 / 12 | 6 / 2 | 7 / 3 | 0 / 0 | 7 / 3 |
| **Total 2011-2018** | **40 / 119** | **7 / 38** | **11 / 42** | **0 / 0** | **12 / 42** |

## 3. FTMO enchaîné sur toute la période hors échantillon (2011-2018), par risque

Les cycles s'enchaînent sans remise à zéro annuelle. Meilleur % : réussis − ratés, puis le moins de ratés.

| Variante | Risque | Réussis | Ratés | Durée médiane d'un cycle réussi (jours) | Pire baisse du compte continu | Compte continu |
|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 2 | 21 | 359 | 84.4 % | -81.8 % |
| A. Combo actuel | 0.5 % | 9 | 42 | 34 | 95.8 % | -94.7 % |
| A. Combo actuel | 0.75 % | 21 | 81 | 29 | 99.2 % | -98.9 % |
| A. Combo actuel | 1 % | 40 | 120 | 8 | 99.8 % | -99.6 % |
| A. Combo actuel | 1.25 % | 59 | 162 | 7 | 99.9 % | -99.9 % |
| A. Combo actuel | 1.5 % | 72 | 182 | 7 | 100.0 % | -100.0 % |
| A. Combo actuel | 2 % | 117 | 271 | 6 | 100.0 % | -100.0 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.3 % | 0 | 7 | — | 54.5 % | -52.5 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.5 % | 0 | 16 | — | 73.5 % | -71.6 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.75 % | 2 | 28 | 197 | 86.7 % | -85.4 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1 % | 8 | 41 | 36 | 94.2 % | -93.3 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1.25 % | 14 | 57 | 31 | 97.3 % | -96.7 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1.5 % | 18 | 69 | 20 | 98.7 % | -98.4 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2 % | 27 | 94 | 16 | 99.6 % | -99.4 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.3 % | 0 | 7 | — | 48.7 % | -46.2 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.5 % | 1 | 14 | 154 | 67.7 % | -65.2 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.75 % | 8 | 30 | 44 | 82.2 % | -80.3 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1 % | 12 | 43 | 32 | 91.7 % | -90.2 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.25 % | 17 | 58 | 31 | 95.6 % | -94.7 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.5 % | 27 | 73 | 19 | 97.7 % | -97.2 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2 % | 38 | 102 | 15 | 98.6 % | -98.2 % |
| R. RSI(2) US500 | 0.3 % | 0 | 0 | — | 0.5 % | +1.1 % |
| R. RSI(2) US500 | 0.5 % | 0 | 0 | — | 0.9 % | +1.9 % |
| R. RSI(2) US500 | 0.75 % | 0 | 0 | — | 1.4 % | +2.9 % |
| R. RSI(2) US500 | 1 % | 0 | 0 | — | 1.8 % | +3.8 % |
| R. RSI(2) US500 | 1.25 % | 0 | 0 | — | 2.3 % | +4.8 % |
| R. RSI(2) US500 | 1.5 % | 0 | 0 | — | 2.7 % | +5.7 % |
| R. RSI(2) US500 | 2 % | 1 | 0 | 2163 | 4.0 % | +5.1 % |
| C+R. FVG + RSI(2) | 0.3 % | 0 | 7 | — | 48.1 % | -45.6 % |
| C+R. FVG + RSI(2) | 0.5 % | 1 | 15 | 147 | 67.1 % | -64.6 % |
| C+R. FVG + RSI(2) | 0.75 % | 7 | 29 | 44 | 81.7 % | -79.8 % |
| C+R. FVG + RSI(2) | 1 % | 13 | 43 | 32 | 91.2 % | -89.7 % |
| C+R. FVG + RSI(2) | 1.25 % | 16 | 59 | 30 | 95.3 % | -94.3 % |
| C+R. FVG + RSI(2) | 1.5 % | 26 | 74 | 20 | 97.5 % | -96.9 % |
| C+R. FVG + RSI(2) | 2 % | 38 | 100 | 20 | 98.5 % | -98.0 % |

## 4. RRR par année (trades isolés, R net) - le choix 1:5 / 1:7 tient-il avant 2019 ?

### US100

| RRR | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total 2011-2018 |
|---|---|---|---|---|---|---|---|---|---|
| 1:2 | -35.9 | -22.9 | -24.6 | -53.6 | -37.6 | -29.1 | -25.7 | -24.2 | **-253.7** |
| 1:3 | -46.9 | -27.8 | -37.5 | -62.6 | -41.6 | -13.2 | -13.7 | -1.1 | **-244.4** |
| 1:4 | -50.0 | -20.9 | -28.5 | -65.0 | -46.2 | -27.7 | -25.8 | +18.2 | **-246.0** |
| 1:5 | -55.1 | -27.0 | -30.4 | -61.0 | -52.9 | -17.5 | -14.5 | +23.4 | **-235.0** |
| 1:6 | -59.1 | -29.4 | -37.1 | -62.4 | -45.9 | -4.0 | -5.5 | +43.4 | **-200.1** |
| 1:7 | -64.3 | -31.7 | -35.4 | -62.6 | -38.9 | -8.4 | -9.6 | +31.2 | **-219.8** |

### XAUUSD

| RRR | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total 2011-2018 |
|---|---|---|---|---|---|---|---|---|---|
| 1:2 | -10.4 | -15.1 | +4.8 | +10.4 | +13.9 | -9.3 | -16.6 | -10.3 | **-32.6** |
| 1:3 | -1.8 | -4.7 | +6.7 | +19.3 | +7.2 | -11.4 | -13.5 | -9.4 | **-7.8** |
| 1:4 | -4.4 | -14.6 | +12.0 | +21.3 | +18.4 | -12.2 | -16.8 | -15.4 | **-11.8** |
| 1:5 | +1.5 | -7.7 | +15.3 | +15.7 | +27.5 | -6.2 | -12.9 | -24.3 | **+8.8** |
| 1:6 | -1.2 | -7.8 | +23.3 | +10.4 | +30.9 | -4.1 | -9.4 | -21.9 | **+20.2** |
| 1:7 | +1.4 | -12.7 | +23.1 | +7.6 | +38.9 | -0.6 | -6.5 | -20.9 | **+30.4** |

## 5. Calibration : HistData M15 contre broker M1 exact (2023-2025)

Même moteur, mêmes années ; seules la source des prix et la façon de régler changent. R net au garde-fou du bot. Chiffres broker : `candidates-<année>-analysis.md`. Lancer les deux bornes (`--histdata` et `--histdata --optimiste`) pour situer le vrai chiffre.

| Variante | Année | HistData M15 (cette borne) | Broker M1 exact |
|---|---|---|---|
| A. Combo actuel | 2023 | +20.8 | +72.6 |
| A. Combo actuel | 2024 | +19.6 | +3.9 |
| A. Combo actuel | 2025 | +6.2 | +79.5 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2023 | -20.8 | +77.6 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2024 | -11.1 | +24.4 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2025 | +56.3 | +62.6 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2023 | -38.6 | +67.4 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2024 | -5.7 | +35.5 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2025 | +59.9 | +71.7 |
| R. RSI(2) US500 | 2024 | +3.7 | +3.2 |
| C+R. FVG + RSI(2) | 2023 | -38.5 | +66.9 |
| C+R. FVG + RSI(2) | 2024 | -1.9 | +38.7 |
| C+R. FVG + RSI(2) | 2025 | +61.7 | +73.5 |
