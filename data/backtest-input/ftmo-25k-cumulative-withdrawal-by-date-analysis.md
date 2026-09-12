# FTMO 1-Step $25k → $500 CUMULÉS via des retraits réguliers (pas un seul gros retrait)

Esdras : "après avoir passé le challenge FTMO, je ne dois rien toucher dans le profit jusqu'à ce qu'il arrive à 500$?" -> "oui, fais-le [le test]." Variante directe de `ftmo-25k-first-payout-by-date-analysis.md`, qui modélisait "attendre un seul retrait de $500". Celui-ci modélise la stratégie inverse et plus réaliste : **retirer TOUT ce qui est disponible à chaque cycle de 14 jours** (le cycle bi-hebdomadaire de FTMO), dès le premier trade live, plutôt que d'attendre d'accumuler $500 d'un coup. Le total CUMULÉ des retraits est suivi, et on regarde quand ce total franchit $500 pour la première fois.

Même 98 points de départ historiques, même architecture qu'avant.

**Nouvelle hypothèse de modélisation, la vraie inconnue de ce test** : un retrait est modélisé comme "verrouillant" le plancher de drawdown trailing au NOUVEAU solde (post-retrait) - c'est-à-dire qu'après chaque retrait, le compte repart sur un plancher frais plutôt que de continuer à poursuivre l'ancien sommet plus haut. C'est le comportement le plus courant chez les firmes avec un plancher trailing, mais le mécanisme EXACT de FTMO sur ce point précis n'a pas été trouvé/confirmé cette session - à vérifier directement avant un premier vrai retrait.

**Résultat : sur 98 points de départ testés, 96 ont atteint $500 CUMULÉS dans les données disponibles (2 n'ont pas eu assez de données restantes pour conclure).**

- Médiane : **108 jours**
- Moyenne : 141 jours
- Plus rapide : 26 jours
- Plus lent (parmi ceux qui ont fini) : 563 jours
- Nombre moyen de retraits distincts pour atteindre $500 : 1.9

## La question directe : le 1er décembre (80j) vs début janvier (115j), à partir d'aujourd'hui (12 sept. 2026)

| Seuil (jours) | Date approximative | % des points de départ qui y arrivent |
|---|---|---|
| 30 | — | 1% |
| 45 | — | 4% |
| 60 | — | 20% |
| 80 | 1er décembre | 31% |
| 90 | — | 40% |
| 115 | début janvier (5 jan.) | 59% |
| 120 | — | 60% |
| 150 | — | 70% |

**1er décembre : ~31% des points de départ testés y arrivent.** **Début janvier (115 jours au total) : ~59%.**

## Comparaison avec la stratégie "un seul retrait de $500"

| Stratégie | % d'ici le 1er déc. | % d'ici début jan. | Médiane |
|---|---|---|---|
| Un seul retrait de $500 (voir `ftmo-25k-first-payout-by-date-analysis.md`) | 41% | 67% | 92j |
| Retraits réguliers, cumulés (ce rapport) | 31% | 59% | 108j |

**Résultat contre-intuitif, mais logique une fois expliqué** : retirer tôt et souvent est LÉGÈREMENT plus lent pour ACCUMULER $500 au total (108j médian contre 92j). Ce n'est pas un problème du plan - c'est l'effet attendu de retirer du capital qui composait : à chaque retrait, le solde retombe à $25k et le risque par trade (toujours % du solde COURANT) retombe avec lui, donc chaque cycle après un retrait recommence à "vitesse de croisière" plutôt que de profiter d'un solde plus gros. Retirer tôt reste plus SÛR (l'argent est en sécurité, hors de portée d'une mauvaise série) - juste marginalement plus lent en moyenne pour atteindre un total cumulé donné. Le vrai compromis : sécurité contre vitesse pure, pas gratuit dans un sens ni dans l'autre.

## Ce qui améliore concrètement les chances de tenir la date

1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.
2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (`ACCOUNT_MODE=challenge`, 0.5%, déjà configuré) plutôt que d'attendre.
3. **Vérifier le vrai comportement du plancher de FTMO après un retrait AVANT le premier retrait réel** - voir l'hypothèse en tête de rapport, c'est la seule vraie inconnue de cette stratégie.
4. **Accepter que ce n'est pas garanti** - le résultat dépend fortement de QUAND le marché donne des opportunités. Un objectif de repli (mi-décembre) réduit la pression sans changer la stratégie.

**Rien codé dans `src/`** - script de recherche/planification seulement, aucun changement de configuration.