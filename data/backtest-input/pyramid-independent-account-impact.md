# Impact de la pyramide "stops indépendants, sans breakeven" au niveau du COMPTE complet — US100 + US500

⚠ Compte $10000, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis $10,000 le 1er janvier. Design testé : le stop de l'unité ORIGINALE n'est JAMAIS déplacé (elle se comporte exactement comme sans gestion active) ; une SECONDE unité, totalement indépendante (sa propre entrée/stop/target), est ouverte à +1R et se résout seule - un pullback qui la stoppe ne touche pas l'unité originale. Comparé SANS pyramide vs AVEC cette pyramide, à risque normal ET à risque de base moitié (0.125%/0.25%) pour la variante pyramide - un trade pyramidé pouvant déployer jusqu'à 2x le risque normal si les deux unités perdent, risquer moitié en base rend le pire cas dollar comparable à la version sans pyramide au risque normal (comparaison à pire cas égal).

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

## Pyramide stops indépendants — 0.25%/trade de base (pire cas ~0.5%)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 38 (dont 14 pyramidés) | 47.4% | 0.3% | 2.2% | non | jamais | jamais |
| 2020 (train) | 47 (dont 12 pyramidés) | 55.3% | 1.5% | 1.5% | non | jour 174 | jamais |
| 2021 (train) | 31 (dont 7 pyramidés) | 35.5% | 0.9% | 2.0% | non | jamais | jamais |
| 2022 (train) | 38 (dont 8 pyramidés) | 44.7% | 0.5% | 2.2% | non | jamais | jamais |
| 2023 (train) | 25 (dont 6 pyramidés) | 28.0% | 2.4% | 2.4% | non | jamais | jamais |
| 2024 (test) | 30 (dont 6 pyramidés) | 55.6% | 0.0% | 1.1% | non | jour 263 | jamais |
| 2025 (test) | 46 (dont 6 pyramidés) | 47.8% | 0.3% | 1.6% | non | jour 357 | jamais |

## Pyramide stops indépendants — 0.5%/trade de base (pire cas ~1%)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 38 (dont 14 pyramidés) | 47.4% | 0.5% | 4.5% | non | jour 310 | jamais |
| 2020 (train) | 47 (dont 12 pyramidés) | 55.3% | 3.0% | 3.0% | non | jour 119 | jour 155 |
| 2021 (train) | 31 (dont 7 pyramidés) | 35.5% | 1.7% | 4.0% | non | jamais | jamais |
| 2022 (train) | 38 (dont 8 pyramidés) | 44.7% | 1.1% | 4.3% | non | jour 281 | jamais |
| 2023 (train) | 25 (dont 6 pyramidés) | 28.0% | 4.7% | 4.7% | non | jamais | jamais |
| 2024 (test) | 30 (dont 6 pyramidés) | 55.6% | 0.0% | 2.2% | non | jour 142 | jour 260 |
| 2025 (test) | 46 (dont 6 pyramidés) | 47.8% | 0.6% | 3.2% | non | jour 225 | jour 309 |

## Pyramide stops indépendants — 0.125%/trade de base (pire cas ~0.25%, comparaison à risque égal)
| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 38 (dont 14 pyramidés) | 47.4% | 0.1% | 1.1% | non | jamais | jamais |
| 2020 (train) | 47 (dont 12 pyramidés) | 55.3% | 0.8% | 0.8% | non | jamais | jamais |
| 2021 (train) | 31 (dont 7 pyramidés) | 35.5% | 0.4% | 1.0% | non | jamais | jamais |
| 2022 (train) | 38 (dont 8 pyramidés) | 44.7% | 0.3% | 1.1% | non | jamais | jamais |
| 2023 (train) | 25 (dont 6 pyramidés) | 28.0% | 1.2% | 1.2% | non | jamais | jamais |
| 2024 (test) | 30 (dont 6 pyramidés) | 55.6% | 0.0% | 0.5% | non | jamais | jamais |
| 2025 (test) | 46 (dont 6 pyramidés) | 47.8% | 0.1% | 0.8% | non | jamais | jamais |
