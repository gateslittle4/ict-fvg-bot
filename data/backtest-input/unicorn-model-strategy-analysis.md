# Stratégie exploratoire ICT #14 : Unicorn Model (Breaker Block + FVG en superposition)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Combine deux PD arrays déjà détectés séparément (Breaker Block déjà testé/rejeté, FVG brut) mais jamais requis de coïncider : un Order Block cassé (même mécanique que breakerBlock.js — BOS, recherche de l'OB, cassure complète) devient un breaker, et l'entrée n'est prise que si un FVG de même sens se forme et CHEVAUCHE la zone du breaker dans une fenêtre bornée après la cassure. Entrée sur retest de la zone de chevauchement, stop au-delà de l'extrême du breaker, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Priorité donnée à US100/US500 (seuls instruments avec un edge déjà validé dans ce projet), mais testé sur les 6 instruments disponibles pour la comparaison habituelle. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 489 | 26.2% | 0.95 | -0.04 | 198 | 27.8% | 1.06 | 0.05 | ⚠️ affaibli |
| US500 | 450 | 23.6% | 0.81 | -0.16 | 187 | 23.0% | 0.78 | -0.19 | ❌ ne tient pas |
| XAUUSD | 379 | 27.8% | 0.94 | -0.05 | 208 | 32.7% | 1.25 | 0.19 | ⚠️ affaibli |
| EURUSD | 515 | 28.9% | 1.00 | -0.00 | 176 | 30.1% | 1.05 | 0.04 | ⚠️ affaibli |
| GBPUSD | 393 | 26.2% | 0.87 | -0.11 | 167 | 23.5% | 0.76 | -0.21 | ❌ ne tient pas |
| USDJPY | 619 | 25.9% | 0.85 | -0.13 | 198 | 28.3% | 0.99 | -0.00 | ❌ ne tient pas |