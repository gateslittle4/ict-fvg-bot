# Stratégie exploratoire ICT : NDOG (New Day Opening Gap, pari sur le comblement)

⚠ Concept ICT publié (sibling quotidien du NWOG déjà en production sur US100), jamais testé jusqu'ici dans ce projet - recherché à la demande explicite d'Esdras après que 9 concepts différents aient déjà été rejetés sur GBPUSD (Judas Swing, Asian Range Breakout, Asian Range Fade, Power of Three, Divergence EUR/GBP, MACD, Weekly Liquidity Sweep, NWOG-bruit, Breaker Block). Seuil de détection (1h-3h) fixé depuis l'histogramme réel des écarts de temps entre bougies de ce projet (586 écarts de 75min, 98 de 135min sur GBPUSD - une vraie pause quotidienne récurrente, pas inventée), AVANT d'avoir regardé un seul résultat de trade - voir src/backtest/ndog.js. Direction = pari sur le comblement, entrée une bougie après la bougie de gap, stop au-delà de l'extrême de cette même bougie, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs, rien inventé pour la sortie). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1032 | 25.8% | 0.89 | -0.10 | 315 | 28.9% | 1.04 | 0.03 | ⚠️ affaibli |
| US500 | 884 | 26.8% | 0.90 | -0.09 | 274 | 23.0% | 0.74 | -0.22 | ❌ ne tient pas |
| XAUUSD | 511 | 25.5% | 0.82 | -0.16 | 249 | 21.7% | 0.68 | -0.29 | ❌ ne tient pas |
| EURUSD | 245 | 31.8% | 1.11 | 0.09 | 1 | 100.0% | ∞ | 2.74 | ❓ pas assez de trades |
| GBPUSD | 219 | 23.7% | 0.73 | -0.25 | 2 | 0.0% | 0.00 | -1.08 | ❓ pas assez de trades |