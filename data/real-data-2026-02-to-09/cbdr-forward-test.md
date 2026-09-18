# Forward-test CBDR — vraies données cTrader (2026-02-10 → 2026-09-16)

⚠ ~7 mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Ces données n'ont JAMAIS servi à choisir un paramètre de cbdr.js (fenêtre 14h-20h, projection 2x, etc.) — écrites et validées avant que ce forward-test ne soit lancé. Conversion fuseau horaire appliquée (voir en-tête du script) : les bougies exportées sont en UTC réel, converties en "heure moteur" (UTC-5 fixe) avant tout calcul de fenêtre de session, exactement comme le fait le bot live lui-même.

| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) |
|---|---|---|---|---|---|---|---|---|
| US100 | 52 | 18 | 34 | 0 | 34.6% | 17.46 | 1.49 | 0.34 |
| US500 | 42 | 17 | 25 | 0 | 40.5% | 22.30 | 1.82 | 0.53 |
| GER40 | 74 | 18 | 56 | 0 | 24.3% | -4.87 | 0.92 | -0.07 |
| EURUSD | 31 | 15 | 16 | 0 | 48.4% | 22.68 | 2.19 | 0.73 |
| XAUUSD | 66 | 17 | 49 | 0 | 25.8% | -3.22 | 0.94 | -0.05 |