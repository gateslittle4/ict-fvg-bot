# Candidates sur l'historique long HistData (2011-2025) : FVG US100+XAUUSD, RSI(2) US500, contre le combo actuel

**Borne OPTIMISTE** (`--optimiste`) : la bougie M15 d'entrée est ignorée pour le stop et la cible. La borne pessimiste (stop d'abord dans cette bougie) est dans `candidates-histdata-analysis.md` ; le M1 exact est entre les deux.

Même script que `candidates-2026-analysis.md` (`--histdata`) : vrai `LiveStrategyEngine` et vraie classe `DailyAlertEngine`, garde-fou du bot, FTMO 1-Step réel simulé par événements, spread par défaut + swap réel d'aujourd'hui. **Aucun réglage refait** : RRR figés (C : US100 1:5 / XAUUSD 1:7 ; C0 : RRR actuels 5/4), combo = config de production.

**Ce que vaut ce test.** Les filtres FVG et les RRR ont été mis au point sur 2019-2025 : **2011-2018 n'a jamais servi à aucun choix**, c'est le vrai test hors échantillon. 2019-2025 est montré pour la continuité (déjà vu pendant la mise au point).

**Limites propres à cette source** : prix HistData.com (pas le flux du broker) ; **bougies M15 seulement**, donc règlement M15 avec le stop d'abord quand stop et cible sont touchés dans la même bougie - nettement plus pessimiste que le M1 exact (voir calibration en fin de rapport) : lire les écarts entre variantes plus que les niveaux ; swap d'aujourd'hui (taux proches de 0 en 2011-2021 : coût de l'achat surestimé) ; perte quotidienne FTMO sur le P&L clôturé.

## 1. R net par année (garde-fou du bot, compte continu)

| Année | A : trades | C0 : trades | C : trades | R : trades | C+R : trades | A : R net | C0 : R net | C : R net | R : R net | C+R : R net |
|---|---|---|---|---|---|---|---|---|---|---|
| 2011 | 459 | 92 | 88 | 0 | 88 | -67.9 | -21.5 | -15.7 | +0.0 | -15.7 |
| 2012 | 493 | 127 | 123 | 11 | 134 | -42.5 | -5.5 | -5.9 | +0.8 | -5.1 |
| 2013 | 423 | 97 | 97 | 8 | 105 | +31.2 | -4.9 | +9.2 | +1.0 | +10.2 |
| 2014 | 435 | 133 | 130 | 10 | 140 | +38.8 | +16.9 | +4.7 | +0.5 | +5.2 |
| 2015 | 477 | 110 | 109 | 10 | 119 | +97.1 | +72.1 | +92.7 | -0.2 | +92.4 |
| 2016 | 474 | 112 | 111 | 7 | 118 | -107.0 | -2.5 | +7.7 | +0.5 | +8.1 |
| 2017 | 434 | 118 | 117 | 8 | 125 | -31.9 | +9.4 | +19.7 | +2.7 | +22.4 |
| 2018 | 501 | 134 | 133 | 11 | 144 | +178.1 | +100.7 | +95.2 | -1.4 | +93.9 |
| 2019 (vu) | 498 | 139 | 135 | 8 | 143 | +113.8 | +92.5 | +73.1 | -0.0 | +73.1 |
| 2020 (vu) | 525 | 154 | 151 | 8 | 159 | +211.2 | +137.2 | +130.1 | -1.7 | +128.4 |
| 2021 (vu) | 497 | 148 | 147 | 12 | 159 | +178.0 | +137.2 | +138.3 | +3.9 | +142.2 |
| 2022 (vu) | 498 | 140 | 140 | 2 | 142 | +204.6 | +111.0 | +111.0 | -1.0 | +110.0 |
| 2023 (vu) | 480 | 137 | 132 | 12 | 143 | +189.2 | +129.5 | +101.5 | +0.2 | +101.6 |
| 2024 (vu) | 511 | 171 | 168 | 14 | 182 | +208.1 | +149.4 | +162.8 | +3.7 | +166.6 |
| 2025 (vu) | 524 | 160 | 158 | 10 | 168 | +190.2 | +156.7 | +160.4 | +1.8 | +162.2 |

### Hors échantillon 2011-2018 (jamais vu)

