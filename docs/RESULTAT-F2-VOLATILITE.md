# Résultat : F2 et régime de volatilité (VOL1)

Définitions : `PREREG-F2-VOLATILITE.md` (SHA-256 `f7aac017…c9`, écrit et commité le 2026-11-14 avant tout calcul). Code : `scripts/comboFvgV6/comboAQ_volatilite.mjs` (+ 6 tests). Sortie : `SORTIE-F2-VOLATILITE-train.txt`. Contrôle réussi : F2C 2011-2022 redonne 1 222 trades, 129,7 R, pire baisse 27,4.

## Verdict : VOL1 REJETÉE à l'entraînement. Le test 2023-2025 n'a pas été lu.

Régime « élevé » = ATR relatif 14 jours du dernier jour complet au-dessus de la médiane des 120 jours précédents (45,8 % des bougies de la série).

US100 2011-2022, les 1 222 trades de F2C partagés selon le régime au moment de la pose :

| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| Régime élevé | 564 | 30 % | 91,4 | **+0,162** | 2,06 | 25,5 |
| Régime calme | 658 | 28 % | 38,3 | **+0,058** | 0,84 | 35,0 |
| 2011-2016 élevé / calme | 280 / 337 | | 38,2 / 3,1 | +0,136 / +0,009 | | |
| 2017-2022 élevé / calme | 284 / 321 | | 53,2 / 35,2 | +0,187 / +0,110 | | |

Les quatre critères : 1 (élevé > calme avec Welch ≥ 1,96) : **non**, Welch = 0,99. 2 (élevé ≥ 0,156) : oui, de justesse. 3 (élevé > 0 dans les deux moitiés) : oui. 4 (≥ 30 % des trades) : oui. Il fallait les quatre.

Par an, élevé contre calme : 2011 0,00 / 0,06 ; 2012 0,18 / 0,19 ; 2013 0,62 / −0,03 ; 2014 0,06 / 0,18 ; 2015 0,12 / −0,43 ; 2016 0,06 / 0,15 ; 2017 0,67 / 0,39 ; 2018 −0,27 / −0,02 ; 2019 −0,02 / 0,23 ; 2020 0,20 / 0,23 ; 2021 −0,21 / 0,12 ; 2022 0,62 / −0,34. L'écart va dans le sens de l'hypothèse 6 années sur 12.

## Ce que cela dit
- Le sens est celui attendu (F2 fait +0,10 R de plus par trade en régime agité), et il tient dans les deux moitiés. Mais l'écart est d'un écart-type de hasard (Welch 0,99) : **une telle différence sort une fois sur trois par hasard**. Avec le nombre d'essais déjà faits sur F2, on ne peut pas le retenir.
- Le gain vient de 3 années (2013, 2015, 2022) ; dans 6 années sur 12 le régime calme fait mieux. Ce n'est pas un effet régulier.
- Même si l'effet était réel, il ne donnerait pas plus de trades : il dirait seulement de **s'abstenir** quand le marché est calme (environ la moitié du temps).

## Ce que cela ne dit pas
- Puissance faible (erreur type de la différence ≈ 0,10 R) : un vrai gain de +0,05 R resterait invisible la plupart du temps. L'idée n'est pas réfutée, elle n'est pas soutenue.
- Une autre mesure (ATR H4, VIX, écart-type des clôtures), une autre longueur ou un autre seuil n'ont pas été regardés et ne le seront pas sans nouveau pré-enregistrement, qui compterait comme un essai de plus.

## Interdit après lecture
Aucun changement de longueur, de seuil, de mesure, de période. Le test 2023-2025 reste non lu pour VOL1. Simulation seulement ; Krystofia décide.
