# Forward-test VWAP ancré — vraies données cTrader (2026-02-10 → 2026-09-16)

⚠ ~7 mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Rappel sur la donnée (voir anchoredVwap.js) : aucune colonne de volume dans ce projet, l'amplitude de chaque bougie sert de substitut de pondération — les résultats ci-dessous en héritent. Ces données n'ont JAMAIS servi à choisir un paramètre du mécanisme (bandes 2σ, 4 bougies minimum, etc.). Conversion fuseau horaire appliquée (voir en-tête du script) : les bougies exportées sont en UTC réel, converties en "heure moteur" (UTC-5 fixe) avant tout calcul d'ancrage journalier, exactement comme le fait le bot live lui-même.

| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) |
|---|---|---|---|---|---|---|---|---|
| US100 | 229 | 55 | 174 | 0 | 24.0% | 141.67 | 1.73 | 0.62 |
| US500 | 182 | 60 | 122 | 0 | 33.0% | 67.34 | 1.47 | 0.37 |
| GER40 | 237 | 68 | 169 | 0 | 28.7% | 172.22 | 1.93 | 0.73 |
| EURUSD | 13 | 6 | 7 | 0 | 46.2% | 10.88 | 2.23 | 0.84 |
| XAUUSD | 197 | 51 | 146 | 0 | 25.9% | 94.36 | 1.56 | 0.48 |