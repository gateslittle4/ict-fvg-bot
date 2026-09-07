# Impact au niveau du COMPTE de la stratégie de divergence US100/US500 (lookback 100, seuil z=2) - risque 0.25%/trade

⚠ Compte $10000, risque fixe 0.25%/trade, un seul trade ouvert à la fois, PAS de garde-fous partagés ici (test de la qualité de l'edge seul, pas encore intégré au bot). Config choisie par classement TRAIN uniquement (0.26R train, 0.18R test) - pas en regardant quelle config a l'air la meilleure sur test.

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 107 | 35.5% | 1.0% | 2.2% | non | jour 340 | jamais | $11034 |
| 2020 (train) | 104 | 26.5% | 0.8% | 2.9% | non | jamais | jamais | $10196 |
| 2021 (train) | 103 | 28.2% | 2.2% | 4.9% | non | jamais | jamais | $10243 |
| 2022 (train) | 118 | 28.2% | 2.1% | 2.8% | non | jamais | jamais | $10393 |
| 2023 (train) | 88 | 42.0% | 0.8% | 1.3% | non | jour 221 | jour 340 | $11542 |
| 2024 (test) | 104 | 30.8% | 0.0% | 2.9% | non | jamais | jamais | $10544 |
| 2025 (test) | 105 | 28.8% | 0.0% | 2.8% | non | jamais | jamais | $10394 |