| Variante | Trades | Win rate | RRR réalisé | R net | R/trade | t | Années positives |
|---|---|---|---|---|---|---|---|
| A. Combo actuel | 3696 | 27 % | 2.79 | +95.8 | +0.026 | 0.78 | 4 / 8 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 923 | 25 % | 3.61 | +164.7 | +0.178 | 2.27 | 4 / 8 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 908 | 24 % | 4.05 | +207.6 | +0.229 | 2.64 | 6 / 8 |
| R. RSI(2) US500 | 65 | 71 % | 0.59 | +3.8 | +0.059 | 1.09 | 5 / 8 |
| C+R. FVG + RSI(2) | 973 | 27 % | 3.43 | +211.4 | +0.217 | 2.68 | 6 / 8 |

### Part de chaque paire (C, trades isolés, 2011-2018)

| Paire | Trades | Win rate | R net |
|---|---|---|---|
| US100 | 680 | 24 % | +147.2 |
| XAUUSD | 277 | 22 % | +70.6 |

## 2. FTMO 1-Step (+10 %) : réussis / ratés par année (cycles remis à zéro le 1er janvier)

### Risque 0.5 % par trade

| Année | A | C0 | C | R | C+R |
|---|---|---|---|---|---|
| 2011 | 2 / 6 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2012 | 1 / 4 | 0 / 1 | 0 / 1 | 0 / 0 | 0 / 1 |
| 2013 | 3 / 3 | 0 / 1 | 1 / 1 | 0 / 0 | 1 / 1 |
| 2014 | 3 / 3 | 1 / 0 | 1 / 1 | 0 / 0 | 1 / 1 |
| 2015 | 6 / 1 | 3 / 0 | 4 / 0 | 0 / 0 | 4 / 0 |
| 2016 | 0 / 6 | 1 / 1 | 1 / 1 | 0 / 0 | 1 / 1 |
| 2017 | 2 / 4 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 |
| 2018 | 8 / 0 | 4 / 0 | 4 / 0 | 0 / 0 | 4 / 0 |
| 2019 (vu) | 6 / 2 | 4 / 0 | 3 / 0 | 0 / 0 | 3 / 0 |
| 2020 (vu) | 12 / 2 | 7 / 1 | 6 / 1 | 0 / 0 | 6 / 1 |
| 2021 (vu) | 8 / 0 | 6 / 0 | 6 / 0 | 0 / 0 | 6 / 0 |
| 2022 (vu) | 9 / 0 | 5 / 0 | 5 / 0 | 0 / 0 | 5 / 0 |
| 2023 (vu) | 9 / 0 | 6 / 0 | 4 / 0 | 0 / 0 | 4 / 0 |
| 2024 (vu) | 10 / 1 | 7 / 0 | 8 / 0 | 0 / 0 | 8 / 0 |
| 2025 (vu) | 9 / 0 | 7 / 0 | 7 / 0 | 0 / 0 | 7 / 0 |
| **Total 2011-2018** | **25 / 27** | **9 / 4** | **11 / 5** | **0 / 0** | **12 / 5** |

### Risque 1 % par trade

| Année | A | C0 | C | R | C+R |
|---|---|---|---|---|---|
| 2011 | 6 / 14 | 0 / 3 | 1 / 3 | 0 / 0 | 1 / 3 |
| 2012 | 5 / 14 | 1 / 3 | 3 / 5 | 0 / 0 | 3 / 5 |
| 2013 | 7 / 8 | 2 / 3 | 3 / 4 | 0 / 0 | 3 / 3 |
| 2014 | 9 / 10 | 3 / 3 | 3 / 4 | 0 / 0 | 3 / 4 |
| 2015 | 14 / 9 | 7 / 2 | 9 / 1 | 0 / 0 | 7 / 0 |
| 2016 | 4 / 17 | 1 / 2 | 3 / 3 | 0 / 0 | 3 / 3 |
| 2017 | 5 / 12 | 2 / 3 | 2 / 3 | 0 / 0 | 3 / 3 |
| 2018 | 17 / 5 | 9 / 1 | 8 / 1 | 0 / 0 | 8 / 1 |
| 2019 (vu) | 14 / 7 | 8 / 1 | 7 / 1 | 0 / 0 | 7 / 1 |
| 2020 (vu) | 23 / 8 | 13 / 2 | 11 / 2 | 0 / 0 | 11 / 2 |
| 2021 (vu) | 17 / 5 | 11 / 0 | 11 / 0 | 0 / 0 | 11 / 0 |
| 2022 (vu) | 19 / 6 | 9 / 1 | 9 / 1 | 0 / 0 | 9 / 1 |
| 2023 (vu) | 19 / 4 | 11 / 0 | 9 / 1 | 0 / 0 | 9 / 2 |
| 2024 (vu) | 22 / 6 | 13 / 0 | 14 / 0 | 0 / 0 | 14 / 0 |
| 2025 (vu) | 17 / 5 | 14 / 1 | 14 / 1 | 0 / 0 | 14 / 1 |
| **Total 2011-2018** | **67 / 89** | **25 / 20** | **32 / 24** | **0 / 0** | **31 / 22** |

