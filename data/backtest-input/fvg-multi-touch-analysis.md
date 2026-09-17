# FVG "multi-contact" vs contact unique (production) — proposition d'Esdras

⚠ Test direct d'une proposition explicite (2026-09-12), après qu'un vrai contact US100 ait raté la fenêtre 10h-11h NY de 90 minutes alors que la zone était loin d'être périmée (23 bougies sur 50 autorisées) : "c'est comme ça que je tradais" - garder une zone encore fraîche active et la prendre au PROCHAIN retour dans la bonne heure, au lieu du contact unique de la production actuelle (fvgEngine.js : un contact rejeté supprime la zone, peu importe son âge). `MultiTouchFvgEngine` (src/backtest/fvgMultiTouch.js) implémente exactement cette alternative - mêmes 3 bougies de détection, même limite de 50 bougies, mêmes critères de filtre (biais/structure/session/sweep, mêmes fonctions que la production), seul le fait qu'un contact raté ne supprime plus la zone change. Comparé à la référence DÉJÀ VALIDÉE (contact unique, config production exacte, zéro paramètre retouché) sur les 3 instruments réellement tradés (US100, US500, XAUUSD). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs dans ce projet.

| Symbole | Mécanisme | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|
| US100 | contact unique (production) | 493 | 0.45 | 111 | 0.83 | ✅ tient |
| US100 | **multi-contact (proposition)** | 969 | 0.77 | 229 | 1.11 | ✅ tient |
| US500 | contact unique (production) | 152 | 0.71 | 31 | 1.29 | ✅ tient |
| US500 | **multi-contact (proposition)** | 348 | 0.80 | 85 | 0.67 | ✅ tient |
| XAUUSD | contact unique (production) | 488 | 0.17 | 76 | 0.46 | ✅ tient |
| XAUUSD | **multi-contact (proposition)** | 1025 | 0.07 | 134 | 0.40 | ✅ tient |