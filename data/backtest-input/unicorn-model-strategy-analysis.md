# Stratégie exploratoire ICT #14 : Unicorn Model (Breaker Block + FVG en superposition)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Combine deux PD arrays déjà détectés séparément (Breaker Block déjà testé/rejeté, FVG brut) mais jamais requis de coïncider : un Order Block cassé (même mécanique que breakerBlock.js — BOS, recherche de l'OB, cassure complète) devient un breaker, et l'entrée n'est prise que si un FVG de même sens se forme et CHEVAUCHE la zone du breaker dans une fenêtre bornée après la cassure. Entrée sur retest de la zone de chevauchement, stop au-delà de l'extrême du breaker, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Priorité donnée à US100/US500 (seuls instruments avec un edge déjà validé dans ce projet), mais testé sur les 6 instruments disponibles pour la comparaison habituelle. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1152 | 27.1% | 0.98 | -0.02 | 202 | 27.2% | 1.06 | 0.05 | ⚠️ affaibli |
| US500 | 1140 | 25.2% | 0.86 | -0.12 | 201 | 24.9% | 0.89 | -0.09 | ❌ ne tient pas |
| XAUUSD | 977 | 26.5% | 0.87 | -0.11 | 208 | 32.7% | 1.25 | 0.19 | ⚠️ affaibli |
| EURUSD | 490 | 28.8% | 0.98 | -0.02 | 161 | 29.8% | 1.03 | 0.02 | ⚠️ affaibli |
| GBPUSD | 393 | 26.2% | 0.87 | -0.11 | 167 | 23.5% | 0.76 | -0.21 | ❌ ne tient pas |
| USDJPY | 619 | 25.9% | 0.85 | -0.13 | 198 | 28.3% | 0.99 | -0.00 | ❌ ne tient pas |
| USDCAD | 1066 | 26.8% | 0.88 | -0.10 | 142 | 24.6% | 0.76 | -0.22 | ❌ ne tient pas |
| GER40 | 956 | 29.3% | 1.13 | 0.10 | 208 | 30.3% | 1.22 | 0.16 | ✅ tient |
| UKX | 552 | 28.9% | 1.03 | 0.03 | 192 | 25.0% | 0.83 | -0.14 | ❌ ne tient pas |
| AUX | 388 | 27.8% | 0.98 | -0.02 | 170 | 31.8% | 1.16 | 0.13 | ⚠️ affaibli |