# Pré-enregistrement : l'aimant des FVG lointains (≥ 4 ATR), 28/09/2026

Écrit et enregistré **avant** toute lecture des années 2019-2022. Script : `scripts/runEsdrasMagnet.js <phase> US100 far`.

## Origine
Le test de l'aimant (preregistration-esdras-magnet-2026-09-28.md) est non retenu en général, mais son découpage descriptif (non prévu comme critère) montre en 2011-2018 :
- FVG à gauche à 4-8 ATR : atteints dans 50,2 % des cas, contre 46,2 % pour un niveau quelconque à la même distance ;
- FVG à ≥ 8 ATR : 27,3 % contre 18,3 %.

Piste trouvée après coup : elle doit être confirmée sur des années jamais lues.

## Hypothèse
Après un BMS M15, un FVG à gauche situé à **au moins 4 ATR** est atteint dans les 24 h plus souvent qu'un niveau quelconque à la même distance, **même à taille égale du mouvement récent** (sinon ce ne serait qu'un retour à la moyenne après un grand mouvement).

## Mesures (mêmes définitions que le test de l'aimant)
- Événements : BMS M15, FVG à gauche le plus proche, distance r en ATR M15, excursion sur 24 h.
- **Mouvement récent** D : écart en ATR entre la clôture du BMS et l'extrême opposé des 96 bougies M15 précédentes (plus haut des 24 h pour un BMS haussier, plus bas pour un BMS baissier). On le découpe en 5 tranches (quintiles) par sens.
- **Référence contrôlée** p(r | tranche de D) : part des BMS du même sens et de la même tranche de D dont l'excursion atteint r ATR.
- **Écart contrôlé** = (atteint ? 1 : 0) − p(r | tranche de D), sur les seuls événements avec r ≥ 4. On calcule la moyenne par jour, puis le t sur les jours.
- L'écart brut (sans contrôle) est donné à côté.

## Déroulement et critères
1. Calcul sur **2011-2018** (exploration). Si l'écart contrôlé y est ≤ 0, la piste s'arrête là, sans lecture de 2019-2022.
2. Sinon, **une seule lecture de 2019-2022** (validation) : l'aimant des FVG lointains est confirmé si l'écart contrôlé est **> 0 avec t ≥ 2**, et l'écart brut > 0.
3. S'il est confirmé : US500 hors échantillon (mêmes critères), puis finale.
