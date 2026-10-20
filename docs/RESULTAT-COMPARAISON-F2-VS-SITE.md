# Résultat — F2 contre le « FVG filtré » du site, US100 M15

Calculé le 2026-10-06, après le pré-enregistrement `PREREG-COMPARAISON-F2-VS-SITE.md` (écrit avant le calcul, aucune règle modifiée depuis).

## Verdict
**F2 fait mieux que le site sur les 5 contrôles pré-enregistrés. Aucun des deux n'est validé.** Le « FVG filtré » du site perd sur chaque bloc ; F2 gagne sur l'entraînement et le test mais perd en 2026.

## Contrôle de réplication : réussi
Mon rejeu du site (mode resting, config de production, 1:5) retrouve les valeurs que le projet avait déjà mesurées, en R brut : 2010–2022 −229,4 (projet −229) ; 2023–2025 −12,7 (projet −13) ; 2026 −25,0 (projet −25). Le moteur est donc bien le même.

## Résultats (coûts de F2 : spread 0,6 × prix/8200, sans swap)
| Bloc | F2 (achats) | SITE (achats + ventes) | SITE achats seuls |
|---|---|---|---|
| 2011–2016 | +0,067 (617) | −0,500 (469) | −0,503 (321) |
| 2017–2022 | +0,146 (605) | −0,169 (689) | −0,214 (474) |
| 2011–2022 | +0,106 (1 222), t 2,04 | −0,303 (1 158), t −5,05 | −0,331 (795), t −4,60 |
| Test 2023–2025 | +0,183 (325), t 1,71 | −0,210 (347), t −1,75 | −0,247 (266), t −1,82 |
| 2026 (au 21/09) | −0,239 (87) | −0,484 (73) | −0,290 (42) |
| Trades par semaine (2023–25) | 2,08 | 2,22 | 1,70 |

R moyen par trade, nombre de trades entre parenthèses. Pour le site : % gagnants 13 % (2011–2022), 16 % (test), 11 % (2026) ; pire baisse 353 R sur 2011–2022. Seules 2020 (+0,23) et 2021 (+0,02) sont non négatives, sur 16 ans.

Ventes seules du site : 2011–2022 −0,244 (363), test −0,089 (81), 2026 −0,747 (31). Les ventes ne sauvent pas le site non plus.

## Les 5 contrôles
1. R moyen 2011–2022 : F2 (+0,106 contre −0,303).
2. Deux moitiés > 0 : F2 (les deux positives ; le site négatif dans les deux).
3. t 2011–2022 : F2 (2,04 contre −5,05).
4. R moyen test 2023–2025 : F2 (+0,183 contre −0,210).
5. R moyen 2026 : F2 (−0,239 contre −0,484).

F2 : 5 points sur 5, R moyen > 0 sur 2011–2022 → « fait mieux ».

## Coûts propres au site (secondaire, descriptif)
Avec le spread et le swap du broker tels que `runCleanStudy.js` les calcule : 2011–2016 −0,455 ; 2017–2022 −0,087 ; 2011–2022 −0,236 (t −3,96) ; 2023–2025 −0,092 (t −0,77) ; 2026 −0,384 (t −1,75). Le site reste négatif partout. Ces coûts sont moins lourds dans les vieilles années que ceux de F2, et le verdict ne change pas. (F2 n'a pas été recalculé avec ces coûts.)

## Validation absolue (indépendante)
- **Site** : ne passe aucun critère (t ≥ 2,6, deux moitiés > 0, test > 0).
- **F2** : ne passe pas non plus (t 2,04 < 2,6 ; 2026 négatif). Elle reste une candidate pour la démo test, pas une preuve.

## Ce que ça ne dit pas
- Seul le FVG filtré du site est comparé, pas ses autres mécanismes (Silver Bullet, NWOG, Weekly Sweep, CBDR, Divergence…). Le projet a mesuré le « combo actuel » complet ailleurs (clean-study-analysis.md : +0,050 R/trade sur l'entraînement, +0,143 sur le test, +0,112 en 2026) ; ce n'est pas le même objet et ce n'est pas comparé ici.
- Le site n'applique pas la règle c4 : c'est une méthode différente (entrée au premier contact), pas une variante de F2.
- Les filtres du site ont été conçus sur 2019–2025 ; ceux de F2 ne sont pas vierges pour 2023–2026. Aucune des deux n'a été retouchée.
- Le site est arrêté en live depuis le 23/09 (`liveSymbols: []`) pour exactement ce motif.

## Reproduction
- Rejeu : `LIVE_FILL=resting RRS=5 node --max-old-space-size=6144 scripts/runCleanStudy.js legs fvg-US100`, puis `analyse_site.mjs` et `analyse_site_secondaire.mjs` (dans `scripts/comboFvgV6/`, à lancer depuis la racine du projet après le rejeu). Ces deux scripts d'analyse n'ont pas de test dédié ; la réplication des −229 / −13 / −25 R fait office de contrôle.
- Les fichiers de cache du rejeu (`data/clean-study-cache-resting/`) ne sont pas copiés dans le dossier du projet.
