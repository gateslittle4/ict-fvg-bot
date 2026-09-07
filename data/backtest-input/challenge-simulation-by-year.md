# Simulation "challenge $10,000" par année, avec et sans filtre liquidity sweep

⚠ Compte de $10000, setup US100 (H4/EMA200) + US500 (H1/EMA50), structure ICT ON, session 10h-11h NY "Silver Bullet", fvg-edge, 1:3 - le meilleur combo trouvé en fixant la fenêtre dès le départ de la recherche (voir silver-bullet-grid-search.md), même GuardrailEngine que le bot réel. Chaque année est simulée INDÉPENDAMMENT à partir de $10,000 le 1er janvier de cette année-là (pas de report du solde d'une année à l'autre). Deux niveaux de risque testés (0.25% et 0.5%) - ce setup montre des drawdowns nettement plus bas que le précédent, ce qui laisse de la marge pour tester un risque un peu plus élevé sans dépasser les limites FundingPips.

⚠⚠ **2019-2023 = années "train"** (utilisées pour choisir cette config au départ - les résultats y sont probablement optimistes/gonflés). **2024-2025 = années "test"**, jamais utilisées pour choisir quoi que ce soit - ce sont les SEULES qui donnent une vraie idée de ce à quoi s'attendre. Repères FundingPips (Phase 1 +8%, Phase 2 +5% du nouveau solde, bust statique à -10%) non revérifiés sur fundingpips.com cette session.

## Sans filtre liquidity sweep — risque 0.25%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 83 | 34.9% | 0.0% | 3.7% | non | jamais | jamais |
| 2020 (train) | 130 | 31.8% | 1.8% | 4.1% | non | jamais | jamais |
| 2021 (train) | 116 | 36.2% | 1.0% | 2.9% | non | jour 353 (2021-12-22) | jamais |
| 2022 (train) | 116 | 34.2% | 1.5% | 3.3% | non | jour 347 (2022-12-15) | jamais |
| 2023 (train) | 90 | 30.0% | 1.1% | 4.1% | non | jamais | jamais |
| 2024 (test) | 114 | 33.0% | 3.4% | 4.1% | non | jamais | jamais |
| 2025 (test) | 136 | 33.8% | 2.4% | 3.9% | non | jour 303 (2025-10-31) | jamais |

## Sans filtre liquidity sweep — risque 0.5%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 83 | 34.9% | 0.0% | 7.3% | non | jour 96 (2019-04-07) | jamais |
| 2020 (train) | 130 | 31.8% | 3.7% | 8.0% | non | jour 211 (2020-07-30) | jour 274 (2020-10-01) |
| 2021 (train) | 116 | 36.2% | 2.1% | 5.7% | non | jour 102 (2021-04-15) | jour 318 (2021-11-17) |
| 2022 (train) | 116 | 34.2% | 3.1% | 6.4% | non | jour 305 (2022-11-03) | jour 324 (2022-11-22) |
| 2023 (train) | 90 | 30.0% | 2.3% | 8.1% | non | jour 226 (2023-08-16) | jamais |
| 2024 (test) | 114 | 33.0% | 6.7% | 8.1% | non | jour 291 (2024-10-18) | jour 364 (2024-12-30) |
| 2025 (test) | 136 | 33.8% | 4.8% | 7.6% | non | jour 166 (2025-06-16) | jour 267 (2025-09-25) |

## Avec filtre liquidity sweep — risque 0.25%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 1.4% | non | jamais | jamais |
| 2020 (train) | 35 | 60.0% | 0.6% | 0.9% | non | jour 174 (2020-06-23) | jamais |
| 2021 (train) | 24 | 33.3% | 0.9% | 2.0% | non | jamais | jamais |
| 2022 (train) | 30 | 43.3% | 0.3% | 1.9% | non | jamais | jamais |
| 2023 (train) | 19 | 26.3% | 1.3% | 1.8% | non | jamais | jamais |
| 2024 (test) | 24 | 45.5% | 0.0% | 1.1% | non | jamais | jamais |
| 2025 (test) | 40 | 45.0% | 0.3% | 1.6% | non | jamais | jamais |

## Avec filtre liquidity sweep — risque 0.5%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 2.8% | non | jour 324 (2019-11-21) | jamais |
| 2020 (train) | 35 | 60.0% | 1.2% | 1.7% | non | jour 119 (2020-04-29) | jour 156 (2020-06-05) |
| 2021 (train) | 24 | 33.3% | 1.7% | 4.0% | non | jamais | jamais |
| 2022 (train) | 30 | 43.3% | 0.6% | 3.7% | non | jour 311 (2022-11-09) | jamais |
| 2023 (train) | 19 | 26.3% | 2.6% | 3.5% | non | jamais | jamais |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 227 (2024-08-15) | jamais |
| 2025 (test) | 40 | 45.0% | 0.6% | 3.2% | non | jour 239 (2025-08-28) | jour 357 (2025-12-24) |
