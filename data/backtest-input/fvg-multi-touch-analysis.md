# FVG "multi-contact" vs contact unique (production) — proposition d'Esdras

⚠ Test direct d'une proposition explicite (2026-09-12), après qu'un vrai contact US100 ait raté la fenêtre 10h-11h NY de 90 minutes alors que la zone était loin d'être périmée (23 bougies sur 50 autorisées) : "c'est comme ça que je tradais" - garder une zone encore fraîche active et la prendre au PROCHAIN retour dans la bonne heure, au lieu du contact unique de la production actuelle (fvgEngine.js : un contact rejeté supprime la zone, peu importe son âge). `MultiTouchFvgEngine` (src/backtest/fvgMultiTouch.js) implémente exactement cette alternative - mêmes 3 bougies de détection, même limite de 50 bougies, mêmes critères de filtre (biais/structure/session/sweep, mêmes fonctions que la production), seul le fait qu'un contact raté ne supprime plus la zone change. Comparé à la référence DÉJÀ VALIDÉE (contact unique, config production exacte, zéro paramètre retouché) sur les 3 instruments réellement tradés (US100, US500, XAUUSD). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs dans ce projet.

| Symbole | Mécanisme | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|
| US100 | contact unique (production) | 68 | 1.38 | 38 | 1.44 | ✅ tient |
| US100 | **multi-contact (proposition)** | 180 | 1.10 | 93 | 1.40 | ✅ tient |
| US500 | contact unique (production) | 70 | 1.02 | 30 | 1.13 | ✅ tient |
| US500 | **multi-contact (proposition)** | 136 | 0.72 | 73 | 0.60 | ✅ tient |
| XAUUSD | contact unique (production) | 82 | 0.88 | 41 | 0.61 | ✅ tient |
| XAUUSD | **multi-contact (proposition)** | 244 | 0.19 | 104 | 0.22 | ✅ tient |