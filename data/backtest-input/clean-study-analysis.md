# Étude propre : entraînement 2010-2022, test 2023-2025, forward 2026

Protocole d'Esdras (2026-09-23), pour toute analyse : **tous les choix se font sur l'entraînement 2010-2022**, puis le test 2023-2025 et le forward 2026 sont lus une seule fois, sans rien choisir dessus. Remplace les analyses « candidates » et « 3e jambe » (effacées).

**Données.** Entraînement : HistData.com M1 (US100 = NSXUSD, US500 = SPXUSD, XAUUSD, EURUSD ; US100/US500 commencent le 2010-11-14). Test et forward : M1 du broker. Vrai `LiveStrategyEngine` (M15 reconstruites depuis le M1), chaque trade réglé à la minute, spread par défaut + swap réel du broker, relevés aujourd'hui en points et appliqués **en % du prix** (mis à l'échelle du prix d'entrée : sinon le swap d'un Nasdaq à 20 000 appliqué au Nasdaq de 2011 à 2 300 coûterait ~8x trop par nuit ; colonne de contrôle « coûts fixes en points » au tableau 1). Compte : garde-fou du bot (3 trades/jour, pause 30 min), une seule position par paire, FTMO 1-Step réel (+10 %, perte max 10 %, perte quotidienne), cycles enchaînés dans chaque période.

**Règles de sélection, fixées avant de lire le test.** (1) Chaque jambe = une stratégie du bot sur une paire, config de production ; RRR testé de 1:2 à 1:7, on garde celui au meilleur R net d'entraînement. (2) La jambe entre dans le portefeuille si, à ce RRR : t ≥ 2 sur l'entraînement, R net positif dans chaque moitié (2010-2016 et 2017-2022), au moins 30 trades. (3) Le % de risque est celui qui donne, sur l'entraînement, le plus de challenges réussis moins ratés (à égalité : le moins de ratés).

**Limites.** Les filtres des stratégies ont été conçus à l'origine sur 2019-2025 : l'entraînement en contient une partie (normal) mais le **test 2023-2025 a déjà été vu pendant la conception** ; le forward 2026 est la période la plus propre. Prix HistData ≠ flux du broker. Swap d'aujourd'hui appliqué au passé. Perte quotidienne FTMO sur le P&L clôturé.

## 1. Entraînement : chaque jambe seule, à son meilleur RRR

