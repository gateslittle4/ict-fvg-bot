# Stratégie exploratoire ICT #12 : Power of Three / AMD (fade du range asiatique)

⚠ Miroir de l'Asian Range Breakout déjà testé (même définition du range, importée directement, pas réécrite) : au lieu d'une clôture nette au-delà du range (continuation), ceci exige un balayage PUIS une reconquête même bougie (même convention que liquiditySweep.js/Judas Swing), et trade dans le sens OPPOSÉ au balayage (fade). Entrée une bougie après, stop au-delà de l'extrême du balayage, cible fixe 1:3, timeout 480 bougies M15. Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 947 | 27.5% | 0.98 | -0.02 | 408 | 28.4% | 1.05 | 0.04 | ⚠️ affaibli |
| US500 | 841 | 27.2% | 0.93 | -0.06 | 343 | 29.2% | 1.02 | 0.02 | ⚠️ affaibli |
| XAUUSD | 651 | 25.0% | 0.78 | -0.19 | 371 | 27.0% | 0.93 | -0.06 | ❌ ne tient pas |
| EURUSD | 1028 | 26.8% | 0.87 | -0.11 | 284 | 25.7% | 0.82 | -0.15 | ❌ ne tient pas |
| GBPUSD | 827 | 27.8% | 0.92 | -0.07 | 253 | 21.0% | 0.64 | -0.34 | ❌ ne tient pas |