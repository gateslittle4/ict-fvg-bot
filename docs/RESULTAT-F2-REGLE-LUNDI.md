# Résultat — F2 : règle du lundi (acheter même sans cible, TP 3 R)

Calculé le 2026-10-06, après `PREREG-F2-REGLE-LUNDI.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis ; empreinte SHA-256 du fichier : `d57c9039d7219f3e2aca06039c4ebf5ef2d7859fffc22789b6d28b61bf79ea63`).

## Verdict
**La règle ne passe pas l'entraînement. F2 reste telle quelle.** Les trades ajoutés (achats sans cible les lundis après un vendredi haussier) ne sont pas profitables : −0,111 R en moyenne, et le résultat total de F2 baisse. Le test 2023–2025 n'a donc **pas été lu** (25 trades ajoutés y existent, leur R n'a pas été regardé).

## Contrôle
Le calcul de base retrouve exactement : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, 129,7 R, pire baisse 27,4 R.

## Entraînement 2011–2022
| | Contrôle F2 | Avec la règle du lundi |
|---|---|---|
| 2011–2016 | +0,067 (617) | +0,044 (662) |
| 2017–2022 | +0,146 (605) | +0,140 (650) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,091 (1 312), t 1,83 |
| R total | 129,7 | 119,7 |
| Pire baisse (R) | 27,4 | 33,8 |

**Trades ajoutés par la règle : 90** (45 sur 2011–2016, 45 sur 2017–2022). R moyen **−0,111**, t −0,65. Par moitié : −0,275 en 2011–2016, +0,053 en 2017–2022.

Critères : au moins 40 trades ajoutés (**oui**, 90) ; R moyen > 0 et t ≥ 1,65 (**non**) ; R moyen > 0 dans A et B (**non**, A est à −0,275) ; R total de la variante > contrôle (**non**, 119,7 contre 129,7) ; pire baisse ≤ 34,3 R (oui, 33,8). Il fallait les cinq.

## Ce que ça veut dire
Les lundis après un vendredi haussier sans FVG à viser ont fini en hausse dans 77 % des cas (analyse descriptive), mais acheter ces lundis avec les règles de F2 (entrée à 50 % de la zone, stop sous c1, TP à 3 R) ne rapporte rien : le prix finit la journée plus haut, mais il touche souvent le stop avant ou ne va pas assez loin pour atteindre 3 R. Fin de journée haussière ne veut pas dire trade gagnant : c'est exactement la réserve que contenait la divulgation du pré-enregistrement.

La règle d'origine de F2 (pas de cible = pas d'achat) est donc, dans les données, une bonne règle : ses lundis sans cible ne manquent pas de trades profitables.

## Réserves
- Le rejeu ne voit qu'environ 3 mois de passé : sur ton graphique, plus de zones seraient « sans cible » (la règle des 15–30 jours aurait plus de portée), et la comparaison serait peut-être différente.
- Seul un TP à 3 R a été testé pour ces trades ; d'autres sorties (TP plus proche, partiels) ne l'ont pas été, la règle écrite d'avance l'interdit. Idem pour d'autres définitions de « vendredi haussier ».
- Le balayage H4 n'était pas exigé pour ces trades (conformément au pré-enregistrement) ; ce sont donc des achats de nature différente de ceux de F2, ce qui peut expliquer en partie le résultat.
- Les trades sont corrélés ; le t est un peu flatteur ; l'échantillon (90) est petit.
- Aucune lecture de 2023–2025 (sauf le nombre de trades ajoutés, 25) ni de 2026.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboQ.mjs <data> train` (≈ 2 min). Moteur : `scripts/comboFvgV6/lib/krysBacktestW.js` (copie de `krysBacktest.js`, avec en plus l'option `noTargetRR`). Tests : `node --test scripts/comboFvgV6/comboQ.test.mjs` (5 tests : identité sans l'option, TP à 3 R exact pour les trades sans cible, option inactive = F2, jours qualifiants, cas dégénérés).
