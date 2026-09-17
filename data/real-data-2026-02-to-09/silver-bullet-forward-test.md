# Forward-test Silver Bullet autonome — vraies données cTrader (2026-02-10 → 2026-09-16)

⚠ ~7 mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Ces données n'ont JAMAIS servi à choisir un paramètre de Silver Bullet (fenêtre 10h-11h, tolérance EQH/EQL, etc.) - écrites et validées avant que ce dossier n'existe. Conversion fuseau horaire appliquée (voir en-tête du script) : les bougies exportées sont en UTC réel, converties en "heure moteur" (UTC-5 fixe) avant tout calcul de fenêtre de session, exactement comme le fait le bot live lui-même.

| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) | Chevauchement production |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 78 | 23 | 55 | 0 | 29.5% | 25.74 | 1.52 | 0.33 | 14/78 (17.9%) |
| US500 | 68 | 20 | 48 | 0 | 29.4% | 28.71 | 1.72 | 0.42 | 13/68 (19.1%) |
| GER40 | 55 | 13 | 42 | 0 | 23.6% | 12.74 | 1.37 | 0.23 | 5/55 (9.1%) |