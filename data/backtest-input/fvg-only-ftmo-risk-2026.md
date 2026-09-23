# FVG seul vs combo, avec un risque plus élevé sur FTMO 1-Step — entraînement / test / 2026

Vrai `LiveStrategyEngine`, tout `data/real-m1-full` (EURUSD/XAUUSD dès 2022-05, indices dès 2023-01) reconstruit en M15, règlement **M1 exact**, rejeu dans le vrai `GuardrailEngine` (3 trades/jour, pause 30 min, -2 %/jour) ; cycles FTMO 1-Step réels via `buildEffectiveConfig` (+10 %, perte max 10 % trailing fin de journée, perte quotidienne FTMO). Un `warmUp()` par variante (retirer des mécanismes change le netting). Coûts : spread seulement (pas de commission/swap/glissement réel) → niveau absolu surestimé par rapport à la démo.

**Limite de méthode (héritée de `runFtmo1StepFullHistoryTrainTestForward2026.js`) :** le P&L de chaque trade est comptabilisé dans l'ordre des ENTRÉES, pas des sorties ; quand deux trades se chevauchent, une date de fin de cycle peut précéder la date de début affichée (jours négatifs). Effet négligeable sur les totaux, mais les dates de cycle sont approximatives à quelques jours près.

**⚠️ Biais de sélection déclaré :** FVG a été désigné « meilleure stratégie » en regardant tout l'historique, 2025 et 2026 compris. Les colonnes Test et 2026 ne sont donc PAS une validation hors échantillon de la décision « FVG seul ».

## FVG par paire à l'entraînement (< 2025) — base de la règle pour la variante C

| Paire | Trades | R net |
|---|---|---|
| XAUUSD | 117 | +17.0 |
| US500 | 114 | -20.0 |
| US100 | 295 | +87.0 |

Règle (même que pour le retrait de GER40) : retirer une paire seulement si son R net d'entraînement est <= 0. FVG US500 : -20.0 R → variante C **retenue**.

## Résultats en R (indépendants du risque, rejoués dans le garde-fou du bot)

| Variante | Fenêtre | Trades | Gagnants | R net | R/trade | t |
|---|---|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | 1141 | 26 % | +90.5 | +0.079 | 1.31 |
| A. Combo actuel (référence) | Test (2025) | 528 | 27 % | +90.2 | +0.171 | 1.84 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | 402 | 25 % | +47.0 | +0.117 | 1.12 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | 474 | 23 % | +81.3 | +0.172 | 1.58 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | 211 | 27 % | +86.8 | +0.411 | 2.35 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | 161 | 22 % | +26.8 | +0.167 | 0.89 |
| C. FVG seul sans US500 | Entraînement (< 2025) | 378 | 25 % | +111.7 | +0.295 | 2.36 |
| C. FVG seul sans US500 | Test (2025) | 164 | 26 % | +65.4 | +0.399 | 2.02 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | 122 | 25 % | +39.8 | +0.326 | 1.48 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | 541 | 28 % | +148.0 | +0.274 | 2.85 |
| D. FVG sans US500 + Divergence | Test (2025) | 242 | 30 % | +101.9 | +0.421 | 2.82 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | 175 | 26 % | +42.4 | +0.242 | 1.44 |

## Risque 0.3 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +28.4 % | 10.6 % | 4 / 1 / 1 |
| A. Combo actuel (référence) | Test (2025) | +29.7 % | 10.4 % | 2 / 1 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +14.2 % | 9.3 % | 1 / 0 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +26.1 % | 7.6 % | 2 / 0 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +28.9 % | 6.4 % | 3 / 0 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +7.9 % | 6.1 % | 1 / 0 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +38.4 % | 6.0 % | 3 / 0 / 1 |
| C. FVG seul sans US500 | Test (2025) | +21.1 % | 4.4 % | 2 / 0 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +12.3 % | 3.2 % | 1 / 0 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +54.0 % | 6.7 % | 5 / 0 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +34.9 % | 4.4 % | 3 / 0 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +13.1 % | 4.6 % | 1 / 0 / 1 |

