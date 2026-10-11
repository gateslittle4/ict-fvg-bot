# Règle LX d'Esdras, entrée au marché après rejet (LX-MKT) : US100 2011-2018

Pré-enregistrement : `preregistration-lx-market-entry-2026-09-30.md` (commit `bd29d2a`, amendement `180fb4f` : bougies M15, règlement plus pessimiste que la minute). Placebo : 20 tirages, décalage de 1 à 6 bougies M15 au hasard, graine 20260930.

```
LX-A  MARCHÉ  644 trades  R moyen -0.166  t -1.97  gagnants 16 %  total -107.1 R  creux max 155.8 R
LX-A  LIMITE 1372 trades  R moyen -0.086  t -1.28  gagnants 15 %  total -118.5 R  creux max 215.4 R  (référence, ordre limite au bord)
   signaux pris par les deux : 628  R moyen marché -0.145  R moyen limite +0.127
   placebo : R moyen -0.156 (min -0.223, max -0.083) ; le placebo fait au moins aussi bien 12 fois sur 20
   LX-A : REJETÉE (moitiés -0.217 / -0.125 R ; seuil t 2,5 ; placebo battu 8/20, il en faut 19)
LX-E  MARCHÉ  707 trades  R moyen +0.014  t 0.13  gagnants 15 %  total +10.0 R  creux max 74.6 R
LX-E  LIMITE 1561 trades  R moyen -0.032  t -0.30  gagnants 11 %  total -50.4 R  creux max 248.0 R  (référence, ordre limite au bord)
   signaux pris par les deux : 692  R moyen marché +0.029  R moyen limite +0.372
   placebo : R moyen +0.015 (min -0.069, max +0.135) ; le placebo fait au moins aussi bien 8 fois sur 20
   LX-E : REJETÉE (moitiés -0.071 / +0.086 R ; seuil t 2,5 ; placebo battu 12/20, il en faut 19)
LX-M  MARCHÉ  661 trades  R moyen -0.064  t -0.65  gagnants 17 %  total -42.0 R  creux max 99.2 R
LX-M  LIMITE 1317 trades  R moyen -0.029  t -0.34  gagnants 13 %  total -38.0 R  creux max 166.9 R  (référence, ordre limite au bord)
   signaux pris par les deux : 648  R moyen marché -0.060  R moyen limite +0.280
   placebo : R moyen -0.057 (min -0.149, max +0.056) ; le placebo fait au moins aussi bien 12 fois sur 20
   LX-M : REJETÉE (moitiés -0.151 / +0.011 R ; seuil t 2,5 ; placebo battu 8/20, il en faut 19)
```
