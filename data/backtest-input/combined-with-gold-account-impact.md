# Impact au niveau du COMPTE — FVG (US100+US500+OR) + Divergence COMBINÉS, mêmes garde-fous partagés (0.5%/trade)

⚠ Compte $10000, un seul budget de garde-fous PARTAGÉ entre les 4 sources de signaux (US100-FVG, US500-FVG, XAUUSD-FVG, Divergence US100/US500), garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2%) - pas assouplis pour laisser plus de place aux sources supplémentaires. XAUUSD-FVG = config choisie par classement TRAIN seul dans full-session-grid-search-gold.md (fenêtre Londres-NY 07h-10h, H4_EMA20, stop swing, 1:3) - fenêtre et mode de stop différents des indices, propres à l'or. Divergence = config choisie par classement TRAIN seul (lookback 100, seuil z=2), reste scoping US100/US500 uniquement (relation de paire, pas applicable à l'or seul). Donnée XAUUSD manque l'année 2022 (zip source jamais fourni) - cette année-là tourne donc sans la source or, comme un rappel de robustesse partielle plutôt qu'un vrai trou. Simplification connue : une position Divergence et une position FVG sur le MÊME instrument peuvent être ouvertes simultanément dans ce modèle (slots suivis indépendamment).

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 141 (23 FVG-idx + 12 FVG-or + 106 div.) | 37.6% | 0.9% | 7.8% | non | jour 96 | jour 210 | $13470 |
| 2020 (train) | 152 (33 FVG-idx + 16 FVG-or + 103 div.) | 38.0% | 1.6% | 8.0% | non | jour 49 | jour 113 | $14369 |
| 2021 (train) | 140 (24 FVG-idx + 16 FVG-or + 100 div.) | 30.0% | 3.4% | 6.7% | non | jour 305 | jamais | $11041 |
| 2022 (train) | 144 (29 FVG-idx + 0 FVG-or + 115 div.) | 31.5% | 3.3% | 6.1% | non | jour 214 | jour 313 | $11853 |
| 2023 (train) | 127 (17 FVG-idx + 22 FVG-or + 88 div.) | 38.1% | 1.8% | 4.9% | non | jour 191 | jour 213 | $13509 |
| 2024 (test) | 144 (22 FVG-idx + 19 FVG-or + 103 div.) | 32.4% | 0.5% | 5.7% | non | jour 43 | jour 135 | $12158 |
| 2025 (test) | 156 (39 FVG-idx + 21 FVG-or + 96 div.) | 34.8% | 0.0% | 3.6% | non | jour 16 | jour 96 | $13127 |