## Risque 0.5 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +48.2 % | 17.2 % | 9 / 8 / 1 |
| A. Combo actuel (référence) | Test (2025) | +52.4 % | 16.8 % | 4 / 2 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +23.8 % | 15.1 % | 3 / 2 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +45.3 % | 12.5 % | 5 / 1 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +51.7 % | 10.5 % | 4 / 1 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +13.1 % | 10.0 % | 2 / 0 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +70.0 % | 9.9 % | 5 / 0 / 1 |
| C. FVG seul sans US500 | Test (2025) | +36.9 % | 7.3 % | 3 / 0 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +20.9 % | 5.2 % | 2 / 0 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +102.6 % | 11.0 % | 7 / 1 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +63.7 % | 7.2 % | 4 / 0 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +22.3 % | 7.5 % | 2 / 0 / 1 |

## Risque 0.75 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +72.8 % | 24.9 % | 14 / 16 / 1 |
| A. Combo actuel (référence) | Test (2025) | +84.0 % | 24.2 % | 9 / 7 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +35.5 % | 21.9 % | 5 / 4 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +70.9 % | 18.5 % | 9 / 6 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +84.5 % | 15.4 % | 8 / 4 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +19.3 % | 14.7 % | 4 / 2 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +117.1 % | 14.6 % | 8 / 2 / 0 |
| C. FVG seul sans US500 | Test (2025) | +58.6 % | 10.9 % | 5 / 1 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +32.1 % | 7.8 % | 3 / 0 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +181.3 % | 16.1 % | 13 / 4 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +106.9 % | 10.6 % | 7 / 1 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +34.1 % | 11.2 % | 3 / 1 / 1 |

## Risque 1 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +140.1 % | 29.7 % | 24 / 25 / 1 |
| A. Combo actuel (référence) | Test (2025) | +99.2 % | 29.8 % | 16 / 11 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +57.5 % | 28.4 % | 8 / 8 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +119.1 % | 20.5 % | 12 / 6 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +106.5 % | 18.4 % | 10 / 5 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +27.2 % | 16.8 % | 5 / 4 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +161.6 % | 18.2 % | 12 / 6 / 1 |
| C. FVG seul sans US500 | Test (2025) | +70.7 % | 13.5 % | 9 / 4 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +41.1 % | 10.2 % | 4 / 1 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +260.1 % | 20.1 % | 18 / 9 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +118.1 % | 15.8 % | 10 / 2 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +52.8 % | 13.8 % | 5 / 1 / 1 |

## Risque 1.5 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +217.7 % | 41.8 % | 44 / 46 / 1 |
| A. Combo actuel (référence) | Test (2025) | +153.4 % | 41.6 % | 21 / 16 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +89.4 % | 38.7 % | 17 / 12 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +196.2 % | 29.7 % | 25 / 20 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +183.3 % | 26.5 % | 15 / 9 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +39.0 % | 24.5 % | 6 / 7 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +291.3 % | 26.5 % | 26 / 16 / 1 |
| C. FVG seul sans US500 | Test (2025) | +115.2 % | 20.0 % | 12 / 7 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +63.4 % | 15.0 % | 5 / 2 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +523.2 % | 28.8 % | 30 / 22 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +208.3 % | 22.8 % | 15 / 6 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +83.3 % | 20.3 % | 7 / 4 / 1 |

## Risque 2 % par trade

| Variante | Fenêtre | Compte continu 10 000 $ | Pire baisse | FTMO réussis / ratés / en cours |
|---|---|---|---|---|
| A. Combo actuel (référence) | Entraînement (< 2025) | +102.7 % | 59.7 % | 64 / 72 / 1 |
| A. Combo actuel (référence) | Test (2025) | +215.5 % | 41.1 % | 31 / 30 / 1 |
| A. Combo actuel (référence) | 2026 (1er jan. → fin des données) | +159.2 % | 39.9 % | 25 / 25 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Entraînement (< 2025) | +224.9 % | 49.4 % | 34 / 34 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | Test (2025) | +131.6 % | 32.1 % | 18 / 15 / 1 |
| B. FVG seul (US100/US500/XAUUSD) | 2026 (1er jan. → fin des données) | +55.4 % | 35.0 % | 9 / 11 / 1 |
| C. FVG seul sans US500 | Entraînement (< 2025) | +209.8 % | 53.3 % | 31 / 27 / 1 |
| C. FVG seul sans US500 | Test (2025) | +53.0 % | 38.0 % | 11 / 10 / 1 |
| C. FVG seul sans US500 | 2026 (1er jan. → fin des données) | +50.7 % | 23.4 % | 8 / 6 / 1 |
| D. FVG sans US500 + Divergence | Entraînement (< 2025) | +664.1 % | 46.7 % | 43 / 40 / 1 |
| D. FVG sans US500 + Divergence | Test (2025) | +122.3 % | 21.2 % | 19 / 14 / 1 |
| D. FVG sans US500 + Divergence | 2026 (1er jan. → fin des données) | +49.4 % | 29.8 % | 11 / 7 / 1 |

