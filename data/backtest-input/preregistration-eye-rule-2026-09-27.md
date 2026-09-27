# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : la règle tirée de l'œil d'Esdras

Date : 2026-09-27. Origine : `blind-exercise-result-2026-09-27.md`. Ses « oui » ressortaient sur les FVG vierges et assez grands, le
matin. Cette règle a été trouvée sur 21 trades seulement : elle doit donc passer tout le parcours ci-dessous, sans retouche.

## La règle (figée)
- **Marché** : US100, FVG M15 haussiers. La règle principale ne porte que sur des achats, parce que ses réponses fiables étaient des
  achats. Le miroir vendeur est donné en descriptif.
- **FVG valide** : A, B et C forment le FVG (haut de A < bas de C). La bougie juste avant A ne touche pas la zone. La bougie D, juste
  après C, ne touche pas la zone.
- **Heure** : C et D se ferment entre 7 h et 11 h NY. La décision se prend à la fermeture de D.
- **Taille** : hauteur de la zone ≥ 0,25 × ATR H1 (ATR 14 des bougies H1 terminées). C'est la variante principale.
  - La variante 0,10 × ATR H1 est donnée en second. Elle ne décide rien.
- **Exécution** :
  - ordre limite d'achat au haut de la zone ;
  - stop sous la mèche de A ;
  - objectif 3R ;
  - ordre annulé si l'objectif est touché avant le remplissage, ou à 11 h NY ;
  - position fermée à 11 h NY ;
  - spread et swap du simulateur M1 (`simulate`, `scripts/lib/nightLab.js`).
- **Plusieurs FVG le même matin** : chaque FVG qualifié a son propre ordre, et chaque trade compte. La variante « un seul, le premier
  qualifié de la journée » est donnée en descriptif.

## Référence (les filtres doivent apporter quelque chose)
- Même marché, mêmes heures, même exécution, mais sans le filtre « vierge » ni le filtre de taille : tous les FVG haussiers dont D reste
  hors de la zone.
- Le marché a monté presque tout le temps : acheter gagne souvent sans filtre. La règle doit donc battre cette référence.

## Parcours et critères
1. **Exploration, 2011-2018** (`explore`). Il faut à la fois :
   - au moins 60 trades, un R moyen > 0, t ≥ 2, et les deux moitiés (2011-2014, 2015-2018) positives ;
   - un R moyen de la règle supérieur à celui de la référence.
2. **Validation, 2019-2022** (`NIGHT_PHASE=validation`, lecture unique pour cette règle) : R moyen > 0 et t ≥ 2. La règle doit être
   commitée avant, sans changement.
3. **Final, 2023-2024 + 2026** (`NIGHT_PHASE=final`, lecture unique) : R moyen > 0. L'année 2025, qu'Esdras a tradée, est donnée à part,
   en descriptif.

Si une étape échoue, on s'arrête, sans ajuster les paramètres. La conclusion est alors : « la règle tirée de l'œil ne tient pas ».