| Jambe | En prod. | RRR retenu | Trades | Win rate | R brut (sans coûts) | R net | R net, coûts fixes en points | R/trade | t | 2010-2016 | 2017-2022 | Gardée |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Silver Bullet US100 | oui | 1:7 | 1054 | 16 % | +282.5 | +243.4 | +36.1 | +0.231 | 2.61 | +72.7 | +170.6 | **OUI** |
| NWOG US100 | oui | 1:7 | 210 | 20 % | +118.0 | +111.2 | +83.9 | +0.530 | 2.42 | +22.9 | +88.3 | **OUI** |
| Silver Bullet US500 | oui | 1:6 | 1065 | 18 % | +266.6 | +204.4 | +47.9 | +0.192 | 2.37 | +105.5 | +98.9 | **OUI** |
| Weekly Sweep US500 | oui | 1:5 | 577 | 21 % | +156.3 | +134.5 | +81.6 | +0.233 | 2.29 | +41.2 | +93.3 | **OUI** |
| Weekly Sweep US100 |  | 1:5 | 531 | 21 % | +135.8 | +125.0 | +67.9 | +0.235 | 2.23 | +78.0 | +47.0 | **OUI** |
| RSI(2) US500 (journalier) |  | — | 97 | 73 % | +12.1 | +9.9 | +4.7 | +0.103 | 2.17 | +5.0 | +5.0 | **OUI** |
| FVG US500 | oui | 1:6 | 525 | 18 % | +145.1 | +113.9 | +43.9 | +0.217 | 1.85 | +49.2 | +64.7 | non |
| CBDR XAUUSD |  | 1:7 | 962 | 16 % | +218.0 | +157.5 | +35.7 | +0.164 | 1.79 | +182.5 | -25.1 | non |
| FVG US100 | oui | 1:7 | 1294 | 15 % | +225.1 | +168.4 | -54.5 | +0.130 | 1.67 | -42.7 | +211.1 | non |
| Divergence US100/US500 | oui | 1:7 | 1172 | 18 % | +223.5 | +120.6 | -246.4 | +0.103 | 1.36 | -13.0 | +133.6 | non |
| FVG XAUUSD | oui | 1:5 | 499 | 23 % | +68.9 | +47.5 | +3.5 | +0.095 | 0.96 | +40.5 | +7.0 | non |
| CBDR US100 | oui | 1:6 | 660 | 16 % | +64.7 | +42.8 | -55.7 | +0.065 | 0.66 | +123.0 | -80.2 | non |
| NWOG US500 |  | 1:6 | 405 | 16 % | +50.6 | +32.1 | -8.2 | +0.079 | 0.62 | +19.8 | +12.3 | non |
| Weekly Sweep XAUUSD |  | 1:7 | 492 | 15 % | +58.5 | +32.9 | -22.8 | +0.067 | 0.54 | -10.0 | +42.8 | non |
| Judas Swing XAUUSD |  | 1:4 | 748 | 22 % | +74.1 | +28.4 | -63.0 | +0.038 | 0.50 | +40.0 | -11.6 | non |
| Judas Swing EURUSD | oui | 1:7 | 1268 | 15 % | +242.4 | +47.2 | +56.8 | +0.037 | 0.47 | +54.2 | -7.0 | non |
| Breaker Block XAUUSD |  | 1:7 | 1189 | 13 % | +68.9 | -11.0 | -166.1 | -0.009 | -0.12 | +12.2 | -23.2 | non |
| Silver Bullet XAUUSD |  | 1:3 | 807 | 26 % | +29.9 | -12.0 | -95.2 | -0.015 | -0.24 | -38.1 | +26.1 | non |
| Breaker Block US100 |  | 1:7 | 1410 | 13 % | +3.3 | -41.5 | -249.6 | -0.029 | -0.42 | -58.9 | +17.4 | non |
| Judas Swing US100 |  | 1:2 | 747 | 33 % | +0.0 | -18.1 | -97.4 | -0.024 | -0.47 | -9.0 | -9.1 | non |
| Judas Swing US500 |  | 1:3 | 795 | 25 % | +9.0 | -26.3 | -107.5 | -0.033 | -0.54 | +10.0 | -36.3 | non |
| CBDR US500 |  | 1:2 | 602 | 34 % | +4.0 | -26.0 | -94.7 | -0.043 | -0.75 | -21.6 | -4.4 | non |
| Weekly Sweep EURUSD |  | 1:7 | 518 | 14 % | +18.5 | -50.7 | -47.2 | -0.098 | -0.84 | -41.2 | -9.4 | non |
| NWOG XAUUSD |  | 1:3 | 369 | 24 % | -17.0 | -37.2 | -76.6 | -0.101 | -1.13 | -36.0 | -1.2 | non |
| Silver Bullet EURUSD |  | 1:6 | 864 | 15 % | +26.0 | -99.2 | -92.8 | -0.115 | -1.37 | -67.0 | -32.2 | non |
| NWOG EURUSD |  | 1:4 | 379 | 21 % | +11.0 | -55.9 | -52.7 | -0.148 | -1.42 | -26.4 | -29.5 | non |
| Breaker Block EURUSD |  | 1:7 | 1370 | 14 % | +66.9 | -175.4 | -163.8 | -0.128 | -1.76 | -113.0 | -62.4 | non |
| CBDR EURUSD |  | 1:7 | 1179 | 13 % | +13.8 | -181.9 | -172.2 | -0.154 | -2.01 | -133.4 | -48.5 | non |
| Breaker Block US500 |  | 1:2 | 1508 | 32 % | -41.0 | -111.2 | -266.9 | -0.074 | -2.04 | -39.9 | -71.2 | non |

