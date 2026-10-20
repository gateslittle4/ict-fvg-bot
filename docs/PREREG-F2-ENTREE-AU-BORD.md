# Pré-enregistrement — F2 avec entrée au bord proche du FVG (ENT0)

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, après avoir vu que 545 ordres de F2 (21 %) vont au TP sans jamais toucher les 50 % du FVG : « teste l'entrée au bord ».

## Contrôle
F2C, inchangé (entrée à 50 % de la zone restante). Valeurs attendues 2011–2022 : 1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 ; A +0,067 (617) / 41,3 R, B +0,146 (605) / 88,4 R. Le contrôle doit se reproduire exactement, sinon on s'arrête.

## La règle ENT0 (une seule hypothèse, figée)
- Mêmes règles que F2C, sauf que l'ordre limite est posé au **bord proche** de la zone restante du FVG (haut du FVG pour un achat) au lieu de son milieu : `entryFraction = 0`.
- Le reste est calculé par le moteur comme pour F2C : stop = bas de c1 − 3 pts (inchangé) ; TP = le plus haut entre la moitié du FVG M15 baissier « à gauche » et 3 R **calculés depuis la nouvelle entrée**. Le risque est donc plus grand et le TP en 3 R plus lointain qu'avec F2C ; ce n'est pas le même TP absolu. Choix de moi, c'est la règle naturelle de F2 appliquée à une autre entrée.
- Un ordre par zone, une position à la fois, plage 06–16 NY, âge ≤ 8, spread 0,6 mis à l'échelle, sortie au temps à 96 bougies, stop d'abord.
- Aucune autre valeur essayée (25 %, 75 %, entrée au marché, TP identique à F2C). Si ENT0 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
1. R total de ENT0 ≥ R total de F2C × 1,10 (≥ 142,7 R).
2. R moyen de ENT0 > 0 et t ≥ 1,96.
3. ENT0 > 0 en R moyen dans A (2011–2016) et dans B (2017–2022), et R total de ENT0 ≥ celui de F2C dans chacune des deux moitiés (41,3 et 88,4).
4. Pire baisse ≤ 1,25 × celle de F2C (34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, seulement si l'entraînement passe)
R moyen de ENT0 > 0 et R total de ENT0 > R total de F2C. 2026 : descriptif.

## Descriptif (non jugé, aucune décision n'en dépend)
1. **Profondeur dans le FVG** pour les ordres de F2C posés en 2011–2022 : pour chaque ordre, jusqu'où le prix descend dans la zone (0 % = jamais le bord proche, 100 % = zone traversée) avant le TP, le stop, ou la fin de la plage horaire. Parts atteignant le bord proche, 25 %, 50 %, 75 %, 100 %. Parmi les ordres où le prix va au TP sans toucher 50 % : combien ont touché le bord proche, combien jamais.
2. **Un signe connu avant le trade** : la largeur du FVG rapportée à l'amplitude moyenne des 96 bougies précédentes, en trois groupes d'effectifs égaux (terciles) : part des ordres qui atteignent 50 % dans chaque groupe. Une seule variable regardée, pour répondre à « comment savoir si le prix va au bord ou à 50 % » ; ce n'est pas un filtre testé.
3. Nombre de trades ENT0 contre F2C et appariement (clé année + bougie de pose + bougie de création de la zone) : trades communs, ajoutés, retirés, et leur R moyen.

## Divulgations
- **Le TP change** avec l'entrée (3 R depuis une entrée plus haute), donc ENT0 n'isole pas l'effet « entrer plus tôt » ; c'est un effet combiné entrée + TP. Si le TP était gardé identique, le résultat serait différent (non testé).
- Le critère 1 (+10 % de R total) et les critères de moitiés sont de moi. Ils sont posés d'avance.
- Les ordres de F2C jamais remplis (545 vers le TP, 652 expirés) ne sont pas des trades : « manqués » ne veut pas dire « gagnants perdus ». Le descriptif 1 mesure seulement jusqu'où le prix est allé.
- 2023–2025 n'est pas vierge pour F2 mais n'a jamais été lu pour cette règle.
- Les trades sont corrélés ; les t sont un peu flatteurs. Le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples (nombreuses variantes testées sur ces données).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAH_entree_bord.mjs <data> train`, puis `... test` si l'entraînement passe.
