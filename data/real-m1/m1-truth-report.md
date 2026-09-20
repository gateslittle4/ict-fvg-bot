# La vérité à la minute : mêmes trades, règlement M15 prudent vs M1 exact

Fenêtre couverte par les bougies d'1 minute du broker sur les 5 paires : 2026-01-16 → 2026-09-18 (données réelles du broker). 10 000 $, 0,5 % de risque, sans plafond d'objectif, garde-fous simplifiés, spread inclus, filtre « stop ≥ 3× le spread ».

| Configuration | Règlement | Trades | Gagnants | R net | Compte final | Pire baisse | Défis FTMO 1-Step (réussis / échoués / en cours) |
|---|---|---|---|---|---|---|---|
| Aujourd'hui (15 mécanismes, stops d'origine) | M15 prudent | 434 | 23 % | +33.5 | **$11540** (+15.4 %) | 19 % | 3 / 3 / 1 |
| Aujourd'hui (15 mécanismes, stops d'origine) | M1 exact (9 entrées limite jamais touchées, écartées) | 412 | 26 % | +90.6 | **$15340** (+53.4 %) | 11 % | 5 / 1 / 1 |
| Recommandé (13 mécanismes, planchers ATR) | M15 prudent | 335 | 24 % | +41.8 | **$12098** (+21.0 %) | 11 % | 3 / 2 / 1 |
| Recommandé (13 mécanismes, planchers ATR) | M1 exact (7 entrées limite jamais touchées, écartées) | 322 | 24 % | +46.0 | **$12359** (+23.6 %) | 11 % | 2 / 0 / 1 |

### Mêmes trades, deux règlements

| Configuration | Trades communs | Même issue | R net (M15 prudent) | R net (M1 exact) |
|---|---|---|---|---|
| Aujourd'hui | 384 | 371 (97 %) | +51.6 | +82.6 |
| Recommandé | 295 | 290 (98 %) | +42.5 | +50.5 |

### Plancher ATR partout, règlement M1 exact

| Plancher | Trades | Gagnants | R net | Compte final | Pire baisse | FTMO (réussis / échoués / en cours) |
|---|---|---|---|---|---|---|
| stop d'origine | 412 | 26 % | +90.6 | $15340 (+53.4 %) | 11 % | 5 / 1 / 1 |
| 1× ATR | 401 | 26 % | +87.7 | $15134 (+51.3 %) | 19 % | 5 / 2 / 1 |
| 2× ATR | 340 | 24 % | +31.7 | $11514 (+15.1 %) | 18 % | 3 / 2 / 1 |
| 3× ATR | 283 | 27 % | +39.7 | $12031 (+20.3 %) | 13 % | 2 / 1 / 1 |

### Chaque mécanisme (stop d'origine, M1 exact, seul)

| Mécanisme | Trades | Gagnants | R net |
|---|---|---|---|
| EURUSD judas | 36 | 22 % | -11.8 |
| GER40 breaker | 99 | 14 % | -18.4 |
| GER40 nwog | 29 | 31 % | +24.0 |
| GER40 silver | 52 | 35 % | +17.8 |
| GER40 weekly | 29 | 10 % | -11.8 |
| US100 cbdr | 52 | 29 % | +5.3 |
| US100 divergence | 22 | 32 % | +5.9 |
| US100 fvg | 60 | 23 % | +20.7 |
| US100 nwog | 16 | 38 % | +19.6 |
| US100 silver | 71 | 24 % | -5.1 |
| US500 divergence | 32 | 25 % | -0.5 |
| US500 fvg | 27 | 11 % | -12.2 |
| US500 silver | 63 | 29 % | +6.0 |
| US500 weekly | 30 | 23 % | +10.8 |
| XAUUSD fvg | 22 | 36 % | +17.7 |

Sans US500 Silver et US100 CBDR (stops d'origine, M1 exact) : 374 trades, R net +78.3, compte $14450 (+44.5 %), FTMO 4 / 1 / 1.

## Limites

- Les entrées viennent des modules de backtest (bougies M15) ; un ordre limite est supposé rempli au premier minute de sa bougie M15 qui touche son prix.
- Bid uniquement (le spread est ajouté comme coût fixe) ; pas de glissement, pas d'élargissement du spread au rollover.
- Environ 4 mois : un échantillon, pas une preuve.