## 2. Entraînement : % de risque par trade (FTMO 1-Step enchaîné sur 2010-2022)

| Portefeuille | Risque | Réussis | Ratés | Réussis − ratés | Durée médiane d'un réussi (jours) | Pire baisse du compte continu |
|---|---|---|---|---|---|---|
| P. Portefeuille choisi sur l'entraînement | 0.25 % | 16 | 2 | 14 | 132 | 13.6 % |
| P. Portefeuille choisi sur l'entraînement | 0.5 % | 44 | 22 | 22 | 53 | 26.0 % |
| P. Portefeuille choisi sur l'entraînement | 0.75 % | 68 | 48 | 20 | 28 | 37.0 % |
| P. Portefeuille choisi sur l'entraînement | 1 % | 103 | 81 | 22 | 16 | 46.7 % |
| P. Portefeuille choisi sur l'entraînement | 1.25 % | 125 | 109 | 16 | 13 | 54.7 % |
| P. Portefeuille choisi sur l'entraînement | 1.5 % | 155 | 158 | -3 | 10 | 62.2 % |
| A. Combo actuel | 0.25 % | 13 | 8 | 5 | 169 | 26.3 % |
| A. Combo actuel | 0.5 % | 39 | 39 | 0 | 51 | 46.6 % |
| A. Combo actuel | 0.75 % | 70 | 85 | -15 | 23 | 61.9 % |
| A. Combo actuel | 1 % | 117 | 140 | -23 | 11 | 74.3 % |
| A. Combo actuel | 1.25 % | 164 | 210 | -46 | 9 | 82.2 % |
| A. Combo actuel | 1.5 % | 196 | 245 | -49 | 7 | 87.5 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.25 % | 4 | 2 | 2 | 854 | 17.5 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.5 % | 13 | 13 | 0 | 71 | 32.5 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.75 % | 26 | 30 | -4 | 60 | 45.3 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1 % | 35 | 45 | -10 | 30 | 55.1 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.25 % | 53 | 68 | -15 | 21 | 64.0 % |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1.5 % | 66 | 89 | -23 | 18 | 71.4 % |

**P. Portefeuille choisi sur l'entraînement : risque retenu 0.5 %** ; **A. Combo actuel : risque retenu 0.25 %** ; **C. FVG US100 1:5 + XAUUSD 1:7 : risque retenu 0.25 %**.

## 3. Résultats : entraînement, test, forward (même risque partout : celui choisi sur l'entraînement)

### P. Portefeuille choisi sur l'entraînement (Silver Bullet US100 1:7 + NWOG US100 1:7 + Silver Bullet US500 1:6 + Weekly Sweep US500 1:5 + Weekly Sweep US100 1:5 + RSI(2) US500 (journalier))

Risque 0.5 % par trade.

| Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d'un réussi (jours) | Pire baisse | Compte continu |
|---|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 2839 | 20 % | +658.2 | +0.232 | 4.64 | 44 / 22 | 53 | 26.0 % | +1917.9 % |
| Test 2023-2025 | 748 | 16 % | -60.8 | -0.081 | -0.94 | 3 / 10 | 40 | 31.8 % | -30.3 % |
| Forward 2026 (→ 18 sept.) | 210 | 20 % | +28.8 | +0.137 | 0.75 | 2 / 1 | 96 | 14.3 % | +13.0 % |

### A. Combo actuel (jambes de production, RRR de production ; GER40 retiré)

Risque 0.25 % par trade.

| Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d'un réussi (jours) | Pire baisse | Compte continu |
|---|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 6370 | 25 % | +318.2 | +0.050 | 2.01 | 13 / 8 | 169 | 26.3 % | +103.2 % |
| Test 2023-2025 | 1634 | 26 % | +233.2 | +0.143 | 2.77 | 5 / 0 | 198 | 8.5 % | +74.7 % |
| Forward 2026 (→ 18 sept.) | 407 | 25 % | +45.5 | +0.112 | 1.08 | 1 / 0 | 199 | 6.9 % | +11.4 % |

### C. FVG US100 1:5 + XAUUSD 1:7 (idée précédente, pour comparaison seulement)

