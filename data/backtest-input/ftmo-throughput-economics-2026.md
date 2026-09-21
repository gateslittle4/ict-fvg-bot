# Débit réel de challenges (passes/an) et coût des rachats — fenêtre test/forward 2026-01-01 → aujourd'hui, M1 exact

Question d'Esdras : le débit réel (challenges réussis par unité de temps) plutôt que juste "réussis/ratés" — chaque échec coûte un rachat. **FEE_PER_BUST = $89 : PLACEHOLDER non confirmé** (aucun tarif $10k publié trouvé — voir HANDOFF.md 2026-09-16 ; le seul chiffre sourcé de ce dépôt est $230 pour un challenge $25k, remboursé une fois financé). À vérifier en direct sur ftmo.com avant toute décision d'achat réel — seule la comparaison RELATIVE entre configurations ci-dessous est fiable, pas le $ absolu.

| Configuration | Cycles terminés | Réussis | Ratés | Passes/an (263 j) | Coût rachats total | Coût par passe |
|---|---|---|---|---|---|---|
| 0.25% fixe | 1 | 1 | 0 | 1.39 | $0 | $0 |
| 0.3% fixe (risque réel live) | 1 | 1 | 0 | 1.39 | $0 | $0 |
| 0.5% fixe | 6 | 4 | 2 | 5.55 | $178 | $45 |
| 0.75% fixe | 11 | 6 | 5 | 8.33 | $445 | $74 |
| 1% fixe | 15 | 8 | 7 | 11.10 | $623 | $78 |
| 1.5% fixe | 30 | 17 | 13 | 23.59 | $1157 | $68 |
| Adaptatif 0.5→0.25 à -4% (retour immédiat sous 4%) | 1 | 1 | 0 | 1.39 | $0 | $0 |

## Limites

- Ne compte QUE le débit de passes de la phase challenge, pas les revenus du compte financé après (chaque passe donne un compte financé qui continue de composer séparément avec le même plancher — question différente, plus grande, déjà traitée pour FTMO $25k dans HANDOFF.md "$500 withdrawal").
- FEE_PER_BUST est un placeholder, pas une valeur sourcée — à corriger avant toute décision d'achat réel.
- Cycle en cours en fin de fenêtre exclu du débit (résultat pas encore connu).
- Même limites que les rapports précédents (coûts partiels, garde-fous réels mais pas de correctif de géométrie d'ordre).