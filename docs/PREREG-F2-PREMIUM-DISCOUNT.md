# Pré-enregistrement — F2 avec premium/discount entre le niveau H4 balayé et le FVG cible (PD1)

Écrit le 2026-10-06, AVANT tout calcul (aucun résultat de ce filtre n'a été regardé). Règle et critères figés : aucun amendement après lecture. Idée de Krystofia : « acheter à discount, arrêter d'acheter à premium, entre la distance des deux PD arrays ». Elle a choisi la fourchette : **niveau H4 balayé → bord bas du FVG cible**, équilibre à 50 %. (Entre le FVG d'entrée et le FVG cible, un achat est toujours à discount par construction, donc cette lecture n'était pas testable.)

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R.

## La règle PD1 (une seule hypothèse, figée)
- **Bas L** : le plus bas des 6 dernières barres H4 complètes (alignées sur minuit NY) **au moment du dernier balayage** retenu par F2, c'est-à-dire à la bougie M15 `li` = dernière bougie, avant ou à la création du FVG d'entrée, dont la mèche est passée sous ce plus bas (c'est exactement le niveau que le filtre H4 de F2 utilise).
- **Haut** : le bord bas du FVG cible choisi par F2 pour cet ordre (celui qui sert au TP).
- **Équilibre** : (L + bord bas du FVG cible) / 2.
- **Filtre** : l'ordre n'est posé que si le prix d'entrée (50 % du FVG d'entrée) est **strictement inférieur** à l'équilibre (discount). À premium ou à l'équilibre exact, pas d'ordre.
- Tout le reste de F2 est inchangé (achats, 06–16 NY, FVG d'âge ≤ 8, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, mises à l'échelle) ; le moteur est le même, les ordres refusés ne sont pas posés (effets sur les ordres suivants simulés, y compris les trades ajoutés).
- Aucune autre valeur essayée (autre niveau d'équilibre comme 40 % ou 60 %, plus bas de la mèche, milieu ou bord haut du FVG cible, autre définition du bas) : si PD1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que H1, E1, PS1 et D930/D06 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de PD1 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de PD1 et les trades de F2C absents de PD1.
3. PD1 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C.
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, si l'entraînement passe)
R moyen de PD1 > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de PD1 < R moyen des trades de PD1. 2026 : descriptif.

## Descriptif (non jugé)
Part des ordres de F2C à premium selon cette définition ; R moyen des trades de F2C à discount et à premium.

## Divulgations
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171) a été lu. Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard : un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- L'idée vient de Krystofia (non mesurée) ; la fourchette est son choix, fait avant tout calcul, parmi deux définitions que j'ai proposées. Les résultats déjà lus (heure, direction du matin) montrent que les achats qui suivent le mouvement sont moins bons que ceux qui achètent plus bas ; PD1 va dans le même sens d'idée (acheter plus bas), ce qui ne garantit rien.
- Les trades sont corrélés ; les t sont un peu flatteurs.
- Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboY_pd.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