## Détail des cycles FTMO 1-Step en 2026

### A. Combo actuel (référence) — risque 0.3 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-06 | 186 | 278 | RÉUSSI |
| 2 | 2026-07-06 | 2026-09-18 | 74 | 124 | en cours (+2.4 %) |

### A. Combo actuel (référence) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-02-01 | 31 | 50 | RATÉ |
| 2 | 2026-02-01 | 2026-04-21 | 79 | 121 | RÉUSSI |
| 3 | 2026-04-21 | 2026-06-15 | 55 | 72 | RÉUSSI |
| 4 | 2026-06-15 | 2026-08-04 | 50 | 87 | RÉUSSI |
| 5 | 2026-08-04 | 2026-08-27 | 23 | 38 | RATÉ |
| 6 | 2026-08-27 | 2026-09-18 | 22 | 35 | en cours (+5.0 %) |

### A. Combo actuel (référence) — risque 0.75 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-18 | 17 | 26 | RATÉ |
| 2 | 2026-01-18 | 2026-02-03 | 16 | 28 | RATÉ |
| 3 | 2026-02-03 | 2026-03-12 | 37 | 60 | RATÉ |
| 4 | 2026-03-12 | 2026-03-31 | 19 | 24 | RÉUSSI |
| 5 | 2026-03-31 | 2026-04-21 | 21 | 33 | RÉUSSI |
| 6 | 2026-04-21 | 2026-06-02 | 42 | 53 | RÉUSSI |
| 7 | 2026-06-02 | 2026-07-06 | 34 | 56 | RÉUSSI |
| 8 | 2026-07-06 | 2026-08-05 | 30 | 52 | RÉUSSI |
| 9 | 2026-08-05 | 2026-08-24 | 19 | 31 | RATÉ |
| 10 | 2026-08-24 | 2026-09-18 | 25 | 43 | en cours (+3.5 %) |

### A. Combo actuel (référence) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-13 | 12 | 19 | RATÉ |
| 2 | 2026-01-13 | 2026-01-29 | 16 | 30 | RATÉ |
| 3 | 2026-01-29 | 2026-02-12 | 14 | 20 | RATÉ |
| 4 | 2026-02-12 | 2026-02-17 | 5 | 9 | RÉUSSI |
| 5 | 2026-02-17 | 2026-03-11 | 22 | 36 | RATÉ |
| 6 | 2026-03-11 | 2026-03-31 | 20 | 27 | RÉUSSI |
| 7 | 2026-03-31 | 2026-04-07 | 7 | 11 | RATÉ |
| 8 | 2026-04-07 | 2026-04-15 | 8 | 13 | RÉUSSI |
| 9 | 2026-04-15 | 2026-04-27 | 11 | 14 | RÉUSSI |
| 10 | 2026-04-27 | 2026-06-02 | 37 | 50 | RÉUSSI |
| 11 | 2026-06-02 | 2026-07-06 | 34 | 54 | RÉUSSI |
| 12 | 2026-07-06 | 2026-08-04 | 29 | 51 | RÉUSSI |
| 13 | 2026-08-04 | 2026-08-19 | 15 | 29 | RATÉ |
| 14 | 2026-08-19 | 2026-08-27 | 8 | 10 | RATÉ |
| 15 | 2026-08-27 | 2026-09-09 | 13 | 19 | RATÉ |
| 16 | 2026-09-09 | 2026-09-11 | 2 | 4 | RÉUSSI |
| 17 | 2026-09-11 | 2026-09-18 | 7 | 14 | en cours (-1.4 %) |

