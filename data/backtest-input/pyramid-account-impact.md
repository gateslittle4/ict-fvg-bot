# Impact de la pyramide (+1 lot à +1R) au niveau du COMPTE complet — US100 + US500

⚠ Compte $10000, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis $10,000 le 1er janvier. Compare SANS pyramide vs AVEC pyramide, à risque normal ET à risque moitié (0.125%/0.25%) pour la version pyramide - puisqu'un trade pyramidé peut déployer 2x le risque normal, risquer moitié en base rend le pire cas dollar comparable à la version sans pyramide au risque normal, ce qui est la comparaison honnête ("à risque de pire cas égal, la pyramide ajoute-t-elle vraiment de la valeur?").

## Sans pyramide — 0.25%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 (dont 0 pyramidés) | 45.8% | 0.0% | 1.4% | non | jamais | jamais |
| 2020 (train) | 35 (dont 0 pyramidés) | 60.0% | 0.6% | 0.9% | non | jour 174 | jamais |
| 2021 (train) | 24 (dont 0 pyramidés) | 33.3% | 0.9% | 2.0% | non | jamais | jamais |
| 2022 (train) | 30 (dont 0 pyramidés) | 43.3% | 0.3% | 1.9% | non | jamais | jamais |
| 2023 (train) | 19 (dont 0 pyramidés) | 26.3% | 1.3% | 1.8% | non | jamais | jamais |
| 2024 (test) | 24 (dont 0 pyramidés) | 45.5% | 0.0% | 1.1% | non | jamais | jamais |
| 2025 (test) | 40 (dont 0 pyramidés) | 45.0% | 0.3% | 1.6% | non | jamais | jamais |

## Sans pyramide — 0.5%/trade
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 (dont 0 pyramidés) | 45.8% | 0.0% | 2.8% | non | jour 324 | jamais |
| 2020 (train) | 35 (dont 0 pyramidés) | 60.0% | 1.2% | 1.7% | non | jour 119 | jour 156 |
| 2021 (train) | 24 (dont 0 pyramidés) | 33.3% | 1.7% | 4.0% | non | jamais | jamais |
| 2022 (train) | 30 (dont 0 pyramidés) | 43.3% | 0.6% | 3.7% | non | jour 311 | jamais |
| 2023 (train) | 19 (dont 0 pyramidés) | 26.3% | 2.6% | 3.5% | non | jamais | jamais |
| 2024 (test) | 24 (dont 0 pyramidés) | 45.5% | 0.0% | 2.2% | non | jour 227 | jamais |
| 2025 (test) | 40 (dont 0 pyramidés) | 45.0% | 0.6% | 3.2% | non | jour 239 | jour 357 |

## Avec pyramide — 0.25%/trade de base (pire cas ~0.5%)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 (dont 11 pyramidés) | 33.3% | 0.9% | 1.8% | non | jamais | jamais |
| 2020 (train) | 35 (dont 9 pyramidés) | 54.3% | 0.7% | 0.9% | non | jour 155 | jamais |
| 2021 (train) | 24 (dont 6 pyramidés) | 29.2% | 0.9% | 2.1% | non | jamais | jamais |
| 2022 (train) | 30 (dont 7 pyramidés) | 36.7% | 0.9% | 2.0% | non | jamais | jamais |
| 2023 (train) | 19 (dont 4 pyramidés) | 26.3% | 1.4% | 1.8% | non | jamais | jamais |
| 2024 (test) | 24 (dont 6 pyramidés) | 45.5% | 0.0% | 1.1% | non | jour 263 | jamais |
| 2025 (test) | 40 (dont 6 pyramidés) | 42.5% | 0.3% | 1.6% | non | jour 357 | jamais |

## Avec pyramide — 0.5%/trade de base (pire cas ~1%)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 (dont 11 pyramidés) | 33.3% | 1.8% | 3.6% | non | jamais | jamais |
| 2020 (train) | 35 (dont 9 pyramidés) | 54.3% | 1.4% | 1.7% | non | jour 119 | jour 133 |
| 2021 (train) | 24 (dont 6 pyramidés) | 29.2% | 1.7% | 4.2% | non | jamais | jamais |
| 2022 (train) | 30 (dont 7 pyramidés) | 36.7% | 1.8% | 4.0% | non | jour 313 | jamais |
| 2023 (train) | 19 (dont 4 pyramidés) | 26.3% | 2.7% | 3.5% | non | jamais | jamais |
| 2024 (test) | 24 (dont 6 pyramidés) | 45.5% | 0.0% | 2.2% | non | jour 142 | jour 260 |
| 2025 (test) | 40 (dont 6 pyramidés) | 42.5% | 0.6% | 3.2% | non | jour 225 | jour 357 |

## Avec pyramide — 0.125%/trade de base (pire cas ~0.25%, comparaison à risque égal)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 (dont 11 pyramidés) | 33.3% | 0.4% | 0.9% | non | jamais | jamais |
| 2020 (train) | 35 (dont 9 pyramidés) | 54.3% | 0.4% | 0.4% | non | jamais | jamais |
| 2021 (train) | 24 (dont 6 pyramidés) | 29.2% | 0.4% | 1.1% | non | jamais | jamais |
| 2022 (train) | 30 (dont 7 pyramidés) | 36.7% | 0.4% | 1.0% | non | jamais | jamais |
| 2023 (train) | 19 (dont 4 pyramidés) | 26.3% | 0.7% | 0.9% | non | jamais | jamais |
| 2024 (test) | 24 (dont 6 pyramidés) | 45.5% | 0.0% | 0.5% | non | jamais | jamais |
| 2025 (test) | 40 (dont 6 pyramidés) | 42.5% | 0.1% | 0.8% | non | jamais | jamais |
