# Analyse exploratoire — nouvelles pistes au-delà de la recherche exhaustive déjà faite

⚠ Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. Base de comparaison = le setup déjà validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, sweep ON, fvg-edge, 1:3).

## A) Exclure le lundi (piste trouvée dans day-of-week-analysis.md)

### US100
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Actuel (tous les jours) | 68 | 47.1% | 2.37 | 0.79 | 38 | 44.7% | 2.19 | 0.70 | ✅ tient |
| Sans lundi | 62 | 50.0% | 2.65 | 0.91 | 27 | 44.4% | 2.18 | 0.70 | ✅ tient |
| Sans lundi ni vendredi | 43 | 48.8% | 2.55 | 0.86 | 16 | 43.8% | 2.07 | 0.65 | ✅ tient |

### US500
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Actuel (tous les jours) | 71 | 43.7% | 1.99 | 0.63 | 30 | 42.9% | 2.16 | 0.70 | ✅ tient |
| Sans lundi | 63 | 47.6% | 2.36 | 0.79 | 24 | 50.0% | 2.90 | 0.98 | ✅ tient |
| Sans lundi ni vendredi | 49 | 51.0% | 2.69 | 0.93 | 16 | 71.4% | 7.30 | 1.79 | ✅ tient |

## B) Grille des paramètres de lookback (structure BOS et liquidity sweep)

### US100
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Actuel (structure lookback 5, sweep lookback 5, fenêtre 10 bougies) | 68 | 47.1% | 2.37 | 0.79 | 38 | 44.7% | 2.19 | 0.70 | ✅ tient |
| Structure lookback 3 | 70 | 42.9% | 2.00 | 0.63 | 35 | 42.9% | 2.03 | 0.63 | ✅ tient |
| Structure lookback 7 | 72 | 47.2% | 2.37 | 0.80 | 39 | 43.6% | 2.07 | 0.65 | ✅ tient |
| Structure lookback 10 | 77 | 44.2% | 2.08 | 0.67 | 46 | 43.5% | 2.03 | 0.64 | ✅ tient |
| Sweep lookback 3 | 97 | 42.3% | 1.93 | 0.59 | 57 | 40.4% | 1.81 | 0.52 | ✅ tient |
| Sweep lookback 7 | 50 | 48.0% | 2.47 | 0.83 | 27 | 51.9% | 2.89 | 0.98 | ✅ tient |
| Sweep lookback 10 | 49 | 40.8% | 1.84 | 0.54 | 18 | 38.9% | 1.69 | 0.46 | ✅ tient |
| Fenêtre sweep 5 bougies M15 | 46 | 43.5% | 2.08 | 0.66 | 26 | 42.3% | 1.96 | 0.60 | ✅ tient |
| Fenêtre sweep 20 bougies M15 | 99 | 40.4% | 1.77 | 0.51 | 63 | 38.1% | 1.64 | 0.43 | ✅ tient |
| Fenêtre sweep 40 bougies M15 | 180 | 35.8% | 1.46 | 0.33 | 91 | 37.4% | 1.59 | 0.40 | ✅ tient |

### US500
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Actuel (structure lookback 5, sweep lookback 5, fenêtre 10 bougies) | 71 | 43.7% | 1.99 | 0.63 | 30 | 42.9% | 2.16 | 0.70 | ✅ tient |
| Structure lookback 3 | 72 | 44.4% | 2.05 | 0.66 | 27 | 48.0% | 2.69 | 0.91 | ✅ tient |
| Structure lookback 7 | 70 | 45.7% | 2.17 | 0.71 | 33 | 38.7% | 1.79 | 0.52 | ✅ tient |
| Structure lookback 10 | 77 | 42.9% | 1.91 | 0.59 | 38 | 38.9% | 1.76 | 0.51 | ✅ tient |
| Sweep lookback 3 | 106 | 35.8% | 1.43 | 0.31 | 45 | 32.6% | 1.38 | 0.27 | ✅ tient |
| Sweep lookback 7 | 55 | 38.2% | 1.59 | 0.41 | 32 | 36.7% | 1.68 | 0.45 | ✅ tient |
| Sweep lookback 10 | 45 | 44.4% | 2.07 | 0.66 | 25 | 43.5% | 2.26 | 0.74 | ✅ tient |
| Fenêtre sweep 5 bougies M15 | 41 | 39.0% | 1.64 | 0.44 | 16 | 35.7% | 1.83 | 0.53 | ✅ tient |
| Fenêtre sweep 20 bougies M15 | 96 | 40.6% | 1.74 | 0.50 | 56 | 38.9% | 1.75 | 0.50 | ✅ tient |
| Fenêtre sweep 40 bougies M15 | 200 | 37.7% | 1.55 | 0.39 | 96 | 28.7% | 1.10 | 0.08 | ⚠️ affaibli |

## C) Alignement multi-timeframe (H1 ET H4 doivent être d'accord, jamais testé avant)

### US100
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| H1 EMA50 + H4 EMA200 (combine les 2 meilleurs picks actuels) | 46 | 47.8% | 2.45 | 0.83 | 32 | 43.8% | 2.10 | 0.67 | ✅ tient |
| H1 EMA20 + H4 EMA50 | 59 | 39.0% | 1.69 | 0.46 | 30 | 46.7% | 2.43 | 0.81 | ✅ tient |
| H1 EMA50 + H4 EMA50 | 60 | 41.7% | 1.89 | 0.57 | 35 | 48.6% | 2.59 | 0.87 | ✅ tient |
| H1 EMA200 + H4 EMA200 | 62 | 45.2% | 2.19 | 0.71 | 33 | 42.4% | 2.00 | 0.62 | ✅ tient |

### US500
| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| H1 EMA50 + H4 EMA200 (combine les 2 meilleurs picks actuels) | 40 | 42.5% | 1.89 | 0.58 | 21 | 35.0% | 1.53 | 0.37 | ✅ tient |
| H1 EMA20 + H4 EMA50 | 45 | 44.4% | 2.06 | 0.66 | 22 | 33.3% | 1.42 | 0.30 | ✅ tient |
| H1 EMA50 + H4 EMA50 | 52 | 40.4% | 1.72 | 0.49 | 23 | 36.4% | 1.60 | 0.42 | ✅ tient |
| H1 EMA200 + H4 EMA200 | 49 | 42.9% | 1.90 | 0.58 | 21 | 35.0% | 1.53 | 0.37 | ✅ tient |
