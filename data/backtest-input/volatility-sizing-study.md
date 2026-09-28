# Taille réduite de moitié en marché agité — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-volatility-sizing-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runVolatilitySizingStudy.js`. Trades du combo au rejeu fidèle ; marché agité = ATR(14) journalier / moyenne 100 de cet ATR > 1,5 (dernière bougie journalière terminée avant l'entrée) → le trade compte pour R / 2.

| Période | Trades (dont agités) | Sans règle : R total / pire baisse / ratio | Avec règle : R total / pire baisse / ratio | R/trade agités | R/trade autres |
|---|---|---|---|---|---|
| Entraînement 2011-2022 | 3748 (393) | +326.2 R / 84.4 R / 3.87 | +254.4 R / 93.1 R / 2.73 | +0.365 | +0.054 |
| 2011-2016 | 1772 (113) | +30.0 R / 84.4 R / 0.36 | +12.4 R / 93.1 R / 0.13 | +0.311 | -0.003 |
| 2017-2022 | 1976 (280) | +296.2 R / 35.3 R / 8.38 | +241.9 R / 35.3 R / 6.85 | +0.387 | +0.111 |
| Test 2023-2025 | 1040 (76) | +21.6 R / 65.2 R / 0.33 | +21.9 R / 60.4 R / 0.36 | -0.009 | +0.023 |
| 2026 (→ 21/09) | 270 (7) | -13.3 R / 53.9 R / -0.25 | -13.7 R / 53.9 R / -0.25 | +0.126 | -0.054 |

## Trades en marché agité, par stratégie (toutes périodes)

| Stratégie | Trades agités | R total agités | R/trade agités | R/trade autres |
|---|---|---|---|---|
| cbdr US100 | 78 | +3.1 R | +0.040 | +0.011 |
| divergence US100 | 52 | +30.5 R | +0.586 | -0.040 |
| divergence US500 | 67 | +39.7 R | +0.593 | +0.049 |
| nwog US100 | 28 | +19.1 R | +0.680 | +0.170 |
| rsi2-daily US500 | 5 | +0.5 R | +0.097 | -0.038 |
| silverbullet US100 | 106 | +18.7 R | +0.177 | +0.066 |
| silverbullet US500 | 85 | -0.8 R | -0.010 | +0.063 |
| weeklysweep US500 | 55 | +33.0 R | +0.600 | +0.051 |

## Verdict (critère pré-enregistré)

**NON RETENU** (le ratio ne s'améliore pas sur les deux moitiés de l'entraînement : 2011-2016 0.36 → 0.13, 2017-2022 8.38 → 6.85)

## Limites

- A et B (ORB, Noise) ne sont pas dans les tranches du rejeu avant 2023 : non évaluées.
- Les règles FTMO (perte journalière) ne sont pas simulées ici.
