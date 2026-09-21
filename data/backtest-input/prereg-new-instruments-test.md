# Pré-enregistrement « nouveaux instruments » — TEST (2025-01-01 → fin), lecture unique des hypothèses retenues

Règles : `data/backtest-input/preregistration-new-instruments-2026-09-21.md` (clarifications comprises). Vrai moteur, M1 exact, garde-fous réels rejoués (0,3 %), spread = 2 × le frère (décision). Spreads absolus : XAGUSD 0.00732, US30 2.51, XTIUSD 0.00647.

| Hypothèse | Trades | R net / trade (2 ×) | R net total | Corrélation mensuelle avec le combo | Verdict |
|---|---|---|---|---|---|
| FVG XAGUSD (config XAUUSD) | 67 | +0.209 | +14.0 | -0.61 | **RÉUSSIE : candidate (mode alerte)** |
| FVG XTIUSD (config US500) | 63 | -0.058 | -3.6 | -0.26 | ÉCHEC |
| ↳ sensibilité XTIUSD, spread ×10 (sans effet sur la décision) | 63 | -1.005 | -63.3 | — | — |
| Weekly Sweep US30 | 79 | +0.009 | +0.7 | -0.13 | ÉCHEC |

Test lu UNE fois. Aucune adoption directe : une candidate est suivie en mode alerte jusqu'à 100 signaux hors échantillon à ≥ +0,1 R/trade.