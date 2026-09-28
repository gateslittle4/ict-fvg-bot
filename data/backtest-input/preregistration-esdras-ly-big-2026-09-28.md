# Pré-enregistrement : version échelle avec « gros BMS » (LY-G, LY-GQ), 28/09/2026

Écrit et enregistré **avant tout calcul de performance**. Code : option `bigBms` de `signalsLY` ; script `scripts/runEsdrasLY.js explore --big`.

## Origine
LY (version échelle) est rejetée (−0,085 R). Esdras précise comment il choisit le sens :
- « un gros BMS me suffit » ;
- « un gros BMS c'est une grosse bougie qui casse, mais il faut qu'il clôture en haut ou en bas, pas seulement la mèche » ;
- « le gros BMS est surtout quand le prix change de direction ».

## Définition retenue
La jambe du BMS (du bout de la jambe jusqu'à la bougie q qui clôture au-delà du dernier sommet/creux) contient **une bougie du sens dont le corps fait au moins 1 ATR M15**. Pas d'exigence de changement de direction : il a dit « surtout », pas « toujours ».

Calibrage, fait avant tout calcul :
- Première définition essayée : la bougie de cassure elle-même ≥ 1 ATR, et changement de direction obligatoire. Elle écartait ses trois trades de référence.
- Sur ces trades, la grosse bougie est tantôt celle qui casse (21/06/2017 : 0,98 ATR ; 27/09/2026 : 1,3 ATR), tantôt celle juste avant (27/06/2018 : 1,4 ATR). Et le BMS précédent en M15 n'est pas toujours de l'autre sens.
- Avec la définition retenue, le mode `match` retrouve ses trades du 20 et du 21/06/2017 et du 27/09/2026.

## Deux candidates (seuil t ≥ 2,5)
- **LY-G** : LY (preregistration-esdras-ly-2026-09-28.md) + gros BMS.
- **LY-GQ** : LY-G + les réglages réalistes du mode quiz (zones d'au moins 0,02 % du prix, stop d'au moins 0,3 ATR, 1re entrée à au plus 3 ATR du prix).

## Critères
Identiques à LY :
- **exploration** US100 2011-2018 : au moins 60 trades, R moyen > 0, t ≥ 2,5, les deux moitiés positives ;
- si une candidate est retenue : **validation** 2019-2022 une seule fois (R > 0 et t ≥ 2), finale, puis US500.

C'est la sixième famille de règles d'Esdras testée sur 2011-2018 : seule la validation sur des années jamais lues pourra confirmer.
