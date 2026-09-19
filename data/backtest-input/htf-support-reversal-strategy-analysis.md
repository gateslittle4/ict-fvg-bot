# Stratégie exploratoire : Support/résistance validé par 3 touches (jour/semaine/mois) + confirmation par pattern de renversement (H1/H4)

Idée testée (Esdras, 2026-09-19, après correction d'une première lecture trop littérale) : un niveau support/résistance touché 3 FOIS sur UNE SEULE timeframe (jour, semaine OU mois - n'importe laquelle, indépendamment des deux autres) est-il tradable une fois confirmé par un doji ou un engulfing sur une timeframe d'entrée plus basse (H1 ou H4, les deux testées ici séparément) ? Entrée ramenée sur M15 (la bougie juste après la clôture de la bougie H1/H4 de confirmation), stop au-delà de l'extrême de la bougie (et de la précédente pour un engulfing), cible fixe 1:3, timeout 480 bougies M15. Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Timeframe d'entrée | Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| H1 | US100 | 32 | 34.4% | 1.39 | 0.28 | 0 | — | — | — | ❓ pas assez de trades |
| H1 | US500 | 46 | 20.5% | 0.74 | -0.21 | 0 | — | — | — | ❓ pas assez de trades |
| H1 | XAUUSD | 242 | 23.6% | 0.75 | -0.22 | 0 | — | — | — | ❓ pas assez de trades |
| H1 | EURUSD | 1114 | 24.5% | 0.84 | -0.14 | 50 | 22.4% | 0.77 | -0.20 | ❌ ne tient pas |
| H1 | GBPUSD | 948 | 25.1% | 0.86 | -0.11 | 3 | 33.3% | 1.27 | 0.20 | ❓ pas assez de trades |
| H1 | USDJPY | 604 | 22.8% | 0.75 | -0.22 | 12 | 25.0% | 0.89 | -0.09 | ❌ ne tient pas |
| H1 | USDCAD | 1220 | 24.3% | 0.81 | -0.16 | 56 | 25.0% | 0.83 | -0.15 | ❌ ne tient pas |
| H1 | GER40 | 56 | 21.4% | 0.78 | -0.18 | 10 | 10.0% | 0.31 | -0.64 | ❌ ne tient pas |
| H1 | UKX | 176 | 21.6% | 0.72 | -0.24 | 8 | 37.5% | 1.58 | 0.40 | ❓ pas assez de trades |
| H1 | AUX | 135 | 32.8% | 1.31 | 0.22 | 0 | — | — | — | ❓ pas assez de trades |
| H1 | NZDJPY | 18 | 29.4% | 1.03 | 0.03 | 7 | 0.0% | 0.24 | -0.80 | ❓ pas assez de trades |
| H1 | AUDUSD | 168 | 30.7% | 1.11 | 0.09 | 25 | 20.0% | 0.59 | -0.40 | ❌ ne tient pas |
| H4 | US100 | 15 | 20.0% | 0.70 | -0.25 | 0 | — | — | — | ❓ pas assez de trades |
| H4 | US500 | 13 | 23.1% | 0.84 | -0.13 | 0 | — | — | — | ❓ pas assez de trades |
| H4 | XAUUSD | 97 | 25.3% | 1.00 | 0.00 | 0 | — | — | — | ❓ pas assez de trades |
| H4 | EURUSD | 410 | 24.5% | 0.94 | -0.04 | 16 | 20.0% | 0.78 | -0.18 | ❌ ne tient pas |
| H4 | GBPUSD | 331 | 28.0% | 1.15 | 0.11 | 0 | — | — | — | ❓ pas assez de trades |
| H4 | USDJPY | 194 | 24.9% | 0.91 | -0.07 | 8 | 42.9% | 1.74 | 0.47 | ❓ pas assez de trades |
| H4 | USDCAD | 412 | 20.8% | 0.75 | -0.20 | 25 | 13.0% | 0.46 | -0.49 | ❌ ne tient pas |
| H4 | GER40 | 13 | 23.1% | 0.88 | -0.09 | 3 | 0.0% | 0.00 | -1.02 | ❓ pas assez de trades |
| H4 | UKX | 54 | 23.1% | 0.93 | -0.05 | 3 | 33.3% | 1.41 | 0.29 | ❓ pas assez de trades |
| H4 | AUX | 46 | 20.5% | 0.82 | -0.15 | 0 | — | — | — | ❓ pas assez de trades |
| H4 | NZDJPY | 11 | 22.2% | 1.07 | 0.05 | 4 | 0.0% | 0.54 | -0.37 | ❓ pas assez de trades |
| H4 | AUDUSD | 52 | 20.4% | 0.76 | -0.20 | 14 | 35.7% | 1.44 | 0.32 | ⚠️ affaibli |