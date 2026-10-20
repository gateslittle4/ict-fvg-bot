# Pré-enregistrement — FVG formé entre 4 h et 7 h, testé entre 7 h et 10 h, heures du graphique = UTC (FM2)

Écrit le 2026-10-08, AVANT tout calcul de cette règle (seul le nombre de bougies par plage horaire UTC n'a pas été regardé ; aucun résultat de FM2 n'a été calculé). Règle et critères figés : aucun amendement après lecture.

## Pourquoi une deuxième version
FM1 (`PREREG-FVG-FORME-4-7-TESTE-7-10.md`, `RESULTAT-FVG-FORME-4-7-TESTE-7-10.md`) avait lu « 4 h–7 h » et « 7 h–10 h » en heure de New York et a été rejetée (R moyen −0,009, trois critères sur quatre échoués). Krystofia a ensuite précisé que ses heures sont **celles de son graphique**. Son graphique est en **UTC** : la bougie en cours, ouverte à 08 h 15 UTC, apparaît à 08 h 14 sur l'axe de sa capture du 2026-10-08 04:24 heure locale, et le sommet de 30 924 du 1er octobre est sur la bougie de 06 h 00 UTC (02 h 00 à New York). FM1 avait donc mal lu sa règle ; FM2 est la règle qu'elle a donnée. Ce n'est pas une variante voisine choisie après un échec, mais c'est un deuxième essai sur la même idée et les mêmes données, ce qui augmente le risque de faux positif : je le compte comme tel.

## La règle FM2 (une seule hypothèse, figée)
Heures **UTC fixes** (comme l'axe de son graphique : pas de changement d'heure d'été). Bougies M15, séries continues par année. Tout le reste est identique à FM1.
- **FVG** : strict, trois bougies contiguës, mèches comprises, achats et ventes. Règle c4 du moteur.
- **Formé entre 4 h et 7 h UTC** : la bougie c3 s'ouvre entre 4 h 00 UTC incluses et 7 h 00 UTC exclues (= 0 h–3 h à New York en été, 23 h–2 h en hiver).
- **Testé entre 7 h et 10 h UTC** : ordre limite à 50 % de la zone restante, posé à partir de la bougie de 6 h 45 UTC et jusqu'à celle de 9 h 30 UTC, donc remplissage possible dans les bougies ouvertes de 7 h 00 à 9 h 45 UTC, jamais à partir de 10 h 00 UTC (= 3 h–6 h à New York en été). Première visite seulement : un contact avec la zone avant l'activation de l'ordre la consomme. Âge maximal 24 bougies (non contraignant).
- **Entrée, stop, cible, coûts** : ceux de F2 (entrée à 50 %, stop c1 ± 3 points, cible = la plus lointaine entre la moitié du FVG opposé le plus proche et 3 R, pas d'ordre sans FVG cible, spread 0,6 × prix/8200, sortie au temps à 96 bougies, stop d'abord, une position à la fois), sans balayage H4.
- Mise en œuvre : le moteur lit l'heure par `nyHour(t)` ; je lui passe `t = raw/1000 + 5 h`, de sorte que `nyHour` renvoie l'heure UTC.
- Aucune autre valeur essayée (autres heures, 4 h–6 h, 7 h–9 h, entrée au bord, achats seuls, ventes seules, autre fuseau) : si FM2 échoue, on s'arrête, et l'idée « plage horaire matinale » est close.

## Critères d'entraînement (tous requis, sur 2011–2022) — les mêmes que FM1
1. R moyen > 0 et t du R moyen ≥ 1,96.
2. R moyen > 0 dans A (2011–2016) et dans B (2017–2022).
3. Pire baisse ≤ 34,3 R.
4. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

Palier : « validée » si les quatre passent ; « prometteuse » si seul le t manque, avec un t ≥ 1,0 et un R moyen > 0 ; sinon « rejetée ».

## Lecture du test 2023–2025 (une seule fois, si validée ou prometteuse)
**OK** si le R moyen de FM2 sur 2023–2025 est > 0 ; sinon **KO**. 2026 : descriptif. OK = candidate au suivi en direct, pas une adoption.

## Descriptif (non jugé)
Achats et ventes séparés ; F2C en repère.

## Divulgations
- **Écart avec tes captures.** Les FVG de tes deux premières captures (un achat le 6 octobre, une vente le 7) se sont formés vers 10 h 45–11 h 15 UTC (06 h 45–07 h 15 à New York), donc **hors** de la plage 4 h–7 h UTC de FM2. Je suis ta consigne écrite (« les heures de mon graphique »), pas les captures ; si tes captures sont les exemples que tu as en tête, la règle que tu veux est peut-être dans un autre fuseau, auquel cas FM2 ne la teste pas non plus.
- Heures UTC fixes : le lien avec l'ouverture de Londres (8 h à Londres) change d'une heure entre l'été et l'hiver ; ton graphique ne le corrige pas, moi non plus.
- Définitions de « formé » et « testé » choisies par moi, comme pour FM1 ; l'entrée à 50 % rate une part des contacts moins profonds.
- Plage UTC 3 h–6 h à New York : avant l'ouverture américaine, séance asiatique tardive et début de Londres ; la liquidité y est plus faible que dans la plage de F2 (6 h–16 h NY). Les spreads réels y sont probablement plus larges que 0,6 point ; le test utilise le spread de F2.
- Plus de 40 hypothèses déjà testées sur les mêmes données, plus FM1 : une réussite à l'entraînement peut être du hasard. Critère de test (R moyen > 0) peu exigeant, non durci après coup.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAL_fvg_matin_utc.mjs <data> train`, puis `... test` si validée ou prometteuse. Moteur : `lib/krysBacktestC.js`.
