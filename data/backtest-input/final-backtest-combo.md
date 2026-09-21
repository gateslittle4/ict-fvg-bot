# Backtest final du combo actuel (inchangé) — entraînement / test

## A. 2010-2025 en M15 — borne prudent (stop d'abord)

Borne basse : en cas de doute, le stop gagne.

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2023 | 7957 | 24 % | -13.9 | -0.002 | $6197 | 76 % | 36 / 51 |
| **Test 2024-2025** | 1377 | 23 % | +91.2 | +0.066 | $14616 | 28 % | 9 / 9 |
| Tout 2010-2025 | 9333 | 24 % | +78.3 | +0.008 | $9103 | 76 % | 46 / 61 |

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2010 | 200 | +0.5 | +0.003 |
| 2011 | 571 | -148.2 | -0.260 |
| 2012 | 573 | -57.0 | -0.099 |
| 2013 | 528 | +26.1 | +0.049 |
| 2014 | 551 | +76.8 | +0.139 |
| 2015 | 593 | -2.6 | -0.004 |
| 2016 | 574 | -54.6 | -0.095 |
| 2017 | 567 | -39.8 | -0.070 |
| 2018 | 623 | +64.5 | +0.103 |
| 2019 | 640 | -3.3 | -0.005 |
| 2020 | 658 | +111.1 | +0.169 |
| 2021 | 620 | -48.4 | -0.078 |
| 2022 | 624 | +24.7 | +0.040 |
| 2023 | 597 | +50.3 | +0.084 |
| 2024 | 687 | +99.2 | +0.144 |
| 2025 | 690 | -8.0 | -0.012 |

Années positives : 8 sur 16.

## A. 2010-2025 en M15 — borne optimiste (objectif d'abord)

Borne haute : en cas de doute, l'objectif gagne.

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Entraînement 2010-2023 | 7975 | 27 % | +1438.3 | +0.180 | $8357223 | 58 % | 85 / 28 |
| **Test 2024-2025** | 1386 | 31 % | +614.1 | +0.443 | $195576 | 14 % | 30 / 2 |
| Tout 2010-2025 | 9360 | 28 % | +2053.5 | +0.219 | $164276886 | 58 % | 115 / 30 |

| Année | Trades | R net | R / trade |
|---|---|---|---|
| 2010 | 200 | +0.5 | +0.003 |
| 2011 | 572 | -101.3 | -0.177 |
| 2012 | 573 | -19.9 | -0.035 |
| 2013 | 530 | +55.9 | +0.106 |
| 2014 | 551 | +124.8 | +0.226 |
| 2015 | 593 | +63.1 | +0.106 |
| 2016 | 576 | +13.1 | +0.023 |
| 2017 | 567 | +10.2 | +0.018 |
| 2018 | 625 | +192.1 | +0.307 |
| 2019 | 642 | +173.4 | +0.270 |
| 2020 | 661 | +321.6 | +0.486 |
| 2021 | 618 | +105.6 | +0.171 |
| 2022 | 630 | +266.3 | +0.423 |
| 2023 | 599 | +242.0 | +0.404 |
| 2024 | 694 | +340.7 | +0.491 |
| 2025 | 692 | +273.4 | +0.395 |

Années positives : 14 sur 16.

## B. 7 mois réels (2026), règlement à la minute (M1 exact) — chiffre de référence

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Tout (≈ jan→sept 2026) | 412 | 26 % | +90.6 | +0.220 | $15340 | 11 % | 5 / 1 |
| 1re moitié | 167 | 31 % | +69.0 | +0.413 | $13963 | 8 % | 3 / 0 |
| 2e moitié | 245 | 23 % | +21.6 | +0.088 | $10986 | 11 % | 1 / 1 |

## Limites

- Combo inchangé : rien n'est choisi sur le test, donc pas de sur-ajustement ; mais 2010-2025 avait déjà servi à bâtir le combo, le vrai hors échantillon est la démo à venir.
- M15 : deux bornes, le vrai résultat est entre les deux ; le M1 exact des 7 mois est le seul chiffre sans ce biais.
- Non modélisés : commissions, swap, glissement, spread élargi autour de 17 h NY. Garde-fous approximés (voir le script).
- Les tentatives FTMO sont peu nombreuses sur 7 mois : à lire comme un ordre de grandeur, pas comme une probabilité.