Risque 0.25 % par trade.

| Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d'un réussi (jours) | Pire baisse | Compte continu |
|---|---|---|---|---|---|---|---|---|---|
| Entraînement 2010-2022 | 1650 | 19 % | +109.1 | +0.066 | 1.14 | 4 / 2 | 854 | 17.5 % | +27.7 % |
| Test 2023-2025 | 512 | 24 % | +199.4 | +0.389 | 3.35 | 5 / 0 | 175 | 4.6 % | +62.7 % |
| Forward 2026 (→ 18 sept.) | 121 | 22 % | +49.7 | +0.410 | 1.63 | 1 / 0 | 116 | 4.6 % | +12.9 % |

### FTMO réussis / ratés à d'autres risques (pour voir la sensibilité)

| Portefeuille | Risque | Entraînement 2010-2022 | Test 2023-2025 | Forward 2026 (→ 18 sept.) |
|---|---|---|---|---|
| P. Portefeuille choisi sur l'entraînement | 0.5 % | 44 / 22 (baisse 26 %) | 3 / 10 (baisse 32 %) | 2 / 1 (baisse 14 %) |
| P. Portefeuille choisi sur l'entraînement | 0.75 % | 68 / 48 (baisse 37 %) | 9 / 18 (baisse 46 %) | 3 / 4 (baisse 21 %) |
| P. Portefeuille choisi sur l'entraînement | 1 % | 103 / 81 (baisse 47 %) | 13 / 27 (baisse 64 %) | 7 / 6 (baisse 30 %) |
| A. Combo actuel | 0.5 % | 39 / 39 (baisse 47 %) | 13 / 6 (baisse 16 %) | 4 / 2 (baisse 13 %) |
| A. Combo actuel | 0.75 % | 70 / 85 (baisse 62 %) | 21 / 13 (baisse 24 %) | 5 / 3 (baisse 19 %) |
| A. Combo actuel | 1 % | 117 / 140 (baisse 74 %) | 36 / 28 (baisse 34 %) | 8 / 7 (baisse 23 %) |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.5 % | 13 / 13 (baisse 33 %) | 8 / 0 (baisse 9 %) | 3 / 0 (baisse 9 %) |
| C. FVG US100 1:5 + XAUUSD 1:7 | 0.75 % | 26 / 30 (baisse 45 %) | 14 / 3 (baisse 14 %) | 4 / 1 (baisse 13 %) |
| C. FVG US100 1:5 + XAUUSD 1:7 | 1 % | 35 / 45 (baisse 55 %) | 23 / 9 (baisse 20 %) | 5 / 1 (baisse 17 %) |

## 4. R net par année (compte continu, garde-fou du bot)

| Année | P | A | C |
|---|---|---|---|
| 2010 | -16.8 | -21.5 | -35.2 |
| 2011 | +10.1 | -66.0 | -21.2 |
| 2012 | +97.9 | +30.5 | -10.5 |
| 2013 | +36.7 | +89.4 | +23.8 |
| 2014 | +30.3 | +13.4 | -11.6 |
| 2015 | +50.9 | +59.5 | +33.0 |
| 2016 | -17.1 | -70.5 | +4.1 |
| 2017 | +73.3 | +19.3 | +33.0 |
| 2018 | +143.7 | +61.2 | +10.6 |
| 2019 | +9.7 | +65.9 | -19.5 |
| 2020 | +99.2 | +97.6 | +71.5 |
| 2021 | +94.5 | -3.0 | -15.0 |
| 2022 | +50.7 | +40.3 | +46.1 |
| 2023 (test) | -26.3 | +85.1 | +69.7 |
| 2024 (test) | -3.8 | +51.0 | +49.2 |
| 2025 (test) | -32.6 | +96.0 | +80.4 |
| 2026 (forward) | +28.8 | +45.5 | +49.7 |

## 5. Les jambes gardées, une par une (trades isolés, R net)

