# Stratégie exploratoire : Support HTF (jour/semaine/mois) + confirmation par pattern de renversement

Idée testée (Esdras, 2026-09-19) : un niveau support/résistance est-il plus fiable quand le jour, la semaine ET le mois s'accordent dessus (à 0.1% près), confirmé par un doji ou un engulfing sur la bougie qui teste le niveau ? Délibérément PAS la théorie "3 touches = niveau plus fort" (non retenue - chaque touche consomme de la liquidité resting, donc plus de tests plausiblement AFFAIBLIT un niveau plutôt que de le renforcer) : ici c'est la confluence entre timeframes INDÉPENDANTS qui est testée, pas le nombre de touches sur un seul. Entrée une bougie après confirmation, stop au-delà de l'extrême de la bougie (et de la précédente pour un engulfing), cible fixe 1:3, timeout 480 bougies M15. Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 747 | 30.1% | 1.08 | 0.06 | 169 | 27.2% | 1.03 | 0.03 | ✅ tient |
| US500 | 1091 | 27.2% | 0.89 | -0.09 | 210 | 28.6% | 1.04 | 0.03 | ⚠️ affaibli |
| XAUUSD | 369 | 25.8% | 0.83 | -0.15 | 72 | 26.4% | 0.90 | -0.08 | ❌ ne tient pas |
| EURUSD | 1631 | 24.7% | 0.79 | -0.18 | 249 | 33.2% | 1.19 | 0.15 | ⚠️ affaibli |
| GBPUSD | 1438 | 26.2% | 0.86 | -0.12 | 244 | 27.0% | 0.87 | -0.12 | ❌ ne tient pas |
| USDJPY | 1005 | 26.5% | 0.85 | -0.13 | 277 | 25.3% | 0.83 | -0.15 | ❌ ne tient pas |
| USDCAD | 1479 | 25.3% | 0.80 | -0.18 | 316 | 24.4% | 0.74 | -0.24 | ❌ ne tient pas |
| GER40 | 569 | 25.7% | 0.93 | -0.06 | 97 | 27.8% | 1.08 | 0.06 | ⚠️ affaibli |
| UKX | 348 | 25.3% | 0.82 | -0.15 | 147 | 27.9% | 0.95 | -0.04 | ❌ ne tient pas |
| AUX | 285 | 28.1% | 0.96 | -0.04 | 127 | 27.6% | 0.93 | -0.06 | ❌ ne tient pas |
| NZDJPY | 44 | 25.6% | 0.74 | -0.24 | 27 | 22.2% | 0.65 | -0.33 | ❌ ne tient pas |
| AUDUSD | 297 | 23.6% | 0.71 | -0.27 | 113 | 32.7% | 1.11 | 0.09 | ⚠️ affaibli |