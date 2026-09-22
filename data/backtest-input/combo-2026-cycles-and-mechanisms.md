# Le combo en production en 2026 : cycles de +10 % et performance de chaque stratégie

Combo : US100, US500, XAUUSD, EURUSD (GER40 retiré). Vrai moteur (`LiveStrategyEngine`, mécanismes réels, deux jambes de Divergence), chauffé sur tout l'historique M1 réel sans trous, trades du **1er janvier 2026 au 2026-09-18** (502 signaux avant garde-fous), réglés à la minute (M1 exact) puis, à titre prudent, comme le moteur (M15, « stop d'abord »). Garde-fous réels rejoués (3 trades/jour, pause 30 min après perte, arrêt du jour). Cycles FTMO 1-Step : un cycle finit à +10 % (réussi) ou à -10 % trailing (raté), le suivant repart à 10 000 $.

**Limites :** coûts partiels (spread par défaut du moteur, sans commission, swap, glissement réel), niveau probablement surestimé ; le règlement M1 suppose l'ordre rempli au niveau du signal ; les cycles sont un rejeu sur une seule suite de trades, pas une probabilité. Le vrai suivi démo : 2 trades réels seulement depuis le 21 septembre.

## Cycles FTMO 1-Step — risque 0.3 %/trade, règlement M1 exact : 1 réussi(s), 0 raté(s)

