# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Bloquer une stratégie après une série de pertes, la suivre « à blanc », la réactiver après un gain virtuel

Date : 2026-09-24. Idée d'Esdras : « détecter la stratégie qui ne fonctionne plus, la bloquer, la surveiller quand même et la réactiver si elle reprend ; ou bloquer la paire/stratégie après une série de pertes et la débloquer au prochain trade qui marche ». Variante lente déjà rejetée (`runCleanStudy.js switch` : jambe active si R > 0 sur 12 mois). Celle-ci réagit trade par trade ; jamais testée.

**Déjà vu, déclaré :** les résultats globaux par jambe du rejeu fidèle et de A/B ; jamais leurs séries de pertes ni l'enchaînement des trades.

## Règle (par jambe = une stratégie sur une paire)
1. Trades dans l'ordre d'entrée. Au départ : jambe **active**.
2. Jambe active : le trade est **pris**. Perte = R < 0. Après **K = 3 pertes consécutives prises**, la jambe est **bloquée**.
3. Jambe bloquée : les trades suivants sont **sautés** mais suivis à blanc. Dès qu'un trade sauté est **gagnant** (R > 0), la jambe redevient active : le trade suivant est pris, compteur de pertes remis à 0.
4. K = 3 fixé a priori (valeur courante en pratique) ; K = 2 et K = 4 affichés en sensibilité, jamais choisis.

## Données
- Combo live, rejeu fidèle 2010-2026 (`data/live-replay/*.json`, 8 jambes, R par trade).
- A (ORB 5 min US100) en R ; B (noise area US500) en % du nominal, affiché à part.

## Critère (fixé avant calcul)
- Mesure principale, sur les jambes en R (combo + A), toutes jambes réunies : **R moyen des trades pris − R moyen des trades sautés** (t de Welch).
- **Règle utile** si, sur l'entraînement 2010-2022 : écart > 0 avec **t ≥ 2**, écart positif en 2010-2016 ET 2017-2022 ; PUIS au test 2023-2025 : écart > 0. 2026 : descriptif.
- Contrôle direct (descriptif) : R moyen du trade qui suit 3 pertes de suite, contre R moyen de tous les trades de la jambe.
- Même utile, le R total peut baisser (moins de trades) : on l'affiche. Utile → proposé en démo, pas d'adoption directe. Inutile → pas d'autres K.