### A. Combo actuel (référence) — risque 1.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-12 | 11 | 5 | RÉUSSI |
| 2 | 2026-01-12 | 2026-01-13 | 1 | 11 | RATÉ |
| 3 | 2026-01-13 | 2026-01-21 | 8 | 15 | RATÉ |
| 4 | 2026-01-21 | 2026-02-01 | 11 | 16 | RATÉ |
| 5 | 2026-02-01 | 2026-02-05 | 4 | 8 | RATÉ |
| 6 | 2026-02-05 | 2026-02-12 | 7 | 10 | RÉUSSI |
| 7 | 2026-02-12 | 2026-02-25 | 13 | 22 | RÉUSSI |
| 8 | 2026-02-25 | 2026-03-10 | 13 | 18 | RATÉ |
| 9 | 2026-03-10 | 2026-03-24 | 14 | 19 | RATÉ |
| 10 | 2026-03-24 | 2026-04-01 | 8 | 10 | RÉUSSI |
| 11 | 2026-04-01 | 2026-04-05 | 5 | 7 | RATÉ |
| 12 | 2026-04-05 | 2026-04-15 | 10 | 14 | RÉUSSI |
| 13 | 2026-04-15 | 2026-04-22 | 7 | 8 | RÉUSSI |
| 14 | 2026-04-22 | 2026-04-27 | 4 | 7 | RÉUSSI |
| 15 | 2026-04-27 | 2026-05-01 | 4 | 7 | RATÉ |
| 16 | 2026-05-01 | 2026-05-06 | 5 | 6 | RÉUSSI |
| 17 | 2026-05-06 | 2026-05-11 | 5 | 9 | RATÉ |
| 18 | 2026-05-11 | 2026-05-13 | 2 | 4 | RÉUSSI |
| 19 | 2026-05-13 | 2026-06-02 | 20 | 21 | RÉUSSI |
| 20 | 2026-06-02 | 2026-06-15 | 13 | 18 | RÉUSSI |
| 21 | 2026-06-15 | 2026-07-06 | 21 | 33 | RÉUSSI |
| 22 | 2026-07-06 | 2026-07-20 | 14 | 22 | RÉUSSI |
| 23 | 2026-07-20 | 2026-08-04 | 15 | 24 | RÉUSSI |
| 24 | 2026-08-04 | 2026-08-12 | 8 | 13 | RÉUSSI |
| 25 | 2026-08-12 | 2026-08-18 | 6 | 12 | RATÉ |
| 26 | 2026-08-18 | 2026-08-25 | 7 | 7 | RATÉ |
| 27 | 2026-08-25 | 2026-09-08 | 14 | 17 | RATÉ |
| 28 | 2026-09-08 | 2026-09-14 | 6 | 10 | RÉUSSI |
| 29 | 2026-09-14 | 2026-09-16 | 2 | 2 | RÉUSSI |
| 30 | 2026-09-16 | 2026-09-18 | 2 | 6 | en cours (-9.7 %) |

