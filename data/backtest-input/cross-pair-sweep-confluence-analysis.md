# Confluence de liquidity sweep CROISÉE entre US100/US500 (idée utilisateur) + double confirmation

⚠ Trois versions comparées pour chaque instrument : (1) le filtre déjà validé, sweep exigé sur le MÊME instrument que le FVG ; (2) l'idée testée au tour précédent, sweep exigé sur le PARTENAIRE (US100<->US500) à la place ; (3) NOUVEAU - double confirmation, sweep exigé SUR LES DEUX à la fois (ET logique, pas OU) - un fait un balayage de stops sur un swing high/low, l'autre AUSSI, et le FVG retrace sur celui qu'on trade. Même config FVG déjà validée par instrument, même lookback de swing (5) et même fenêtre de fraîcheur du sweep (10 bougies M15, ~2h30) déjà utilisés par le filtre existant - seule la SOURCE (ou les sources) des événements de sweep changent. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Version | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | même instrument (US100, déjà validé) | 166 | 42.2% | 1.89 | 0.57 | 39 | 46.2% | 2.41 | 0.79 | ✅ tient |
| US100 | partenaire (US500) seul | 148 | 31.8% | 1.22 | 0.17 | 37 | 37.8% | 1.72 | 0.46 | ✅ tient |
| US100 | double confirmation (US100 ET US500) | 89 | 38.2% | 1.65 | 0.44 | 25 | 48.0% | 2.62 | 0.87 | ✅ tient |
| US500 | même instrument (US500, déjà validé) | 153 | 36.2% | 1.46 | 0.33 | 31 | 44.8% | 2.44 | 0.80 | ✅ tient |
| US500 | partenaire (US100) seul | 223 | 38.3% | 1.59 | 0.41 | 43 | 36.6% | 1.68 | 0.45 | ✅ tient |
| US500 | double confirmation (US500 ET US100) | 101 | 38.0% | 1.61 | 0.42 | 26 | 41.7% | 2.21 | 0.70 | ✅ tient |