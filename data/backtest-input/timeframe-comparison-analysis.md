# Le timeframe (M15) explique-t-il le taux de gain relativement bas ?

⚠ Isolation d'UNE seule variable : même règle FVG (gap à 3 bougies), même stop (fvg-edge), même cible 1:3, même âge max de zone (50 bougies), AUCUN autre filtre (pas de biais HTF, pas de structure/BOS, pas de session, pas de liquidity sweep) - lancé sur le MÊME historique de prix, ré-échantillonné en M15 (ce qui tourne réellement), H1 et H4. Toute différence entre les lignes d'un même symbole vient donc du timeframe/de la taille de bougie seule, pas d'un des autres filtres déjà utilisés par ailleurs. Rappel avant de lire les résultats : à 1:3, le seuil de rentabilité mécanique est 25% de gains (1 gain paie 3 pertes) AVANT coûts - un taux de gain de 30-45% à 1:3 n'est donc pas un problème en soi, c'est à ça que ressemble une stratégie 1:3 qui fonctionne. Ce script sert à vérifier si le timeframe change ce chiffre, pas à chasser un taux de gain plus haut pour lui-même (voir bollinger-rsi-*-analysis.md sur ce piège). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Timeframe | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | M15 | 8037 | 28.7% | 1.04 | 0.03 | 3530 | 30.1% | 1.13 | 0.10 | ✅ tient |
| US100 | H1 | 2778 | 29.1% | 1.10 | 0.08 | 1027 | 29.8% | 1.17 | 0.12 | ✅ tient |
| US100 | H4 | 952 | 29.8% | 1.19 | 0.14 | 283 | 26.6% | 1.05 | 0.04 | ⚠️ affaibli |
| US500 | M15 | 6849 | 28.4% | 0.99 | -0.00 | 2805 | 28.8% | 1.02 | 0.02 | ⚠️ affaibli |
| US500 | H1 | 2366 | 29.8% | 1.11 | 0.08 | 875 | 31.1% | 1.19 | 0.14 | ✅ tient |
| US500 | H4 | 920 | 27.8% | 1.05 | 0.04 | 300 | 27.8% | 1.07 | 0.05 | ✅ tient |
| XAUUSD | M15 | 4001 | 26.7% | 0.87 | -0.12 | 3057 | 30.0% | 1.07 | 0.06 | ⚠️ affaibli |
| XAUUSD | H1 | 1508 | 28.3% | 0.99 | -0.01 | 1042 | 32.9% | 1.29 | 0.21 | ⚠️ affaibli |
| XAUUSD | H4 | 581 | 29.1% | 1.07 | 0.06 | 331 | 34.4% | 1.44 | 0.30 | ✅ tient |