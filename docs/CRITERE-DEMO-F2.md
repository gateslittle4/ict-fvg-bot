# Critère de démo — F2 (balayage du low H4) — écrit le 06/10/2026, AVANT de lancer

Démo = TEST en simulation, aucun ordre réel. Rien ici ne prouve un avantage : F2 n'a pas passé ses critères (t 2,04 < 2,6) et 2026 est négatif (−0,239 R, 87 trades).

## Règles figées (aucun changement pendant la démo)
F2 = achats ; 06:00–16:00 NY ; FVG d'entrée ≤ 8 bougies ; balayage du low des 6 dernières barres H4 dans les 32 bougies avant c3 ; entrée 50 % ; stop c1 − 3 pts ; TP = max(½ FVG cible, 3R) ; spread 0,6 ; échelle prix/8200. Départ : 05/10/2026. Chaque ordre posé est journalisé (rempli ou non, R final). Aucune intervention manuelle, aucun trade ajouté ou retiré.

## Critère de réussite (demandé : ≥ 60 trades, moyenne > 0)
- À 60 trades remplis (≈ 7 mois à 2,08/sem.) : moyenne R > 0 → on continue ; sinon → F2 abandonnée.
- Arrêt anticipé : cumul ≤ −15 R à n'importe quel moment → F2 abandonnée.

## Limite à connaître (calculée)
Écart-type par trade ≈ 1,8 R. À 60 trades, l'erreur sur la moyenne est ≈ 0,24 R : si F2 vaut vraiment +0,106, elle passe « moyenne > 0 » dans ~67 % des cas ; si elle ne vaut rien, elle passe quand même dans ~50 %. Ce critère ne peut donc pas valider F2, seulement l'éliminer si elle est nettement mauvaise. Pour trancher : 150 trades (≈ 14 mois, erreur 0,15 R) ou 300 trades (≈ 2,8 ans, erreur 0,10 R).
Les seuils (60, −15 R) sont des propositions à confirmer par Krystofia avant le départ.
