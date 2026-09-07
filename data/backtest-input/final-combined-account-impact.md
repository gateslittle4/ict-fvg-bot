# Impact au niveau du COMPTE — COMBINAISON FINALE : FVG (US100+US500+OR) + Divergence + RSI(2), règles FTMO 1-Step

⚠ Compte $10000, TOUT ce qui a été validé dans ce projet réuni sur un seul compte : FVG sur US100, US500 ET XAUUSD (config propre à chaque instrument), Divergence US100/US500 (lookback 100, seuil z=2, scope limité à ces deux instruments par nature), et RSI(2) mean-reversion (Connors, EMA200 + stop 2xATR(14) + sortie SMA(5)/10 jours) sur US100/US500 uniquement (jamais testé sur l'or, donc pas ajouté là pour respecter la discipline de validation avant combinaison). NETTING À QUATRE sur US100/US500 (FVG + Divergence + RSI-2, au plus une position par instrument) ; XAUUSD n'a que le FVG dessus, donc aucun conflit de netting possible là. Un seul budget de garde-fous PARTAGÉ, garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2% - plus strict que le 3% réel de FTMO 1-Step). Donnée XAUUSD manque l'année 2022 (zip source jamais fourni). **Cible = +10% une seule fois (FTMO 1-Step). Perte totale max = TRAILING sur le plus haut solde jamais atteint (10%).**

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 151 (19 FVG-idx + 12 FVG-or + 100 div. + 20 RSI-2) | 44.4% | 0.9% | 7.8% | non | jour 96 | $13541 |
| 2020 (train) | 152 (26 FVG-idx + 16 FVG-or + 95 div. + 15 RSI-2) | 40.7% | 1.6% | 8.6% | non | jour 61 | $13322 |
| 2021 (train) | 150 (17 FVG-idx + 16 FVG-or + 93 div. + 24 RSI-2) | 34.7% | 5.8% | 7.5% | non | jamais | $10807 |
| 2022 (train) | 144 (21 FVG-idx + 0 FVG-or + 102 div. + 21 RSI-2) | 36.4% | 3.3% | 6.1% | non | jour 254 | $11173 |
| 2023 (train) | 134 (14 FVG-idx + 22 FVG-or + 81 div. + 17 RSI-2) | 39.1% | 1.8% | 6.2% | non | jour 197 | $12631 |
| 2024 (test) | 141 (17 FVG-idx + 19 FVG-or + 86 div. + 19 RSI-2) | 36.7% | 0.5% | 5.6% | non | jour 135 | $11718 |
| 2025 (test) | 155 (30 FVG-idx + 21 FVG-or + 88 div. + 16 RSI-2) | 38.1% | 0.0% | 4.3% | non | jour 49 | $12669 |