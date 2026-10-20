# Pré-enregistrement — F2 : ordres posés plus tard dans la matinée (nouvelle hypothèse)

Écrit le 2026-10-06 (≈ 13:05 UTC, horloge du conteneur), AVANT toute lecture de 2023–2025 pour ces variantes. Règles et critères figés : aucun amendement après lecture. Fait suite à `RESULTAT-F2-FILTRES-HEURE-JOUR.md`.

## Pourquoi cette étude, et pourquoi le test 2023–2025 est le bon juge
L'étude précédente (heure et jour) avait été écrite pour tester « les ordres posés tôt sont meilleurs ». Les chiffres 2011–2022 ont montré le sens inverse : ordres posés avant 9 h = −0,061 R (380), après 9 h = +0,181 R (842) ; avant 11 h = −0,073 R (571), après 11 h = +0,264 R (651). Ce sens n'était pas dans la liste de départ : il est né de la lecture des données 2011–2022. **Ces années ne peuvent donc plus le juger** (hypothèse choisie après avoir vu). Le juge est **2023–2025**, que ces variantes n'ont jamais lu (aucune variante n'avait passé l'entraînement, le test n'a pas été ouvert ; on a seulement le total F2 de ces années, +0,183 R, pas sa répartition par heure).

## Les 2 hypothèses (figées, aucune autre)
- **T-9** : F2 avec fenêtre de placement [09:00 ; 16:00[ NY (aucun nouvel ordre avant 09:00).
- **T-11** : F2 avec fenêtre de placement [11:00 ; 16:00[ NY.
Le reste de F2 est inchangé (règles de `CRITERE-DEMO-F2.md`). Heure = heure NY de la bougie de placement de l'ordre. Mêmes données, même code que l'étude précédente (`comboI.mjs`, jugement sur les trades de F2 de base, sous-ensembles gardés / exclus).

## Critères (tous requis, par hypothèse), lus une seule fois sur 2023–2025
1. R moyen des gardés > 0.
2. R moyen des gardés > R moyen des exclus (les ordres placés avant l'heure limite).
3. t de Welch (gardés contre exclus) ≥ 1,96 : une seule direction, 2 hypothèses, donc p = 0,05 / 2 = 0,025 unilatéral. Le test est peu puissant (≈ 325 trades en tout) : un échec ne prouve pas que l'effet n'existe pas.
4. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (155 semaines).

2026 (au 21/09) : descriptif, sans critère, lu après 2023–2025. Aucune variante n'est relancée ni modifiée après lecture.

## Verdict
- **Passe les 4 critères** : candidate sérieuse, mais pas adoptée d'office : elle contredit l'habitude de Krystofia (qui trade dès 06:00 et obtient ses meilleurs résultats le matin sur v6) ; la décision reste à elle.
- **Ne passe pas** : on garde F2 telle quelle et on n'essaie pas de variantes voisines (10 h, 12 h…).

## Divulgations
- Les 2 variantes sont celles que j'avais déjà vues sur 2011–2022 (H-E à t +2,16, et l'exclu de H-B à +0,264) : le bon sens y est connu et les deux moitiés vont dans le même sens. Il n'y a donc pas de test « à l'aveugle » sur l'entraînement.
- 2023–2025 n'est pas vierge pour F2 en général (le total +0,183 R, t 1,71, est connu et a servi à comparer F2 au combo), mais il est vierge pour cette découpe par heure.
- Les trades de F2 sont corrélés entre eux : les t sont un peu flatteurs.
- Si T-9 ou T-11 passe, retirer 2 à 5 heures de la matinée réduit le rythme (≈ 1,4 trade/semaine pour T-9 en 2023–25) ; la démo ou le trading réel deviendrait plus lent à juger.
- Une conclusion sur l'heure d'un trade n'est pas une raison de changer ce que Krystofia fait à la main : elle juge ses trades avec son contexte H4.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboI.mjs <data> test H-E,COMBO:11-16-0` : H-E est la fenêtre [9 ; 16[, `COMBO:11-16-0` est [11 ; 16[ sans exclusion de jour.
