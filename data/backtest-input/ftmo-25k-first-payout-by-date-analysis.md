# FTMO 1-Step $25k → premier retrait de $500 — combien de temps ça prend vraiment?

Esdras, après avoir écarté GoatFundedTrader (trop contraignant) : "je veux toucher mon premier 500$ de forex ou futures le 1 December." Plutôt qu'une estimation à la main, simulation empirique du pipeline COMPLET : acheter un challenge FTMO 1-Step $25k, le passer (rachat immédiat d'un nouveau challenge à chaque bust - FTMO n'a ni limite de temps ni pénalité au-delà des frais), passer live sur un compte financé $25k, accumuler du profit réel, et devenir éligible au premier retrait 14 jours calendaires après le premier trade live (règle FTMO sourcée en direct aujourd'hui) + ~4 jours de traitement. Testé depuis 98 points de départ historiques différents (tous les 30 jours sur 2018-2025) pour obtenir une vraie DISTRIBUTION empirique, pas une seule estimation.

**Hypothèses de modélisation à connaître** : risque 0.5% en challenge / 0.3% en live (les défauts déjà codés) ; la limite de perte totale de FTMO (10%, trailing fin de journée) est supposée IDENTIQUE une fois financé - non confirmée séparément dans les sources consultées cette session ; un bust en live repart sur un nouveau challenge (perte du compte financé), sans réinitialiser le compteur de jours écoulés depuis le point de départ initial ; le split 90% s'applique au profit COURANT au-dessus du solde financé de départ, pas trade par trade.

**Résultat : sur 98 points de départ testés, 96 ont atteint un premier retrait de $500 dans les données disponibles (2 n'ont pas eu assez de données restantes pour conclure - à traiter comme "plus de temps que la fenêtre testée", pas comme un échec).**

- Médiane : **92 jours**
- Moyenne : 129 jours
- Plus rapide : 27 jours
- Plus lent (parmi ceux qui ont fini) : 552 jours

## La question directe : le 1er décembre (80j) vs début janvier (115j), à partir d'aujourd'hui (12 sept. 2026)

| Seuil (jours) | Date approximative | % des points de départ qui y arrivent |
|---|---|---|
| 30 | — | 1% |
| 45 | — | 10% |
| 60 | — | 23% |
| 80 | 1er décembre | 41% |
| 90 | — | 48% |
| 115 | début janvier (5 jan.) | 67% |
| 120 | — | 68% |
| 150 | — | 73% |

**1er décembre : ~41% des points de départ testés y arrivent** (TENDU, moins probable qu'improbable avec cette config) - possible dans un scénario favorable, pas le cas moyen. **Début janvier (115 jours au total) : ~67%** - ça repasse au-dessus de 50%, donc devient l'issue la PLUS probable plutôt que l'exception. Le facteur qui domine le calendrier est presque toujours la VITESSE DE PASSAGE DU CHALLENGE (très variable d'un point de départ à l'autre) plus que la phase live elle-même (14 jours minimum + accumulation du profit, plus stable une fois financé) - chaque semaine de marge en plus profite surtout à absorber une évaluation qui prend plus de temps que la moyenne, pas un ralentissement en phase live.

## Ce qui améliore concrètement les chances de tenir la date

1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.
2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (`ACCOUNT_MODE=challenge`, 0.5%, déjà configuré) plutôt que d'attendre.
3. **Demander le premier retrait dès l'éligibilité (jour 14 de trading live), même si c'est moins de $500** - rien n'oblige à attendre un seul gros retrait de $500 : plusieurs petits retraits qui s'additionnent à $500 avant le 1er décembre comptent tout autant pour "toucher" cet argent, et réduisent le risque d'un bust live qui repousserait tout.
4. **Accepter que ce n'est pas garanti** - avec cette config précise, le résultat dépend fortement de QUAND le marché donne des opportunités, pas seulement du système. Un deuxième point de repli (ex. viser mi-décembre plutôt qu'une date dure) réduit la pression sans changer la stratégie.

**Rien codé dans `src/`** - script de recherche/planification seulement, aucun changement de configuration. Détail complet (chaque point de départ, son issue, son nombre de jours) : voir la sortie console du script pour la liste brute si besoin d'auditer un cas précis.