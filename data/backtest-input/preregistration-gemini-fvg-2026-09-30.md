# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — « Cahier des charges 100 % FVG » de Gemini

Date : 2026-09-30. Source : captures d'écran envoyées par Esdras (réponse de Gemini, « Cahier des Charges Algorithmique : 100 % FVG »,
avec code Pine Script v5). Demande d'Esdras : « Teste la variante de Gemini ».

## Texte de Gemini (résumé fidèle)
1. FVG M15 sur 3 bougies B1, B2, B3. Baissier : Low(B1) > High(B3) + Min_gap, haut = Low(B1), bas = High(B3). Haussier : High(B1) <
   Low(B3) − Min_gap, haut = Low(B3), bas = High(B1).
2. Trois types : FVG d'exécution (le dernier FVG formé dans le sens de l'impulsion), FVG cible (« FVG à gauche », non comblé, plus haut
   ou plus bas dans l'historique, objectif principal), FVG traversé (sans rôle dans les règles).
3. Vente : un FVG baissier est détecté ; le prix monte et pénètre la zone (High ≥ bas) sans clôturer au-dessus du haut ; entrée
   « dès la touche ou dès la première bougie M15 qui rejette la zone ».
4. Stop juste au-dessus du haut du FVG d'exécution (haut + marge). Objectif : borne du premier FVG à gauche non comblé.
Aucun indicateur ni filtre externe (pas d'heure, pas de tendance).

## Précisions d'application (écrites par Claude AVANT tout calcul — le texte de Gemini laisse ces points ouverts)
1. **Min_gap** : 0,02 % du prix (valeur déjà utilisée par le mode quiz du simulateur ; fixée ici, jamais ajustée).
2. **Entrée (décision unique)** : « dès la touche » ET « sans clôturer au-dessus du haut » ne peuvent pas être connus en même temps
   (la clôture vient après la touche). La règle exécutable retenue est la **bougie de rejet** : une bougie M15 qui touche la zone
   (vente : High ≥ bas) et clôture sans la franchir (vente : Close < haut) → ordre **au marché à l'ouverture de la bougie suivante**.
   Achat symétrique (Low ≤ haut, Close > bas).
3. **FVG d'exécution** : seul le FVG le plus récent de chaque sens est actif. Il est abandonné si un FVG plus récent du même sens se
   forme, si une bougie clôture au-delà de son bord opposé (vente : Close > haut), après 50 bougies M15 (`CONFIG.fvg.maxAgeCandles`),
   ou après avoir donné un trade (un trade par FVG). La bougie B3 elle-même ne peut pas servir de bougie de rejet.
4. **Stop** : bord opposé ± 10 % de la hauteur de la zone (même convention que `fvg-edge` du bot). Distance entrée-stop mesurée
   depuis le prix d'entrée réel ; trade ignoré si l'entrée est déjà au-delà du stop, ou si la distance < 3 × spread.
5. **Objectif** : parmi les FVG (des deux sens) formés dans les 480 bougies M15 avant le FVG d'exécution, toujours non comblés à
   l'entrée (le prix n'a jamais atteint leur bord éloigné depuis leur formation), situés entièrement du côté de l'objectif
   (vente : haut du FVG cible < prix d'entrée) : le **plus proche**. Objectif = son **bord le plus proche** (vente : son haut ; achat :
   son bas). Trade ignoré s'il n'y en a aucun, ou si l'objectif est à moins de 1 R.
6. **Sortie** : stop, objectif, ou 480 bougies M15 (clôture de la dernière). Stop d'abord si les deux sont touchés dans la même bougie.
   Une seule position ouverte par symbole.
7. **Symboles, sens, heures** : US100 et US500 (les graphiques de Gemini), achats et ventes, 24 h/24 (Gemini : aucun filtre).
8. **Coûts** : spread `DEFAULT_SPREADS` ramené au niveau de prix (même méthode que `runStopOrderEntryStudy.js`) et swap réel mesuré
   (`swapPerUnit`). R = PnL net / |entrée − stop|.

## Données (contrainte de cet environnement, déclarée avant calcul)
Le M1 HistData 2010-2022 n'est pas dans ce dépôt (il est sur le poste d'Esdras). Donc :
- **Entraînement 2010-2022** : M15 HistData (`data/backtest-input/US100.csv`, `US500.csv`), règlement à la bougie M15 (stop d'abord :
  prudent).
- **Test 2023-2025 et forward 2026** : M1 du broker (`data/real-m1-full`), détection sur M15 reconstruit, règlement minute par minute.

## Verdict fixé à l'avance (critère du projet)
US100 + US500 réunis :
- Moins de 60 trades à l'entraînement : **non concluant**.
- Entraînement : R moyen > 0, t ≥ 2,6, et les deux moitiés (2010-2016, 2017-2022) positives — sinon **échec à l'entraînement**.
- Puis test 2023-2025 : R moyen > 0 → **candidat** (démo seulement) ; sinon **échec au test**.
- Forward 2026 : affiché, ne décide rien.
Aucun réglage ne sera modifié après lecture des résultats. Les chiffres par symbole sont affichés pour information.
