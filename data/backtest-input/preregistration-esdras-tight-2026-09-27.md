# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : stop serré et réentrée immédiate, comme Esdras en 2025

Date : 2026-09-27. Ce qu'on voit dans ses trades de 2025 :
- stops d'environ 18 points, soit à peu près un quart de l'ATR H1 de l'époque ;
- trades perdants d'environ 6 minutes ;
- réentrée dans le même sens environ 5 minutes après le stop, presque au prix du stop, avec le même risque ;
- 3 essais au plus.

## Base
Les signaux de C1 restent identiques : sens H4 par PD arrays, BMS M15, FVG M15 avec D hors de la zone, fenêtres 7-11 h et 20-23 h,
objectif H4, annulation, sortie à 17 h NY, au plus 3 trades remplis par jour.

## T0 : stop serré
- Ordre limite au bord du FVG.
- Stop à **0,25 × ATR H1** de l'entrée, avec l'ATR connu à la décision.
- Objectif H4 inchangé, avec au moins 3R, sinon pas de trade.
- Pas d'échelle.

## T1 : stop serré + réentrée immédiate
- Comme T0. Après chaque stop, on rentre **au marché à la minute suivante**, dans le même sens, avec la même distance de stop, le même
  objectif et la même sortie.
- Seulement s'il reste au moins 3R jusqu'à l'objectif.
- Au plus 2 réentrées par signal, donc 3 essais en tout, et 3 trades par jour au plus.

## Critères (famille déjà très testée, donc exigeants)
1. **Exploration US100 2011-2018**. Une candidate est retenue si elle remplit toutes ces conditions :
   - au moins 60 trades, R moyen > 0, **t ≥ 2,5** ;
   - les deux moitiés positives ;
   - un R moyen supérieur à C1 (+0,004 R).
2. **Si retenue, test hors échantillon sur US500** (trois périodes additionnées) : R moyen > 0 et t ≥ 2.
3. **En descriptif** : US100 2019-2022 et 2023-2026.

Aucun réglage : 0,25 ATR, la minute suivante et 2 réentrées sont fixés ici.

## Résultat (27/09) : T0 et T1 REJETÉES dès l'exploration US100 2011-2018
- **T0** (stop serré) : 1 178 trades, +0,079 R (t 0,74), 11 % de gagnants, creux max 105 R. Sans les 5 meilleurs : −56 R.
- **T1** (+ réentrée immédiate) : 2 686 trades, +0,090 R (t 1,16), 10 % de gagnants, creux max 117 R. Sans les 5 meilleurs : +24 R.
  - Réentrées seules : 1 674 trades, +0,129 R (t 1,23).
- Les deux restent loin du seuil t ≥ 2,5, et même de 2. US500 et les autres périodes ne sont pas lues.
- Le profil est celui d'une loterie : 10 % de gagnants et des creux de plus de 100 R, soit environ −26 à −29 % à 0,25 % par trade.
- Détails : `esdras-tight-US100-explore.md`.
