# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Market Maker Buy / Sell Model (ICT)

Date : 2026-09-25 (UTC). Demande d'Esdras : « as-tu entendu parler du market maker buy ou sell model ? » puis « prends ta définition ». Aucune donnée regardée pour ce modèle avant ce texte ; aucune règle ne sera changée après le calcul.

## Données et coûts
US100 et US500, M1 bid : HistData (`data/histdata-m1`, 2011-03 → 2022) pour l'entraînement, M1 du courtier (`data/real-m1-full`) pour 2023 → 2026-09-21. Bougies H1 et M15 construites à partir des M1 (heures UTC). Spread par défaut du projet (`DEFAULT_SPREADS`, mis à l'échelle du prix), réglage minute par minute, stop d'abord si stop et objectif dans la même minute, pas de glissement au-delà du spread.

## Règles — Buy Model (le Sell Model est le miroir exact)
ATR = moyenne des vrais écarts des 14 bougies H1 précédentes.
1. **Consolidation de départ** : 12 bougies H1 consécutives dont (plus haut − plus bas) ≤ 1,5 × ATR (ATR mesuré à la fin des 12 bougies). Haut = OCH, bas = OCL.
2. **Sortie de la consolidation** : dans les 24 bougies H1 suivantes, première clôture H1 hors du range. Sous OCL → Buy Model ; au-dessus d'OCH → Sell Model. Sinon abandon.
3. **Côté vendeur de la courbe** : le prix descend d'au moins 3 × ATR sous OCL, et au moins un plus bas H1 « fractal » (plus bas que les 2 bougies avant et les 2 après) se forme après la sortie et avant le plus bas extrême, qui le balaie (liquidité côté vente prise).
4. **Retournement (MSS) en M15** : première clôture M15 au-dessus du dernier plus haut M15 fractal (2 bougies de chaque côté) formé avant le plus bas extrême, une fois la condition 3 remplie ; au plus 480 bougies M15 (5 jours) après la sortie de la consolidation, sinon abandon.
5. **FVG de déplacement** : un FVG haussier M15 (plus haut de la bougie k−2 < plus bas de la bougie k) avec k entre la bougie du plus bas extrême + 2 et la bougie du MSS + 1 ; on prend le dernier.
6. **Entrée** : ordre LIMIT au haut du FVG (plus bas de la bougie k), actif pendant 16 bougies M15 (4 h) après la formation du FVG. Achat rempli quand l'ask touche le niveau. Annulé si le stop est touché avant le remplissage.
7. **Stop** : le plus bas extrême. **Cible** : OCL (retour vers la consolidation de départ). Trade refusé si la cible est à moins de 2R ou si R < 3 × spread.
8. **Sortie** : stop, cible, ou au marché après 5 jours (7 200 minutes).
9. Un seul modèle actif par paire : la recherche de la consolidation suivante reprend après la fin du modèle (trade clôturé, ordre expiré ou abandon).

## Critère (celui du projet)
Évalué sur US100 + US500 réunis (chaque paire donnée aussi à part, descriptif).
- **Entraînement 2011-2022** : au moins 60 trades, R moyen > 0, t ≥ 2, et R total positif en 2011-2016 ET en 2017-2022. Sinon : ÉCHEC (moins de 60 trades : NON CONCLUANT).
- **Test 2023-2025**, lu une seule fois : R moyen > 0 → CANDIDAT (mode alerte / démo avant tout réel, décision d'Esdras). Sinon ÉCHEC.
- 2026 : descriptif.

## Limites déclarées
Le modèle est visuel ; cette version mécanique n'est qu'UNE traduction possible (celle proposée par Claude et acceptée telle quelle par Esdras). Un échec ne réfute pas toutes les lectures du modèle, seulement celle-ci. Aucune variante ne sera essayée après coup sans nouveau pré-enregistrement.
