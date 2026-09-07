# Impact au niveau du COMPTE — 3 STRATÉGIES (FVG + Divergence + RSI(2) mean-reversion), seulement US100/US500, règles FTMO 1-Step

⚠ Compte $10000, AUCUN 3e instrument (pas d'or ici) - 2e tentative de : empiler des stratégies sur les mêmes 2 paires suffit-il ? Cette fois avec RSI(2) au lieu de Turtle (qui avait échoué - voir three-strategy-two-pairs-account-impact.md - sa durée de position trop longue bloquait Divergence ~46% du temps sous le netting strict). Un seul budget de garde-fous PARTAGÉ entre les 3 mécanismes, garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2%). NETTING À TROIS : au plus une position ouverte par instrument, tous mécanismes confondus. RSI(2) = filtre de tendance EMA200, entrée RSI(2)<5 (haussier) ou >95 (baissier), stop 2xATR(14), sortie SMA(5) ou 10 jours max - paramètres ORIGINAUX publiés (Connors, pas ajustés sur nos données - voir rsi-mean-reversion-analysis.md). **Cible = +10% une seule fois (FTMO 1-Step). Perte totale max = TRAILING sur le plus haut solde jamais atteint (10%).**

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 139 (19 FVG + 100 div. + 20 RSI-2) | 44.6% | 1.2% | 6.7% | non | jour 104 | $13133 |
| 2020 (train) | 137 (26 FVG + 96 div. + 15 RSI-2) | 37.5% | 1.8% | 7.1% | non | jour 125 | $11655 |
| 2021 (train) | 135 (17 FVG + 93 div. + 25 RSI-2) | 35.6% | 6.0% | 8.1% | non | jamais | $10682 |
| 2022 (train) | 144 (21 FVG + 102 div. + 21 RSI-2) | 36.4% | 3.3% | 6.1% | non | jour 254 | $11173 |
| 2023 (train) | 114 (15 FVG + 82 div. + 17 RSI-2) | 37.7% | 2.6% | 5.7% | non | jour 205 | $11689 |
| 2024 (test) | 125 (18 FVG + 87 div. + 20 RSI-2) | 38.2% | 0.5% | 4.9% | non | jour 142 | $11615 |
| 2025 (test) | 137 (30 FVG + 91 div. + 16 RSI-2) | 38.0% | 0.0% | 7.1% | non | jour 96 | $12129 |