# FundingPips 1-Step Flex $25k → premier retrait de $500 — comparaison directe avec FTMO

Esdras : "pourquoi t'aimes autant le FTMO et non le FundingPips ou GoatFundedTrader?" -> "teste FundingPips 1-Step Flex." Exactement la même méthode que `ftmo-25k-first-payout-by-date-analysis.md` (98 points de départ historiques, même pipeline challenge->live->retrait, même cible $500), mais avec les vraies règles FundingPips Flex au lieu de FTMO : cible +12%, perte quotidienne 3%, perte totale **12% STATIQUE** (le plancher ne bouge JAMAIS, contrairement au trailing fin-de-journée de FTMO - la différence structurelle que tu m'avais fait remarquer), split 85% (nouvellement confirmé), premier retrait dès 1% de profit + cycle bi-hebdomadaire + ~3 jours de traitement.

⚠️ **Une règle avec un chiffre AMBIGU, trouvée dans deux sources différentes non réconciliées** (voir `src/propFirms/fundingPips.js` pour le détail complet) : une perte flottante sur "une idée de trade" (un instrument+sens, ou toute ré-entrée dans les 10 minutes après une perte) - une source dit 3%(<$50k)/2%(≥$50k) = rupture immédiate, une autre dit 1% = avertissement, 4 avertissements cumulés (jamais remis à zéro) = rupture, le 2e avertissement coupe le split en deux. Modélisé ici avec la lecture STRICTE (3%, rupture immédiate) comme vraie cause de bust ; la lecture souple (1%) est seulement comptée en info (colonne "avertissements"), pas appliquée comme bust ici. **Accès direct à fundingpips.com/help.fundingpips.com bloqué (429 puis 403) les deux fois où ce projet a essayé** - à reconfirmer avant d'engager du capital réel.

**Résultat : sur 98 points de départ testés, 96 ont atteint un premier retrait de $500 dans les données disponibles (2 n'ont pas eu assez de données restantes pour conclure).**

- Médiane : **102 jours**
- Moyenne : 141 jours
- Plus rapide : 32 jours
- Plus lent (parmi ceux qui ont fini) : 555 jours
- Busts causés par la règle stricte de perte flottante par "idée de trade" (3%) : **0** sur l'ensemble des tentatives (challenge + live confondus)
- Busts en phase LIVE (compte financé perdu, toutes causes) : 0
- Avertissements cumulés (lecture souple 1%) - le plus haut atteint par une seule tentative : 0 (seuil de rupture : 4)

## La question directe : le 1er décembre (80j) vs début janvier (115j), à partir d'aujourd'hui (12 sept. 2026)

| Seuil (jours) | Date approximative | % des points de départ qui y arrivent |
|---|---|---|
| 30 | — | 0% |
| 45 | — | 6% |
| 60 | — | 19% |
| 80 | 1er décembre | 32% |
| 90 | — | 42% |
| 115 | début janvier (5 jan.) | 57% |
| 120 | — | 59% |
| 150 | — | 66% |

**1er décembre : ~32% des points de départ testés y arrivent.** **Début janvier (115 jours au total) : ~57%.** Comparer directement avec `ftmo-25k-first-payout-by-date-analysis.md` (41% / 67% pour FTMO sur les mêmes seuils, mêmes 98 points de départ, même méthode) - voir le tableau de synthèse ci-dessous pour la lecture côte à côte.

## FTMO vs FundingPips Flex, côte à côte (mêmes 98 points de départ, même cible $500)

| | FTMO 1-Step $25k | FundingPips 1-Step Flex $25k |
|---|---|---|
| Cible challenge | +10% | +12% |
| Perte totale | 10%, trailing fin de journée | 12%, **statique (ne bouge jamais)** |
| Split | 90% | 85% |
| % qui atteint $500 net d'ici le 1er décembre | 41% | 32% |
| % qui atteint $500 net d'ici début janvier | 67% | 57% |
| Médiane (jours) | 92 | 102 |

**Sur cette mesure précise, FTMO garde l'avantage** - malgré le plancher statique plus indulgent en théorie, la cible plus haute (+12% contre +10%) et le split plus faible (85% contre 90%) pèsent plus lourd dans le calcul du temps total jusqu'à $500 net en main.

## Ce qui améliore concrètement les chances de tenir la date

1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.
2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (mêmes réglages 0.5%/0.3% que pour FTMO).
3. **Demander le premier retrait dès l'éligibilité, même si c'est moins de $500** - le seuil FundingPips (1% de profit) est plus bas que celui de FTMO, donc éligible plus tôt en théorie.
4. **Vérifier la vraie règle de perte flottante par idée de trade AVANT d'acheter** - c'est la seule inconnue réelle de cette analyse (voir l'avertissement en tête de rapport). Le reste des chiffres est cohérent entre plusieurs sources.

**Rien codé dans `src/`** au-delà du profil `FUNDINGPIPS_1STEP_FLEX` déjà mis à jour dans `src/propFirms/` (documentaire) - script de recherche/planification seulement.