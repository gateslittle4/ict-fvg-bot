# Confluence de liquidity sweep CROISÉE entre US100/US500 (idée utilisateur) + double confirmation

⚠ Trois versions comparées pour chaque instrument : (1) le filtre déjà validé, sweep exigé sur le MÊME instrument que le FVG ; (2) l'idée testée au tour précédent, sweep exigé sur le PARTENAIRE (US100<->US500) à la place ; (3) NOUVEAU - double confirmation, sweep exigé SUR LES DEUX à la fois (ET logique, pas OU) - un fait un balayage de stops sur un swing high/low, l'autre AUSSI, et le FVG retrace sur celui qu'on trade. Même config FVG déjà validée par instrument, même lookback de swing (5) et même fenêtre de fraîcheur du sweep (10 bougies M15, ~2h30) déjà utilisés par le filtre existant - seule la SOURCE (ou les sources) des événements de sweep changent. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Version | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | même instrument (US100, déjà validé) | 68 | 47.1% | 2.37 | 0.79 | 38 | 44.7% | 2.19 | 0.70 | ✅ tient |
| US100 | partenaire (US500) seul | 68 | 35.3% | 1.48 | 0.33 | 37 | 37.8% | 1.65 | 0.43 | ✅ tient |
| US100 | double confirmation (US100 ET US500) | 41 | 41.5% | 1.92 | 0.58 | 25 | 48.0% | 2.52 | 0.84 | ✅ tient |
| US500 | même instrument (US500, déjà validé) | 71 | 43.7% | 1.99 | 0.63 | 30 | 42.9% | 2.16 | 0.70 | ✅ tient |
| US500 | partenaire (US100) seul | 99 | 42.4% | 1.89 | 0.58 | 39 | 37.8% | 1.74 | 0.48 | ✅ tient |
| US500 | double confirmation (US500 ET US100) | 52 | 42.3% | 1.90 | 0.58 | 25 | 39.1% | 1.93 | 0.58 | ✅ tient |