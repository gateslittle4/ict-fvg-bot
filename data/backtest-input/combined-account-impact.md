# Impact au niveau du COMPTE — FVG + Divergence COMBINÉS, mêmes garde-fous partagés (0.5%/trade)

⚠ Compte $10000, un seul budget de garde-fous PARTAGÉ entre les 3 sources de signaux (US100-FVG, US500-FVG, Divergence), garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2%) - pas assouplis pour laisser plus de place à la divergence. Divergence = config choisie par classement TRAIN seul (lookback 100, seuil z=2). Simplification connue : une position Divergence et une position FVG sur le MÊME instrument peuvent être ouvertes simultanément dans ce modèle (slots suivis indépendamment).

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 129 (23 FVG + 106 div.) | 37.2% | 0.9% | 6.7% | non | jour 96 | jour 253 | $13064 |
| 2020 (train) | 137 (33 FVG + 104 div.) | 34.6% | 1.8% | 6.6% | non | jour 119 | jour 140 | $12570 |
| 2021 (train) | 125 (24 FVG + 101 div.) | 29.6% | 2.9% | 7.0% | non | jour 305 | jamais | $10846 |
| 2022 (train) | 144 (29 FVG + 115 div.) | 31.5% | 3.3% | 6.1% | non | jour 214 | jour 313 | $11853 |
| 2023 (train) | 107 (18 FVG + 89 div.) | 36.4% | 2.6% | 5.2% | non | jour 197 | jour 225 | $12501 |
| 2024 (test) | 127 (23 FVG + 104 div.) | 32.8% | 0.5% | 5.2% | non | jour 45 | jour 185 | $12047 |
| 2025 (test) | 139 (40 FVG + 99 div.) | 34.8% | 0.0% | 5.6% | non | jour 51 | jour 168 | $12733 |