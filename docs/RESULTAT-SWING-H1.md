# Résultat : la règle F2 transposée au swing court terme (SW1 : FVG H1, balayage daily)

Définitions : `PREREG-SWING-H1.md` (SHA-256 `8461d27d…21ed`, écrit et commité le 2026-11-14 vers 21 h 05 heure de New York, avant tout calcul). Code : `scripts/comboFvgV6/comboAR_swing.mjs` (+ 8 tests), moteur `lib/krysBacktestS.js` (copie de `krysBacktestC.js` avec l'option `orderMaxBars`). Sortie : `SORTIE-SWING-H1-train.txt`. Contrôles réussis : F2C M15 2011-2022 redonne 1 222 trades, 129,7 R, pire baisse 27,4 avec le nouveau moteur ; 5 738 à 6 107 bougies H1 par an.

## Verdict : SW1 REJETÉE à l'entraînement. Le test 2023-2026 n'a pas été lu (283 trades, R non affichés).

US100 2011-2022, R nets du spread et du swap (7 % par an) :

| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| 2011-2022 | 942 | 26 % | 75,8 | **+0,080** | **1,28** | 30,9 |
| 2011-2016 | 486 | 25 % | 43,3 | +0,089 | 0,99 | 20,1 |
| 2017-2022 | 456 | 26 % | 32,5 | +0,071 | 0,82 | 23,8 |

Les quatre critères : 1 (≥ 150 trades) oui. 2 (R > 0 et t ≥ 1,96) : **non**, t = 1,28. 3 (deux moitiés positives) oui. 4 (R total / pire baisse ≥ 2) oui, 2,45. Il fallait les quatre.

Par an : 2011 +0,22 (102) ; 2012 +0,17 (78) ; 2013 0,00 (65) ; 2014 −0,05 (72) ; 2015 +0,25 (91) ; 2016 −0,15 (78) ; 2017 −0,19 (56) ; 2018 −0,05 (70) ; 2019 +0,58 (60) ; 2020 +0,25 (68) ; 2021 0,00 (88) ; 2022 −0,04 (114). Cinq années positives, sept nulles ou négatives.

## Descriptif (non jugé), 2011-2022

| | Trades | R moyen | t | Pire baisse |
|---|---|---|---|---|
| SW1 avant swap | 942 | +0,103 | 1,62 | 25,6 |
| SW1, swap 10 % | 942 | +0,071 | 1,13 | 33,1 |
| SW1, spread ×2 | 938 | +0,057 | 0,92 | 29,0 |
| Achats H1 sans balayage | 1 914 | −0,029 | −0,68 | 140,8 |
| SW4 (FVG H4, balayage 16 jours) | 207 | −0,038 | −0,30 | 32,4 |
| Achats H4 sans balayage | 410 | −0,015 | −0,16 | 39,5 |
| US500, SW1 | 910 | +0,050 | 0,76 | 54,3 |

Durées, SW1 : durée médiane d'un trade **5 heures** ; durée médiane des gagnants 15 heures ; 30 % des trades passent au moins une nuit (0,7 nuit en moyenne) ; 2 % sortent au temps. SW4 : durée médiane 24 heures, gagnants 72 heures, 3,3 nuits en moyenne.

## Ce que cela dit
- **En H1, la règle fait à peu près la même chose qu'en M15** : +0,10 R par trade avant swap (F2 en M15 : +0,106), +0,08 après. Ce n'est pas un nouvel avantage, c'est le même petit effet à une autre échelle, et il reste sous le seuil de preuve (t 1,28 pour 1,96).
- **Le balayage du plus bas fait la différence à cet horizon aussi** : sans lui, les achats H1 font −0,03 R (1 914 trades) ; avec lui, +0,08. C'est cohérent avec le M15 sur US100 (mais pas avec GER40 et XAUUSD, où le balayage n'ajoutait rien).
- **Ce n'est pas du « 2 à 3 jours »** : en H1 le trade médian dure 5 heures et un gagnant 15 heures. Pour tenir vraiment 2 à 3 jours il faut le H4 (gagnants : 72 heures), et là le résultat est nul ou négatif (−0,04 R, 207 trades), avec trop peu de trades pour conclure.
- **Les coûts sont plus légers, comme prévu** : le swap coûte 0,02 R par trade et doubler le spread 0,02 R (contre 0,04 à 0,07 R en M15). Mais le gain brut n'est pas plus grand, donc cela ne suffit pas.
- US500 va dans le même sens (+0,05 R), sans plus : les deux indices sont très corrélés.

## Ce que cela ne dit pas
- Un rejet à t 1,28 ne prouve pas que l'effet est nul : il est compatible avec un vrai avantage de l'ordre de 0 à +0,2 R par trade. Il dit seulement que 12 ans de données ne suffisent pas à le distinguer du hasard.
- Le test 2023-2026 reste non lu pour SW1. Le lire maintenant serait une lecture exploratoire, hors protocole (comme celle du 06/10 pour « H1 stop court », qui avait confirmé le rejet).
- Le swap de 7 % est une hypothèse. Le prix de sortie sur un trou de cotation est optimiste.

## Interdit après lecture
Aucune variante voisine (H2, autre nombre de jours, fenêtre horaire, autre durée d'ordre), aucun changement de coût ou de seuil. Une autre unité de temps demande un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement ; aucune décision de trade n'est prise ici ; Krystofia décide.
