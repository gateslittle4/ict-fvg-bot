# Bollinger Band Squeeze (compression de volatilité + breakout) — un mécanisme vraiment nouveau, jamais tenté ici

⚠ Choisi explicitement pour diversifier par MÉCANISME, pas seulement par instrument : ni ICT (FVG/Judas Swing/NWOG), ni suivi de tendance par croisement (DMI/MACD/Turtle, tous rejetés), ni mean-reversion RSI (Connors/Bollinger+RSI, déjà tentés). Concept publié (John Bollinger, popularisé "TTM Squeeze" par John Carter) : Bollinger(20,2) entièrement contenu dans Keltner(20, EMA, 1.5xATR20) = compression ; le signal se déclenche quand les bandes ressortent du canal (relâchement), direction = signe de (clôture - SMA20) à cette bougie. Entrée à l'ouverture suivante, stop 1.5xATR(14) (même convention que la Divergence déjà en production), cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que FVG/Judas Swing/NWOG/Weekly Sweep). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs, avec le garde-fou "minimum 10 trades" (sinon un verdict mécanique sur un échantillon trop mince ne veut rien dire — voir le faux positif XAUUSD/GER40 de RSI(2) Connors juste avant dans HANDOFF.md).

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 4632 | 26.9% | 0.99 | -0.01 | 720 | 26.3% | 1.04 | 0.03 | ⚠️ affaibli |
| US500 | 4490 | 25.8% | 0.93 | -0.06 | 687 | 25.2% | 0.96 | -0.03 | ❌ ne tient pas |
| XAUUSD | 5792 | 26.0% | 0.88 | -0.11 | 876 | 28.3% | 1.09 | 0.07 | ⚠️ affaibli |
| EURUSD | 2527 | 24.9% | 0.84 | -0.14 | 847 | 24.3% | 0.80 | -0.17 | ❌ ne tient pas |
| GBPUSD | 2052 | 25.6% | 0.87 | -0.11 | 878 | 24.6% | 0.80 | -0.18 | ❌ ne tient pas |
| USDJPY | 3655 | 26.4% | 0.91 | -0.08 | 886 | 26.4% | 0.96 | -0.03 | ❌ ne tient pas |
| USDCAD | 5435 | 23.9% | 0.78 | -0.19 | 828 | 21.3% | 0.64 | -0.34 | ❌ ne tient pas |
| GER40 | 3367 | 27.4% | 1.08 | 0.06 | 732 | 27.5% | 1.11 | 0.08 | ✅ tient* |

**\* GER40 : le verdict mécanique "✅ tient" est encore un piège, cette fois le piège de biais haussier DÉJÀ documenté pour ce symbole spécifiquement dans ce projet (voir HANDOFF.md, "GER40 — premier signal vraiment prometteur... mais 2 des 6 'tient' sont des pièges de biais haussier").** Vérifié en séparant achat/vente avant de croire le chiffre agrégé : côté VENDEUR négatif dans les deux fenêtres (train exp=-0.04R, PF=0.95 ; test exp=-0.09R, PF=0.88) ; tout l'edge apparent vient du côté ACHETEUR (train exp=+0.16R, PF=1.21 ; test exp=+0.22R, PF=1.31). Un mécanisme qui ne fonctionne QUE dans un sens sur un instrument qui a fortement monté sur toute la période testée n'est pas un edge du mécanisme — c'est le biais directionnel du marché qui fuite dans le résultat agrégé. **Conclusion révisée : rejeté aussi.**