## 3. FTMO enchaîné sur toute la période hors échantillon (2011-2018), par risque

Les cycles s'enchaînent sans remise à zéro annuelle. Meilleur % : réussis − ratés, puis le moins de ratés.

| Variante | Risque | Réussis | Ratés | Durée médiane d'un cycle réussi (jours) | Pire baisse du compte continu | Compte continu |
|---|---|---|---|---|---|---|
| A. Combo actuel | 0.3 % | 12 | 12 | 133 | 42.8 % | +26.5 % |
| A. Combo actuel | 0.5 % | 25 | 28 | 46 | 61.5 % | +31.0 % |
| A. Combo actuel | 0.75 % | 43 | 55 | 24 | 77.3 % | +18.3 % |
| A. Combo actuel | 1 % | 68 | 90 | 14 | 86.4 % | +14.1 % |
| A. Combo actuel | 1.25 % | 97 | 129 | 8 | 91.8 % | +10.3 % |
| A. Combo actuel | 1.5 % | 112 | 154 | 7 | 96.0 % | -15.1 % |
| A. Combo actuel | 2 % | 167 | 229 | 5 | 99.5 % | -90.8 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.3 % | 6 | 2 | 273 | 17.6 % | +60.1 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.5 % | 12 | 7 | 105 | 27.9 % | +113.5 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 0.75 % | 19 | 12 | 69 | 39.4 % | +199.7 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1 % | 26 | 22 | 46 | 49.4 % | +298.5 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1.25 % | 34 | 33 | 24 | 58.1 % | +429.4 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 1.5 % | 49 | 45 | 17 | 64.2 % | +599.3 % |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2 % | 63 | 67 | 15 | 68.5 % | +1345.8 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.3 % | 7 | 1 | 145 | 15.3 % | +81.3 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.5 % | 12 | 6 | 103 | 24.6 % | +161.5 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.75 % | 22 | 13 | 60 | 35.2 % | +303.2 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1 % | 31 | 25 | 28 | 44.7 % | +487.5 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.25 % | 38 | 33 | 30 | 53.2 % | +762.9 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.5 % | 49 | 46 | 15 | 59.8 % | +1140.0 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2 % | 72 | 71 | 15 | 61.7 % | +3305.0 % |
| R. RSI(2) US500 | 0.3 % | 0 | 0 | — | 0.5 % | +1.1 % |
| R. RSI(2) US500 | 0.5 % | 0 | 0 | — | 0.9 % | +1.9 % |
| R. RSI(2) US500 | 0.75 % | 0 | 0 | — | 1.4 % | +2.9 % |
| R. RSI(2) US500 | 1 % | 0 | 0 | — | 1.8 % | +3.8 % |
| R. RSI(2) US500 | 1.25 % | 0 | 0 | — | 2.3 % | +4.8 % |
| R. RSI(2) US500 | 1.5 % | 0 | 0 | — | 2.7 % | +5.7 % |
| R. RSI(2) US500 | 2 % | 1 | 0 | 2163 | 4.0 % | +5.1 % |
| C+R. FVG + RSI(2) | 0.3 % | 6 | 1 | 467 | 15.0 % | +83.4 % |
| C+R. FVG + RSI(2) | 0.5 % | 12 | 6 | 106 | 24.1 % | +166.6 % |
| C+R. FVG + RSI(2) | 0.75 % | 23 | 13 | 63 | 34.5 % | +314.8 % |
| C+R. FVG + RSI(2) | 1 % | 30 | 23 | 38 | 44.0 % | +517.0 % |
| C+R. FVG + RSI(2) | 1.25 % | 38 | 33 | 30 | 52.3 % | +817.4 % |
| C+R. FVG + RSI(2) | 1.5 % | 49 | 45 | 15 | 58.9 % | +1234.6 % |
| C+R. FVG + RSI(2) | 2 % | 72 | 72 | 13 | 60.9 % | +3658.9 % |

