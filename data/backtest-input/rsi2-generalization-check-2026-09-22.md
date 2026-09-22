# Vérification de généralisation, écrite AVANT de lancer le calcul (2026-09-22)

**Question d'Esdras :** le mode alerte prendrait des années à confirmer RSI(2)/US500 (~8-10 trades/an). Au lieu d'attendre, teste la RÈGLE DÉJÀ FIGÉE du lot 3 (aucun paramètre changé : RSI(2)<10, clôture > SMA200, sortie SMA5 ou 10 jours, stop 3×ATR14, achat seul) sur d'autres indices boursiers déjà présents dans le dépôt.

**Ce n'est pas une nouvelle pêche aux résultats** : aucun paramètre n'est réglé ni choisi ici, c'est un contrôle de robustesse d'une règle déjà décidée. Pas de découpage entraînement/test nécessaire pour cette raison ; mais pour rester honnête sur la stabilité dans le temps, chaque instrument est aussi coupé en deux moitiés chronologiques.

**Instruments (fixés, tout l'historique disponible dans `data/backtest-input`, aucun ajout après coup) :** GER40 (2010-2025), UKX (2018-2025), AUX (2019-2025).

**Ce qui sera rapporté, sans exception :** les trois résultats seront publiés tels quels, y compris un échec. Aucun instrument ne sera omis du rapport après avoir vu son résultat.

**Lecture, pas de nouveau seuil d'adoption :** un résultat positif ET stable dans les deux moitiés, sur au moins 2 des 3 indices, renforce la confiance dans RSI(2)/US500 sans pour autant l'adopter en exécution réelle (même règle que toujours : le mode alerte reste la seule voie vers l'exécution réelle). Un échec généralisé affaiblirait la candidate.
