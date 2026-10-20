# Pré-enregistrement — F2 avec les ventes en miroir (F2S)

Écrit le 2026-10-06, AVANT tout calcul de cette étude. Règle et critères figés : aucun amendement après lecture. Choix de Krystofia : « Ajouter les ventes à F2 », une seule hypothèse. Origine : elle trade dans les deux sens (ses réponses au tri à l'aveugle), et la série de ventes en miroir a déjà été simulée en partie pour PS1.

## Contrôle (inchangé)
F2C = F2 achats seuls, série continue. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R, soit un rapport R total / pire baisse de 4,73.

## Les ventes (F2S), définition figée
Miroir exact de F2 pour les ventes, celui déjà codé dans `comboW_premier.mjs` (`runYearSellRaw`) : balayage du **sommet** des 6 dernières barres H4 complètes, FVG de vente formé au plus 32 bougies M15 après, validé par c4, âge ≤ 8 bougies, fenêtre 06–16 NY, entrée à 50 % de la zone restante, stop = sommet de c1 + 3 pts, cible = FVG d'achat non rempli le plus proche sous l'entrée (sans limite d'âge), TP = le plus proche de ½ cible et 3 R, spread 0,6, mêmes mises à l'échelle (prix / 8 200). Les ventes sont simulées **indépendamment** des achats (pas d'interaction : un achat et une vente peuvent être ouverts en même temps, chaque trade compte pour son R).

**F2S** = F2C (achats) + toutes les ventes ci-dessus.

## Critères d'entraînement (tous requis, sur 2011–2022)
Une seule hypothèse : « ajouter les ventes améliore F2 ». Seuil t unilatéral usuel de ce dossier : 1,96.
1. Ventes seules : R moyen > 0 et t (contre 0) ≥ 1,96.
2. Ventes seules : R moyen > 0 dans A (2011–2016) et dans B (2017–2022).
3. Ventes seules : rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).
4. F2S (achats + ventes, trades classés par bougie de sortie) : rapport **R total / pire baisse ≥ 4,73** (celui de F2C). Les R sont en unités de risque ; la pire baisse se calcule sur la série fusionnée.

## Lecture du test 2023–2025 (une seule fois, si l'entraînement passe)
R moyen des ventes > 0 sur 2023–2025 **et** rapport R total / pire baisse de F2S ≥ celui de F2C sur 2023–2025. 2026 : descriptif.

## Descriptif (non jugé)
R moyen, nombre de trades et résultat par année des ventes et de F2S ; part de jours où achat et vente sont ouverts en même temps.

## Divulgations
- **L'entraînement des ventes n'est pas vierge** : pour PS1, j'ai lu le nombre de ventes en miroir sur 2011–2022 (1 579) et le R moyen de celles qui étaient le premier remplissage de leur journée (+0,118 sur 1 061). Le R moyen des ventes entières n'a pas été lu ; la lecture 2023–2025 des ventes est vierge.
- **La raison pour laquelle F2 a été définie « achats seuls » n'est pas rejugée ici.** Si des études antérieures ont lu des ventes, je ne les ai pas en tête ; ce prérégistrement ne s'appuie sur aucune.
- Achats et ventes simultanés : le modèle suppose de pouvoir porter les deux sens à la fois (comme deux comptes indépendants). Un compte unique, à une seule position, ne donnerait pas les mêmes trades.
- 2023–2025 n'est pas vierge pour F2 (son R global a été lu). Un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- Les trades sont corrélés ; les t sont un peu flatteurs.
- Aucune autre variante essayée (ventes avec un autre filtre, ventes seules avec un autre TP, un seul trade à la fois) : si F2S échoue, on s'arrête.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboZ_ventes.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