| Jambe | Entraînement 2010-2022 | Test 2023-2025 | Forward 2026 (→ 18 sept.) |
|---|---|---|---|
| Silver Bullet US100 1:7 | +243.4 (1054 tr., t 2.61) | -33.2 (302 tr., t -0.76) | +23.0 (93 tr., t 0.81) |
| NWOG US100 1:7 | +111.2 (210 tr., t 2.42) | -5.5 (36 tr., t -0.36) | +27.3 (20 tr., t 1.63) |
| Silver Bullet US500 1:6 | +204.4 (1065 tr., t 2.37) | -30.6 (299 tr., t -0.75) | +12.2 (84 tr., t 0.51) |
| Weekly Sweep US500 1:5 | +134.5 (577 tr., t 2.29) | -6.3 (137 tr., t -0.24) | -1.3 (36 tr., t -0.09) |
| Weekly Sweep US100 1:5 | +125.0 (531 tr., t 2.23) | -31.0 (153 tr., t -1.21) | -25.8 (37 tr., t -3.08) |
| RSI(2) US500 (journalier) | +9.9 (97 tr., t 2.17) | +5.1 (33 tr., t 2.31) | +2.9 (11 tr., t 4.15) |

## Annexe : toutes les jambes au RRR d'entraînement sur le test et le forward (informatif, ne sert à aucun choix)

| Jambe | RRR | Entraînement | Test 2023-2025 | Forward 2026 |
|---|---|---|---|---|
| Silver Bullet US100 | 1:7 | +243.4 | -33.2 | +23.0 |
| NWOG US100 | 1:7 | +111.2 | -5.5 | +27.3 |
| Silver Bullet US500 | 1:6 | +204.4 | -30.6 | +12.2 |
| Weekly Sweep US500 | 1:5 | +134.5 | -6.3 | -1.3 |
| Weekly Sweep US100 | 1:5 | +125.0 | -31.0 | -25.8 |
| RSI(2) US500 (journalier) | — | +9.9 | +5.1 | +2.9 |
| FVG US500 | 1:6 | +113.9 | +20.6 | -22.3 |
| CBDR XAUUSD | 1:7 | +157.5 | +57.0 | -15.5 |
| FVG US100 | 1:7 | +168.4 | +139.2 | +32.0 |
| Divergence US100/US500 | 1:7 | +120.6 | +84.8 | +2.9 |
| FVG XAUUSD | 1:5 | +47.5 | +41.5 | +29.2 |
| CBDR US100 | 1:6 | +42.8 | -60.8 | +25.7 |
| NWOG US500 | 1:6 | +32.1 | -18.8 | +18.9 |
| Weekly Sweep XAUUSD | 1:7 | +32.9 | +5.8 | -6.2 |
| Judas Swing XAUUSD | 1:4 | +28.4 | -1.5 | -15.3 |
| Judas Swing EURUSD | 1:7 | +47.2 | +50.2 | +2.5 |
| Breaker Block XAUUSD | 1:7 | -11.0 | -21.6 | -18.9 |
| Silver Bullet XAUUSD | 1:3 | -12.0 | -15.1 | -0.8 |
| Breaker Block US100 | 1:7 | -41.5 | -9.3 | -33.6 |
| Judas Swing US100 | 1:2 | -18.1 | +17.5 | -18.3 |
| Judas Swing US500 | 1:3 | -26.3 | -1.0 | -27.5 |
| CBDR US500 | 1:2 | -26.0 | -50.9 | +1.7 |
| Weekly Sweep EURUSD | 1:7 | -50.7 | +35.3 | +5.0 |
| NWOG XAUUSD | 1:3 | -37.2 | -5.5 | -19.7 |
| Silver Bullet EURUSD | 1:6 | -99.2 | -66.1 | -17.7 |
| NWOG EURUSD | 1:4 | -55.9 | -11.5 | -7.1 |
| Breaker Block EURUSD | 1:7 | -175.4 | +3.0 | -7.7 |
| CBDR EURUSD | 1:7 | -181.9 | -51.1 | -21.2 |
| Breaker Block US500 | 1:2 | -111.2 | -70.8 | -18.7 |
