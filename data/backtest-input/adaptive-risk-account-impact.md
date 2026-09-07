# Risque évolutif (échelle "gagne = monte, perd = redescend") au niveau du COMPTE complet — US100 + US500

⚠ Compte $10000, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis $10,000 le 1er janvier. Échelle testée : base 0.25%, +0.25% après chaque trade gagnant (plafond 1.00%), reset direct à 0.25% après une perte, puis -0.05% supplémentaire par perte additionnelle en dessous de la base (plancher 0.10%) si la série de pertes continue. Un seul niveau de risque PARTAGÉ entre US100 et US500 (comme le budget de trades des garde-fous), mis à jour au moment où N'IMPORTE QUEL trade se ferme. Comparé à risque fixe 0.25% et 0.5% (nos deux références habituelles).

## Risque fixe — 0.25%/trade
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 1.4% | non | jamais | jamais | $10424 | 0.25%-0.25% (moy 0.25%) |
| 2020 (train) | 35 | 60.0% | 0.6% | 0.9% | non | jour 174 | jamais | $11179 | 0.25%-0.25% (moy 0.25%) |
| 2021 (train) | 24 | 33.3% | 0.9% | 2.0% | non | jamais | jamais | $10127 | 0.25%-0.25% (moy 0.25%) |
| 2022 (train) | 30 | 43.3% | 0.3% | 1.9% | non | jamais | jamais | $10495 | 0.25%-0.25% (moy 0.25%) |
| 2023 (train) | 19 | 26.3% | 1.3% | 1.8% | non | jamais | jamais | $9990 | 0.25%-0.25% (moy 0.25%) |
| 2024 (test) | 24 | 45.5% | 0.0% | 1.1% | non | jamais | jamais | $10505 | 0.25%-0.25% (moy 0.25%) |
| 2025 (test) | 40 | 45.0% | 0.3% | 1.6% | non | jamais | jamais | $10719 | 0.25%-0.25% (moy 0.25%) |

## Risque fixe — 0.5%/trade
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 2.8% | non | jour 324 | jamais | $10857 | 0.50%-0.50% (moy 0.50%) |
| 2020 (train) | 35 | 60.0% | 1.2% | 1.7% | non | jour 119 | jour 156 | $12478 | 0.50%-0.50% (moy 0.50%) |
| 2021 (train) | 24 | 33.3% | 1.7% | 4.0% | non | jamais | jamais | $10251 | 0.50%-0.50% (moy 0.50%) |
| 2022 (train) | 30 | 43.3% | 0.6% | 3.7% | non | jour 311 | jamais | $11002 | 0.50%-0.50% (moy 0.50%) |
| 2023 (train) | 19 | 26.3% | 2.6% | 3.5% | non | jamais | jamais | $9976 | 0.50%-0.50% (moy 0.50%) |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.2% | non | jour 227 | jamais | $11027 | 0.50%-0.50% (moy 0.50%) |
| 2025 (test) | 40 | 45.0% | 0.6% | 3.2% | non | jour 239 | jour 357 | $11474 | 0.50%-0.50% (moy 0.50%) |

## Risque évolutif — base 0.25%, +0.25%/gain (plafond 1.00%), reset puis -0.05%/perte (plancher 0.10%)
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.0% | 2.0% | non | jour 339 | jamais | $10830 | 0.10%-1.00% (moy 0.41%) |
| 2020 (train) | 35 | 60.0% | 0.6% | 1.7% | non | jour 133 | jour 155 | $13109 | 0.15%-1.00% (moy 0.53%) |
| 2021 (train) | 24 | 33.3% | 0.8% | 2.6% | non | jour 158 | jamais | $10567 | 0.10%-1.00% (moy 0.34%) |
| 2022 (train) | 30 | 43.3% | 0.3% | 2.9% | non | jamais | jamais | $10374 | 0.10%-1.00% (moy 0.40%) |
| 2023 (train) | 19 | 26.3% | 1.2% | 1.7% | non | jamais | jamais | $9912 | 0.10%-0.60% (moy 0.25%) |
| 2024 (test) | 24 | 45.5% | 0.0% | 2.1% | non | jamais | jamais | $10570 | 0.15%-1.00% (moy 0.44%) |
| 2025 (test) | 40 | 45.0% | 0.8% | 2.5% | non | jour 309 | jamais | $10870 | 0.10%-1.00% (moy 0.39%) |

## Risque évolutif (v2, tolère 1 perte isolée) — base 0.25%, +0.25%/gain (plafond 1.00%), NE reset qu'à la 2e perte d'affilée, puis -0.05%/perte (plancher 0.10%)
| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 24 | 45.8% | 0.3% | 3.1% | non | jour 339 | jamais | $10528 | 0.10%-1.00% (moy 0.56%) |
| 2020 (train) | 35 | 60.0% | 0.6% | 3.0% | non | jour 119 | jour 133 | $13855 | 0.20%-1.00% (moy 0.73%) |
| 2021 (train) | 24 | 33.3% | 0.9% | 3.4% | non | jour 158 | jamais | $10529 | 0.10%-1.00% (moy 0.46%) |
| 2022 (train) | 30 | 43.3% | 0.3% | 3.5% | non | jamais | jamais | $10646 | 0.10%-1.00% (moy 0.51%) |
| 2023 (train) | 19 | 26.3% | 1.2% | 2.8% | non | jamais | jamais | $10004 | 0.10%-1.00% (moy 0.39%) |
| 2024 (test) | 24 | 45.5% | 0.5% | 2.7% | non | jour 260 | jamais | $10925 | 0.20%-1.00% (moy 0.60%) |
| 2025 (test) | 40 | 45.0% | 0.9% | 3.7% | non | jour 303 | jamais | $10998 | 0.10%-1.00% (moy 0.51%) |
