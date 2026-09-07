# Position sizing dynamique — échelle de risque évolutive testée sur le VRAI combo (FVG US100+US500+OR + Divergence), règles FTMO 1-Step

⚠ Compte $10000, combo recommandé réel (voir HANDOFF.md), règles FTMO 1-Step (cible +10% unique, perte max TRAILING 10% sur le plus haut solde jamais atteint). Échelle testée : base 0.25%, +0.25% après chaque trade gagnant (plafond 1.00%), reset à 0.25% après une perte, puis -0.05% supplémentaire par perte additionnelle (plancher 0.10%) — PARAMÈTRES IDENTIQUES à ceux déjà publiés dans adaptive-risk-account-impact.md (non retouchés ici). **Vérification préalable du postulat** (checkOutcomeSerialCorrelationFullCombo.js) : sur le VRAI combo (Divergence = ~70% des trades), le lien gagne-après-gagne est BEAUCOUP plus faible que sur le sous-ensemble FVG seul déjà testé (37.4% vs 32.8% global, et quasi NUL en test : 33.7% vs 33.5%, n=95/188). Ce test vérifie si l'échelle aide quand même (protection anti-ruine indépendante du postulat) ou non. Un DEUXIÈME mécanisme, sans dépendance à ce postulat, est aussi testé : un simple frein sur drawdown (risque plein 0.5% tant que le drawdown trailing reste sous 5% du plus haut solde, risque réduit à 0.25% au-delà, retour au plein risque sous 3% - convention de gestion de risque courante côté prop firm, le seuil 5% étant la moitié du plafond de perte réel 10%).

## Risque fixe — 0.25%/trade
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 0.4% | 4.0% | non | jour 283 | $11641 | 0.25%-0.25% (moy 0.25%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 0.8% | 4.8% | non | jour 125 | $11625 | 0.25%-0.25% (moy 0.25%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 1.7% | 3.8% | non | jamais | $10482 | 0.25%-0.25% (moy 0.25%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 1.7% | 3.1% | non | jamais | $10723 | 0.25%-0.25% (moy 0.25%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 0.9% | 2.5% | non | jour 260 | $11672 | 0.25%-0.25% (moy 0.25%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.3% | 2.9% | non | jour 312 | $10873 | 0.25%-0.25% (moy 0.25%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 1.6% | non | jour 177 | $11399 | 0.25%-0.25% (moy 0.25%) |

## Risque fixe — 0.5%/trade (RÉFÉRENCE PRODUCTION ACTUELLE)
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 0.9% | 7.8% | non | jour 96 | $13507 | 0.50%-0.50% (moy 0.50%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 1.6% | 9.4% | non | jour 61 | $13457 | 0.50%-0.50% (moy 0.50%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 3.4% | 7.5% | non | jour 311 | $10954 | 0.50%-0.50% (moy 0.50%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 3.3% | 6.1% | non | jour 254 | $11463 | 0.50%-0.50% (moy 0.50%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 1.8% | 4.9% | non | jour 197 | $13577 | 0.50%-0.50% (moy 0.50%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.5% | 5.7% | non | jour 107 | $11785 | 0.50%-0.50% (moy 0.50%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 3.3% | non | jour 49 | $12947 | 0.50%-0.50% (moy 0.50%) |

## Risque évolutif — base 0.25%, +0.25%/gain (plafond 1.00%), reset puis -0.05%/perte (plancher 0.10%)
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 1.2% | 3.0% | non | jour 276 | $12144 | 0.10%-1.00% (moy 0.33%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 1.0% | 4.6% | non | jour 119 | $12328 | 0.10%-1.00% (moy 0.32%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 3.0% | 4.9% | non | jamais | $10297 | 0.10%-0.95% (moy 0.28%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 1.1% | 2.9% | non | jour 227 | $11661 | 0.10%-1.00% (moy 0.30%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 1.1% | 3.7% | non | jour 205 | $12127 | 0.10%-1.00% (moy 0.34%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.3% | 4.3% | non | jour 142 | $11655 | 0.10%-1.00% (moy 0.30%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 4.3% | non | jour 303 | $10791 | 0.10%-1.00% (moy 0.31%) |

## Frein sur drawdown — 0.5% plein tant que DD trailing <5%, 0.25% au-delà, retour au plein sous 3%
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 0.9% | 6.5% | non | jour 96 | $13153 | 0.25%-0.50% (moy 0.46%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 1.6% | 7.5% | non | jour 61 | $13304 | 0.25%-0.50% (moy 0.41%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 3.4% | 6.5% | non | jamais | $10665 | 0.25%-0.50% (moy 0.43%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 2.9% | 5.6% | non | jour 332 | $10937 | 0.25%-0.50% (moy 0.41%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 1.8% | 4.9% | non | jour 197 | $13577 | 0.50%-0.50% (moy 0.50%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.5% | 5.5% | non | jour 107 | $11434 | 0.25%-0.50% (moy 0.46%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 3.3% | non | jour 49 | $12947 | 0.50%-0.50% (moy 0.50%) |
