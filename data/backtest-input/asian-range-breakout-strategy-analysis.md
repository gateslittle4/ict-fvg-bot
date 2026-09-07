# Stratégie exploratoire ICT #8 : Asian Range Breakout

⚠ Deuxième nouveau concept ICT de cette session, cette fois un mécanisme de CASSURE/continuation (pas une reversal comme le Judas Swing) : la killzone asiatique ICT (20h-00h heure de New York, jamais utilisée ailleurs dans ce projet) forme un range ; la première bougie qui CLÔTURE au-delà de ce range pendant la fenêtre 00h-05h (de la clôture asiatique à la fin de la killzone Londres) déclenche un trade dans le sens de la cassure. Différent de l'ORB déjà rejeté (qui utilise l'ouverture actions NY 09h30-10h00 et force une clôture le jour même) et du Judas Swing (sweep+reclaim du PDH/PDL, 02h-05h). Bougies M15. Stop = côté opposé du range asiatique (même convention que l'ORB : "le range définit son propre risque"). Cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE/Judas Swing). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 783 | 27.1% | 1.15 | 0.10 | 326 | 27.0% | 1.16 | 0.11 | ✅ tient |
| US500 | 768 | 22.4% | 0.90 | -0.07 | 358 | 25.8% | 1.05 | 0.04 | ⚠️ affaibli |
| XAUUSD | 639 | 25.8% | 1.07 | 0.05 | 253 | 27.0% | 1.11 | 0.08 | ✅ tient |
| EURUSD | 1004 | 24.1% | 0.95 | -0.04 | 325 | 27.6% | 1.11 | 0.08 | ⚠️ affaibli |
| GBPUSD | 988 | 25.3% | 0.96 | -0.03 | 345 | 25.8% | 1.03 | 0.02 | ⚠️ affaibli |