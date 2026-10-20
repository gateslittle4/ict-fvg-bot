# Résultat — F2 : filtre « stop court » (H1) et breakeven à 1 R (H2)

Calculé le 2026-10-06, après `PREREG-F2-STOP-COURT-ET-BREAKEVEN.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis ; empreinte SHA-256 : `ddcd06cd58826c23ecb6ef7e438571d184a3cf4e44d3cf86c93c1565440d5ef4`, fichier horodaté 18:23 heure de New York).

## Verdict
**Aucune des deux ne passe l'entraînement. F2 reste telle quelle.** Le test 2023–2025 n'a pas été lu (seuls des nombres de trades ont été affichés).

## Contrôle
F2C retrouve exactement : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, 129,7 R, pire baisse 27,4 R. Rythme 2023–2025 : 2,14 trades par semaine (nombre seul).

## Entraînement 2011–2022 (R moyen par trade ; n)
| | F2C | H1 (S ≥ 1,76) | H2 (breakeven à 1 R) |
|---|---|---|---|
| 2011–2016 | +0,067 (617) | +0,081 (349) | +0,009 (627) |
| 2017–2022 | +0,146 (605) | +0,374 (275) | +0,159 (608) |
| 2011–2022 | +0,106 (1 222), t 2,04 | **+0,210 (624), t 2,98** | +0,083 (1 235), t 1,87 |
| R total | 129,7 | 131,1 | 102,7 |
| Pire baisse (R) | 27,4 | 19,2 | 34,7 |
| Rythme 2023–25 (trades/sem.) | 2,14 | 1,07 | 2,15 |

## H1 — stop court : rejetée de peu, mais rejetée
Le filtre retire 606 trades sur 1 222 (50 %), de R moyen +0,042 ; il en garde 624 à +0,210. Le R moyen double, la pire baisse passe de 27,4 à 19,2, et le R total est à peu près le même (131,1 contre 129,7) avec la moitié des trades. Mais le critère de significativité n'est pas atteint : **t de Welch entre gardés et supprimés = 1,62, pour 1,96 exigé**. Critères : gain ≥ +0,03 (oui), Welch ≥ 1,96 (**non**), mieux que F2C et > 0 dans A et B (oui), pire baisse (oui), rythme ≥ 1,0 (oui : 1,07, de justesse). Il fallait les cinq.

Deux remarques honnêtes :
- Ce seuil venait de chiffres que j'avais déjà vus sur 2011–2022, donc l'entraînement était favorable à H1 d'avance ; malgré cela, elle ne passe pas. Le seul vrai test aurait été 2023–2025, que je ne lis pas puisque l'entraînement échoue.
- Le gain vient surtout de 2017–2022 (+0,374 contre +0,146) ; en 2011–2016 le gain est petit (+0,081 contre +0,067).

Selon le protocole, **pas de variante voisine** (seuil 1,5 ou 2, autre longueur de bruit, etc.).

## H2 — breakeven à 1 R : ne marche pas
45 % des trades touchent +1 R (559 sur 1 235). Une fois le stop remonté à l'entrée, **324 trades sortent à 0 R**. Parmi eux, 223 sont des stops de F2C devenus des zéros (sur 868), mais **67 gagnants de F2C sur 289 sont aussi devenus des zéros** : le prix est revenu à l'entrée après +1 R, puis est reparti jusqu'au TP. Le bilan :

| | F2C | H2 |
|---|---|---|
| R moyen | +0,106 | +0,083 |
| R total | 129,7 | 102,7 |
| Part de gagnants | 29 % | 21 % |
| Pire baisse | 27,4 | 34,7 |

t apparié : −0,92 (la variante est plutôt moins bonne que F2C, sans que l'écart soit significatif). Critères : gain (non), t (non), moitiés (non : 2011–2016 à +0,009 contre +0,067), pire baisse (non : 34,7 > 34,3), rythme (oui). D'un côté, 223 stops à −1 R deviennent des zéros (223 R de moins de perte) ; de l'autre, 67 gagnants à plus de +3 R chacun deviennent des zéros. Au total, le R passe de 129,7 à 102,7 (−27 R) : le breakeven coûte plus en gagnants coupés qu'il n'économise en pertes évitées.

Ça ne veut pas dire qu'un breakeven soit inutile à tout trader : il peut rassurer, réduire la variabilité d'une série sur le court terme (ce n'est pas le cas ici : la pire baisse empire). Sur F2, avec ces règles et ce TP à 3 R, il ne rapporte rien.

## Réserves
- Deux hypothèses de plus sur F2 après de nombreuses autres ; les t sont un peu flatteurs (trades corrélés).
- Breakeven simulé avec une convention pessimiste (déclenchement effectif à la bougie suivante, sortie au prix d'entrée sans glissement). En réel, les stops au breakeven peuvent sortir avec du glissement.
- Un seul seuil par hypothèse (S = 1,76, breakeven à 1 R) : les variantes (0,5 R, 1,5 R, trailing, autre seuil de S) ne sont pas testées, par la règle écrite d'avance.
- 2023–2025 : seuls des nombres de trades ont été lus (H1 donne 1,07 trade par semaine, H2 2,15). 2026 non lu.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboT.mjs <data> train` (≈ 15 s). Moteur : `lib/krysBacktestC.js` (option `beR` ajoutée, inactive par défaut). Tests : `node --test scripts/comboFvgV6/comboT.test.mjs` (4 tests : identité avec F2C, seuils inactifs, seuil énorme et calcul de S, sorties au breakeven à 0 R après la bougie de déclenchement) ; les tests de `comboR` et `comboS_pertes` passent toujours.
