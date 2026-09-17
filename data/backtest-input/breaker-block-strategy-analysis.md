# Stratégie exploratoire ICT #11 : Breaker Block (Order Block invalidé puis reconquis)

⚠ Distinct de l'Order Block déjà rejeté (celui-ci tradait une mitigation dans le MÊME sens que le BOS d'origine) : ici la zone doit être CASSÉE (invalidée) avant de trader un retest dans le sens OPPOSÉ. Réutilise la détection BOS/swing déjà existante. Entrée au retest du niveau à 50% du corps du bloc, une bougie après confirmation, stop au-delà du bord opposé du bloc, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1566 | 28.7% | 1.04 | 0.03 | 313 | 30.0% | 1.19 | 0.14 | ✅ tient |
| US500 | 1575 | 24.4% | 0.81 | -0.16 | 309 | 29.8% | 1.12 | 0.09 | ⚠️ affaibli |
| XAUUSD | 1227 | 27.5% | 0.90 | -0.09 | 294 | 26.9% | 0.94 | -0.05 | ❌ ne tient pas |
| EURUSD | 607 | 27.9% | 0.94 | -0.05 | 198 | 30.3% | 1.02 | 0.02 | ⚠️ affaibli |
| GBPUSD | 547 | 25.7% | 0.84 | -0.14 | 198 | 23.2% | 0.71 | -0.27 | ❌ ne tient pas |
| USDJPY | 792 | 27.8% | 0.91 | -0.08 | 256 | 23.9% | 0.79 | -0.18 | ❌ ne tient pas |
| USDCAD | 1261 | 26.3% | 0.84 | -0.14 | 129 | 19.4% | 0.56 | -0.43 | ❌ ne tient pas |
| GER40 | 1250 | 29.9% | 1.15 | 0.11 | 312 | 30.4% | 1.23 | 0.17 | ✅ tient |
| UKX | 718 | 29.1% | 1.02 | 0.02 | 252 | 26.6% | 0.89 | -0.09 | ❌ ne tient pas |
| AUX | 584 | 24.3% | 0.80 | -0.18 | 213 | 27.2% | 0.91 | -0.08 | ❌ ne tient pas |