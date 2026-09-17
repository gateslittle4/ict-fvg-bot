# Stratégie exploratoire ICT #13 : Weekly Liquidity Sweep (PWH/PWL, sweep + reclaim)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Même mécanique que Judas Swing (sweep de liquidité + clôture de retour à l'intérieur), mais appliquée au plus haut/bas de la SEMAINE précédente plutôt qu'au plus haut/bas de la veille, et SANS restriction horaire (aucune killzone ICT canonique spécifique aux liquidités hebdomadaires trouvée en recherche — plutôt que d'en inventer une non testée, le signal est cherché sur toute la semaine). Limites de semaine détectées directement depuis les horodatages réels des données (même technique que nwog.js). Entrée une bougie après la bougie de sweep+reclaim, stop au-delà de l'extrême du sweep, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 579 | 31.6% | 1.22 | 0.17 | 101 | 26.7% | 1.04 | 0.03 | ⚠️ affaibli |
| US500 | 620 | 29.9% | 1.10 | 0.08 | 95 | 30.5% | 1.21 | 0.16 | ✅ tient |
| XAUUSD | 521 | 26.0% | 0.88 | -0.10 | 83 | 21.7% | 0.75 | -0.21 | ❌ ne tient pas |
| EURUSD | 213 | 21.2% | 0.69 | -0.28 | 75 | 30.7% | 1.08 | 0.06 | ⚠️ affaibli |
| GBPUSD | 197 | 26.0% | 0.87 | -0.11 | 80 | 25.3% | 0.82 | -0.16 | ❌ ne tient pas |
| USDJPY | 300 | 21.9% | 0.71 | -0.26 | 84 | 32.1% | 1.24 | 0.18 | ⚠️ affaibli |
| USDCAD | 464 | 27.1% | 0.90 | -0.08 | 64 | 29.7% | 1.02 | 0.01 | ⚠️ affaibli |
| GER40 | 581 | 32.0% | 1.32 | 0.23 | 95 | 33.0% | 1.42 | 0.29 | ✅ tient |
| UKX | 257 | 24.5% | 0.83 | -0.14 | 88 | 31.8% | 1.16 | 0.13 | ⚠️ affaibli |
| AUX | 203 | 30.5% | 1.12 | 0.10 | 84 | 25.0% | 0.86 | -0.12 | ❌ ne tient pas |