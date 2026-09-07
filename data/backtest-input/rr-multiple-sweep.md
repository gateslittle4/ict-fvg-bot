# Baisser le R:R pour augmenter le win rate — même setup, cible plus proche

⚠ Mêmes entrées, mêmes stops (mêmes signaux, mêmes filtres : structure ON, session 10h-11h, sweep ON) - seule la distance de la cible change avec rrMultiple. Écran sur TRAIN (2019-2023), vérification sur TEST (2024-2025), même règle de verdict que partout ailleurs dans ce projet (tient = espérance test positive ET >= 30% de l'espérance train).

## US100
| R:R | Trades train | Win rate train | PF train | Espérance train (R) | Trades test | Win rate test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1:3 | 68 | 47.1% | 2.37 | 0.79 | 38 | 44.7% | 2.19 | 0.70 | ✅ tient |
| 1:2.5 | 68 | 47.1% | 1.96 | 0.56 | 38 | 44.7% | 1.81 | 0.48 | ✅ tient |
| 1:2 | 68 | 48.5% | 1.65 | 0.37 | 38 | 44.7% | 1.43 | 0.26 | ✅ tient |
| 1:1.5 | 68 | 50.0% | 1.29 | 0.16 | 38 | 44.7% | 1.05 | 0.03 | ⚠️ affaibli |
| 1:1 | 68 | 54.4% | 1.00 | -0.00 | 38 | 47.4% | 0.75 | -0.14 | ❌ ne tient pas |

## US500
| R:R | Trades train | Win rate train | PF train | Espérance train (R) | Trades test | Win rate test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1:3 | 71 | 43.7% | 1.99 | 0.63 | 30 | 42.9% | 2.16 | 0.70 | ✅ tient |
| 1:2.5 | 71 | 46.5% | 1.85 | 0.51 | 30 | 46.4% | 2.09 | 0.61 | ✅ tient |
| 1:2 | 71 | 49.3% | 1.63 | 0.36 | 30 | 50.0% | 1.70 | 0.40 | ✅ tient |
| 1:1.5 | 71 | 53.5% | 1.42 | 0.22 | 30 | 50.0% | 1.26 | 0.15 | ✅ tient |
| 1:1 | 71 | 59.2% | 1.14 | 0.06 | 30 | 50.0% | 0.81 | -0.10 | ❌ ne tient pas |
