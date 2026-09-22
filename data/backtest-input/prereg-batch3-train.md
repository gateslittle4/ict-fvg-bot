# Pré-enregistrement lot 3 — ENTRAÎNEMENT (2011-2019)

Règles : `data/backtest-input/preregistration-batch3-2026-09-21.md`. Bougies journalières 17:00-17:00 (temps moteur) reconstruites des M15, spread = 2 × le défaut, swap 0,01 %/jour du notionnel, R net.

| Hypothèse | Trades | R net/trade | Facteur de profit | 2011-2015 | 2016-2019 | Verdict |
|---|---|---|---|---|---|---|
| Tendance Donchian 55/20 US100 | 46 | -0.015 | 0.97 | -1.9 (24) | +1.2 (22) | rejetée |
| Tendance Donchian 55/20 US500 | 47 | -0.267 | 0.53 | -7.9 (24) | -4.6 (23) | rejetée |
| Tendance Donchian 55/20 XAUUSD | 51 | +0.017 | 1.03 | -1.7 (28) | +2.5 (23) | rejetée |
| Tendance Donchian 55/20 EURUSD | 49 | -0.060 | 0.92 | +8.3 (24) | -11.2 (25) | rejetée |
| RSI(2) retour à la moyenne US100 | 80 | +0.119 | 1.87 | +9.7 (48) | -0.1 (32) | rejetée |
| RSI(2) retour à la moyenne US500 | 73 | +0.121 | 2.02 | +5.1 (39) | +3.7 (34) | **RETENUE** (test à lire) |
| RSI(2) retour à la moyenne XAUUSD | 52 | +0.000 | 1.00 | +0.7 (24) | -0.7 (28) | rejetée |
| RSI(2) retour à la moyenne EURUSD | 44 | -0.053 | 0.73 | -1.9 (29) | -0.4 (15) | rejetée |

Retenues pour la lecture du test : M-US500.

Règle : T ≥ 30 trades, M ≥ 60 trades ; R net/trade ≥ +0,10 ; facteur de profit ≥ 1,15 ; R net positif sur les DEUX moitiés. Aucune rejetée n'a vu son test.