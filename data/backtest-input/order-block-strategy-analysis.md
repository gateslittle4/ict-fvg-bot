# Stratégie exploratoire ICT #2 : Order Block (mitigation avant continuation)

⚠ Toujours ICT (contrairement à Turtle/ORB/RSI-2), mais un mécanisme de détection COMPLÈTEMENT différent du FVG - zone = la dernière bougie de couleur opposée avant une cassure de structure (BOS), pas un gap à 3 bougies. Réutilise la détection de swing existante (marketStructure.js, lookback 5). Bougies M15, remplissage en limite dans la zone, stop = bord opposé de la zone, cible 1:3 (même convention que FVG/Divergence), fenêtre de guet 50 bougies après le BOS (comme maxAgeCandles du FVG), timeout 480 bougies. Un seul guet et une seule position suivis à la fois. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 2409 | 25.4% | 0.92 | -0.06 | 1058 | 24.9% | 0.93 | -0.06 | ❌ ne tient pas |
| US500 | 2364 | 24.3% | 0.84 | -0.13 | 1091 | 27.0% | 0.97 | -0.03 | ❌ ne tient pas |