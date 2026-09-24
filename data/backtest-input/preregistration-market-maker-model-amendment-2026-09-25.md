# AMENDEMENT (écrit AVANT le nouveau calcul) — Market Maker Model : consolidation de départ moins stricte

Date : 2026-09-25. Esdras : « yes » (après le verdict NON CONCLUANT : 22 trades en 12 ans, goulot = règle 1, ~35 consolidations par paire).
**Déclaré** : les R de la version stricte ont été vus (+4,3 R à l'entraînement, t 0,39 ; test −1,5 R) ; c'est pour ça que le nouveau seuil est choisi UNIQUEMENT sur un nombre de consolidations, jamais sur un résultat.

## Seul changement : la règle 1
- Grille fixée ici : N ∈ {8, 12} bougies H1, largeur ≤ k × ATR avec k ∈ {2, 2,5, 3, 4}.
- Choix : la combinaison dont le nombre de consolidations de départ trouvées sur l'entraînement 2011-2022 (moyenne US100 / US500, même balayage que le script) est le plus proche de **1,5 par semaine et par paire** (≈ 920 sur la période). Le script de choix n'affiche que ces nombres.
- Tout le reste (règles 2 à 9, coûts, données, critère : ≥ 60 trades, t ≥ 2, deux moitiés positives, test 2023-2025 > 0) est inchangé.
- Une seule version sera calculée ; en cas d'échec, pas d'autre variante sans nouveau pré-enregistrement.
