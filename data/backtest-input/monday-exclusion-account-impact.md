# Impact au niveau du COMPTE d'exclure le lundi sur US500 — US100 + US500, 0.5%/trade

⚠ Compte $10000, risque fixe 0.5%/trade, US100 inchangé, seul US500 exclut les signaux du lundi (piste trouvée sur train AVANT de regarder test - contrairement à l'exclusion du vendredi, testée dans exploratory-analysis.md mais rejetée car découverte en regardant test, donc invalide méthodologiquement).

## US500 sans exclusion (actuel)
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 2.8% | non | jour 324 | jamais | $10857 |
| 2020 (train) | 35 | 60.0% | 1.2% | 1.7% | non | jour 119 | jour 156 | $12478 |
| 2021 (train) | 24 | 33.3% | 1.7% | 4.0% | non | jamais | jamais | $10251 |
| 2022 (train) | 30 | 43.3% | 0.6% | 3.7% | non | jour 311 | jamais | $11002 |
| 2023 (train) | 19 | 26.3% | 2.6% | 3.5% | non | jamais | jamais | $9976 |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 227 | jamais | $11027 |
| 2025 (test) | 40 | 45.0% | 0.6% | 3.2% | non | jour 239 | jour 357 | $11474 |

## US500 sans lundi
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 23 | 47.8% | 0.0% | 2.8% | non | jour 324 | jamais | $10918 |
| 2020 (train) | 33 | 60.6% | 1.2% | 1.7% | non | jour 119 | jour 156 | $12380 |
| 2021 (train) | 23 | 34.8% | 1.1% | 4.0% | non | jamais | jamais | $10315 |
| 2022 (train) | 29 | 44.8% | 0.6% | 3.7% | non | jour 281 | jamais | $11074 |
| 2023 (train) | 17 | 29.4% | 2.1% | 3.0% | non | jamais | jamais | $10083 |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 227 | jamais | $11027 |
| 2025 (test) | 34 | 50.0% | 0.0% | 2.1% | non | jour 225 | jour 357 | $11635 |
