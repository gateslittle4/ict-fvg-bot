# Instructions pour Claude

Avant toute autre chose, lis `docs/BRIEF-SEANCE-QUIZ.md` en entier : c'est le contexte à jour de la séance en cours (règles confirmées, état, astuces techniques).
Ensuite seulement, ouvre d'autres fichiers si c'est nécessaire. Ne lis pas HANDOFF.md en entier (1 Mo) sans raison précise.
Réponds en français. Krystofia décide ; ne valide jamais un trade à sa place.

## F2 (stratégie testée en simulation)
F2 n'est pas un fichier ni une fonction : c'est une règle décrite dans `docs/`. Si on te parle de F2, ne cherche pas dans le brief du quiz (il ne la mentionne pas). Lis dans cet ordre :
1. `docs/CRITERE-DEMO-F2.md` : règles figées. Achats seulement, 06 h à 16 h New York, FVG d'entrée d'au plus 8 bougies, balayage du plus bas des 6 dernières barres H4 dans les 32 bougies avant c3, entrée à 50 % du FVG, stop = bas de c1 moins 3 pts, TP = le plus loin entre la moitié du FVG cible et 3R, spread 0,6, échelle de prix = prix / 8200.
2. Code : `scripts/comboFvgV6/comboF.mjs` (constantes `RULES`) et `scripts/comboFvgV6/comboAN_autres_instruments.mjs` (fonction `runYearF2`), moteur dans `scripts/comboFvgV6/lib/krysBacktestC.js`.
3. Tous les documents F2 : `ls docs | grep F2` (PREREG avant le calcul, RESULTAT après). Les plus récents : `docs/RESULTAT-F2-ML-FILTRE.md` et `docs/RESULTAT-ML-TOUS-FVG.md` (machine learning : aucun gain), `docs/PREREG-F2-AUTRES-INSTRUMENTS.md` (pas encore lancé).
Méthode du projet : pré-enregistrer (règles, critères, SHA-256) avant tout calcul, ne rien changer après lecture, garder des données sous scellé. F2 n'a pas passé ses critères (t 2,04 pour 2,6 demandé) ; aucune décision de trade n'est prise ici.
