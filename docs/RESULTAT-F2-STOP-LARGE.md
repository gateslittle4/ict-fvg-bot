# Résultat — F2 : stop plus large

Calculé le 2026-10-06, après `PREREG-F2-STOP-LARGE.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis).

## Verdict
**Aucune des deux variantes ne passe l'entraînement. F2 garde son stop.** Le test 2023–2025 n'a donc **pas été lu** (il reste vierge pour cette idée).

## Contrôle
Le calcul de base retrouve exactement les chiffres de référence : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R. Rythme 2023–2025 : 2,10 trades/semaine (nombre seul).

## Entraînement 2011–2022 (R moyen par trade, calculé avec le risque de chaque trade)
| | Contrôle F2 | S-1,25 | S-1,5 |
|---|---|---|---|
| 2011–2016 | +0,067 (617) | +0,030 (587) | +0,037 (566) |
| 2017–2022 | +0,146 (605) | +0,153 (575) | +0,153 (555) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,091 (1 162), t 1,95 | +0,094 (1 121), t 2,20 |
| % gagnants | 29 % | 33 % | 38 % |
| Pire baisse (R) | 27,4 | 29,0 | 23,7 |
| Rythme 2023–25 (trades/sem.) | 2,10 | 2,01 | 1,86 |
| t apparié (mêmes ordres) | — | 0,29 | 0,00 |

Critères : gain ≥ +0,03 R (**non**, les deux sont plus bas que le contrôle) ; t apparié ≥ 1,96 (**non**, 0,29 et 0,00) ; mieux que le contrôle dans A et B (**non** : A est plus bas dans les deux) ; pire baisse ≤ 34,3 R (oui) ; rythme ≥ 1,5 (oui). Il fallait les cinq.

## Ce que le stop plus large change réellement
- Le taux de gagnants monte (29 % → 33 % → 38 %) : un stop plus loin se fait toucher moins souvent.
- Mais chaque gain rapporte moins en R (un TP de 3R0 vaut 2,4 R à m = 1,25 et 2 R à m = 1,5), et chaque stop perdu fait toujours −1 R. Les deux effets s'annulent : le R moyen par trade reste à peu près le même (+0,09 contre +0,106).
- Le t apparié, qui compare les mêmes ordres, est à 0 : sur un même ordre, le stop large ne gagne pas plus en moyenne que le stop d'origine.
- Seule la pire baisse diminue pour m = 1,5 (23,7 R contre 27,4), parce que la courbe est moins nerveuse (38 % de gagnants). Ce n'était pas un critère d'amélioration : c'est descriptif, et la baisse de rythme (1,86/sem.) vient du fait que la position reste ouverte plus longtemps et bloque de nouveaux ordres.

## Détails
- Appariés : 1 148 ordres (m = 1,25) et 1 108 (m = 1,5) sur 1 222. Ordres remplis seulement avec le stop large : 3 et 6 (peu : l'ancien stop annulait rarement un ordre avant remplissage). Ordres du contrôle absents de la variante : 60 et 100, pour cause de position encore ouverte.
- Vu l'échec, aucune lecture de 2023–2025 ni de 2026.

## Ce que ça veut dire
Le stop de F2 (bas de c1 − 3 pts) n'est pas un point faible mesurable dans les données : l'élargir ne change pas le résultat par trade, il le rend seulement plus lisse (plus de gagnants, des gains plus petits). L'analyse précédente le laissait entendre : seule une minorité des stops voyait le TP revenir sans descendre plus bas. **Elle reste vraie pour F2, pas pour le stop que Krystofia place à la main**, qui n'a pas été mesuré ici.

## Réserves
- Les variantes voisines (m = 1,1 ; 2 ; stop fixe en points) ne sont pas testées : la règle écrite d'avance l'interdit.
- Le TP reste au même prix pour isoler le stop. Un TP recalculé avec le nouveau risque (plus loin) est une autre hypothèse, non testée.
- Les t de chaque colonne supposent des trades indépendants ; le t apparié est plus fiable.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboL.mjs <data> train` (≈ 3 min). Moteur : `scripts/comboFvgV6/lib/krysBacktestW.js` (copie de `krysBacktest.js` avec l'option `stopMult` ; sans elle, identique). Tests : `node --test scripts/comboFvgV6/comboL.test.mjs` (4 tests : identité sans l'option, stop 1,5 avec même entrée et même TP, appariement et t apparié, une variante identique au contrôle ne passe pas).
