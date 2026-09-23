# Régimes de marché : quand chaque stratégie a marché (2011-2026)

Descriptif, ne sert à aucun choix. R net par année des jambes à leur RRR de production (trades isolés). Marché mesuré sur le M1 (HistData jusqu'en 2022, broker ensuite). Efficacité de tendance : 1 = l'année monte ou descend en ligne droite, 0 = aller-retour. Fed : moyenne annuelle du taux effectif (arrondie, 2026 non renseigné).

| Année | FVG US100 1:5 | FVG Or 1:4 | Autres jambes du combo | US100 : rendement | US100 : volatilité | US100 : tendance | Or : rendement | Or : volatilité | Or : tendance | Fed |
|---|---|---|---|---|---|---|---|---|---|---|
| 2011 | -31.0 | +1.9 | -30.1 | +2 % | 21 % | 0.01 | +10 % | 18 % | 0.04 | 0.1 % |
| 2012 | -5.2 | -5.3 | +4.4 | +15 % | 14 % | 0.07 | +6 % | 13 % | 0.03 | 0.1 % |
| 2013 | +1.2 | +13.1 | +68.1 | +31 % | 11 % | 0.18 | -28 % | 18 % | 0.13 | 0.1 % |
| 2014 | -22.3 | +16.4 | +43.3 | +18 % | 12 % | 0.10 | -3 % | 13 % | 0.02 | 0.1 % |
| 2015 | -7.9 | +17.4 | +81.6 | +8 % | 16 % | 0.03 | -10 % | 12 % | 0.06 | 0.1 % |
| 2016 | +16.2 | -14.9 | -69.9 | +7 % | 16 % | 0.03 | +8 % | 15 % | 0.04 | 0.4 % |
| 2017 | +32.3 | -11.7 | +38.9 | +31 % | 10 % | 0.20 | +13 % | 9 % | 0.08 | 1.0 % |
| 2018 | +46.3 | -18.2 | +127.2 | -1 % | 22 % | 0.00 | -2 % | 8 % | 0.02 | 1.8 % |
| 2019 | -3.8 | +11.0 | +66.9 | +40 % | 14 % | 0.16 | +18 % | 11 % | 0.11 | 2.2 % |
| 2020 | +67.3 | +26.3 | +61.1 | +47 % | 28 % | 0.10 | +25 % | 17 % | 0.10 | 0.4 % |
| 2021 | +4.9 | -14.0 | +39.9 | +27 % | 17 % | 0.10 | -5 % | 12 % | 0.03 | 0.1 % |
| 2022 | +40.2 | +8.8 | -3.0 | -33 % | 29 % | 0.09 | -0 % | 14 % | 0.00 | 1.7 % |
| 2023 (test) | +70.0 | +14.1 | +2.8 | +50 % | 16 % | 0.17 | +12 % | 12 % | 0.07 | 5.0 % |
| 2024 (test) | +23.9 | +8.1 | +5.0 | +25 % | 17 % | 0.09 | +27 % | 13 % | 0.13 | 5.1 % |
| 2025 (test) | +61.3 | +13.0 | +5.8 | +20 % | 23 % | 0.07 | +64 % | 17 % | 0.21 | 4.2 % |
| 2026 (fwd) | +20.0 | +30.3 | +3.9 | +17 % | 19 % | 0.08 | -0 % | 27 % | 0.00 | — |

## Corrélations de rang (Spearman) entre le R de l'année et l'état du marché

| Stratégie | Variable | rho | années |
|---|---|---|---|
| FVG US100 | US100 rendement | 0.29 | 16 |
| FVG US100 | US100 volatilité | 0.50 | 16 |
| FVG US100 | US100 tendance | 0.18 | 16 |
| FVG US100 | Or rendement | 0.47 | 16 |
| FVG US100 | Or volatilité | -0.09 | 16 |
| FVG US100 | Or tendance | 0.15 | 16 |
| FVG US100 | Fed | 0.74 | 15 |
| FVG Or | US100 rendement | 0.36 | 16 |
| FVG Or | US100 volatilité | 0.04 | 16 |
| FVG Or | US100 tendance | 0.24 | 16 |
| FVG Or | Or rendement | -0.03 | 16 |
| FVG Or | Or volatilité | 0.44 | 16 |
| FVG Or | Or tendance | 0.16 | 16 |
| FVG Or | Fed | 0.00 | 15 |
| Autres jambes | US100 rendement | 0.27 | 16 |
| Autres jambes | US100 volatilité | -0.23 | 16 |
| Autres jambes | US100 tendance | 0.19 | 16 |
| Autres jambes | Or rendement | -0.32 | 16 |
| Autres jambes | Or volatilité | -0.40 | 16 |
| Autres jambes | Or tendance | 0.24 | 16 |
| Autres jambes | Fed | -0.01 | 15 |

Avec 15-16 années, |rho| doit dépasser ~0,5 pour être distinguable du hasard (seuil 5 %) ; plusieurs essais augmentent le risque d'un faux positif.
## Peut-on suivre la stratégie qui marche ? (`runCleanStudy.js switch`)

Chaque jambe du combo n'est active que si ses propres signaux ont un R net > 0 sur les L derniers mois ; L (3/6/12/24) et le risque choisis sur l'entraînement → **12 mois, 0,5 %** (33 réussis / 23 ratés sur 2010-2022, contre 39 / 39 sans filtre). **Échec hors échantillon :** test 2023-2025 +122 R, 7 / 4 (sans filtre : +233 R, 13 / 6) ; forward 2026 −4 R, 2 / 2 (sans filtre : +46 R, 4 / 2). Le passé récent d'une stratégie ne dit pas si elle va continuer.

## FVG seul aux RRR de production (`runCleanStudy.js port fvg-US100:5,fvg-XAUUSD:4`, rien réglé sur les années récentes)

| Risque | 2010-2022 | 2023-2025 | 2026 |
|---|---|---|---|
| 0,25 % | +100 R, 5 / 3, baisse 16 % | +185 R, 4 / 0, baisse 4,6 % | +40 R, 1 / 0 |
| 0,5 % | 13 / 12, baisse 30 %, ~66 j par réussite | 8 / 0, baisse 9 %, ~99 j | 2 / 0, ~106 j |
| 0,75 % | 23 / 26, baisse 42 % | 13 / 2, baisse 13,5 %, ~50 j | 3 / 0 |

Pour comparer, combo complet à 0,5 % : 39 / 39 (baisse 47 %), 13 / 6, 4 / 2.

## Chaque jambe par période de marché (`runCleanStudy.js byregime`, R net par an, RRR de production)

Périodes tracées APRÈS coup (taux de la Fed + résultats) : descriptif, ne prouve rien sur l'avenir. La période 2022-2026 contient le test et le forward.

| Jambe | RRR | En prod. | 2011-2015 taux zéro, marché calme (R/an) | 2016-2021 remontée des taux puis COVID (R/an) | 2022-2026 inflation, taux élevés (R/an) |
|---|---|---|---|---|---|
| FVG US100 | 1:5 | oui | -13.0 | +27.2 | +43.1 |
| FVG XAUUSD | 1:4 | oui | +8.7 | -3.6 | +14.9 |
| Divergence US100/US500 | 1:3 | oui | -2.9 | +9.3 | +12.2 |
| NWOG US500 | 1:5 |  | -2.5 | -0.2 | +4.6 |
| NWOG US100 | 1:5 | oui | +1.5 | +12.1 | +3.5 |
| FVG US500 | 1:5 | oui | +3.9 | +5.8 | +3.3 |
| Weekly Sweep EURUSD | 1:5 |  | +3.7 | -11.2 | +3.3 |
| Silver Bullet XAUUSD | 1:3 |  | -7.4 | +1.5 | +2.6 |
| Judas Swing US100 | 1:3 |  | -3.4 | -2.2 | +2.5 |
| Weekly Sweep US500 | 1:5 | oui | +9.1 | +11.8 | +2.1 |
| RSI(2) US500 (journalier) | — |  | +0.8 | +1.2 | +1.4 |
| Judas Swing EURUSD | 1:3 | oui | -3.7 | -15.2 | +0.6 |
| CBDR US500 | 1:3 |  | -12.8 | -6.1 | -0.9 |
| CBDR US100 | 1:3 | oui | +7.3 | -1.9 | -1.9 |
| Breaker Block XAUUSD | 1:5 |  | -1.9 | -2.6 | -1.9 |
| CBDR XAUUSD | 1:3 |  | +1.0 | -3.9 | -2.2 |
| NWOG XAUUSD | 1:5 |  | -1.8 | -4.9 | -2.3 |
| NWOG EURUSD | 1:5 |  | -5.4 | -7.1 | -2.9 |
| Weekly Sweep XAUUSD | 1:5 |  | -6.6 | +4.2 | -3.4 |
| Silver Bullet US100 | 1:3 | oui | +4.4 | +12.6 | -4.2 |
| CBDR EURUSD | 1:3 |  | -30.5 | -18.4 | -5.0 |
| Judas Swing US500 | 1:3 |  | -1.1 | -2.3 | -5.9 |
| Judas Swing XAUUSD | 1:3 |  | +6.4 | -3.7 | -6.7 |
| Breaker Block EURUSD | 1:5 |  | -18.2 | -16.0 | -9.2 |
| Silver Bullet US500 | 1:3 | oui | +17.8 | +15.3 | -9.5 |
| Weekly Sweep US100 | 1:5 |  | +14.2 | +8.3 | -10.1 |
| Silver Bullet EURUSD | 1:3 |  | -19.5 | -13.0 | -12.6 |
| Breaker Block US100 | 1:5 |  | -8.0 | -2.4 | -18.5 |
| Breaker Block US500 | 1:5 |  | -23.5 | -7.0 | -24.7 |

Ajouter la Divergence 1:3 à FVG US100 + Or à 0,5 % : 2010-2022 17 / 19 (baisse 37 %) contre 13 / 12 (30 %) ; test 10 / 0 contre 8 / 0 ; forward 2 / 0 les deux → pas de gain net, on garde les deux FVG.
