# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — FVG d'Esdras v2 appliqué à US500

Date : 2026-09-23. Demande d'Esdras après l'échec de la v2 sur US100 : « fais le même test pour US500 ».

- **Règles : exactement celles de `preregistration-esdras-fvg-v2-2026-09-23.md`**, sans aucun changement de paramètre (contexte 4h dans les 5 jours + retournement depuis la zone, impulsion M15 ≥ 2×ATR14 + BMS, distance 2×, LIMIT au bord, 8h-12h NY, cible = liquidité 4h la plus proche ≥ 3R). Seule la paire change : **US500** (spread par défaut du projet, 0,25).
- Données : HistData M1 US500 2010-2022 (entraînement), M1 du broker 2023-2025 (test) et 2026.
- **Même critère** : ≥ 60 trades, R net > 0, t ≥ 2, 2010-2016 et 2017-2022 positives, puis test ≥ 30 trades et R > 0.
- Réserve déclarée : US500 est très corrélé à US100 (−47 R au test sur US100). Un succès isolé sur US500 serait à lire comme possiblement dû au hasard (2e essai de la même règle).
