# Stratégie originale : retour à la moyenne Bandes de Bollinger + RSI(2) (double confirmation)

⚠ Construction propre à ce projet (pas copiée d'un système publié unique), mais entièrement bâtie à partir de briques standards PUBLIÉES pour ne pas être ajustée sur nos données : Bandes de Bollinger (20 jours, 2 écarts-types - défaut de Bollinger lui-même) + RSI(2) (même calcul que la stratégie RSI-2 déjà testée), sans filtre de tendance (contrairement à la RSI-2 EMA200) - le but est de capter TOUT étirement statistique extrême, en tendance ou pas. Entrée = clôture d'HIER hors de la bande (bas ou haut) ET RSI(2) < 10 ou > 90 (double confirmation), remplissage à l'ouverture du jour SUIVANT. Stop = 2xATR(14) (même convention que partout ailleurs). Cible = retour à la bande MÉDIANE (SMA20) - pas un R:R fixe, contrairement au FVG/Divergence - c'est ce qui doit mécaniquement pousser le taux de gain au-dessus de 50%, contre un stop plus large en cas d'échec. Timeout 10 jours. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs - un taux de gain >50% sur TRAIN seul ne prouverait rien, il doit tenir sur TEST aussi.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 84 | 42.2% | 0.65 | -0.18 | 29 | 50.0% | 1.01 | 0.00 | ⚠️ affaibli |
| US500 | 79 | 52.5% | 0.93 | -0.03 | 30 | 65.2% | 2.29 | 0.37 | ⚠️ affaibli |
| XAUUSD | 104 | 37.5% | 0.61 | -0.20 | 45 | 32.5% | 0.55 | -0.28 | ❌ ne tient pas |