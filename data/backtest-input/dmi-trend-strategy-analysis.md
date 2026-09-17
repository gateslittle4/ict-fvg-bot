# Stratégie exploratoire non-ICT #5 : suivi de tendance ADX/DMI (Wilder)

⚠ Système de SUIVI DE TENDANCE publié (Wilder, 1978), plus proche de Turtle dans l'esprit (on laisse courir la tendance, pas de cible R:R fixe) que de tout ce qui a été testé jusqu'ici - mais le déclencheur est un croisement +DI/-DI confirmé par l'ADX, pas une cassure de canal de prix. Bougies journalières. Seuil ADX=25 réutilisé TEL QUEL de l'analyse de régime déjà faite dans ce projet (market-regime-analysis.md), pas un nouveau paramètre ajusté ici. Entrée à l'ouverture du jour suivant un croisement confirmé par l'ADX>25. Stop = 2xATR(14) (même convention que RSI-2/Turtle/divergence RSI). Sortie = stop OU un croisement opposé (règle publiée de Wilder - produit naturellement un retournement direct quand ce croisement opposé est lui-même confirmé par l'ADX). Délibérément AUCUNE cible R:R fixe et AUCUN plafond de durée : c'est un système de suivi de tendance par construction (comme Turtle), les deux affaibliraient artificiellement le type de mouvement qu'il est censé capturer. Testé sur les 5 instruments disponibles d'un coup. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. ATTENTION : si un edge réel apparaît ici, la leçon déjà apprise avec Turtle System 2 (voir HANDOFF.md) s'applique - sa durée de détention doit être vérifiée AVANT toute combinaison avec le combo déjà validé (une position tenue longtemps peut bloquer le netting partagé bien plus qu'elle n'apporte elle-même). Cette vérification est hors du périmètre de ce script, qui teste seulement la qualité du signal seul.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Durée médiane (j, train) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | 60 | 30.0% | 0.82 | -0.07 | 6 | 33.3% | 0.15 | -0.29 | 4 | ❓ pas assez de trades |
| US500 | 60 | 20.0% | 0.33 | -0.32 | 6 | 50.0% | 0.38 | -0.22 | 4 | ❓ pas assez de trades |
| XAUUSD | 82 | 31.7% | 0.89 | -0.04 | 14 | 21.4% | 0.56 | -0.17 | 5 | ❌ ne tient pas |
| EURUSD | 26 | 26.9% | 0.42 | -0.23 | 5 | 0.0% | 0.00 | -0.83 | 4.5 | ❓ pas assez de trades |
| GBPUSD | 18 | 33.3% | 0.29 | -0.20 | 8 | 37.5% | 1.19 | 0.06 | 4 | ❓ pas assez de trades |
| USDJPY | 39 | 33.3% | 1.00 | 0.00 | 9 | 33.3% | 1.10 | 0.04 | 8 | ❓ pas assez de trades |
| USDCAD | 53 | 28.3% | 1.19 | 0.06 | 9 | 11.1% | 0.02 | -0.57 | 7 | ❓ pas assez de trades |
| GER40 | 35 | 22.9% | 1.21 | 0.09 | 5 | 20.0% | 0.46 | -0.27 | 5 | ❓ pas assez de trades |
| UKX | 15 | 40.0% | 1.78 | 0.22 | 11 | 36.4% | 0.75 | -0.09 | 7 | ❌ ne tient pas |