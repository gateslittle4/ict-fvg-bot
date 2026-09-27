# Exercice à l'aveugle : résultat (arrêté le 27/09 à la demande d'Esdras)

Protocole : `preregistration-blind-exercise-2026-09-26.md`. Cas : `data/blind/setups.json` v3, soit des FVG M15 US100 de 2011 à 2018,
sans date. Résultats mécaniques : `blind-outcomes.json` v3.

## Ce qui a été analysé
- 110 réponses du matin, toutes sur des ACHATS. Ce sont ses réponses v3 reprises, après qu'il a confirmé que « achat » voulait bien
  dire acheter.
- 11 réponses du soir, aussi sur des achats.
- Ses réponses v3 sur les ventes sont écartées, à cause de la confusion sur le sens.
- La lecture intermédiaire pré-enregistrée a conclu « pas assez de remplis ». Esdras a choisi d'arrêter plutôt que de remplir environ
  100 cas de plus.

**Verdict : NON CONCLUANT.** Il n'y a que 21 « oui » remplis, alors que le minimum pré-enregistré est de 40. Tous les chiffres
ci-dessous sont descriptifs.

## Mesure principale : matin, achats, stop sous la mèche de A, 3R
| | Réponses | Ordres remplis | R moyen des remplis | Gagnants | R par décision (non rempli = 0) |
|---|---|---|---|---|---|
| Ses « oui » | 42 | 21 | **+0,67** | 11 | +0,34 |
| Ses « non » | 68 | 41 | +0,12 | 14 | +0,08 |

- Écart : +0,55 R.
- p unilatéral : 0,12, sur une permutation de 10 000 tirages. Environ 1 chance sur 8 que ce soit le hasard.
- Référence : tous les achats du matin sans choix (62 remplis) font +0,31 R. Le marché 2011-2018 montait.

## Descriptif
- **Les six exécutions** (stop sous la mèche ou sous la zone ; 2, 3 ou 4R) : ses « oui » font mieux que ses « non » à chaque fois. C'est
  cohérent, mais les échantillons sont petits : 9 à 22 remplis côté « oui ».
- **Bougie avant A** :
  - sur les FVG vierges, ses « oui » font +1,05 R (13 remplis), ses « non » +0,24 R ;
  - sur les FVG collés, ses « oui » font +0,05 R (8 remplis).
- **Taille du FVG** :
  - moins de 0,1 ATR H1 : ses « oui » font −0,43 R (7 remplis) ;
  - plus de 0,25 ATR H1 : +1,36 R (10 remplis).
- **Heure** :
  - il dit presque toujours non de 3 h à 7 h NY (47 non sur 50) ;
  - de 8 h à 11 h, ses « non » ont aussi bien marché (4 remplis) ;
  - l'heure seule ne sépare donc pas ses bons choix.
- **Soir** : 4 « oui » seulement. Rien à en tirer.
- **Raisons** : 4 remplis au plus par raison. Rien d'exploitable seul.

Chiffres complets : sortie de l'analyse ci-dessous.

```
== Mesure principale et variantes (matin, achats) ==
matin meche_3R                 oui  42 (remplis 21, R +0.67, gagn 11) | non  68 (remplis 41, R +0.12, gagn 14) | par décision oui +0.34 non +0.08
matin meche_2R                 oui  42 (remplis 19, R +0.50, gagn 11) | non  68 (remplis 34, R +0.28, gagn 16) | par décision oui +0.22 non +0.14
matin meche_4R                 oui  42 (remplis 22, R +0.37, gagn 10) | non  68 (remplis 48, R +0.04, gagn 13) | par décision oui +0.20 non +0.03
matin zone_2R                  oui  42 (remplis  9, R +1.02, gagn 7) | non  68 (remplis 11, R -0.18, gagn 3) | par décision oui +0.22 non -0.03
matin zone_3R                  oui  42 (remplis 10, R +0.92, gagn 6) | non  68 (remplis 16, R -0.50, gagn 2) | par décision oui +0.22 non -0.12
matin zone_4R                  oui  42 (remplis 11, R +0.65, gagn 5) | non  68 (remplis 20, R -0.10, gagn 4) | par décision oui +0.17 non -0.03
soir (achats) meche_3R         oui   4 (remplis  2, R -1.00, gagn 0) | non   7 (remplis  6, R -0.33, gagn 1) | par décision oui -0.50 non -0.29
== Bougie avant A ==
FVG vierges                    oui  26 (remplis 13, R +1.05, gagn 7) | non  33 (remplis 21, R +0.24, gagn 8) | par décision oui +0.53 non +0.15
FVG collés                     oui  16 (remplis  8, R +0.05, gagn 4) | non  35 (remplis 20, R +0.00, gagn 6) | par décision oui +0.03 non +0.00
== Heure ==
3h-7h                          oui   3 (remplis  2, R -1.00, gagn 0) | non  47 (remplis 33, R -0.11, gagn 9) | par décision oui -0.67 non -0.08
7h-8h                          oui   4 (remplis  4, R +1.87, gagn 3) | non   9 (remplis  4, R +1.00, gagn 2) | par décision oui +1.87 non +0.44
8h-11h                         oui  35 (remplis 15, R +0.57, gagn 8) | non  12 (remplis  4, R +1.17, gagn 3) | par décision oui +0.25 non +0.39
== Taille du FVG (x ATR H1) ==
0-0.1 ATR                      oui   8 (remplis  7, R -0.43, gagn 1) | non  18 (remplis 11, R +0.11, gagn 3) | par décision oui -0.38 non +0.07
0.1-0.25 ATR                   oui  12 (remplis  4, R +0.87, gagn 2) | non  22 (remplis 11, R +0.28, gagn 4) | par décision oui +0.29 non +0.14
0.25-9 ATR                     oui  22 (remplis 10, R +1.36, gagn 8) | non  28 (remplis 19, R +0.04, gagn 7) | par décision oui +0.62 non +0.03
== Raisons (oui seulement, matin) ==
  Bonne heure              17 oui, 7 remplis, R +0.33
  Belle impulsion          12 oui, 4 remplis, R +0.61
  Contexte H4              9 oui, 4 remplis, R +1.87
  Tendance                 8 oui, 3 remplis, R +0.77
  Liquidité prise          5 oui, 4 remplis, R +1.87
  Liquidité H4 prise       4 oui, 1 remplis, R +3.00
  Dans un FVG H4           1 oui, 1 remplis, R +3.00
  (sans raison)            remplis 10, R +0.72
== Référence : tous les 200 cas du matin, sans choix ==
tous : 116 remplis, R +0.06 ; achats seulement : 62 remplis, R +0.31
```

## Piste possible (pas encore testée)
Les traits qui ressortent de ses « oui » donnent une règle candidate, trouvée sur seulement 21 trades :
- FVG haussier du matin (7 h-11 h NY) ;
- vierge : la bougie avant A et la bougie D sont hors de la zone ;
- taille d'au moins 0,1 à 0,25 ATR H1.

C'est de la pêche : cette règle ne vaut rien tant qu'elle n'a pas été testée ailleurs. Le test honnête se ferait en deux temps :
1. une exploration sur tous les FVG 2011-2018 ;
2. si elle tient, règle figée et commitée, puis un seul test sur 2023-2026, années encore intactes.
