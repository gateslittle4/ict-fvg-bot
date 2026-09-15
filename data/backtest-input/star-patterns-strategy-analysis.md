# Patterns de bougies classiques (non-ICT) : Morning/Evening Star et Doji Star

⚠ Demande explicite d'Esdras ("pour l'or, pourquoi pas des patterns connus? Comme diamant, étoile etc?") - concepts d'analyse technique classique, pas ICT. Définitions textbook (Bulkowski, Investopedia) : Morning Star = bougie 1 baissière, bougie 2 petit corps ("étoile"), bougie 3 haussière qui referme au-delà du milieu du corps de la bougie 1 ; Evening Star = miroir exact. Une adaptation documentée pour des données M15 intrajournalières : l'exigence classique d'un vrai "gap" (rare en intrabougie sur forex/CFD M15) est assouplie en "le corps de la bougie 2 reste majoritairement hors du corps de la bougie 1". Entrée à l'ouverture de la bougie APRÈS la bougie de confirmation, stop au-delà de l'extrême du pattern (3 bougies), cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs dans ce projet). Le pattern "diamant" (sommet/creux) n'a délibérément PAS été testé ici - il demande plusieurs paramètres subjectifs de détection de pics/creux à choisir avant de voir un résultat, contrairement au pattern étoile qui est une simple relation OHLC sur 3 bougies. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades"). Testé sur les 6 instruments disponibles, pas seulement l'or - même discipline que partout ailleurs dans ce projet.

## Variante 1 : Star (corps de la bougie 2 ≤ 30% du corps de la bougie 1)

Version la plus large - n'importe quel petit corps compte comme "étoile".

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1204 | 25.4% | 0.92 | -0.06 | 466 | 26.8% | 1.03 | 0.02 | ⚠️ affaibli |
| US500 | 1417 | 25.4% | 0.89 | -0.09 | 525 | 26.3% | 0.94 | -0.05 | ❌ ne tient pas |
| XAUUSD | 1201 | 27.8% | 0.94 | -0.05 | 516 | 25.3% | 0.90 | -0.08 | ❌ ne tient pas |
| EURUSD | 1689 | 24.9% | 0.82 | -0.15 | 622 | 23.0% | 0.73 | -0.24 | ❌ ne tient pas |
| GBPUSD | 1344 | 26.0% | 0.87 | -0.11 | 527 | 26.0% | 0.84 | -0.14 | ❌ ne tient pas |
| USDJPY | 2212 | 25.4% | 0.84 | -0.14 | 624 | 24.6% | 0.84 | -0.13 | ❌ ne tient pas |

## Variante 2 : Doji Star (bougie 2 doit AUSSI être un vrai doji - corps ≤ 10% de sa propre amplitude)

Version plus stricte - filtre la variante 1 pour ne garder que les vrais doji comme bougie centrale.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 798 | 26.0% | 0.95 | -0.04 | 319 | 26.3% | 0.99 | -0.00 | ❌ ne tient pas |
| US500 | 1028 | 25.6% | 0.90 | -0.09 | 378 | 27.5% | 1.00 | -0.00 | ❌ ne tient pas |
| XAUUSD | 811 | 28.1% | 0.96 | -0.04 | 354 | 26.4% | 0.96 | -0.04 | ❌ ne tient pas |
| EURUSD | 1183 | 23.8% | 0.77 | -0.20 | 435 | 22.1% | 0.69 | -0.29 | ❌ ne tient pas |
| GBPUSD | 916 | 24.9% | 0.82 | -0.16 | 358 | 25.1% | 0.80 | -0.18 | ❌ ne tient pas |
| USDJPY | 1532 | 25.1% | 0.82 | -0.16 | 429 | 21.5% | 0.70 | -0.26 | ❌ ne tient pas |
