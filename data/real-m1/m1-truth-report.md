# La vérité à la minute : mêmes trades, règlement M15 prudent vs M1 exact

Fenêtre couverte par les bougies d'1 minute du broker sur les 5 paires : 2026-05-20 → 2026-09-18 (environ 4 mois, données réelles). 10 000 $, 0,5 % de risque, sans plafond d'objectif, garde-fous simplifiés, spread inclus, filtre « stop ≥ 3× le spread ».

| Configuration | Règlement | Trades | Gagnants | R net | Compte final | Pire baisse | Défis FTMO 1-Step (réussis / échoués / en cours) |
|---|---|---|---|---|---|---|---|
| Aujourd'hui (15 mécanismes, stops d'origine) | M15 prudent | 248 | 21 % | -8.4 | **$9463** (-5.4 %) | 19 % | 1 / 3 / 1 |
| Aujourd'hui (15 mécanismes, stops d'origine) | M1 exact (33 entrées jamais remplies, écartées) | 224 | 23 % | +18.0 | **$10802** (+8.0 %) | 11 % | 1 / 1 / 1 |
| Recommandé (13 mécanismes, planchers ATR) | M15 prudent | 187 | 25 % | +29.7 | **$11481** (+14.8 %) | 8 % | 1 / 0 / 1 |
| Recommandé (13 mécanismes, planchers ATR) | M1 exact (15 entrées jamais remplies, écartées) | 174 | 22 % | +11.1 | **$10475** (+4.8 %) | 11 % | 1 / 1 / 1 |

Sur les 158 trades pris par les deux règlements (configuration recommandée) : même issue (gain/perte) pour 158 (100 %) ; **perte en M15 mais gain en M1 : 0** ; gain en M15 mais perte en M1 : 0.

## Limites

- Les entrées viennent des modules de backtest (bougies M15) ; un ordre limite est supposé rempli au premier minute de sa bougie M15 qui touche son prix.
- Bid uniquement (le spread est ajouté comme coût fixe) ; pas de glissement, pas d'élargissement du spread au rollover.
- Environ 4 mois : un échantillon, pas une preuve.