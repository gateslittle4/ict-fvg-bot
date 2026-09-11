# Stratégie exploratoire ICT #13 : Weekly Liquidity Sweep (PWH/PWL, sweep + reclaim)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Même mécanique que Judas Swing (sweep de liquidité + clôture de retour à l'intérieur), mais appliquée au plus haut/bas de la SEMAINE précédente plutôt qu'au plus haut/bas de la veille, et SANS restriction horaire (aucune killzone ICT canonique spécifique aux liquidités hebdomadaires trouvée en recherche — plutôt que d'en inventer une non testée, le signal est cherché sur toute la semaine). Limites de semaine détectées directement depuis les horodatages réels des données (même technique que nwog.js). Entrée une bougie après la bougie de sweep+reclaim, stop au-delà de l'extrême du sweep, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 231 | 29.0% | 1.11 | 0.09 | 99 | 27.3% | 1.05 | 0.04 | ✅ tient |
| US500 | 230 | 28.8% | 1.07 | 0.06 | 89 | 28.1% | 1.05 | 0.04 | ✅ tient |
| XAUUSD | 181 | 27.4% | 0.95 | -0.04 | 83 | 21.7% | 0.75 | -0.21 | ❌ ne tient pas |
| EURUSD | 224 | 22.9% | 0.76 | -0.21 | 77 | 31.2% | 1.12 | 0.09 | ⚠️ affaibli |
| GBPUSD | 197 | 26.0% | 0.87 | -0.11 | 80 | 25.3% | 0.82 | -0.16 | ❌ ne tient pas |
| USDJPY | 300 | 21.9% | 0.71 | -0.26 | 84 | 32.1% | 1.24 | 0.18 | ⚠️ affaibli |