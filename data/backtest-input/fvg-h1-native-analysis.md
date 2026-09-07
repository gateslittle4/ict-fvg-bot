# FVG négocié nativement en H1 (au lieu de M15) - même config validée par instrument

⚠ Même config EXACTE que le combo M15 recommandé (variant de biais, structure/BOS, fenêtre de session, liquidity sweep, mode de stop, cible 1:3) - décidée AVANT ce test, aucun nouveau réglage. Seul changement : les zones FVG sont détectées et négociées directement sur des bougies D'1 HEURE au lieu de 15 minutes. Attendu à l'avance : beaucoup moins de signaux (un gap à 3 bougies est plus rare en H1 ; une fenêtre de session qui capturait ~4 bougies M15/jour n'en capture plus qu'~1 en H1) - certaines cases auront donc peu de trades, signalé honnêtement plutôt que caché. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 12 | 33.3% | 1.25 | 0.19 | 3 | 33.3% | 1.32 | 0.23 | ❓ pas assez de trades |
| US500 | 5 | 80.0% | 10.09 | 2.10 | 2 | 0.0% | 0.00 | -1.02 | ❓ pas assez de trades |
| XAUUSD | 18 | 50.0% | 2.77 | 0.93 | 3 | 66.7% | 5.82 | 1.64 | ❓ pas assez de trades |