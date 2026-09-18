# Forward-test CBDR autonome — vraies données cTrader

⚠ Quelques mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Ces données n'ont JAMAIS servi à choisir un paramètre de CBDR (fenêtre 14h-20h NY, 2 écarts-types, RR 1:3, timeout 480 bougies) - valeurs publiées, fixées et validées sur les CSV historiques 2019-2025 avant que ce dossier n'existe. Conversion fuseau horaire appliquée (voir en-tête du script) : les bougies exportées sont en UTC réel, converties en "heure moteur" (UTC-5 fixe) avant tout calcul de fenêtre de session, exactement comme le fait le bot live lui-même.

| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) |
|---|---|---|---|---|---|---|---|---|
| US100 | 52 | 18 | 34 | 0 | 34.6% | 17.46 | 1.49 | 0.34 |
| EURUSD | 31 | 15 | 16 | 0 | 48.4% | 22.68 | 2.19 | 0.73 |
| GER40 | 74 | 18 | 56 | 0 | 24.3% | -4.87 | 0.92 | -0.07 |

**Bilan** : 2/3 instrument(s) testé(s) montrent une espérance positive sur ce fenêtre réelle jamais vue par le réglage de CBDR (US100, EURUSD). Ceci confirme ou infirme uniquement le signal LUI-MÊME - ni recommandation ni rejet pour du capital réel n'est automatique à partir de ce seul résultat, à lire avec Esdras avant toute décision de mise en production.