# Impact au niveau du COMPTE — FVG (US100+US500+OR) + Divergence COMBINÉS, avec netting même-instrument (0.5%/trade)

⚠ Compte $10000, un seul budget de garde-fous PARTAGÉ entre les 4 sources de signaux (US100-FVG, US500-FVG, XAUUSD-FVG, Divergence US100/US500), garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2%) - pas assouplis pour laisser plus de place aux sources supplémentaires. XAUUSD-FVG = config choisie par classement TRAIN seul dans full-session-grid-search-gold.md (fenêtre Londres-NY 07h-10h, H4_EMA20, stop swing, 1:3) - fenêtre et mode de stop différents des indices, propres à l'or. Divergence = config choisie par classement TRAIN seul (lookback 100, seuil z=2), reste scoping US100/US500 uniquement (relation de paire, pas applicable à l'or seul). Donnée XAUUSD manque l'année 2022 (zip source jamais fourni) - cette année-là tourne donc sans la source or, comme un rappel de robustesse partielle plutôt qu'un vrai trou. RÈGLE DE NETTING (nouveau, corrige la simplification des runs précédents) : au plus UNE position ouverte par instrument, tous types confondus - si une position Divergence est déjà ouverte sur US100, une nouvelle position FVG-US100 ne peut PAS s'ouvrir tant que la première n'est pas fermée, et vice-versa. Ordre d'arrivée (premier arrivé bloque le second), pas de priorité fixe entre les deux sources.

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21 FVG-idx + 12 FVG-or + 104 div.) | 38.0% | 0.9% | 7.8% | non | jour 96 | jour 210 | $13507 |
| 2020 (train) | 146 (27 FVG-idx + 16 FVG-or + 103 div.) | 36.1% | 1.6% | 9.4% | non | jour 49 | jour 106 | $13457 |
| 2021 (train) | 138 (21 FVG-idx + 16 FVG-or + 101 div.) | 29.7% | 3.4% | 7.5% | non | jour 305 | jamais | $10954 |
| 2022 (train) | 135 (26 FVG-idx + 0 FVG-or + 109 div.) | 30.6% | 3.3% | 6.1% | non | jour 227 | jour 332 | $11463 |
| 2023 (train) | 126 (16 FVG-idx + 22 FVG-or + 88 div.) | 38.4% | 1.8% | 4.9% | non | jour 191 | jour 213 | $13577 |
| 2024 (test) | 135 (17 FVG-idx + 19 FVG-or + 99 div.) | 31.6% | 0.5% | 5.7% | non | jour 45 | jour 142 | $11785 |
| 2025 (test) | 148 (31 FVG-idx + 21 FVG-or + 96 div.) | 34.7% | 0.0% | 3.3% | non | jour 16 | jour 96 | $12947 |