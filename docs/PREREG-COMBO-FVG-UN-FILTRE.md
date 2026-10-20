# Pré-enregistrement — Combo FVG avec UN SEUL filtre H4 (objectif : plus de trades)

Écrit le 2026-10-06 (07:21 UTC), AVANT le calcul. Objectif : trouver une version de la v6 qui garde un avantage tout en donnant au moins 1,5 trade par semaine (la v6 complète en donne environ 0,7).

## Variantes testées (3 hypothèses, pas une de plus)
Toutes : règles de `PREREG-COMBO-FVG-V6.md` (achats, 06:00–16:00 NY, âge ≤ 8, entrée 50 %, stop c1 − 3 pts, TP max(½ cible, 3R), échelle prix/8200), sauf les filtres H4 :
- **F1 tendance** : seulement la tendance H4 haussière (dernière cassure agressive = un high).
- **F2 balayage** : seulement le balayage d'un low H4 (N=6, W=32).
- **F3 FVG baissier** : seulement « pas d'achat dans un FVG H4 baissier non rempli ».
Contrôle : « achats sans filtre » (déjà calculé : +0,025 R par trade sur 2011–2022, ~6 trades par semaine).

## Critères de réussite (tous requis, par variante)
1. Rythme : au moins 1,5 trade par semaine en moyenne sur 2023–2025.
2. Entraînement 2011–2022 : t ≥ 2,4 (trois hypothèses testées), et moyenne > 0 dans 2011–2016 ET dans 2017–2022.
3. Moyenne par trade supérieure à celle du contrôle sans filtre sur 2011–2022.
4. Test 2023–2025 : moyenne > 0 (bloc non vierge, déjà divulgué).
Si aucune variante ne passe : « aucune version à 2–3 trades par semaine validée », sans autre essai sur ces données.

## Empreinte
- comboF.mjs : 157702eb0a4e2d23d745fb2f7573abc78d32b818db87da4241bc4b86a937c212
