# Stratégie exploratoire ICT #12 : Power of Three / AMD (fade du range asiatique)

⚠ Miroir de l'Asian Range Breakout déjà testé (même définition du range, importée directement, pas réécrite) : au lieu d'une clôture nette au-delà du range (continuation), ceci exige un balayage PUIS une reconquête même bougie (même convention que liquiditySweep.js/Judas Swing), et trade dans le sens OPPOSÉ au balayage (fade). Entrée une bougie après, stop au-delà de l'extrême du balayage, cible fixe 1:3, timeout 480 bougies M15. Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1014 | 27.3% | 1.01 | 0.01 | 428 | 28.3% | 1.08 | 0.06 | ✅ tient |
| US500 | 972 | 28.3% | 1.02 | 0.01 | 395 | 28.9% | 1.05 | 0.04 | ✅ tient |
| XAUUSD | 651 | 25.0% | 0.78 | -0.19 | 371 | 27.0% | 0.93 | -0.06 | ❌ ne tient pas |
| EURUSD | 954 | 26.4% | 0.85 | -0.13 | 260 | 24.6% | 0.77 | -0.20 | ❌ ne tient pas |
| GBPUSD | 827 | 27.8% | 0.92 | -0.07 | 253 | 21.0% | 0.64 | -0.34 | ❌ ne tient pas |
| USDJPY | 988 | 26.3% | 0.86 | -0.12 | 334 | 29.1% | 1.03 | 0.03 | ⚠️ affaibli |
| USDCAD | 1505 | 23.9% | 0.73 | -0.25 | 157 | 21.7% | 0.62 | -0.36 | ❌ ne tient pas |
| GER40 | 373 | 28.2% | 1.09 | 0.07 | 531 | 28.1% | 1.09 | 0.07 | ✅ tient |