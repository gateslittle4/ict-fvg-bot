# Stratégie exploratoire ICT : NDOG (New Day Opening Gap, pari sur le comblement)

⚠ Concept ICT publié (sibling quotidien du NWOG déjà en production sur US100), jamais testé jusqu'ici dans ce projet - recherché à la demande explicite d'Esdras après que 9 concepts différents aient déjà été rejetés sur GBPUSD (Judas Swing, Asian Range Breakout, Asian Range Fade, Power of Three, Divergence EUR/GBP, MACD, Weekly Liquidity Sweep, NWOG-bruit, Breaker Block). Seuil de détection (1h-3h) fixé depuis l'histogramme réel des écarts de temps entre bougies de ce projet (586 écarts de 75min, 98 de 135min sur GBPUSD - une vraie pause quotidienne récurrente, pas inventée), AVANT d'avoir regardé un seul résultat de trade - voir src/backtest/ndog.js. Direction = pari sur le comblement, entrée une bougie après la bougie de gap, stop au-delà de l'extrême de cette même bougie, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs, rien inventé pour la sortie). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1504 | 26.0% | 0.91 | -0.07 | 347 | 29.7% | 1.13 | 0.10 | ⚠️ affaibli |
| US500 | 1369 | 27.5% | 0.95 | -0.04 | 326 | 24.5% | 0.84 | -0.14 | ❌ ne tient pas |
| XAUUSD | 700 | 25.2% | 0.79 | -0.19 | 249 | 21.7% | 0.68 | -0.29 | ❌ ne tient pas |
| EURUSD | 227 | 32.2% | 1.11 | 0.09 | 1 | 100.0% | ∞ | 2.71 | ❓ pas assez de trades |
| GBPUSD | 219 | 23.7% | 0.73 | -0.25 | 2 | 0.0% | 0.00 | -1.08 | ❓ pas assez de trades |
| USDJPY | 285 | 25.7% | 0.85 | -0.13 | 7 | 28.6% | 1.04 | 0.03 | ❓ pas assez de trades |
| USDCAD | 179 | 26.8% | 0.85 | -0.13 | 0 | — | — | — | ❓ pas assez de trades |
| GER40 | 502 | 28.9% | 1.05 | 0.04 | 340 | 29.1% | 1.08 | 0.06 | ✅ tient |
| UKX | 799 | 24.2% | 0.76 | -0.21 | 206 | 25.2% | 0.80 | -0.17 | ❌ ne tient pas |
| AUX | 829 | 28.2% | 0.97 | -0.03 | 306 | 31.8% | 1.17 | 0.13 | ⚠️ affaibli |