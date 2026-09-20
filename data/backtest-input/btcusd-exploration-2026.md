# BTCUSD : exploration des 22 stratégies du Labo (aucun ordre passé)

Bougies M15 réelles du broker (14000), première partie (entraînement) jusqu'au 2026-07-14, puis test. Spread supposé 15 $ (non mesuré), filtre « stop ≥ 3× le spread », chaque trade réglé avec les deux règles d'égalité. **Exploration, pas validation** : 22 stratégies sur ~145 jours de marché, attendre des faux positifs.

| Stratégie | Trades utilisés (entr. / test) | R moyen entr. (stop d'abord / objectif d'abord) | t entr. | R moyen test (stop d'abord / objectif d'abord) | A regarder ? |
|---|---|---|---|---|---|
| Asian Range Breakout | 33 / 12 | +0.56 / +0.56 | 1.6 | -0.02 / -0.02 | non |
| Star Patterns | 101 / 52 | +0.32 / +0.32 | 1.7 | -0.32 / -0.32 | non |
| Breaker Block | 53 / 24 | +0.24 / +0.39 | 0.9 | -0.48 / -0.31 | non |
| RSI Divergence | 130 / 74 | +0.02 / +0.02 | 0.1 | -0.12 / -0.12 | non |
| Judas Swing | 25 / 10 | +0.00 / +0.00 | 0.0 | -0.32 / -0.32 | non |
| Weekly Liquidity Sweep | 15 / 11 | +0.00 / +0.00 | 0.0 | -0.36 / -0.36 | non |
| DMI Trend | 0 / 0 | +0.00 / +0.00 | 0.0 | +0.00 / +0.00 | non |
| Gap Continuation (quotidien) | 0 / 0 | +0.00 / +0.00 | 0.0 | +0.00 / +0.00 | non |
| Support HTF (jour/semaine/mois) + renversement | 0 / 0 | +0.00 / +0.00 | 0.0 | +0.00 / +0.00 | non |
| MACD Trend | 0 / 0 | +0.00 / +0.00 | 0.0 | +0.00 / +0.00 | non |
| NDOG (New Day Opening Gap) | 0 / 0 | +0.00 / +0.00 | 0.0 | +0.00 / +0.00 | non |
| OTE (Optimal Trade Entry) | 105 / 48 | -0.01 / -0.01 | -0.1 | -0.13 / -0.05 | non |
| Asian Range Fade | 66 / 26 | -0.03 / +0.10 | -0.1 | -0.51 / -0.51 | non |
| NWOG (New Week Opening Gap) | 16 / 2 | -0.14 / -0.14 | -0.3 | -1.16 / -1.16 | non |
| Anchored VWAP | 84 / 28 | -0.15 / -0.06 | -0.6 | -0.40 / -0.40 | non |
| Mitigation Block | 195 / 95 | -0.20 / -0.16 | -1.7 | -0.02 / -0.02 | non |
| Bollinger Squeeze | 203 / 91 | -0.20 / -0.20 | -1.7 | -0.23 / -0.23 | non |
| Unicorn Model | 45 / 19 | -0.30 / -0.03 | -1.2 | -0.47 / -0.47 | non |
| Equal Highs / Equal Lows | 84 / 48 | -0.34 / -0.05 | -1.9 | +0.08 / +0.42 | non |
| CBDR (Central Bank Dealer Range) | 26 / 10 | -0.48 / -0.33 | -1.7 | -0.75 / -0.35 | non |
| Power of Three | 26 / 11 | -0.61 / -0.61 | -2.4 | +0.03 / +0.03 | non |
| Midnight Open Retracement | 5 / 0 | -0.85 / -0.85 | -3.1 | +0.00 / +0.00 | non |

**A regarder de plus près (positif dans les deux moitiés et avec les deux règles, t ≥ 2) : aucune.**

Limites : environ 7 mois, une seule séparation temporelle, 22 essais (un « oui » peut être du hasard), spread supposé, entrées supposées remplies, BTCUSD ferme le week-end chez ce broker.