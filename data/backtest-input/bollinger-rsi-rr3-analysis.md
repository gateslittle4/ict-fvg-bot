# Variante : Bollinger + RSI(2), mais cible fixe 1:3 (au lieu du retour à la moyenne)

⚠ Même signal EXACT que bollinger-rsi-mean-reversion-analysis.md (clôture d'hier hors bande de Bollinger 20/2 ET RSI(2) < 10 ou > 90, remplissage à l'ouverture du jour suivant, stop 2xATR(14)) - seule la SORTIE change : cible fixe 1:3 (même convention que FVG/Divergence) au lieu du retour à la bande médiane. Le but est de savoir si le signal lui-même est le problème, ou seulement le choix de cible de la version précédente. Timeout 10 jours. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 82 | 0.0% | 0.47 | -0.29 | 28 | 7.7% | 1.02 | 0.01 | ⚠️ affaibli |
| US500 | 76 | 6.3% | 0.63 | -0.19 | 28 | 10.0% | 1.87 | 0.30 | ⚠️ affaibli |
| XAUUSD | 98 | 5.7% | 0.57 | -0.24 | 43 | 3.6% | 0.45 | -0.36 | ❌ ne tient pas |