## 4. RRR par année (trades isolés, R net) - le choix 1:5 / 1:7 tient-il avant 2019 ?

### US100

| RRR | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total 2011-2018 |
|---|---|---|---|---|---|---|---|---|---|
| 1:2 | -8.9 | -13.9 | -12.6 | -35.6 | +25.4 | -11.1 | -7.7 | +26.8 | **-37.7** |
| 1:3 | -10.9 | -8.7 | -23.2 | -30.6 | +42.4 | +2.8 | +14.3 | +66.9 | **+53.0** |
| 1:4 | -15.0 | +0.6 | -15.2 | -30.0 | +58.8 | +2.3 | +9.2 | +108.2 | **+118.8** |
| 1:5 | -25.1 | +5.5 | -20.0 | -21.6 | +55.1 | +6.5 | +21.5 | +125.4 | **+147.2** |
| 1:6 | -31.1 | +1.2 | -33.2 | -23.1 | +73.1 | +24.0 | +27.5 | +155.4 | **+193.8** |
| 1:7 | -40.3 | -4.1 | -30.5 | -33.2 | +88.2 | +23.6 | +20.4 | +135.2 | **+159.2** |

### XAUUSD

| RRR | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | Total 2011-2018 |
|---|---|---|---|---|---|---|---|---|---|
| 1:2 | -7.4 | -12.3 | +7.8 | +22.7 | +13.9 | -3.3 | -16.6 | -10.3 | **-5.5** |
| 1:3 | -2.0 | +3.1 | +10.7 | +35.6 | +7.2 | -3.4 | -13.5 | -9.4 | **+28.3** |
| 1:4 | -4.5 | -4.8 | +17.0 | +36.2 | +18.4 | -2.2 | -16.8 | -15.4 | **+27.8** |
| 1:5 | +1.3 | -2.4 | +21.3 | +28.1 | +27.5 | +0.3 | -12.9 | -18.3 | **+44.9** |
| 1:6 | -1.4 | -1.4 | +30.3 | +24.8 | +30.9 | +3.4 | -9.4 | -21.9 | **+55.3** |
| 1:7 | +1.3 | -5.2 | +31.1 | +24.0 | +38.9 | +8.0 | -6.5 | -20.9 | **+70.6** |

## 5. Calibration : HistData M15 contre broker M1 exact (2023-2025)

Même moteur, mêmes années ; seules la source des prix et la façon de régler changent. R net au garde-fou du bot. Chiffres broker : `candidates-<année>-analysis.md`. Lancer les deux bornes (`--histdata` et `--histdata --optimiste`) pour situer le vrai chiffre.

| Variante | Année | HistData M15 (cette borne) | Broker M1 exact |
|---|---|---|---|
| A. Combo actuel | 2023 | +189.2 | +72.6 |
| A. Combo actuel | 2024 | +208.1 | +3.9 |
| A. Combo actuel | 2025 | +190.2 | +79.5 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2023 | +129.5 | +77.6 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2024 | +149.4 | +24.4 |
| C0. FVG US100 1:5 + XAUUSD 1:4 (RRR actuels) | 2025 | +156.7 | +62.6 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2023 | +101.5 | +67.4 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2024 | +162.8 | +35.5 |
| C. FVG US100 1:5 + XAUUSD 1:7 | 2025 | +160.4 | +71.7 |
| R. RSI(2) US500 | 2024 | +3.7 | +3.2 |
| C+R. FVG + RSI(2) | 2023 | +101.6 | +66.9 |
| C+R. FVG + RSI(2) | 2024 | +166.6 | +38.7 |
| C+R. FVG + RSI(2) | 2025 | +162.2 | +73.5 |
