# Pré-enregistrement — F2 : règle du lundi (acheter même sans cible, TP 3 R)

Écrit le 2026-10-06 (≈ 21:35 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Fait suite à `ANALYSE-LUNDIS-F2.md`. Choix de Krystofia : acheter même sans cible, avec un TP fixe à 3 R (« hier devrait être un buy day »).

## Question
Si, le lundi après un vendredi haussier, F2 prend aussi les achats qui n'ont aucun FVG à viser (avec un TP à 3 R), ces trades supplémentaires sont-ils profitables, et le résultat total de F2 s'améliore-t-il ?

## F2 de base (contrôle, inchangée)
Règles de `CRITERE-DEMO-F2.md`. Un achat sans FVG cible n'est jamais pris. Référence : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, 129,7 R au total, pire baisse 27,4 R.

## La règle M (une seule hypothèse, figée)
Un jour qualifie si c'est un **lundi** (date de New York de la bougie de pose de l'ordre) et que le **vendredi précédent (la veille de calendrier moins 3 jours)** est haussier, avec les définitions déjà utilisées dans `ANALYSE-LUNDIS-F2.md` : session 06:00–16:00 NY d'au moins 30 bougies, clôture de session > ouverture, clôture dans le tiers haut de la plage de la session. Un lundi après un vendredi férié (pas de session) ne qualifie pas.

Ces jours-là, et seulement ces jours-là, une zone d'achat **valide** (FVG strict validé par c4, âge ≤ 8 bougies, dans les heures 06–16 NY, mêmes règles que F2) **sans FVG de vente à viser** donne un ordre, **sans exiger le balayage du low H4**, avec : entrée à 50 % de la zone, stop = bas de c1 − 3 pts, **TP = entrée + 3 R** (3 fois la distance entrée → stop). Tout le reste est identique à F2 : spread, échelle de prix, rejeu M15 pessimiste, une position à la fois. Les autres cas (zone avec cible, ou autres jours) sont traités exactement comme dans F2. Le balayage H4 n'est pas exigé pour ces trades parce que la règle de Krystofia parle d'un « buy day » indépendant du balayage ; avec le balayage exigé, seuls ≈ 3 lundis seraient concernés (voir l'analyse).

## Données et blocs
Mêmes que les études précédentes. Entraînement : 2011–2016 (A) et 2017–2022 (B). Test : 2023–2025, lu une seule fois. 2026 (au 21/09) : descriptif.

## Mesures
Nombre et R moyen des trades **ajoutés** par la règle (présents dans la variante, absents du contrôle), t ; R total et R moyen de la variante contre le contrôle ; pire baisse ; trades du contrôle retirés par effet de bord (position encore ouverte).

## Critères d'entraînement (tous requis, sur 2011–2022)
1. Au moins **40 trades ajoutés** sur 2011–2022. En dessous, l'échantillon est trop petit : « non concluant », la règle n'est pas lue au test.
2. R moyen des trades ajoutés **> 0** et **t ≥ 1,65** (une seule hypothèse, unilatéral à 5 %).
3. R moyen des trades ajoutés **> 0 dans A et dans B**.
4. **R total** de la variante > R total du contrôle (129,7 R) sur 2011–2022.
5. Pire baisse de la variante ≤ 1,25 × celle du contrôle (≤ 34,3 R).

## Lecture du test 2023–2025 (une seule fois)
Seulement si l'entraînement passe. Critère : R moyen des trades ajoutés **> 0** ET R total de la variante > R total du contrôle sur 2023–2025. Pas de critère de t. 2026 : descriptif.

## Verdict possible
- **Ne passe pas l'entraînement** (ou non concluant) : F2 reste telle quelle. Pas de variante voisine (TP 2 R ou 4 R, vendredi seulement, autre définition de « haussier »…).
- **Passe l'entraînement et le test** : candidate ; la règle ne change pas d'elle-même, Krystofia décide.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- **Aucun échantillon n'est vierge pour cette idée.** L'analyse descriptive des lundis (2011 → 21/09/2026) a montré que les lundis sans cible après un vendredi haussier ont fini en hausse dans 77 % des cas ; elle couvre donc l'entraînement ET 2023–2025. Elle n'a mesuré ni entrée, ni stop, ni R : un lundi qui finit en hausse ne rend pas forcément un trade gagnant (le stop peut être touché avant). Mais la direction du lundi est connue, donc le test 2023–2025 est moins propre que pour les études précédentes.
- La règle est née d'une phrase de Krystofia et de ce descriptif, pas d'une recherche sur le R des trades.
- Le nombre de trades ajoutés risque d'être petit (≈ 69 lundis concernés sur 2011–2026, un ou plusieurs ordres par jour possible). Un résultat « non concluant » est possible et valable.
- Le rejeu ne voit qu'environ 3 mois de passé : une cible plus vieille n'existe pas dans ces calculs, donc plus de zones sont « sans cible » dans le simulateur que sur ton graphique complet.
- Les trades sont corrélés ; le t suppose l'indépendance et est un peu flatteur.
- La règle contredit la règle d'origine de Krystofia (« sans FVG à gauche, ce n'est pas un buy day ») : c'est une exception qu'elle propose elle-même pour les lundis après un vendredi haussier.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboQ.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestW.js` (copie de `krysBacktest.js`, avec en plus l'option `noTargetRR`).
