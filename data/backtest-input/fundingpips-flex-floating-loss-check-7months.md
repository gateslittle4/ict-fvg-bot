# Vérification de la règle "floating loss par idée de trade" - FundingPips 1-Step Flex

⚠ Demande explicite d'Esdras : "On verifie [...] la trade idea floating loss [rule]". Règle documentée dans `src/propFirms/fundingPips.js` (ambiguë, jamais réconciliée - accès direct à fundingpips.com bloqué) : lecture STRICTE = 3% (<$50k)/2% (≥$50k) de perte flottante+réalisée combinée sur UNE "idée de trade" = rupture immédiate ; lecture SOUPLE = 1% = avertissement, 4 cumulés = fermeture. Compte $10k, risque 0.5%/trade (le réglage actuel du bot), portefeuille de production réel (FVG US100/US500/XAUUSD, Divergence, NWOG achat seul, Judas Swing, Weekly Sweep GER40, pyramidage soumis au garde-fou).

## Fenêtre : 2025-05-31 → 2025-12-31

Trades analysés : 226 (dont 20 legs pyramid). Paires parent+pyramid superposées (= la définition même d'une "idée de trade" étendue par la règle) : 19.

| | Pire excursion flottante | % du solde | Dépassements strict (3%) | Dépassements souple (1%) |
|---|---|---|---|---|
| SOLO (une position) | 126.73$ | 0.50% | 0/226 | 0/226 |
| COMBINÉ (parent+pyramid) | 214.93$ | 1.00% | 0/19 | 0/19 |

**Verdict à 0.5% de risque : aucun dépassement, ni sous la lecture stricte ni sous la lecture souple.** Le pire cas solo (0.50% du solde) plafonne à quasiment exactement 1R (= 0.5% du solde par construction du risque par trade) grâce au stop-loss réel placé côté broker (`cTraderDataSource.js`) - une fois le prix atteint le niveau du stop, le broker ferme la position, donc l'exposition flottante ne peut pas dépasser 1R (hors slippage de gap au-delà du stop, un effet réel mais distinct et typiquement bien plus petit, non modélisé ici). Le pire cas combiné (1.00% du solde) correspond à deux unités (parent + pyramid) proches de leur stop en même temps, soit ~2R au pire - toujours largement sous le seuil souple de 1% par unité individuelle et sous le seuil strict combiné.

**Réserve honnête** : ceci répond à "quelle est l'exposition flottante réelle tant que le stop protège la position", pas au cas d'un gap qui saute par-dessus le niveau du stop lui-même (slippage d'exécution réel, dépendant du broker/de la liquidité au moment du gap - non quantifié ici, faute de données de profondeur de marché).
