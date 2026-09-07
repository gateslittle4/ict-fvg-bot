# Impact au niveau du COMPTE — même setup validé (FVG US100+US500+OR + Divergence, netting), sous les règles FTMO 1-Step

⚠ Compte $10000, un seul budget de garde-fous PARTAGÉ entre les 4 sources de signaux (US100-FVG, US500-FVG, XAUUSD-FVG, Divergence US100/US500), netting même-instrument actif (au plus une position par instrument, peu importe la source). Notre propre garde-fou de perte quotidienne (2%, INCHANGÉ) reste plus strict que la limite réelle de FTMO 1-Step (3%) - donc ce test sous-estime plutôt la marge réelle. **Cible = +10% une seule fois (FTMO 1-Step), pas de Phase 2.** **Perte totale max = TRAILING sur le plus haut solde jamais atteint (10%), pas statique sur le solde de départ** - règle confirmée sur ftmo.com/en/trading-objectives/ (sept. 2026); c'est une mesure plus stricte que le 10-12% statique de FundingPips utilisé dans les runs précédents, donc le nombre de bustés peut différer même à stratégie identique. XAUUSD-FVG = config choisie par classement TRAIN seul (fenêtre Londres-NY 07h-10h, H4_EMA20, stop swing, 1:3). Divergence = config choisie par classement TRAIN seul (lookback 100, seuil z=2), scope US100/US500 uniquement. Donnée XAUUSD manque l'année 2022 (zip source jamais fourni).

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21 FVG-idx + 12 FVG-or + 104 div.) | 38.0% | 0.9% | 7.8% | non | jour 96 | $13507 |
| 2020 (train) | 146 (27 FVG-idx + 16 FVG-or + 103 div.) | 36.1% | 1.6% | 9.4% | non | jour 61 | $13457 |
| 2021 (train) | 138 (21 FVG-idx + 16 FVG-or + 101 div.) | 29.7% | 3.4% | 7.5% | non | jour 311 | $10954 |
| 2022 (train) | 135 (26 FVG-idx + 0 FVG-or + 109 div.) | 30.6% | 3.3% | 6.1% | non | jour 254 | $11463 |
| 2023 (train) | 126 (16 FVG-idx + 22 FVG-or + 88 div.) | 38.4% | 1.8% | 4.9% | non | jour 197 | $13577 |
| 2024 (test) | 135 (17 FVG-idx + 19 FVG-or + 99 div.) | 31.6% | 0.5% | 5.7% | non | jour 107 | $11785 |
| 2025 (test) | 148 (31 FVG-idx + 21 FVG-or + 96 div.) | 34.7% | 0.0% | 3.3% | non | jour 49 | $12947 |