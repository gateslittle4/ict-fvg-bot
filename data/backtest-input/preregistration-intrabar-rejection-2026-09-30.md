# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Réagir dans la bougie plutôt qu'à sa clôture (M1 / M5 contre M15)

Date : 2026-09-30. Question d'Esdras : le bot n'évalue ses signaux qu'à la clôture de la bougie M15 ; voir le prix « en direct » (par
minute) lui ferait-il gagner quelque chose ? Étude sur la règle de Gemini, achats seulement (`preregistration-gemini-fvg-2026-09-30.md`
et `preregistration-gemini-buyonly-2026-09-30.md`), seul candidat en cours — on isole la vitesse de décision, rien d'autre.

## Ce qui change (et rien d'autre)
- **Formation du FVG, invalidation par l'âge (50 bougies M15), objectif (FVG à gauche non comblé), stop (bord lointain − 10 % de la
  hauteur), coûts, règlement** : identiques à `scripts/lib/geminiFvg.js` (les FVG se forment toujours sur bougies M15 fermées).
- **Le rejet** est évalué sur des bougies de durée D : touche (`low + spread ≤ haut du FVG`) et clôture au-dessus du bord bas ;
  invalidation : clôture de la bougie D sous le bord bas. Entrée **au marché à l'ouverture de la bougie D suivante**.
  - **Témoin D = M15** : doit reproduire `geminiSignals` (les achats), à l'identique.
  - **M5** et **M1** : le rejet est reconnu à la clôture de la bougie de 5 min / 1 min, donc jusqu'à 14 min plus tôt.
- Achats seulement, US100 + US500, 24 h/24, une position par symbole, sortie stop / objectif / 480 bougies M15.

## Données (contrainte déclarée)
M1 du broker `data/real-m1-full` : US100 et US500 depuis 2023-01-11 jusqu'au 2026-09-21. **Cette fenêtre a déjà été lue** pour
l'étude « achats seulement » ; ici la comparaison est RELATIVE (M1 / M5 contre M15 sur les mêmes FVG), donc l'effet de cette lecture est
limité, mais aucun résultat absolu ne vaudra preuve. Le M1 HistData 2010-2022 n'est pas dans ce dépôt : pas de validation plus
ancienne possible ici.

## Mesures et verdict fixé à l'avance
Pour D ∈ {M5, M1}, US100 + US500 réunis :
1. Appariement par FVG (symbole + bougie de formation) : sur les FVG tradés dans les DEUX versions, `d = R(D) − R(M15)`.
2. **« Réagir plus vite aide »** seulement si TOUT est vrai : `d` moyen > 0 avec t ≥ 2 ; R moyen global de D > R moyen global du témoin ;
   `d` moyen > 0 dans les deux moitiés (2023-01→2024-12, 2025-01→2026-09).
3. Sinon : **« ne prouve rien »** (ou « aggrave » si `d` moyen < 0 avec t ≤ −2).
Affichés sans décider : nombre de trades, R moyen par version, part des FVG tradés seulement à D fin, écart moyen d'entrée (en % du
risque) entre les deux versions. Aucun réglage modifié après lecture.
