# Market Maker Buy / Sell Model (version mécanique) — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-market-maker-model-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runMarketMakerModelStudy.js`, règles `scripts/lib/marketMakerModel.js` (testées). R par trade, réglé à la minute, spread par défaut.

| Paire | Période | Trades | Gagnants | Achats / ventes | Cible moyenne | R net | R/trade | t |
|---|---|---|---|---|---|---|---|---|
| US100 + US500 | Entraînement 2011-2022 | 22 | 23 % | 4 / 18 | 6.8 R | +4.3 | +0.194 | 0.39 |
| US100 + US500 | 2011-2016 | 14 | 29 % | 2 / 12 | 6.1 R | +7.9 | +0.563 | 0.78 |
| US100 + US500 | 2017-2022 | 8 | 13 % | 2 / 6 | 8.2 R | -3.6 | -0.450 | -0.82 |
| US100 + US500 | Test 2023-2025 | 5 | 20 % | 2 / 3 | 3.4 R | -1.5 | -0.294 | -0.42 |
| US100 + US500 | 2026 (→ 21/09) | 0 | 0 % | 0 / 0 | - R | +0.0 | +0.000 | 0.00 |
| US100 | Entraînement 2011-2022 | 10 | 20 % | 2 / 8 | 8.4 R | -0.2 | -0.022 | -0.03 |
| US100 | 2011-2016 | 5 | 40 % | 1 / 4 | 6.3 R | +4.8 | +0.956 | 0.75 |
| US100 | 2017-2022 | 5 | 0 % | 1 / 4 | 10.4 R | -5.0 | -1.000 | 0.00 |
| US100 | Test 2023-2025 | 0 | 0 % | 0 / 0 | - R | +0.0 | +0.000 | 0.00 |
| US100 | 2026 (→ 21/09) | 0 | 0 % | 0 / 0 | - R | +0.0 | +0.000 | 0.00 |
| US500 | Entraînement 2011-2022 | 12 | 25 % | 2 / 10 | 5.6 R | +4.5 | +0.375 | 0.50 |
| US500 | 2011-2016 | 9 | 22 % | 1 / 8 | 6.0 R | +3.1 | +0.344 | 0.37 |
| US500 | 2017-2022 | 3 | 33 % | 1 / 2 | 4.4 R | +1.4 | +0.466 | 0.32 |
| US500 | Test 2023-2025 | 5 | 20 % | 2 / 3 | 3.4 R | -1.5 | -0.294 | -0.42 |
| US500 | 2026 (→ 21/09) | 0 | 0 % | 0 / 0 | - R | +0.0 | +0.000 | 0.00 |

## Verdict (US100 + US500, critère pré-enregistré)

Entraînement : 22 trades, +0.194 R/trade, t 0.39, 2011-2016 +7.9 R, 2017-2022 -3.6 R ; test 2023-2025 : 5 trades, -1.5 R → **NON CONCLUANT** (moins de 60 trades à l'entraînement)

## Sorties (toutes périodes)

- target : 6
- stop : 21
- time : 0

## Où les modèles s'arrêtent (entraînement 2011-2022, diagnostic sans changement de règle)

| | US100 | US500 |
|---|---|---|
| Consolidations de départ trouvées (12 H1 dans 1,5 ATR) | 35 | 36 |
| Descente < 3 ATR en 5 jours | 10 | 9 |
| Pas de plus bas H1 balayé | 1 | 2 |
| MSS sans FVG | 1 | 2 |
| Structures complètes (MSS + FVG) | 23 | 23 |
| Cible < 2R | 11 | 9 |
| LIMIT non rempli en 4 h | 2 | 2 |
| **Trades** | **10** | **12** |

Le goulot est la règle 1 : 12 bougies H1 contenues dans 1,5 fois l'amplitude moyenne d'UNE bougie H1 n'arrivent qu'environ 3 fois par an. La traduction mécanique choisie était trop stricte pour produire assez de trades ; le modèle n'est ni validé ni réfuté.

## Limites

- UNE traduction mécanique d'un modèle visuel ; HistData ≠ prix du broker ; spread par défaut, pas de glissement ; bougies H1/M15 en heures UTC (les week-ends comptent comme des bougies manquantes).
