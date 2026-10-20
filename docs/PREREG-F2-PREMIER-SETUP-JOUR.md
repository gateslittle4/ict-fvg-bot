# Pré-enregistrement — F2 avec « premier setup de la journée » (PS1)

Écrit le 2026-10-06, AVANT tout calcul (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. La définition est celle choisie par Krystofia : premier setup de la journée **dans les deux sens** (achat ou vente), et **le premier setup rempli compte** (un ordre annulé sans remplissage ne ferme pas la journée). Origine : sa remarque pendant le tri à l'aveugle (« j'aime prendre le premier setup, il est généralement plus puissant ; un setup inverse peut venir le soir ») et son souvenir : « c'est comme ça que je faisais beaucoup de RRR ».

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R.

## La règle PS1 (une seule hypothèse, figée)
- **Journée** : date civile de New York de la bougie de remplissage (même conversion horaire que les autres études).
- **Série d'achats** : les trades de F2C, sans aucun changement.
- **Série de ventes** : même méthode F2 en miroir pour les ventes (moteur `krysBacktestC.js` avec `buyOnly` désactivé et un filtre qui ne laisse passer que les ventes : balayage d'un **sommet** H4 des 6 dernières barres complètes, FVG formé au plus 32 bougies après, mêmes âge, plage 06–16 NY, entrée à 50 %, stop au sommet de c1 + 3 pts, TP = max(½ cible, 3 R), cible sans limite d'âge, spread 0,6, mêmes mises à l'échelle). Elle est simulée **indépendamment** de la série d'achats, sans interaction. Elle sert uniquement à détecter qu'un setup de vente a été rempli : ces ventes ne sont pas des trades de PS1.
- **Premier setup rempli de la journée** : pour chaque journée, parmi tous les remplissages d'achats (F2C) et de ventes (série ci-dessus), le plus tôt.
- **PS1** = les trades de F2C qui sont le premier remplissage de leur journée. Un achat n'est pas retenu si un autre achat ou une vente de la même journée s'est rempli plus tôt, ou **à la même bougie** (égalité : l'achat n'est pas retenu). Les trades retenus gardent exactement leur sortie et leur R de F2C.
- Simplification assumée : retirer des trades ne peut en principe pas en faire apparaître d'autres, mais un trade retiré pourrait libérer la position pour un ordre que F2C avait ignoré ; ce cas n'est pas simulé.
- Aucune autre valeur essayée (deux premiers setups, premier avant 9 h, premier achat seulement, journée terminée si l'ordre n'est pas rempli, autre fenêtre horaire) : si PS1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que H1 et E1 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de PS1 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de PS1 et les trades de F2C retirés.
3. PS1 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, si l'entraînement passe)
R moyen de PS1 > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C retirés < R moyen des trades de PS1. 2026 : descriptif.

## Descriptif (non jugé, n'entre dans aucun critère)
Nombre de journées avec au moins un remplissage, part où le premier remplissage est un achat ou une vente, R moyen des ventes qui seraient premier remplissage de la journée (pour information : ces ventes ne sont pas dans PS1 et la méthode de vente n'est pas validée), R moyen des achats retirés selon qu'une vente ou un autre achat les a précédés.

## Divulgations
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171), celui de H1 et le tri à l'aveugle (signaux de 2011–2022 seulement) ont déjà été lus. Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard. Un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- La règle vient d'une observation de Krystofia (non mesurée) ; sa définition (deux sens, premier rempli) est son choix, fait avant tout calcul. Les deux autres définitions proposées (achats seulement ; journée terminée si l'ordre n'est pas rempli) ne seront pas essayées.
- La méthode de vente est une transposition en miroir de F2 ; elle n'a jamais été validée seule et n'est utilisée ici que pour détecter les setups de vente.
- La clé d'appariement est celle corrigée (voir `CORRECTION-APPARIEMENT.md`). Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboW_premier.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
