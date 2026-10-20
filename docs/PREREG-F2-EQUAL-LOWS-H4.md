# Pré-enregistrement — F2 avec balayage d'equal lows H4 (E1)

Écrit le 2026-10-06, AVANT tout calcul. Règle et critères figés : aucun amendement après lecture. La définition d'un equal low est celle choisie par Krystofia (2 creux, écart ≤ 0,1 %, 12 barres H4, remplace le balayage actuel). Elle vient de ses tris à l'aveugle du lot 1 (où elle ne voyait pas de « H4 pris » sur un signal que F2 acceptait) et de sa question sur les equal highs/lows.

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel (mèche sous le plus bas des 6 dernières barres H4 complètes, FVG formé au plus 32 bougies après). À retrouver : 2011–2022 +0,106 (1 222), 129,7 R, pire baisse 27,4 R.

## La règle E1 (une seule hypothèse, figée)
- Barres H4 : mêmes que dans F2 (alignées sur minuit de New York), uniquement les barres **complètes**.
- **Creux H4** : une barre H4 complète dont le plus bas est strictement inférieur à celui de la barre précédente et à celui de la barre suivante (la barre suivante doit être complète : le creux est confirmé).
- **Equal lows** : deux creux H4 situés parmi les **12 dernières barres H4 complètes**, dont les plus bas diffèrent d'au plus **0,1 %** du plus bas des deux. Le niveau L est le plus bas des deux.
- **Balayage d'equal lows** : la première bougie M15, après la confirmation du deuxième creux, dont le plus bas passe strictement sous L (un niveau déjà balayé ne compte plus ; une bougie qui reste sous L ne compte qu'une fois). Les barres H4 de la fenêtre s'actualisent à chaque nouvelle barre complète : un niveau reste actif tant que ses deux creux sont dans les 12 dernières barres complètes.
- **Règle F2 modifiée** : un FVG d'achat n'est valide que s'il est formé au plus **32 bougies M15 après le dernier balayage d'equal lows** (le « balayage H4 actuel » est remplacé). Tout le reste de F2 est inchangé : FVG strict validé par c4, âge ≤ 8 bougies, 06–16 NY, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), cible sans limite d'âge, spread 0,6.
- Aucune autre valeur essayée (0,05 %, trois creux, 24 barres, « s'ajoute au lieu de remplacer ») : si E1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères que H1, avec le même seuil de t ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de la variante et les trades de F2C absents de la variante.
3. Variante > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, si l'entraînement passe)
R moyen de la variante > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de la variante < R moyen des trades de la variante. 2026 : descriptif.

## Divulgations
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171) et celui de H1 ont déjà été lus. Pour E1, la définition n'a pas été réglée sur ces années, mais plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard. Un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- La règle vient d'un jugement de Krystofia sur un seul signal ; ses paramètres (2 creux, 0,1 %, 12 barres) sont les siens, choisis avant tout calcul.
- Plusieurs trades peuvent partager la même bougie de pose ; l'appariement utilise donc aussi la bougie de création de la zone (correction ajoutée ce jour, voir `CORRECTION-APPARIEMENT.md`).
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboV_eql.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
