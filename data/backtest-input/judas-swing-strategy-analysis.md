# Stratégie exploratoire ICT #7 : Judas Swing (killzone Londres)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet (différent de l'Order Block, l'IFVG, le Turtle Soup déjà rejetés, et du FILTRE de confluence liquidity sweep déjà en place sur le FVG validé - celui-ci utilise un pivot de swing fractal, à toute heure ; celui-ci utilise le plus-haut/plus-bas de la veille (PDH/PDL), limité à UNE fenêtre horaire précise). Bougies M15. PDH/PDL = plus haut/plus bas du jour calendaire COMPLET précédent (même agrégation journalière que partout ailleurs dans ce projet). Fenêtre : killzone Londres ICT (02h-05h heure de New York, publiée telle quelle, distincte de la Silver Bullet 10h-11h et de l'overlap Londres-NY 07h-10h déjà utilisées pour le FVG validé). Signal = une bougie DANS cette fenêtre dont la mèche dépasse le PDH/PDL puis qui clôture de l'autre côté (même convention de "sweep même bougie" que liquiditySweep.js), au plus un signal par direction par jour. Entrée à l'ouverture de la bougie suivante, stop au-delà de l'extrême du sweep, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE, rien de nouveau inventé pour la sortie). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 360 | 29.4% | 1.10 | 0.08 | 142 | 28.2% | 1.05 | 0.04 | ✅ tient |
| US500 | 346 | 24.6% | 0.82 | -0.16 | 140 | 29.3% | 1.05 | 0.04 | ⚠️ affaibli |
| XAUUSD | 282 | 26.7% | 0.88 | -0.11 | 149 | 28.9% | 1.04 | 0.03 | ⚠️ affaibli |
| EURUSD | 532 | 29.9% | 1.05 | 0.04 | 163 | 33.1% | 1.19 | 0.15 | ✅ tient |
| GBPUSD | 434 | 30.4% | 1.07 | 0.05 | 152 | 23.7% | 0.73 | -0.24 | ❌ ne tient pas |
| USDJPY | 498 | 26.6% | 0.88 | -0.11 | 159 | 34.0% | 1.31 | 0.23 | ⚠️ affaibli |