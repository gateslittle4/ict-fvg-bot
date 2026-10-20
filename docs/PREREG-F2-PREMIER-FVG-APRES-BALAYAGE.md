# Pré-enregistrement — F2 avec « premier FVG après le balayage H4 » (FB1)

Écrit le 2026-10-06, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, après le bilan du tri à l'aveugle (« beaucoup d'entrées, je ne les aurais pas prises, ou j'aurais entré plus tôt, donc je profite du mouvement avant F2 »). Quand je lui ai demandé de définir « plus tôt », elle a répondu : **« le premier FVG après le balayage H4 »**. C'est sa définition, prise telle quelle ; je ne l'ai pas ajustée.

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R.

## La règle FB1 (une seule hypothèse, figée)
- **Balayage** : celui de F2, inchangé. Pour un FVG d'achat créé à la bougie M15 `z` (c3), `li` = la dernière bougie M15, avant ou à `z`, dont la mèche est passée sous le plus bas des 6 dernières barres H4 complètes (barres alignées sur minuit NY). Cette `li` est celle que le filtre H4 de F2 utilise (`lastLow[z]`). Si de nouvelles bougies passent encore sous le niveau, `li` avance : le « balayage » est toujours le plus récent.
- **FVG de l'épisode** : tous les FVG d'achat bruts (c1.haut < c3.bas) dont la bougie de création `z` partage la même `li`. Il n'y a pas de limite de distance pour *définir* le premier (le premier FVG de l'épisode est le premier, qu'il soit tradable ou non).
- **Le premier FVG** : celui de plus petit `z` dans l'épisode. Une bougie de création égale à `li` compte comme candidate (c'est ce que F2 accepte déjà).
- **Filtre** : un ordre n'est posé (en plus de toutes les règles de F2, dont `z − li ≤ 32`) que si son FVG d'entrée est le premier FVG de son épisode. Si le premier FVG n'est pas tradable par F2 (zone non validée par c4, hors 06–16 NY, âge > 8, pas de FVG cible, détruit…), l'épisode ne produit **aucun** ordre : on n'achète pas un deuxième FVG à sa place (ton « premier » est le premier, pas « le premier tradable »).
- Tout le reste de F2 est inchangé (achats, 06–16 NY, FVG d'âge ≤ 8, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, mises à l'échelle, sortie au temps à 96 bougies, stop d'abord). Le moteur est le même ; les ordres refusés ne sont pas posés (les effets sur les ordres suivants sont simulés, y compris les trades ajoutés).
- Aucune autre valeur essayée (deux premiers FVG, premier FVG tradable, premier FVG après le premier balayage du jour, FVG M5 ou M1, `li` figée au premier contact, autre fenêtre) : si FB1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que H1, E1, PS1, D930/D06 et PD1 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de FB1 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de FB1 et les trades de F2C absents de FB1.
3. FB1 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C (≤ 34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, uniquement si l'entraînement passe)
R moyen de FB1 > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de FB1 < R moyen des trades de FB1. 2026 : descriptif.

## Descriptif (non jugé)
Part des trades de F2C qui sont le premier FVG de leur épisode ; R moyen des premiers FVG et des suivants (sur F2C, 2011–2022) ; rang moyen du FVG d'entrée dans son épisode.

## Divulgations
- **L'idée vient de l'observation de Krystofia sur son trading réel** (non mesurée). « Entrer plus tôt » dans son trading peut vouloir dire autre chose (une entrée sur M5 ou M1 dans la zone, un ordre posé plus tôt dans la matinée) ; FB1 en est une traduction en règle écrite sur M15, pas son trading.
- **FB1 ne peut que retirer des ordres de F2** (plus quelques ordres ajoutés par effet de position libre) : elle n'ajoute aucun trade « plus tôt » que F2 n'aurait pas pris. Si ses entrées plus précoces sont des FVG que F2 ne trade pas (stop, âge, cible), elles ne sont pas dans ce test.
- Un premier FVG se forme souvent au moment même du balayage, avec un stop (c1 − 3 pts) qui peut être loin et un FVG cible parfois absent ; ces cas sont comptés comme « pas de trade pour cet épisode » (voir le filtre).
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171) a été lu. Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard : un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- Les trades sont corrélés ; les t sont un peu flatteurs. Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAB_premier_fvg.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
