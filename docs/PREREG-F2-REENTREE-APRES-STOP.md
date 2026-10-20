# Pré-enregistrement — F2 avec réentrée au marché après un stop (REE)

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia : « la fenêtre d'achat est toujours valide même après un stop hunt si ce n'est pas un grand BMS baissier » (= une grande bougie baissière), et « oui » à la réentrée au marché à l'ouverture de la bougie suivante, même TP, nouveau stop sous le nouveau plus bas.

## Contrôle
F2C, inchangé (achats seulement ; balayage H4 ; 06–16 NY ; âge ≤ 8 ; entrée à 50 % ; stop c1 − 3 pts ; TP = max(½ FVG à gauche, 3 R) ; spread 0,6 mis à l'échelle ; sortie au temps à 96 bougies ; stop d'abord). Valeurs attendues 2011–2022 : 1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 ; A +0,067 (617), B +0,146 (605). Le contrôle doit se reproduire exactement, sinon on s'arrête.

## La règle REE (une seule hypothèse, figée)
1. Déclencheur : un trade de F2C (ordre d'origine) sort par son **stop** (sortie « stop », y compris dans la bougie de remplissage). Les sorties au temps, au TP, et les stops d'un trade de réentrée ne déclenchent rien (**une seule réentrée par trade d'origine**).
2. Condition « pas un grand BMS baissier » : la bougie M15 qui prend le stop (appelons-la S) n'est pas une « grande bougie baissière ». **Définition chiffrée, choisie par moi car Krystofia n'a pas donné de nombre** : grande baissière = clôture < ouverture ET (ouverture − clôture) ≥ 2 × la moyenne de (high − low) des 96 bougies M15 précédant S. Si S est grande baissière : pas de réentrée.
3. Si la condition est remplie : achat **au marché à l'ouverture de la bougie suivante S+1** (prix = ouverture + spread), seulement si S+1 est dans la plage 06–16 NY et qu'aucune position n'est ouverte.
4. Nouveau stop = plus bas (low) de S − marge de stop (3 pts mis à l'échelle). **Même TP absolu** que l'ordre d'origine. Pas de réentrée si le TP est déjà ≤ prix d'entrée ou si le risque ≤ 0. Aucun filtre sur le RR obtenu (règle permissive, voulue par Krystofia).
5. La réentrée est un trade normal : stop d'abord dans la même bougie, sortie au temps à 96 bougies après son remplissage, une position à la fois (la réentrée prend la place, un autre ordre qui se remplit pendant ce temps est consommé sans trade, comme dans le moteur).
6. Aucune autre valeur essayée (seuil 1,5 ou 3, attente de plusieurs bougies, plusieurs réentrées, stop sous plusieurs bougies). Si REE échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Trades de réentrée = trades de REE absents de F2C (clé année + bougie de pose + bougie de création de la zone ; la pose d'une réentrée = la bougie S+1).
1. R moyen des réentrées > 0 et t ≥ 1,96.
2. R moyen des réentrées > 0 dans A (2011–2016) et dans B (2017–2022).
3. REE entier : R total > R total de F2C, et R moyen par trade ≥ R moyen de F2C (pas de dilution).
4. Pire baisse de REE ≤ 1,25 × celle de F2C (34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, seulement si l'entraînement passe)
R moyen des réentrées > 0 et R total de REE > R total de F2C. 2026 : descriptif.

## Descriptif (non jugé)
Nombre de stops de F2C, nombre exclus car S grande baissière, nombre de réentrées prises ; part des réentrées qui finissent au TP / au stop / au temps ; RR moyen visé ; résultat des réentrées en excluant le filtre « grande baissière » (descriptif seulement, pas jugé) ; trades de F2C supprimés ou déplacés par les réentrées.

## Divulgations
- **Le seuil de 2 × est de moi** (Krystofia a dit « grande bougie baissière » sans chiffre). C'est un choix non optimisé ; le résultat dépend de lui.
- Je lis ses deux réponses comme : fenêtre valide si pas de grande baissière **et** réentrée au marché à la bougie suivante. Je n'ai pas codé une attente de plusieurs bougies (fenêtre prolongée), car elle n'a pas donné de durée.
- Le stop de réentrée (sous le plus bas de S) peut être large : le TP d'origine vise alors un RR plus petit que 3. C'est voulu (pas de filtre) ; le descriptif montrera le RR.
- 2023–2025 n'est pas vierge pour F2 (déjà lu, F2C +0,171) mais n'a jamais été lu pour cette règle.
- Les trades sont corrélés ; les t sont un peu flatteurs. Même série de variantes que les études précédentes : le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAF_reentree.mjs <data> train`, puis `... test` si l'entraînement passe.
