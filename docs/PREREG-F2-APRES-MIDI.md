# Pré-enregistrement — F2 avec ordres posés seulement l'après-midi, 12 h–16 h (AP1)

Écrit le 2026-10-07, AVANT tout calcul de AP1 par la règle ci-dessous. Règle et critères figés : aucun amendement après lecture. Origine : Krystofia (« essaie de trader après 12 h pour voir ; je me rappelais que les trades après 12 h marchaient, le bruit du matin passe, le marché est plus calme »).

## Contrôle (inchangé)
F2C : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R ; A +0,067 (617), B +0,146 (605). Le contrôle doit retrouver ces valeurs.

## La règle AP1 (une seule hypothèse, figée)
- Tout est celui de F2C, sauf la plage horaire de **pose** des ordres : `hourFrom = 12` au lieu de 6 ; `hourTo = 16` inchangé. Un ordre n'est posé que si la bougie de pose tombe de 12 h à 16 h (heure de New York, convention du moteur : décalage fixe de 5 h).
- Les ordres sont annulés à 16 h, comme dans F2C. Une position ouverte reste suivie jusqu'à son stop, son TP ou la sortie au temps (96 bougies).
- Aucune autre valeur essayée (11 h, 13 h, 12 h 30, 12–15 h, autre fenêtre) : si AP1 échoue, on s'arrête.

## Critères d'entraînement (sur 2011–2022, mêmes seuils que les études précédentes)
1. R moyen de AP1 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de AP1 et les trades de F2C absents de AP1.
3. AP1 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C (≤ 34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

Palier : « validée » si les cinq passent ; « prometteuse » si seul le critère 2 manque, avec un Welch ≥ 1,0 (voir `PROTOCOLE-PALIER-PROMETTEUR.md`) ; sinon « rejetée ».

## Lecture du test 2023–2025 (une seule fois, si validée ou prometteuse)
**OK** si R moyen de AP1 > R moyen de F2C, **et** > 0, **et** R moyen des trades de F2C absents de AP1 < R moyen de AP1. Sinon **KO**. 2026 : descriptif. OK = candidate au suivi en direct, jamais un remplacement de F2.

## Divulgations
- **Ce n'est pas un test à l'aveugle.** Avant d'écrire cette règle, j'avais déjà calculé la variante inverse (ordres posés 6 h–12 h : −0,050 R sur 588 trades, 2011–2022), donc je savais par différence que le reste de F2 (12 h–16 h) valait environ +0,25 R. Les critères d'entraînement 1, 3 et le critère 2 sont donc favorisés d'avance ; le vrai test est 2023–2025, lu une seule fois.
- Le calcul 6 h–12 h portait sur 2011–2022 et sur le nombre de trades de 2023–2025 (R non lu). Le R de AP1 sur 2023–2025 n'a pas été lu.
- Retirer les ordres du matin libère des positions : quelques trades de l'après-midi peuvent être ajoutés (effet de position libre), ce que le moteur simule.
- Plus de 40 hypothèses ont été testées sur les mêmes données ; 2023–2025 n'est pas vierge pour F2 (son R global a été lu). Un succès serait un indice, pas une preuve.
- « 12 h » est l'heure de New York. Elle coïncide avec l'heure d'Haïti tant que les deux observent l'heure d'été en même temps (c'est le cas depuis 2017 ; avant, il pouvait y avoir un écart d'une heure certaines semaines).
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAJ_apres_midi.mjs <data> train`, puis `... test` si palier validée ou prometteuse.
