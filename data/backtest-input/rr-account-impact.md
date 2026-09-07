# Impact d'un R:R plus bas au niveau du COMPTE complet — US100 + US500, 0.5%/trade

⚠ Compte $10000, risque fixe 0.5%/trade, mêmes filtres partout (structure ON, session 10h-11h, sweep ON), seul rrMultiple change. 1:2.5 est le seul autre R:R qui "tient" encore pleinement hors-échantillon (voir rr-multiple-sweep.md) - 1:2 et en dessous s'affaiblissent ou cassent carrément sur test.

## R:R 1:3
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 2.8% | non | jour 324 | jamais | $10857 |
| 2020 (train) | 35 | 60.0% | 1.2% | 1.7% | non | jour 119 | jour 156 | $12478 |
| 2021 (train) | 24 | 33.3% | 1.7% | 4.0% | non | jamais | jamais | $10251 |
| 2022 (train) | 30 | 43.3% | 0.6% | 3.7% | non | jour 311 | jamais | $11002 |
| 2023 (train) | 19 | 26.3% | 2.6% | 3.5% | non | jamais | jamais | $9976 |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 227 | jamais | $11027 |
| 2025 (test) | 40 | 45.0% | 0.6% | 3.2% | non | jour 239 | jour 357 | $11474 |

## R:R 1:2.5
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.5% | 2.8% | non | jamais | jamais | $10567 |
| 2020 (train) | 35 | 65.7% | 0.0% | 1.7% | non | jour 113 | jour 155 | $12271 |
| 2021 (train) | 24 | 33.3% | 1.7% | 4.0% | non | jamais | jamais | $10050 |
| 2022 (train) | 30 | 43.3% | 0.6% | 3.7% | non | jamais | jamais | $10656 |
| 2023 (train) | 19 | 31.6% | 2.1% | 3.5% | non | jamais | jamais | $10027 |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 263 | jamais | $10759 |
| 2025 (test) | 40 | 47.5% | 0.9% | 3.2% | non | jour 292 | jamais | $11171 |
