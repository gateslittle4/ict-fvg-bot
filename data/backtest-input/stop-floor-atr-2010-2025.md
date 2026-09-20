> ⚠️ **INVALIDÉ en partie (2026-09-20)** : ce rapport règle un stop et un objectif touchés dans la même bougie M15 en faveur du stop. Avec les vraies bougies d'une minute (`data/real-m1/m1-truth-report.md`), cette règle pénalise à tort les stops serrés d'origine : la conclusion « un plancher de stop en ATR améliore » ne tient PAS en M1 exact (2026 : stop d'origine +53 # Plancher de stop en ATR — 2010-2025, 8 mécanismes du bot

Chaque trade est re-résolu avec la même règle pour toutes les variantes (voir l'en-tête de `scripts/runStopFloorLongHistory.js`) : entrée jugée dès sa bougie, stop = max(stop de structure, k × ATR14 M15), même R:R, filtre « stop ≥ 3× le spread », garde-fous simplifiés identiques (1 position par paire, 3 trades/jour, pause 30 min après une perte, stop du jour à −4R). **k = 0 = le stop d'aujourd'hui.**

| Plancher | Trades | Gagnants | R net total | Entraînement ≤ 2023 (R) | Test 2024+ (R) | Pire baisse (R) | Compte 10 000 $ à 0,5 % | Pire baisse du compte | Défis FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|---|---|
| stop d'origine | 9333 | 24 % | +78.3 | -13.9 (7957) | +92.2 (1376) | 258 | $9103 | 76 % | **46 / 61** (médiane 41 j pour réussir) |
| 1× ATR | 10067 | 24 % | +398.5 | +208.6 (8651) | +190.0 (1416) | 213 | $43035 | 71 % | **70 / 74** (médiane 30 j pour réussir) |
| 2× ATR | 9186 | 24 % | +406.9 | +310.6 (7922) | +96.3 (1264) | 116 | $48065 | 48 % | **57 / 57** (médiane 40 j pour réussir) |
| 3× ATR | 7629 | 25 % | +415.9 | +324.1 (6593) | +91.8 (1036) | 98 | $55556 | 40 % | **49 / 47** (médiane 51 j pour réussir) |

## R net par année

| Année | origine | 1× ATR | 2× ATR | 3× ATR |
|---|---|---|---|---|
| 2009 | -9.0 | -3.8 | +0.1 | +4.9 |
| 2010 | +0.5 | +2.7 | +15.6 | +2.2 |
| 2011 | -148.2 | -116.8 | -42.1 | +29.3 |
| 2012 | -57.0 | -45.1 | -10.3 | +46.8 |
| 2013 | +26.1 | +11.1 | +13.0 | +29.6 |
| 2014 | +76.8 | +6.2 | +85.2 | +41.3 |
| 2015 | -2.6 | +89.5 | -0.3 | +11.5 |
| 2016 | -54.6 | -86.7 | -48.5 | -42.2 |
| 2017 | -44.8 | -23.6 | +47.5 | +28.3 |
| 2018 | +64.5 | +67.9 | +73.8 | -14.9 |
| 2019 | -3.3 | +60.7 | +57.5 | +42.2 |
| 2020 | +111.1 | +117.3 | +75.4 | +85.8 |
| 2021 | -48.4 | -13.2 | -5.7 | +19.3 |
| 2022 | +24.7 | +42.6 | +51.4 | +48.6 |
| 2023 | +50.3 | +99.8 | -1.9 | -8.5 |
| 2024 | +100.2 | +64.5 | +48.7 | +58.0 |
| 2025 | -8.0 | +125.4 | +47.6 | +33.8 |

Années où « 2× ATR » fait mieux que le stop d'origine : 13 sur 17.

## Limites

- Entrées issues des modules de backtest (un ordre limite est supposé rempli à son prix) ; spread constant ; pas de glissement ni d'élargissement du spread au rollover.
- Garde-fous approximés (pas le moteur complet) mais identiques pour toutes les variantes : la comparaison est équitable, le niveau absolu est indicatif.
- Seuls 4 réglages (k) ont été essayés : peu de risque de surajustement, mais la séparation ≤ 2023 / 2024+ reste la vraie preuve.