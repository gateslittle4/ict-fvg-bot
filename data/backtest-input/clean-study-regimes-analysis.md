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
