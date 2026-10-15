# Filtre ML des signaux du combo (pré-enregistré 2026-10-15)

Règles : `preregistration-ml-signal-filter-2026-10-15.md`. Signaux du vrai moteur, M1 exact, `data/real-m1-full`. Entraînement < 2025, TEST 2025 (lu une fois), forward 2026. Filtre = 50 % de signaux au meilleur score (seuil = médiane des scores d'entraînement).

Signaux : entraînement 1113, test 565, forward 446. R/trade tous signaux : entraînement +0.006, test +0.157, forward +0.092. % gagnants : 22.8% / 25.0% / 23.8%.

## Régression logistique L2

- Validation croisée temporelle (entraînement, 3 plis) : AUC moyenne 0.523 (seuil > 0,52).
- TEST 2025 : AUC 0.501 (seuil > 0,55) ; signaux gardés 275/565 : R/trade -0.000 contre +0.157 tous signaux (écart -0.157, seuil +0,05) ; R total gardé -0.0 contre +88.6.
- Placebo (1000 permutations des étiquettes d'entraînement) : p = 0.454 (seuil < 0,05).
- Forward 2026 (robustesse) : AUC 0.508 ; gardés 206/446 : R/trade +0.095 contre +0.092 ; R total +19.6 contre +41.0.
- **Verdict : REJETÉ (critères non remplis)**

## Forêt aléatoire (300 arbres, profondeur 3)

- Validation croisée temporelle (entraînement, 3 plis) : AUC moyenne 0.573 (seuil > 0,52).
- TEST 2025 : AUC 0.480 (seuil > 0,55) ; signaux gardés 281/565 : R/trade +0.076 contre +0.157 tous signaux (écart -0.081, seuil +0,05) ; R total gardé +21.3 contre +88.6.
- Placebo (300 permutations des étiquettes d'entraînement) : p = 0.827 (seuil < 0,05).
- Forward 2026 (robustesse) : AUC 0.548 ; gardés 216/446 : R/trade +0.188 contre +0.092 ; R total +40.5 contre +41.0.
- **Verdict : REJETÉ (critères non remplis)**

## Limites

- Entraînement court (~2 ans, M1 broker) : le M1 HistData 2010-2022 n'est pas dans le dépôt (écart déclaré dans le pré-enregistrement).
- Placebo de la forêt : 300 permutations au lieu de 1 000 (temps de calcul), déclaré.
- Les trades sont réglés comme des signaux indépendants (garde-fous non rejoués), niveau absolu surestimé ; seuls les écarts entre « gardés » et « tous » comptent.
- Un modèle qui passerait resterait un candidat : échantillon de 2025 petit, signaux autocorrélés.
