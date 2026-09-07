# Impact au niveau du COMPTE de la stratégie de divergence US100/US500 (lookback 100, seuil z=2)

⚠ Compte $10000, risque fixe 0.5%/trade, un seul trade ouvert à la fois, PAS de garde-fous partagés ici (test de la qualité de l'edge seul, pas encore intégré au bot). Config choisie par classement TRAIN uniquement (0.26R train, 0.18R test) - pas en regardant quelle config a l'air la meilleure sur test.

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 107 | 35.5% | 2.0% | 4.3% | non | jour 190 | jour 274 | $12144 |
| 2020 (train) | 104 | 26.5% | 1.6% | 5.8% | non | jour 201 | jamais | $10374 |
| 2021 (train) | 103 | 28.2% | 4.4% | 9.6% | non | jour 305 | jamais | $10470 |
| 2022 (train) | 118 | 28.2% | 4.3% | 5.7% | non | jour 225 | jamais | $10776 |
| 2023 (train) | 88 | 42.0% | 1.6% | 2.6% | non | jour 173 | jour 203 | $13291 |
| 2024 (test) | 104 | 30.8% | 0.0% | 5.8% | non | jour 127 | jamais | $11093 |
| 2025 (test) | 105 | 28.8% | 0.0% | 5.6% | non | jour 50 | jamais | $10780 |