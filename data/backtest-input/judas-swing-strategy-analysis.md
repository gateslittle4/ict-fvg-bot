# Stratégie exploratoire ICT #7 : Judas Swing (killzone Londres)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet (différent de l'Order Block, l'IFVG, le Turtle Soup déjà rejetés, et du FILTRE de confluence liquidity sweep déjà en place sur le FVG validé - celui-ci utilise un pivot de swing fractal, à toute heure ; celui-ci utilise le plus-haut/plus-bas de la veille (PDH/PDL), limité à UNE fenêtre horaire précise). Bougies M15. PDH/PDL = plus haut/plus bas du jour calendaire COMPLET précédent (même agrégation journalière que partout ailleurs dans ce projet). Fenêtre : killzone Londres ICT (02h-05h heure de New York, publiée telle quelle, distincte de la Silver Bullet 10h-11h et de l'overlap Londres-NY 07h-10h déjà utilisées pour le FVG validé). Signal = une bougie DANS cette fenêtre dont la mèche dépasse le PDH/PDL puis qui clôture de l'autre côté (même convention de "sweep même bougie" que liquiditySweep.js), au plus un signal par direction par jour. Entrée à l'ouverture de la bougie suivante, stop au-delà de l'extrême du sweep, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE, rien de nouveau inventé pour la sortie). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 749 | 28.2% | 1.01 | 0.01 | 146 | 27.4% | 1.05 | 0.04 | ✅ tient |
| US500 | 779 | 28.1% | 0.98 | -0.02 | 156 | 27.6% | 1.00 | 0.00 | ⚠️ affaibli |
| XAUUSD | 706 | 27.7% | 0.91 | -0.08 | 149 | 28.9% | 1.04 | 0.03 | ⚠️ affaibli |
| EURUSD | 516 | 29.8% | 1.03 | 0.03 | 152 | 34.2% | 1.24 | 0.18 | ✅ tient |
| GBPUSD | 434 | 30.4% | 1.07 | 0.05 | 152 | 23.7% | 0.73 | -0.24 | ❌ ne tient pas |
| USDJPY | 498 | 26.6% | 0.88 | -0.11 | 159 | 34.0% | 1.31 | 0.23 | ⚠️ affaibli |
| USDCAD | 730 | 24.7% | 0.77 | -0.21 | 72 | 26.4% | 0.81 | -0.17 | ❌ ne tient pas |
| GER40 | 1024 | 29.3% | 1.15 | 0.11 | 262 | 26.0% | 1.01 | 0.01 | ⚠️ affaibli |
| UKX | 658 | 28.0% | 0.99 | -0.00 | 241 | 27.0% | 0.94 | -0.05 | ❌ ne tient pas |