# Plafond de trades par jour — refait sur le M1 réel sans trous

Combo inchangé ; seul le plafond quotidien varie (8 variantes testées, comptées). Données : `data/real-m1-full` (EURUSD/XAUUSD dès 2022-05, indices dès 2023-01), règlement à la minute. Garde-fous approximés, coûts non modélisés : lire les différences entre plafonds, pas les dollars. Remplace la partie B de `max-trades-per-day-sweep.md`, qui utilisait un M1 avec trous.

## Tout l'historique

| Plafond / jour | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| 1 | 1160 | 24 % | +117.8 | +0.102 | $16861 | 26 % | 11 / 8 |
| 2 | 2013 | 24 % | +199.9 | +0.099 | $24260 | 28 % | 16 / 12 |
| **3 (actuel)** | 2574 | 25 % | +305.1 | +0.119 | $39815 | 22 % | 23 / 14 |
| 4 | 2900 | 25 % | +294.3 | +0.101 | $37142 | 23 % | 23 / 13 |
| 5 | 2996 | 25 % | +300.3 | +0.100 | $38118 | 22 % | 23 / 14 |
| 6 | 3022 | 25 % | +293.7 | +0.097 | $36839 | 22 % | 22 / 14 |
| 8 | 3033 | 25 % | +281.7 | +0.093 | $34695 | 22 % | 22 / 15 |
| illimité | 3033 | 25 % | +281.7 | +0.093 | $34695 | 22 % | 22 / 15 |

Trades refusés par le plafond de 3 (pris avec « illimité ») : 534, R moyen -0.040.

## Entraînement (avant 2025)

| Plafond / jour | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| 1 | 641 | 23 % | +2.1 | +0.003 | $9771 | 26 % | 4 / 6 |
| 2 | 1093 | 23 % | +15.7 | +0.014 | $10214 | 28 % | 7 / 10 |
| **3 (actuel)** | 1378 | 24 % | +76.8 | +0.056 | $13640 | 22 % | 11 / 10 |
| 4 | 1547 | 24 % | +85.2 | +0.055 | $14111 | 23 % | 11 / 9 |
| 5 | 1594 | 24 % | +100.5 | +0.063 | $15191 | 22 % | 12 / 10 |
| 6 | 1607 | 24 % | +91.6 | +0.057 | $14525 | 22 % | 11 / 10 |
| 8 | 1612 | 24 % | +85.9 | +0.053 | $14120 | 22 % | 11 / 11 |
| illimité | 1612 | 24 % | +85.9 | +0.053 | $14120 | 22 % | 11 / 11 |

Trades refusés par le plafond de 3 (pris avec « illimité ») : 266, R moyen +0.048.

## Test (2025-01-01 → fin)

| Plafond / jour | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| 1 | 519 | 26 % | +115.7 | +0.223 | $17256 | 13 % | 7 / 2 |
| 2 | 920 | 26 % | +184.2 | +0.200 | $23752 | 15 % | 9 / 3 |
| **3 (actuel)** | 1196 | 26 % | +228.4 | +0.191 | $29190 | 17 % | 13 / 4 |
| 4 | 1353 | 25 % | +209.0 | +0.155 | $26320 | 17 % | 13 / 4 |
| 5 | 1402 | 25 % | +199.9 | +0.143 | $25093 | 19 % | 11 / 4 |
| 6 | 1415 | 25 % | +202.1 | +0.143 | $25362 | 19 % | 12 / 4 |
| 8 | 1421 | 25 % | +195.8 | +0.138 | $24571 | 20 % | 12 / 3 |
| illimité | 1421 | 25 % | +195.8 | +0.138 | $24571 | 20 % | 12 / 3 |

Trades refusés par le plafond de 3 (pris avec « illimité ») : 268, R moyen -0.127.

## R par trade selon l'année

| Plafond | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| 1 | -0.122 (-34 R) | +0.173 (+51 R) | +0.269 (+80 R) | +0.160 (+35 R) |
| 2 | -0.023 (-12 R) | +0.085 (+44 R) | +0.239 (+125 R) | +0.150 (+60 R) |
| **3** | +0.075 (+48 R) | +0.067 (+45 R) | +0.211 (+143 R) | +0.164 (+85 R) |
| 4 | +0.074 (+54 R) | +0.064 (+47 R) | +0.176 (+135 R) | +0.126 (+74 R) |
| 5 | +0.088 (+66 R) | +0.066 (+50 R) | +0.170 (+135 R) | +0.107 (+65 R) |
| 6 | +0.091 (+69 R) | +0.050 (+38 R) | +0.169 (+135 R) | +0.109 (+67 R) |
| 8 | +0.084 (+65 R) | +0.048 (+37 R) | +0.166 (+133 R) | +0.102 (+63 R) |
| illimité | +0.084 (+65 R) | +0.048 (+37 R) | +0.166 (+133 R) | +0.102 (+63 R) |

## Limites

- Le vrai garde-fou compte les trades CLÔTURÉS du jour UTC ; ici c'est le jour calendaire du moteur, approximation.
- Un plafond protège aussi contre les séries de pertes du même jour : lire la pire baisse et FTMO, pas seulement le R total.
- 8 variantes comparées : une différence de quelques centièmes de R par trade est dans le bruit.
- Même période que celle qui a servi à bâtir le combo : remesure, pas preuve indépendante.