| Cycle | Début | Fin (date d'atteinte) | Jours | Trades | Résultat | Solde final | Plus haut / plus bas |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-06 | 186 | 278 | RÉUSSI (+10 %) | $11161 | $11161 / $9328 |
| 2 | 2026-07-06 | 2026-09-18 | 74 | 124 | en cours (2.36 %) | $10236 | $10655 / $9811 |

Vétos des garde-fous : 100.

## Cycles FTMO 1-Step — risque 0.3 %/trade, règlement M15 (moteur) : 1 réussi(s), 0 raté(s)

| Cycle | Début | Fin (date d'atteinte) | Jours | Trades | Résultat | Solde final | Plus haut / plus bas |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-20 | 199 | 304 | RÉUSSI (+10 %) | $11044 | $11044 / $9227 |
| 2 | 2026-07-20 | 2026-09-18 | 60 | 102 | en cours (-6.27 %) | $9373 | $10000 / $9119 |

Vétos des garde-fous : 96.

## Cycles FTMO 1-Step — risque 0.5 %/trade, règlement M1 exact : 3 réussi(s), 2 raté(s)

| Cycle | Début | Fin (date d'atteinte) | Jours | Trades | Résultat | Solde final | Plus haut / plus bas |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-02-01 | 31 | 50 | RATÉ (perte max 10 %) | $9313 | $10480 / $9313 |
| 2 | 2026-02-01 | 2026-04-21 | 79 | 121 | RÉUSSI (+10 %) | $11033 | $11033 / $9505 |
| 3 | 2026-04-21 | 2026-06-15 | 55 | 72 | RÉUSSI (+10 %) | $11079 | $11079 / $9793 |
| 4 | 2026-06-15 | 2026-08-04 | 50 | 87 | RÉUSSI (+10 %) | $11057 | $11057 / $9640 |
| 5 | 2026-08-04 | 2026-08-27 | 23 | 38 | RATÉ (perte max 10 %) | $9321 | $10470 / $9321 |
| 6 | 2026-08-27 | 2026-09-18 | 22 | 35 | en cours (4.97 %) | $10497 | $10913 / $9789 |

Vétos des garde-fous : 99.

## Cycles FTMO 1-Step — risque 0.5 %/trade, règlement M15 (moteur) : 2 réussi(s), 2 raté(s)

| Cycle | Début | Fin (date d'atteinte) | Jours | Trades | Résultat | Solde final | Plus haut / plus bas |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-02-03 | 33 | 55 | RATÉ (perte max 10 %) | $9166 | $10273 / $9166 |
| 2 | 2026-02-03 | 2026-04-27 | 82 | 123 | RÉUSSI (+10 %) | $11140 | $11140 / $9476 |
| 3 | 2026-04-27 | 2026-07-06 | 71 | 104 | RÉUSSI (+10 %) | $11014 | $11014 / $9565 |
| 4 | 2026-07-06 | 2026-08-24 | 49 | 83 | RATÉ (perte max 10 %) | $9258 | $10373 / $9258 |
| 5 | 2026-08-24 | 2026-09-18 | 25 | 43 | en cours (-0.10 %) | $9990 | $10386 / $9550 |

Vétos des garde-fous : 94.

## Performance de chaque stratégie en 2026 — règlement M1 exact (garde-fous réels, 0,3 %) — compte continu 14.2 %, pire baisse 9.3 %

| Stratégie | Trades | Gagnants | Taux | R net | R / trade | Part du R total |
|---|---|---|---|---|---|---|
| fvg | 123 | 28 | 23 % | +25.5 | +0.207 | 54 % |
| nwog | 15 | 5 | 33 % | +14.6 | +0.970 | 31 % |
| divergence | 60 | 18 | 30 % | +11.4 | +0.190 | 24 % |
| weeklysweep | 24 | 6 | 25 % | +11.0 | +0.460 | 24 % |
| silverbullet | 90 | 23 | 26 % | -1.5 | -0.017 | -3 % |
| cbdr | 45 | 11 | 24 % | -3.6 | -0.080 | -8 % |
| judaswing | 45 | 11 | 24 % | -10.4 | -0.230 | -22 % |
| **Total** | 402 | 102 | 25 % | +47.0 | +0.117 | 100 % |

### Mécanisme × paire (trades / R net)

| Stratégie | US500 | US100 | XAUUSD | EURUSD |
|---|---|---|---|---|
| cbdr | — | 45 / -3.6 | — | — |
| divergence | 34 / +1.5 | 26 / +9.9 | — | — |
| fvg | 32 / -12.1 | 66 / +7.9 | 25 / +29.6 | — |
| judaswing | — | — | — | 45 / -10.4 |
| nwog | — | 15 / +14.6 | — | — |
| silverbullet | 44 / -2.2 | 46 / +0.6 | — | — |
| weeklysweep | 24 / +11.0 | — | — | — |

### Mois par mois (R net / trades)

| Mois | Trades | R net |
|---|---|---|
| 2026-01 | 50 | -13.9 |
| 2026-02 | 43 | +3.5 |
| 2026-03 | 47 | +5.5 |
| 2026-04 | 41 | +11.3 |
| 2026-05 | 40 | +8.1 |
| 2026-06 | 48 | +15.3 |
| 2026-07 | 56 | +17.1 |
| 2026-08 | 47 | -10.3 |
| 2026-09 | 30 | +10.4 |

## Performance de chaque stratégie en 2026 — règlement M15 (moteur) (garde-fous réels, 0,3 %) — compte continu 3.5 %, pire baisse 9.2 %

| Stratégie | Trades | Gagnants | Taux | R net | R / trade | Part du R total |
|---|---|---|---|---|---|---|
| nwog | 15 | 5 | 33 % | +14.6 | +0.970 | 104 % |
| divergence | 62 | 19 | 31 % | +13.4 | +0.216 | 95 % |
| weeklysweep | 24 | 6 | 25 % | +11.1 | +0.461 | 79 % |
| fvg | 127 | 25 | 20 % | +4.3 | +0.034 | 31 % |
| silverbullet | 88 | 21 | 24 % | -7.3 | -0.083 | -52 % |
| judaswing | 45 | 11 | 24 % | -10.4 | -0.230 | -74 % |
| cbdr | 45 | 9 | 20 % | -11.6 | -0.258 | -83 % |
| **Total** | 406 | 96 | 24 % | +14.0 | +0.035 | 100 % |

### Mécanisme × paire (trades / R net)

| Stratégie | US500 | US100 | XAUUSD | EURUSD |
|---|---|---|---|---|
| cbdr | — | 45 / -11.6 | — | — |
| divergence | 34 / +1.5 | 28 / +11.9 | — | — |
| fvg | 33 / -7.1 | 69 / -13.2 | 25 / +24.6 | — |
| judaswing | — | — | — | 45 / -10.4 |
| nwog | — | 15 / +14.6 | — | — |
| silverbullet | 43 / -5.1 | 45 / -2.2 | — | — |
| weeklysweep | 24 / +11.1 | — | — | — |

### Mois par mois (R net / trades)

| Mois | Trades | R net |
|---|---|---|
| 2026-01 | 51 | -12.9 |
| 2026-02 | 43 | +3.5 |
| 2026-03 | 47 | -0.5 |
| 2026-04 | 42 | +10.4 |
| 2026-05 | 41 | +13.1 |
| 2026-06 | 48 | +5.3 |
| 2026-07 | 57 | +6.1 |
| 2026-08 | 47 | -16.2 |
| 2026-09 | 30 | +5.4 |
