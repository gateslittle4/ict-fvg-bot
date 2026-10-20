# Résultat — F2 sur la série continue (cibles de tout âge)

Calculé le 2026-10-06, après `PREREG-F2-SERIE-CONTINUE.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis ; empreinte SHA-256 : `68bdeeff82c4d0ef8aaf12a8aea6fdea7fb86f3975db90993777342ba84a4129`, fichier horodaté 17:46 heure de New York).

## Verdict
**Aucune des trois règles ne passe l'entraînement. F2 reste telle quelle.** Lever la limite de passé ne change presque rien : ni la règle des 15–30 jours, ni la règle du lundi ne se confirment avec tout l'historique. Le test 2023–2025 n'a donc **pas été lu** (seuls des nombres de trades ont été affichés).

## Ce que la limite de passé changeait (vérification faite après coup)
Après le calcul, j'ai comparé les trades de F2 avec tout l'historique contre les trades de l'ancien rejeu (3 à 15 mois de passé). Ce contrôle n'était pas dans le pré-enregistrement ; il ne sert qu'à comprendre. **Les trades sont identiques, à la décimale près, pour toutes les années 2011–2022 et 2024–2026.** Seule 2023 diffère (122 trades contre 116 pour F2). Dans 2023, c'est normal : l'ancien rejeu repartait d'octobre 2022 et ne voyait pas les sommets de 2021, qui servent de cibles. J'ai seulement lu le nombre de trades de 2023, pas leur R.

La raison est simple : la cible de F2 est le FVG de vente non rempli **le plus proche** au-dessus de l'entrée. Un FVG vieux de plusieurs mois n'est presque jamais le plus proche ; et quand il n'y a rien au-dessus (prix à un sommet historique), il n'y avait rien non plus dans l'historique plus court. Âge médian de la cible dans F2 : 0,5 jour ; 5 % des trades ont une cible de plus de 15 jours, 3 % de plus de 30 jours, **1 % de plus de 90 jours**.

## Entraînement 2011–2022 (R moyen par trade ; n)
| | F2C (contrôle) | C-15C | C-30C | M-C (lundi) |
|---|---|---|---|---|
| 2011–2016 | +0,067 (617) | +0,062 (592) | +0,062 (600) | +0,044 (662) |
| 2017–2022 | +0,146 (605) | +0,155 (583) | +0,147 (592) | +0,140 (650) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,108 (1 175), t 2,04 | +0,104 (1 192), t 1,99 | +0,091 (1 312), t 1,83 |
| R total | 129,7 | 127,2 | 124,3 | 119,7 |
| Pire baisse (R) | 27,4 | 27,8 | 27,4 | 33,8 |

F2C redonne exactement F2 de l'ancien rejeu (1 222 trades, +0,106, t 2,04, 129,7 R, pire baisse 27,4 R).

**C-15C et C-30C.** Trades supprimés : 51 (R moyen −0,036) et 32 (R moyen +0,097). Welch (gardés contre supprimés) : 0,57 et 0,02, très loin de 2,13. Gain : +0,002 et −0,002, loin de +0,03. La variante est sous F2C dans A. Pire baisse et rythme (1,99 et 2,02 trades par semaine en 2023–2025) passent, mais il fallait les cinq critères.

**M-C.** 90 trades ajoutés (45 + 45), R moyen **−0,111**, t −0,65 ; −0,275 en 2011–2016, +0,053 en 2017–2022. R total 119,7 contre 129,7 pour F2C, pire baisse 33,8 contre 27,4. Critères réussis : au moins 40 trades, pire baisse ≤ 34,3. Échoués : R moyen > 0 avec t ≥ 2,13, positif dans A et B, R total supérieur. Ce sont **les mêmes 90 trades que dans l'ancien test**.

## Ce que ça veut dire
Pour F2, avoir 13 ans de passé ou 3 mois de passé revient à peu près au même : les vieux FVG ne servent presque jamais de cible. Ta règle des 15–30 jours est donc déjà « respectée » dans 95–97 % des trades de F2 ; les rares autres trades (3 à 5 %) ne sont ni meilleurs ni pires que le reste. Et acheter les lundis sans cible après un vendredi haussier reste perdant dans les données (−0,111 R), même avec tout l'historique : un lundi sans cible, c'est un prix qui est à un sommet historique, ce que le passé ne change pas.

Ce résultat ne dit pas que ton jugement du 06/10 était faux. Il dit que, **appliquée mécaniquement avec les règles de F2** (entrée à 50 %, stop sous c1, TP à 3 R), cette règle ne gagne pas d'argent sur 2011–2022.

## Réserves
- Deuxième regard sur deux règles déjà rejetées, avec un seuil durci (t ≥ 2,13 pour 3 hypothèses) ; ce n'est pas un test indépendant. Le résultat est quasi identique à l'ancien parce que les trades sont presque les mêmes.
- Seul un TP à 3 R a été testé pour les trades sans cible ; d'autres sorties ne l'ont pas été (interdit par la règle écrite d'avance).
- 2011 et 2012 ont un passé de 2 à 14 mois seulement (les données commencent en 2010-11).
- Les trades sont corrélés ; les t sont un peu flatteurs. Échantillon de la règle du lundi petit (90).
- 2023–2025 : seuls des nombres de trades ont été lus (rythme de 2,14 trades par semaine pour F2C ; 16 trades ajoutés par M-C). 2026 non lu.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboR.mjs <data> train` (≈ 20 s). Moteur : `scripts/comboFvgV6/lib/krysBacktestC.js` (copie accélérée de `krysBacktestW.js` ; mêmes trades). Tests : `node --test scripts/comboFvgV6/comboR.test.mjs` (5 tests : identité avec les anciens moteurs sur F2, la cible à 30 jours et la règle du lundi, absence de cible plus vieille que la limite, cas dégénéré).
