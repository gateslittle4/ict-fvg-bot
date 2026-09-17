# Stratégie exploratoire ICT #8 : Asian Range Breakout

⚠ Deuxième nouveau concept ICT de cette session, cette fois un mécanisme de CASSURE/continuation (pas une reversal comme le Judas Swing) : la killzone asiatique ICT (20h-00h heure de New York, jamais utilisée ailleurs dans ce projet) forme un range ; la première bougie qui CLÔTURE au-delà de ce range pendant la fenêtre 00h-05h (de la clôture asiatique à la fin de la killzone Londres) déclenche un trade dans le sens de la cassure. Différent de l'ORB déjà rejeté (qui utilise l'ouverture actions NY 09h30-10h00 et force une clôture le jour même) et du Judas Swing (sweep+reclaim du PDH/PDL, 02h-05h). Bougies M15. Stop = côté opposé du range asiatique (même convention que l'ORB : "le range définit son propre risque"). Cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE/Judas Swing). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 2184 | 23.6% | 0.91 | -0.07 | 326 | 27.0% | 1.17 | 0.12 | ⚠️ affaibli |
| US500 | 2089 | 22.2% | 0.86 | -0.11 | 358 | 25.8% | 1.07 | 0.05 | ⚠️ affaibli |
| XAUUSD | 1819 | 26.3% | 1.07 | 0.05 | 253 | 27.0% | 1.11 | 0.08 | ✅ tient |
| EURUSD | 1004 | 24.1% | 0.94 | -0.05 | 325 | 27.6% | 1.10 | 0.07 | ⚠️ affaibli |
| GBPUSD | 988 | 25.3% | 0.96 | -0.03 | 345 | 25.8% | 1.03 | 0.02 | ⚠️ affaibli |
| USDJPY | 872 | 24.5% | 1.04 | 0.03 | 226 | 29.7% | 1.37 | 0.24 | ✅ tient |
| USDCAD | 2169 | 21.4% | 0.79 | -0.17 | 330 | 22.5% | 0.81 | -0.15 | ❌ ne tient pas |
| GER40 | 244 | 29.4% | 1.26 | 0.18 | 369 | 28.7% | 1.24 | 0.17 | ✅ tient |
| UKX | 782 | 24.4% | 0.98 | -0.02 | 308 | 19.3% | 0.74 | -0.21 | ❌ ne tient pas |
| AUX | 421 | 20.7% | 0.95 | -0.03 | 183 | 19.6% | 0.83 | -0.13 | ❌ ne tient pas |