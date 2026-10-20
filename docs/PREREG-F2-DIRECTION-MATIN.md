# Pré-enregistrement — F2 avec filtre de direction du matin (D930 et D06)

Écrit le 2026-10-06, AVANT tout calcul (aucun résultat de ces filtres n'a été regardé). Règles et critères figés : aucun amendement après lecture. Origine : l'explication de Krystofia après PS1 (« l'idée était de faire partie du mouvement qui continue à 9 h 30, car la plupart du temps 11 h faisait un retracement ») ; elle a demandé de tester les deux définitions proposées. Ce n'est pas une fenêtre horaire (les fenêtres horaires de F2 ont déjà été testées et rejetées) : c'est un filtre de **direction**.

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R.

## Les deux hypothèses (figées)
Le « prix de pose » est la **clôture de la bougie M15 de pose** de l'ordre (information connue au moment de la pose). Le jour est celui de New York. Les filtres s'ajoutent aux règles de F2 (achats, balayage H4, FVG d'âge ≤ 8, 06–16 NY, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, mises à l'échelle) ; le moteur est le même, les ordres refusés par le filtre ne sont pas posés (les effets sur les autres ordres sont donc simulés, y compris les trades ajoutés).

1. **D930** : pour les ordres dont la bougie de pose est à **09:30 ou après**, l'ordre n'est posé que si le prix de pose est **strictement supérieur à l'ouverture** de la bougie M15 de 09:30 du même jour (si cette bougie manque, la première bougie du jour à partir de 09:30). Les ordres posés avant 09:30 sont gardés sans condition.
2. **D06** : pour tous les ordres, l'ordre n'est posé que si le prix de pose est **strictement supérieur à l'ouverture** de la bougie M15 de 06:00 du même jour (si cette bougie manque, la première bougie du jour à partir de 06:00). Un ordre posé sur la bougie de 06:00 elle-même est comparé à l'ouverture de cette bougie.

Aucune autre valeur essayée (08:00, 08:30, clôture de la veille, seuil en points ou en ATR, minuit, vente) : si une hypothèse échoue, on s'arrête pour celle-là.

## Seuil
Deux hypothèses : seuil t de Welch ≥ **1,96** (comme H1/H2 et E1).

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères que H1, E1 et PS1 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de la variante et les trades de F2C absents de la variante.
3. Variante > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, uniquement pour les variantes qui passent)
R moyen de la variante > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de la variante < R moyen des trades de la variante. 2026 : descriptif.

## Divulgations
- **2023–2025 n'est pas vierge pour F2 ni pour l'heure** : le R global de F2 (+0,171) a été lu, et la découpe par heure de pose a été lue sur 2023–2025 (T-9 et T-11). D930 est en partie corrélée à l'heure de pose (elle ne filtre que les ordres de 09:30 et après). Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard : un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- Les deux définitions viennent d'une idée de Krystofia, non mesurée ; elles ont été proposées par moi et acceptées toutes deux par elle avant tout calcul. Le filtre ne regarde que des bougies de la même journée déjà fermées à la pose (pas de regard vers l'avant).
- Les trades sont corrélés ; les t sont un peu flatteurs.
- Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboX_direction.mjs <data> train`, puis `... test <D930,D06>` pour les variantes qui passent. Moteur : `lib/krysBacktestC.js`.
