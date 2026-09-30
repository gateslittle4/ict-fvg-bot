# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Règle de Gemini, ACHATS SEULEMENT, avec placebo

Date : 2026-09-30. Demande d'Esdras : « les indices montent tout le temps, on pourrait se concentrer sur l'achat seulement ».
Règle : exactement celle de `preregistration-gemini-fvg-2026-09-30.md` (mêmes précisions 1 à 8, mêmes données, même règlement),
mais les signaux baissiers sont ignorés (ils n'occupent plus de position). Un achat ne peut donc plus être bloqué par une vente.

## Honnêteté sur les données (déclarée avant calcul)
Cette idée est née d'un découpage achats / ventes lu APRÈS le premier test, sur les trois périodes (entraînement, test, forward).
Aucune période n'est donc vierge pour cette hypothèse. Le verdict ci-dessous reste utile (le placebo est le vrai juge), mais un
résultat positif ne vaudra que « candidat exploratoire » : la preuve viendra de données futures (démo), pas de ce rejeu.

## Placebo (le juge)
Pour CHAQUE trade réel, un trade placebo : même symbole, même année, une bougie M15 tirée au hasard dans cette année, achat à
l'ouverture (mêmes coûts), avec le MÊME stop et la MÊME cible exprimés en fraction du prix d'entrée que le trade réel, même règlement
(`manage`, stop d'abord, 480 bougies M15 max). Aucune limite « une position à la fois » pour le placebo (seule la moyenne compte).
100 tirages complets, graine fixe (mulberry32, graine 20260930). On note la moyenne de R par tirage : moyenne des tirages `P` et
écart-type des moyennes `σP`. Écart de la règle : `D = R moyen réel − P`.

## Verdict fixé à l'avance (US100 + US500 réunis)
1. Entraînement 2010-2022 : moins de 60 trades → **non concluant**. R moyen > 0, t ≥ 2,6 et les deux moitiés (2010-2016, 2017-2022)
   positives ; sinon **ÉCHEC à l'entraînement**.
2. Entraînement contre placebo : `D ≥ 2 σP` ; sinon **ÉCHEC : la règle n'ajoute rien à un achat quelconque**.
3. Test 2023-2025 : R moyen > 0 ET `D > 0` ; sinon **ÉCHEC au test**.
4. Tout passe → **CANDIDAT EXPLORATOIRE** (démo seulement, jamais de réel sur ce seul rejeu).
Forward 2026 : affiché avec son placebo, ne décide rien. Chiffres par symbole affichés pour information. Aucun réglage modifié
après lecture.