### A. Combo actuel (référence) — risque 2 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-12 | 11 | 5 | RÉUSSI |
| 2 | 2026-01-12 | 2026-01-12 | -1 | 9 | RATÉ |
| 3 | 2026-01-12 | 2026-01-19 | 7 | 9 | RATÉ |
| 4 | 2026-01-19 | 2026-01-25 | 7 | 8 | RATÉ |
| 5 | 2026-01-25 | 2026-01-29 | 4 | 11 | RATÉ |
| 6 | 2026-01-29 | 2026-02-03 | 5 | 8 | RATÉ |
| 7 | 2026-02-03 | 2026-02-11 | 8 | 10 | RATÉ |
| 8 | 2026-02-11 | 2026-02-13 | 2 | 6 | RÉUSSI |
| 9 | 2026-02-13 | 2026-02-25 | 12 | 16 | RATÉ |
| 10 | 2026-02-25 | 2026-02-25 | 0 | 4 | RÉUSSI |
| 11 | 2026-02-25 | 2026-03-03 | 5 | 8 | RATÉ |
| 12 | 2026-03-03 | 2026-03-05 | 2 | 4 | RÉUSSI |
| 13 | 2026-03-05 | 2026-03-10 | 5 | 6 | RATÉ |
| 14 | 2026-03-10 | 2026-03-18 | 8 | 12 | RÉUSSI |
| 15 | 2026-03-18 | 2026-03-23 | 5 | 7 | RATÉ |
| 16 | 2026-03-23 | 2026-03-26 | 3 | 7 | RATÉ |
| 17 | 2026-03-26 | 2026-03-30 | 4 | 4 | RÉUSSI |
| 18 | 2026-03-30 | 2026-04-01 | 2 | 2 | RÉUSSI |
| 19 | 2026-04-01 | 2026-04-02 | 1 | 5 | RATÉ |
| 20 | 2026-04-02 | 2026-04-07 | 5 | 5 | RATÉ |
| 21 | 2026-04-07 | 2026-04-14 | 7 | 11 | RÉUSSI |
| 22 | 2026-04-14 | 2026-04-15 | 1 | 2 | RÉUSSI |
| 23 | 2026-04-15 | 2026-04-22 | 7 | 7 | RÉUSSI |
| 24 | 2026-04-22 | 2026-04-27 | 4 | 7 | RÉUSSI |
| 25 | 2026-04-27 | 2026-04-29 | 3 | 5 | RATÉ |
| 26 | 2026-04-29 | 2026-05-11 | 12 | 14 | RATÉ |
| 27 | 2026-05-11 | 2026-05-13 | 2 | 5 | RÉUSSI |
| 28 | 2026-05-13 | 2026-06-02 | 20 | 21 | RÉUSSI |
| 29 | 2026-06-02 | 2026-06-11 | 9 | 16 | RÉUSSI |
| 30 | 2026-06-11 | 2026-06-16 | 5 | 7 | RATÉ |
| 31 | 2026-06-16 | 2026-06-17 | 1 | 2 | RÉUSSI |
| 32 | 2026-06-17 | 2026-06-22 | 5 | 6 | RATÉ |
| 33 | 2026-06-22 | 2026-06-23 | 1 | 3 | RÉUSSI |
| 34 | 2026-06-23 | 2026-07-01 | 9 | 11 | RATÉ |
| 35 | 2026-07-01 | 2026-07-06 | 5 | 6 | RÉUSSI |
| 36 | 2026-07-06 | 2026-07-15 | 9 | 15 | RÉUSSI |
| 37 | 2026-07-15 | 2026-07-20 | 5 | 9 | RÉUSSI |
| 38 | 2026-07-20 | 2026-07-30 | 10 | 16 | RATÉ |
| 39 | 2026-07-30 | 2026-07-31 | 1 | 2 | RÉUSSI |
| 40 | 2026-07-31 | 2026-08-05 | 5 | 8 | RÉUSSI |
| 41 | 2026-08-05 | 2026-08-12 | 7 | 12 | RÉUSSI |
| 42 | 2026-08-12 | 2026-08-17 | 5 | 10 | RATÉ |
| 43 | 2026-08-17 | 2026-08-19 | 2 | 7 | RATÉ |
| 44 | 2026-08-19 | 2026-08-25 | 6 | 5 | RATÉ |
| 45 | 2026-08-25 | 2026-08-28 | 3 | 6 | RATÉ |
| 46 | 2026-08-28 | 2026-09-01 | 4 | 3 | RÉUSSI |
| 47 | 2026-09-01 | 2026-09-04 | 3 | 8 | RATÉ |
| 48 | 2026-09-04 | 2026-09-08 | 4 | 5 | RATÉ |
| 49 | 2026-09-08 | 2026-09-11 | 3 | 4 | RÉUSSI |
| 50 | 2026-09-11 | 2026-09-15 | 4 | 7 | RÉUSSI |
| 51 | 2026-09-15 | 2026-09-18 | 3 | 7 | en cours (-7.9 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 0.3 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-06-02 | 148 | 74 | RÉUSSI |
| 2 | 2026-06-02 | 2026-09-17 | 107 | 87 | en cours (-2.0 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-05-26 | 141 | 72 | RÉUSSI |
| 2 | 2026-05-26 | 2026-07-15 | 50 | 36 | RÉUSSI |
| 3 | 2026-07-15 | 2026-09-17 | 64 | 53 | en cours (-8.3 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 0.75 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 9 | RÉUSSI |
| 2 | 2026-01-22 | 2026-02-20 | 29 | 19 | RATÉ |
| 3 | 2026-02-20 | 2026-05-20 | 89 | 38 | RÉUSSI |
| 4 | 2026-05-20 | 2026-06-02 | 13 | 8 | RÉUSSI |
| 5 | 2026-06-02 | 2026-07-15 | 43 | 36 | RÉUSSI |
| 6 | 2026-07-15 | 2026-08-27 | 43 | 35 | RATÉ |
| 7 | 2026-08-27 | 2026-09-17 | 21 | 16 | en cours (-5.2 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 8 | RÉUSSI |
| 2 | 2026-01-22 | 2026-02-11 | 20 | 11 | RATÉ |
| 3 | 2026-02-11 | 2026-03-24 | 41 | 22 | RATÉ |
| 4 | 2026-03-24 | 2026-05-13 | 50 | 21 | RÉUSSI |
| 5 | 2026-05-13 | 2026-05-26 | 13 | 10 | RÉUSSI |
| 6 | 2026-05-26 | 2026-06-02 | 7 | 2 | RÉUSSI |
| 7 | 2026-06-02 | 2026-07-15 | 43 | 34 | RÉUSSI |
| 8 | 2026-07-15 | 2026-07-28 | 13 | 12 | RATÉ |
| 9 | 2026-07-28 | 2026-08-27 | 30 | 25 | RATÉ |
| 10 | 2026-08-27 | 2026-09-17 | 21 | 16 | en cours (-7.0 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 1.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 7 | RÉUSSI |
| 2 | 2026-01-22 | 2026-02-10 | 19 | 8 | RATÉ |
| 3 | 2026-02-10 | 2026-02-20 | 10 | 11 | RATÉ |
| 4 | 2026-02-20 | 2026-03-24 | 32 | 13 | RATÉ |
| 5 | 2026-03-24 | 2026-04-21 | 28 | 8 | RÉUSSI |
| 6 | 2026-04-21 | 2026-05-20 | 29 | 17 | RÉUSSI |
| 7 | 2026-05-20 | 2026-05-29 | 9 | 7 | RÉUSSI |
| 8 | 2026-05-29 | 2026-06-02 | 4 | 3 | RÉUSSI |
| 9 | 2026-06-02 | 2026-07-02 | 30 | 24 | RATÉ |
| 10 | 2026-07-02 | 2026-07-06 | 4 | 2 | RÉUSSI |
| 11 | 2026-07-06 | 2026-07-28 | 22 | 13 | RATÉ |
| 12 | 2026-07-28 | 2026-08-26 | 29 | 25 | RATÉ |
| 13 | 2026-08-26 | 2026-09-17 | 22 | 17 | RATÉ |
| 14 | 2026-09-17 | 2026-09-17 | 0 | 1 | en cours (-1.6 %) |

### B. FVG seul (US100/US500/XAUUSD) — risque 2 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 7 | RÉUSSI |
| 2 | 2026-01-22 | 2026-02-09 | 18 | 6 | RATÉ |
| 3 | 2026-02-09 | 2026-02-12 | 3 | 5 | RATÉ |
| 4 | 2026-02-12 | 2026-02-17 | 5 | 6 | RATÉ |
| 5 | 2026-02-17 | 2026-03-12 | 23 | 13 | RATÉ |
| 6 | 2026-03-12 | 2026-05-01 | 50 | 15 | RÉUSSI |
| 7 | 2026-05-01 | 2026-05-12 | 11 | 5 | RATÉ |
| 8 | 2026-05-12 | 2026-05-13 | 1 | 3 | RÉUSSI |
| 9 | 2026-05-13 | 2026-05-20 | 7 | 4 | RÉUSSI |
| 10 | 2026-05-20 | 2026-05-29 | 9 | 7 | RÉUSSI |
| 11 | 2026-05-29 | 2026-06-02 | 4 | 3 | RÉUSSI |
| 12 | 2026-06-02 | 2026-07-08 | 36 | 23 | RATÉ |
| 13 | 2026-07-08 | 2026-07-06 | -2 | 3 | RÉUSSI |
| 14 | 2026-07-06 | 2026-07-15 | 9 | 6 | RÉUSSI |
| 15 | 2026-07-15 | 2026-07-24 | 9 | 6 | RATÉ |
| 16 | 2026-07-24 | 2026-08-11 | 18 | 10 | RATÉ |
| 17 | 2026-08-11 | 2026-08-12 | 1 | 2 | RÉUSSI |
| 18 | 2026-08-12 | 2026-08-25 | 13 | 11 | RATÉ |
| 19 | 2026-08-25 | 2026-08-28 | 3 | 5 | RATÉ |
| 20 | 2026-08-28 | 2026-09-17 | 20 | 14 | RATÉ |
| 21 | 2026-09-17 | 2026-09-17 | 0 | 1 | en cours (-2.2 %) |

### C. FVG seul sans US500 — risque 0.3 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-05-29 | 144 | 57 | RÉUSSI |
| 2 | 2026-05-29 | 2026-09-16 | 110 | 65 | en cours (+1.8 %) |

### C. FVG seul sans US500 — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-04-21 | 106 | 37 | RÉUSSI |
| 2 | 2026-04-21 | 2026-06-02 | 42 | 23 | RÉUSSI |
| 3 | 2026-06-02 | 2026-09-16 | 106 | 62 | en cours (-1.6 %) |

### C. FVG seul sans US500 — risque 0.75 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-22 | 17 | 7 | RÉUSSI |
| 2 | 2026-01-22 | 2026-05-20 | 118 | 44 | RÉUSSI |
| 3 | 2026-05-20 | 2026-06-02 | 13 | 9 | RÉUSSI |
| 4 | 2026-06-02 | 2026-09-16 | 106 | 62 | en cours (-2.6 %) |

### C. FVG seul sans US500 — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-21 | 15 | 5 | RÉUSSI |
| 2 | 2026-01-21 | 2026-05-01 | 101 | 36 | RÉUSSI |
| 3 | 2026-05-01 | 2026-05-29 | 28 | 16 | RÉUSSI |
| 4 | 2026-05-29 | 2026-06-10 | 11 | 6 | RÉUSSI |
| 5 | 2026-06-10 | 2026-08-28 | 80 | 51 | RATÉ |
| 6 | 2026-08-28 | 2026-09-16 | 19 | 8 | en cours (+1.6 %) |

### C. FVG seul sans US500 — risque 1.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-09 | 4 | 3 | RÉUSSI |
| 2 | 2026-01-09 | 2026-02-12 | 34 | 11 | RATÉ |
| 3 | 2026-02-12 | 2026-04-21 | 68 | 22 | RÉUSSI |
| 4 | 2026-04-21 | 2026-05-20 | 29 | 14 | RÉUSSI |
| 5 | 2026-05-20 | 2026-06-02 | 13 | 7 | RÉUSSI |
| 6 | 2026-06-02 | 2026-07-15 | 43 | 25 | RÉUSSI |
| 7 | 2026-07-15 | 2026-08-26 | 42 | 26 | RATÉ |
| 8 | 2026-08-26 | 2026-09-16 | 21 | 11 | en cours (-2.8 %) |

### C. FVG seul sans US500 — risque 2 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-05 | 2026-01-09 | 4 | 3 | RÉUSSI |
| 2 | 2026-01-09 | 2026-01-22 | 13 | 4 | RÉUSSI |
| 3 | 2026-01-22 | 2026-02-10 | 19 | 5 | RATÉ |
| 4 | 2026-02-10 | 2026-02-19 | 9 | 9 | RATÉ |
| 5 | 2026-02-19 | 2026-04-09 | 49 | 14 | RÉUSSI |
| 6 | 2026-04-09 | 2026-05-13 | 34 | 11 | RATÉ |
| 7 | 2026-05-13 | 2026-05-20 | 7 | 4 | RÉUSSI |
| 8 | 2026-05-20 | 2026-05-29 | 9 | 7 | RÉUSSI |
| 9 | 2026-05-29 | 2026-06-02 | 4 | 3 | RÉUSSI |
| 10 | 2026-06-02 | 2026-06-18 | 16 | 9 | RATÉ |
| 11 | 2026-06-18 | 2026-06-25 | 7 | 5 | RÉUSSI |
| 12 | 2026-06-25 | 2026-07-29 | 34 | 16 | RATÉ |
| 13 | 2026-07-29 | 2026-08-12 | 14 | 9 | RÉUSSI |
| 14 | 2026-08-12 | 2026-08-25 | 13 | 10 | RATÉ |
| 15 | 2026-08-25 | 2026-09-16 | 22 | 12 | en cours (-6.3 %) |

### D. FVG sans US500 + Divergence — risque 0.3 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-06-11 | 161 | 101 | RÉUSSI |
| 2 | 2026-06-11 | 2026-09-16 | 97 | 74 | en cours (+2.6 %) |

### D. FVG sans US500 + Divergence — risque 0.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-05-06 | 124 | 71 | RÉUSSI |
| 2 | 2026-05-06 | 2026-08-12 | 98 | 76 | RÉUSSI |
| 3 | 2026-08-12 | 2026-09-16 | 35 | 30 | en cours (-1.6 %) |

### D. FVG sans US500 + Divergence — risque 0.75 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-03-20 | 78 | 52 | RATÉ |
| 2 | 2026-03-20 | 2026-04-15 | 26 | 7 | RÉUSSI |
| 3 | 2026-04-15 | 2026-06-02 | 48 | 32 | RÉUSSI |
| 4 | 2026-06-02 | 2026-08-12 | 71 | 57 | RÉUSSI |
| 5 | 2026-08-12 | 2026-09-16 | 35 | 30 | en cours (-2.5 %) |

### D. FVG sans US500 + Divergence — risque 1 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-22 | 21 | 14 | RÉUSSI |
| 2 | 2026-01-22 | 2026-03-02 | 39 | 28 | RATÉ |
| 3 | 2026-03-02 | 2026-04-15 | 44 | 17 | RÉUSSI |
| 4 | 2026-04-15 | 2026-05-06 | 21 | 12 | RÉUSSI |
| 5 | 2026-05-06 | 2026-06-11 | 36 | 30 | RÉUSSI |
| 6 | 2026-06-11 | 2026-08-12 | 62 | 46 | RÉUSSI |
| 7 | 2026-08-12 | 2026-09-16 | 35 | 30 | en cours (-3.5 %) |

### D. FVG sans US500 + Divergence — risque 1.5 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-09 | 8 | 6 | RÉUSSI |
| 2 | 2026-01-09 | 2026-02-05 | 27 | 15 | RATÉ |
| 3 | 2026-02-05 | 2026-03-12 | 35 | 27 | RATÉ |
| 4 | 2026-03-12 | 2026-04-09 | 28 | 9 | RÉUSSI |
| 5 | 2026-04-09 | 2026-05-01 | 22 | 6 | RÉUSSI |
| 6 | 2026-05-01 | 2026-05-29 | 28 | 25 | RÉUSSI |
| 7 | 2026-05-29 | 2026-06-02 | 4 | 4 | RÉUSSI |
| 8 | 2026-06-02 | 2026-07-09 | 37 | 29 | RÉUSSI |
| 9 | 2026-07-09 | 2026-07-29 | 20 | 10 | RATÉ |
| 10 | 2026-07-29 | 2026-08-05 | 6 | 6 | RÉUSSI |
| 11 | 2026-08-05 | 2026-08-28 | 23 | 19 | RATÉ |
| 12 | 2026-08-28 | 2026-09-16 | 19 | 13 | en cours (+0.4 %) |

### D. FVG sans US500 + Divergence — risque 2 %

| Cycle | Début | Fin | Jours | Trades | Résultat |
|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-12 | 11 | 3 | RÉUSSI |
| 2 | 2026-01-12 | 2026-02-04 | 23 | 17 | RATÉ |
| 3 | 2026-02-04 | 2026-03-02 | 26 | 21 | RATÉ |
| 4 | 2026-03-02 | 2026-03-17 | 15 | 8 | RATÉ |
| 5 | 2026-03-17 | 2026-04-14 | 28 | 7 | RÉUSSI |
| 6 | 2026-04-14 | 2026-04-15 | 1 | 2 | RÉUSSI |
| 7 | 2026-04-15 | 2026-05-01 | 16 | 9 | RÉUSSI |
| 8 | 2026-05-01 | 2026-05-06 | 5 | 3 | RÉUSSI |
| 9 | 2026-05-06 | 2026-05-13 | 7 | 6 | RATÉ |
| 10 | 2026-05-13 | 2026-05-29 | 16 | 12 | RÉUSSI |
| 11 | 2026-05-29 | 2026-06-02 | 4 | 4 | RÉUSSI |
| 12 | 2026-06-02 | 2026-06-18 | 16 | 15 | RATÉ |
| 13 | 2026-06-18 | 2026-06-25 | 7 | 4 | RÉUSSI |
| 14 | 2026-06-25 | 2026-07-15 | 20 | 12 | RÉUSSI |
| 15 | 2026-07-15 | 2026-07-27 | 12 | 7 | RATÉ |
| 16 | 2026-07-27 | 2026-08-05 | 9 | 7 | RÉUSSI |
| 17 | 2026-08-05 | 2026-08-12 | 7 | 6 | RÉUSSI |
| 18 | 2026-08-12 | 2026-08-27 | 15 | 12 | RATÉ |
| 19 | 2026-08-27 | 2026-09-16 | 20 | 13 | en cours (+0.2 %) |
