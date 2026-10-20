# Pré-enregistrement — F2 sur la série continue (cibles de tout âge) : règle des 15–30 jours et lundis sans cible

Écrit le 2026-10-06 (≈ 21:50 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Fait suite à `RESULTAT-F2-CIBLE-RECENTE.md` et `RESULTAT-F2-REGLE-LUNDI.md`, dont la réserve principale était : « le rejeu ne voit que 3 à 15 mois de passé ».

## Question
Les deux règles de Krystofia (« pas de cible dans les 15–30 jours = pas un jour d'achat » ; « le lundi après un vendredi haussier, on achète même sans cible ») changent-elles de verdict quand le simulateur voit tout l'historique disponible, comme elle sur son graphique ? Ce n'est pas une nouvelle idée : c'est le même test, avec la limite de données levée.

## Construction « série continue » (la seule nouveauté)
Pour chaque année Y, le rejeu part de la première bougie disponible (2010-11) et va jusqu'au 31 décembre Y ; les trades comptés sont ceux remplis pendant Y. Le passé visible n'est donc plus tronqué à octobre Y−1 : une cible peut avoir plusieurs années. Tout le reste est identique à F2 (`CRITERE-DEMO-F2.md`) : balayage H4, FVG d'entrée ≤ 8 bougies, 06–16 NY, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, échelle de prix par année Y (prix moyen de l'année Y / 8200), une position à la fois. Limite : 2011 et 2012 ont un passé de 2 à 14 mois seulement (les données commencent en 2010-11).

Moteur : copie accélérée `krysBacktestC.js` (retire des listes les zones mortes ou entrées et les FVG remplis ; ne change aucun résultat). Un test d'identité doit montrer qu'il redonne exactement les trades de `krysBacktestW.js` sur les anciennes tranches (octobre Y−1 → décembre Y), soit F2 : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), 129,7 R, pire baisse 27,4 R.

## Contrôle (nouveau)
**F2C** = F2 sur la série continue, sans autre changement. Toutes les variantes sont comparées à F2C, pas à F2 de l'ancien rejeu. Le chiffre de F2C est une mesure, pas un critère : il peut être meilleur ou pire que +0,106 ; il est rapporté tel quel et ne change pas F2 par lui-même.

## Les 3 hypothèses (figées, aucune autre)
- **C-15C** : seuls les FVG de vente formés dans les 15 derniers jours calendaires (de c3 à la bougie de pose) peuvent servir de cible ; sinon pas d'ordre. Le TP reste max(½ cible, 3 R) sur la cible retenue (la plus proche non remplie au-dessus de l'entrée).
- **C-30C** : idem avec 30 jours.
- **M-C** : règle du lundi, définitions de `PREREG-F2-REGLE-LUNDI.md` (lundi après vendredi haussier, clôture de session dans le tiers haut) : sur ces jours, une zone d'achat valide **sans FVG de vente non rempli à viser** (dans toute l'histoire visible) donne un ordre, sans exiger le balayage H4, TP = 3 R ; le reste est comme F2C.

Trois hypothèses : seuil unilatéral à 5 % / 3, soit **t ≥ 2,13** pour chacune (même niveau pour les trois, y compris M-C, qui avait 1,65 avec une seule hypothèse).

## Critères d'entraînement (tous requis, sur 2011–2022)
**C-15C et C-30C** (mêmes critères que `PREREG-F2-CIBLE-RECENTE.md`, seul le seuil de t change) :
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 2,13 entre les trades gardés et les trades supprimés (appariés par année + bougie de pose).
3. Variante > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement).

**M-C** (mêmes critères que `PREREG-F2-REGLE-LUNDI.md`, seuil de t modifié) :
1. Au moins 40 trades ajoutés sur 2011–2022 (sinon « non concluant »).
2. R moyen des trades ajoutés > 0 et t ≥ 2,13.
3. R moyen des trades ajoutés > 0 dans A et dans B.
4. R total de la variante > R total de F2C.
5. Pire baisse ≤ 1,25 × celle de F2C.

## Lecture du test 2023–2025 (une seule fois, seulement pour les variantes qui passent)
Mêmes critères que les pré-enregistrements d'origine : pour C-15C/C-30C, R moyen de la variante > R moyen de F2C et > 0, et R moyen des trades supprimés < R moyen des trades gardés ; pour M-C, R moyen des trades ajoutés > 0 et R total de la variante > R total de F2C. Pas de critère de t. 2026 : descriptif.

## Descriptif ajouté (aucun jugement)
- F2C contre F2 de l'ancien rejeu (n, R moyen, t, pire baisse) sur 2011–2022.
- Âge de la cible des trades de F2C : médiane, parts > 15, > 30, > 90 jours.
- Pour M-C : nombre de trades ajoutés par moitié, et lundis qualifiants sans cible (au sens série continue) comparés à la version tronquée.

## Verdict possible
- **Aucune variante ne passe** : F2 reste telle quelle ; la règle de Krystofia ne se confirme pas non plus avec tout l'historique. Pas de variante voisine (10 ou 60 jours, TP 2 R ou 4 R, autre définition du vendredi, etc.).
- **Une variante passe l'entraînement et le test** : candidate ; Krystofia décide.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- Deuxième regard sur deux idées déjà rejetées : ce n'est pas un test indépendant, d'où le seuil durci à 3 hypothèses (2,13). Les résultats antérieurs sur les tranches courtes sont connus (C-15 : +0,108 ; C-30 : +0,104 ; règle du lundi : −0,111 sur 90 trades ajoutés) ; le nouveau calcul peut donner un autre résultat parce que les cibles sont plus nombreuses, et surtout parce que « sans cible » devient rare (seulement près des plus hauts historiques).
- Aucun échantillon vierge pour le lundi : l'analyse descriptive des lundis couvre 2011–2026 (77 % de hausse). Pour les règles d'âge de cible, le test 2023–2025 n'a jamais eu son R lu.
- Le test 2023–2025 sur F2C n'est pas lu en dehors des critères ci-dessus (rythme en nombre de trades seulement).
- Les trades sont corrélés ; les t sont un peu flatteurs.
- Le moteur accéléré est un changement de code ; seul le test d'identité garantit qu'il ne change rien. S'il échoue, aucun calcul n'est lu.
- La connaissance de l'historique complet est celle que Krystofia a sur son graphique ; elle est plus proche du trading réel. Les prix ne sont pas modifiés : seuls le spread et la marge du stop sont mis à l'échelle de l'année Y. Un FVG de vente ancien, resté non rempli très au-dessus du prix actuel, peut donc servir de cible même s'il date de plusieurs années ; je rapporte la part de trades dont la cible a plus de 90 jours pour que cela se voie.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboR.mjs <data> train`, puis `... test <C-15C,C-30C,M-C>` pour les variantes qui passent. Moteur : `lib/krysBacktestC.js`. Tests : `comboR.test.mjs` (identité avec l'ancien moteur, cible plus vieille que la limite absente, M-C inactive = F2C, etc.).
