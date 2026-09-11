# Stratégie exploratoire ICT #11 : Breaker Block (Order Block invalidé puis reconquis)

⚠ Distinct de l'Order Block déjà rejeté (celui-ci tradait une mitigation dans le MÊME sens que le BOS d'origine) : ici la zone doit être CASSÉE (invalidée) avant de trader un retest dans le sens OPPOSÉ. Réutilise la détection BOS/swing déjà existante. Entrée au retest du niveau à 50% du corps du bloc, une bougie après confirmation, stop au-delà du bord opposé du bloc, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 644 | 31.8% | 1.23 | 0.18 | 291 | 29.2% | 1.12 | 0.09 | ✅ tient |
| US500 | 606 | 24.4% | 0.83 | -0.15 | 279 | 29.0% | 1.04 | 0.03 | ⚠️ affaibli |
| XAUUSD | 473 | 29.6% | 1.01 | 0.01 | 294 | 26.9% | 0.94 | -0.05 | ❌ ne tient pas |
| EURUSD | 648 | 27.7% | 0.93 | -0.06 | 219 | 30.1% | 1.02 | 0.02 | ⚠️ affaibli |
| GBPUSD | 547 | 25.7% | 0.84 | -0.14 | 198 | 23.2% | 0.71 | -0.27 | ❌ ne tient pas |
| USDJPY | 792 | 27.8% | 0.91 | -0.08 | 256 | 23.9% | 0.79 | -0.18 | ❌ ne tient pas |