# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — A (ORB 5 min, US100) gardée jusqu'à la clôture du lendemain

Date : 2026-09-25. Esdras : « et si nos positions prenaient 1-2 jours ? » puis « teste A seulement jusqu'au lendemain ».

## Ce qui change (seulement la sortie)
- A actuelle (référence) : entrée à 9:35 NY dans le sens de la bougie 9:30-9:35, stop à son extrême opposé, objectif 10R, sortie forcée
  à 15:59 le jour même (`orbTrade`, `scripts/lib/intradayMomentum.js`, inchangé).
- Variante : même entrée, même stop, même objectif ; si ni le stop ni l'objectif ne sont touchés, la position est GARDÉE pendant la nuit
  (stop et objectif surveillés minute par minute sur toutes les heures cotées, stop d'abord, ouverture au-delà du stop = sortie à
  l'ouverture) et fermée à 15:59 NY de la séance suivante. Swap du courtier (`swapPerUnit`) compté pour chaque nuit tenue.
- Données : US100, HistData 2011-2022 puis M1 du courtier 2023 → 2026-09-21 ; spread par défaut.

## Critère (comparaison à la référence, mêmes trades d'entrée)
La variante n'est retenue que si :
1. Entraînement 2011-2022 : R total de la variante > R total de la référence, ET l'écart (variante − référence) est positif en 2011-2016
   ET en 2017-2022 ;
2. Test 2023-2025, lu une seule fois : R total de la variante ≥ R total de la référence.
Sinon A reste telle quelle (sortie à 15:59). 2026 : descriptif. Aucune autre durée (2, 3 jours…) ne sera essayée après coup.
