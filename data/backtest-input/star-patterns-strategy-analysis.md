# Patterns de bougies classiques (non-ICT) : Morning/Evening Star et Doji Star

⚠ Demande explicite d'Esdras ("pour l'or, pourquoi pas des patterns connus? Comme diamant, étoile etc?") - concepts d'analyse technique classique, pas ICT. Définitions textbook (Bulkowski, Investopedia) : Morning Star = bougie 1 baissière, bougie 2 petit corps ("étoile"), bougie 3 haussière qui referme au-delà du milieu du corps de la bougie 1 ; Evening Star = miroir exact. Une adaptation documentée pour des données M15 intrajournalières : l'exigence classique d'un vrai "gap" (rare en intrabougie sur forex/CFD M15) est assouplie en "le corps de la bougie 2 reste majoritairement hors du corps de la bougie 1". Entrée à l'ouverture de la bougie APRÈS la bougie de confirmation, stop au-delà de l'extrême du pattern (3 bougies), cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs dans ce projet). Le pattern "diamant" (sommet/creux) n'a délibérément PAS été testé ici - il demande plusieurs paramètres subjectifs de détection de pics/creux à choisir avant de voir un résultat, contrairement au pattern étoile qui est une simple relation OHLC sur 3 bougies. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades"). Testé sur les 6 instruments disponibles, pas seulement l'or - même discipline que partout ailleurs dans ce projet.

## Variante 1 : Star (corps de la bougie 2 ≤ 30% du corps de la bougie 1)

Version la plus large - n'importe quel petit corps compte comme "étoile".

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 3517 | 24.9% | 0.87 | -0.11 | 466 | 26.8% | 1.05 | 0.04 | ⚠️ affaibli |
| US500 | 3953 | 25.9% | 0.91 | -0.07 | 531 | 26.0% | 0.97 | -0.02 | ❌ ne tient pas |
| XAUUSD | 3198 | 26.3% | 0.87 | -0.11 | 516 | 25.3% | 0.90 | -0.08 | ❌ ne tient pas |
| EURUSD | 1636 | 24.8% | 0.81 | -0.17 | 587 | 22.8% | 0.72 | -0.26 | ❌ ne tient pas |
| GBPUSD | 1344 | 26.0% | 0.87 | -0.11 | 527 | 26.0% | 0.84 | -0.14 | ❌ ne tient pas |
| USDJPY | 2212 | 25.4% | 0.84 | -0.14 | 624 | 24.6% | 0.84 | -0.13 | ❌ ne tient pas |
| USDCAD | 3443 | 23.0% | 0.73 | -0.24 | 495 | 26.1% | 0.82 | -0.16 | ❌ ne tient pas |
| GER40 | 2568 | 26.0% | 0.99 | -0.00 | 524 | 29.9% | 1.25 | 0.18 | ⚠️ affaibli |
| UKX | 1482 | 25.5% | 0.89 | -0.09 | 508 | 25.4% | 0.86 | -0.12 | ❌ ne tient pas |
| AUX | 1241 | 25.5% | 0.88 | -0.10 | 504 | 24.2% | 0.83 | -0.15 | ❌ ne tient pas |

## Variante 2 : Doji Star (bougie 2 doit AUSSI être un vrai doji - corps ≤ 10% de sa propre amplitude)

Version plus stricte - filtre la variante 1 pour ne garder que les vrais doji comme bougie centrale.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 2372 | 24.2% | 0.83 | -0.14 | 319 | 26.3% | 1.02 | 0.02 | ⚠️ affaibli |
| US500 | 2836 | 25.8% | 0.89 | -0.09 | 384 | 27.1% | 1.02 | 0.02 | ⚠️ affaibli |
| XAUUSD | 2188 | 25.6% | 0.83 | -0.14 | 354 | 26.4% | 0.96 | -0.04 | ❌ ne tient pas |
| EURUSD | 1152 | 23.6% | 0.76 | -0.22 | 413 | 22.0% | 0.68 | -0.30 | ❌ ne tient pas |
| GBPUSD | 916 | 24.9% | 0.82 | -0.16 | 358 | 25.1% | 0.80 | -0.18 | ❌ ne tient pas |
| USDJPY | 1532 | 25.1% | 0.82 | -0.16 | 429 | 21.5% | 0.70 | -0.26 | ❌ ne tient pas |
| USDCAD | 2360 | 23.6% | 0.75 | -0.23 | 336 | 28.9% | 0.94 | -0.05 | ❌ ne tient pas |
| GER40 | 1782 | 26.6% | 1.02 | 0.02 | 377 | 30.0% | 1.23 | 0.17 | ✅ tient |
| UKX | 1034 | 26.8% | 0.94 | -0.05 | 345 | 26.4% | 0.91 | -0.08 | ❌ ne tient pas |
| AUX | 883 | 25.3% | 0.86 | -0.12 | 356 | 25.6% | 0.89 | -0.09 | ❌ ne tient pas |
