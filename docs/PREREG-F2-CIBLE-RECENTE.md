# Pré-enregistrement — F2 : « pas de cible dans les 15–30 derniers jours = pas un jour d'achat »

Écrit le 2026-10-06 (≈ 21:00 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture.

## Origine de la règle (mots de Krystofia)
Après la capture du 06/10/2026 (journée haussière), elle précise ce qu'elle appelle « le vide à gauche » : *« dans les 15–30 jours, il n'y a rien que le prix pourrait target, d'après ma stratégie ce n'est pas un buy day. Je l'accepte humblement parce qu'il n'y a pas de FVG 15 min à gauche, mais hier devrait être un buy day d'après moi. »* Il s'agit donc d'un **âge maximal de la cible** : si aucun FVG M15 non rempli, dans le sens du TP, n'existe dans les 15 (ou 30) derniers jours, F2 ne prend pas l'achat. Le cas d'hier est une anecdote : elle ne tranche pas la règle, et on ne la juge pas sur un jour.

## Question
Limiter la cible de F2 aux FVG M15 formés dans les N derniers jours (N = 15 ou 30) améliore-t-il F2 ?

## F2 de base (contrôle, inchangée)
Règles de `CRITERE-DEMO-F2.md` ; la cible est le FVG M15 de vente non rempli le plus proche au-dessus de l'entrée, sans limite d'âge (dans les limites du rejeu : 3 mois de préchauffage avant chaque année, donc au plus ≈ 3 mois de passé). Référence à retrouver : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R.

## Les 2 hypothèses (figées, aucune autre)
- **C-15** : seuls les FVG de vente formés dans les 15 derniers jours calendaires (temps entre la bougie c3 du FVG et la bougie de pose de l'ordre) peuvent servir de cible.
- **C-30** : même chose avec 30 jours.

Les FVG plus anciens sont ignorés dans le choix de la cible : la cible devient le FVG récent non rempli le plus proche au-dessus de l'entrée ; s'il n'y en a aucun, pas d'ordre (« pas un buy day »). Le TP reste max(½ cible, 3 R) calculé sur cette nouvelle cible, donc il peut changer pour certains trades (cible plus loin). Tout le reste est inchangé.

Limite connue : le rejeu ne regarde au plus que ≈ 3 mois de passé ; C-30 et C-15 restent donc bien dans ce que le rejeu peut voir.

## Données et blocs
Mêmes que les études précédentes. Entraînement : 2011–2016 (A) et 2017–2022 (B). Test : 2023–2025, lu une seule fois. 2026 (au 21/09) : descriptif.

## Mesures
R moyen par trade, t, % de gagnants, pire baisse, rythme (trades/semaine), nombre de trades supprimés. Descriptif ajouté : âge de la cible des trades du contrôle (part à plus de 15 jours, à plus de 30 jours).
Comparaison avec le contrôle : un même ordre (même année, même bougie de placement) présent dans les deux versions est apparié ; les ordres présents seulement dans le contrôle sont « supprimés par la règle ».

## Critères d'entraînement (tous requis, par hypothèse, sur 2011–2022)
1. R moyen de la variante **≥ contrôle + 0,03 R** (soit ≥ +0,136).
2. **t de Welch ≥ 1,96** entre les trades de la variante et les trades supprimés (2 hypothèses, unilatéral : 0,05 / 2 = 0,025) : les trades supprimés doivent être significativement moins bons que ceux qu'on garde.
3. Variante > contrôle **et** > 0 dans A **et** dans B.
4. Pire baisse ≤ 1,25 × celle du contrôle (≤ 34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, sans lire R).

## Lecture du test 2023–2025 (une seule fois)
Seulement pour les variantes qui passent l'entraînement. Critère : R moyen de la variante **> R moyen du contrôle sur 2023–2025** (+0,183) **et > 0**, et R moyen des trades supprimés < R moyen des trades gardés. Pas de critère de t. 2026 : descriptif.

## Verdict possible
- **Aucune ne passe** : F2 garde sa cible sans limite d'âge. Pas de variante voisine (10 jours, 60 jours, cible « jamais touchée »…).
- **Passe l'entraînement et le test** : candidate ; la règle ne change pas d'elle-même, Krystofia décide.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- Cette règle vient d'une phrase de Krystofia, pas des données : elle n'a pas été choisie parce qu'elle marche. Elle peut quand même échouer ; c'est ce que le test mesure.
- Le critère voisin « FVG cible jamais pénétré » (c2) a déjà été testé sur F2 sans passer ; ce n'est pas le même critère (âge de la cible, pas intégrité).
- Le rejeu ne voit qu'environ 3 mois de passé : une cible vieille de plus de 3 mois n'existe déjà pas dans ces calculs, alors que dans le trading réel de Krystofia elle peut remonter plus loin. La règle « sans limite d'âge » du contrôle est donc déjà tronquée à ≈ 3 mois.
- Les trades de F2 sont corrélés : les t sont un peu flatteurs.
- Une conclusion statistique n'efface pas ton jugement manuel : la règle testée est un cadre mécanique, pas ta lecture du contexte H4.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboO.mjs <data> train`, puis `... test C-15,C-30` pour les variantes qui passent. Moteur : `lib/krysBacktestW.js` (copie de `krysBacktest.js`, avec en plus l'option `maxTargetAgeDays`).
