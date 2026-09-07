# Exclusion calendaire : jours fériés, NFP, FOMC, CPI, lundi/vendredi

⚠ Même config FVG déjà validée par instrument (variant/stopMode/structure/session/sweep inchangés) - on ajoute juste un filtre supplémentaire qui bloque les entrées certains jours précis, décidés AVANT de lancer ce script à partir de calendriers publics indépendants de nos données : jours fériés NYSE 2019-2025 (+ 2 demi-journées connues), dates de décision FOMC (site de la Fed), dates de publication du CPI (site du BLS), et jours NFP (1er vendredi du mois, calculé, pas une liste externe). Lundi/vendredi testés à la demande de l'utilisateur, décidé à l'avance - pas choisi après coup en fonction de ce qui a l'air mauvais cette fois-ci. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | Aucune exclusion (déjà validé) | 68 | 47.1% | 2.37 | 0.79 | 38 | 44.7% | 2.19 | 0.70 | ✅ tient |
| US100 | Sans lundi | 62 | 50.0% | 2.65 | 0.91 | 27 | 44.4% | 2.18 | 0.70 | ✅ tient |
| US100 | Sans vendredi | 49 | 44.9% | 2.19 | 0.71 | 27 | 44.4% | 2.12 | 0.68 | ✅ tient |
| US100 | Sans lundi ni vendredi | 43 | 48.8% | 2.55 | 0.86 | 16 | 43.8% | 2.07 | 0.65 | ✅ tient |
| US100 | Sans jours fériés US (+ 2 demi-journées) | 66 | 48.5% | 2.51 | 0.85 | 36 | 47.2% | 2.43 | 0.80 | ✅ tient |
| US100 | Sans jours NFP (1er vendredi du mois) | 59 | 40.7% | 1.82 | 0.53 | 33 | 45.5% | 2.24 | 0.73 | ✅ tient |
| US100 | Sans jours FOMC | 64 | 46.9% | 2.37 | 0.79 | 37 | 43.2% | 2.07 | 0.65 | ✅ tient |
| US100 | Sans jours CPI | 62 | 48.4% | 2.48 | 0.84 | 36 | 44.4% | 2.16 | 0.69 | ✅ tient |
| US100 | Tout combiné (fériés+NFP+FOMC+CPI+lundi+vendredi) | 31 | 54.8% | 3.19 | 1.09 | 13 | 38.5% | 1.67 | 0.45 | ✅ tient |
| US500 | Aucune exclusion (déjà validé) | 71 | 43.7% | 1.99 | 0.63 | 30 | 42.9% | 2.16 | 0.70 | ✅ tient |
| US500 | Sans lundi | 63 | 47.6% | 2.36 | 0.79 | 24 | 50.0% | 2.90 | 0.98 | ✅ tient |
| US500 | Sans vendredi | 57 | 45.6% | 2.14 | 0.70 | 22 | 55.0% | 3.54 | 1.18 | ✅ tient |
| US500 | Sans lundi ni vendredi | 49 | 51.0% | 2.69 | 0.93 | 16 | 71.4% | 7.30 | 1.79 | ✅ tient |
| US500 | Sans jours fériés US (+ 2 demi-journées) | 71 | 43.7% | 1.99 | 0.63 | 29 | 44.4% | 2.30 | 0.76 | ✅ tient |
| US500 | Sans jours NFP (1er vendredi du mois) | 65 | 41.5% | 1.82 | 0.54 | 25 | 52.2% | 3.17 | 1.07 | ✅ tient |
| US500 | Sans jours FOMC | 67 | 41.8% | 1.84 | 0.55 | 29 | 44.4% | 2.30 | 0.76 | ✅ tient |
| US500 | Sans jours CPI | 64 | 45.3% | 2.10 | 0.68 | 25 | 40.0% | 1.73 | 0.49 | ✅ tient |
| US500 | Tout combiné (fériés+NFP+FOMC+CPI+lundi+vendredi) | 38 | 52.6% | 2.80 | 0.98 | 10 | 80.0% | 10.48 | 2.11 | ✅ tient |
| XAUUSD | Aucune exclusion (déjà validé) | 85 | 44.6% | 2.17 | 0.70 | 42 | 38.1% | 1.74 | 0.48 | ✅ tient |
| XAUUSD | Sans lundi | 75 | 41.1% | 1.90 | 0.57 | 35 | 34.3% | 1.47 | 0.32 | ✅ tient |
| XAUUSD | Sans vendredi | 69 | 46.3% | 2.33 | 0.77 | 36 | 36.1% | 1.61 | 0.40 | ✅ tient |
| XAUUSD | Sans lundi ni vendredi | 59 | 42.1% | 1.99 | 0.61 | 29 | 31.0% | 1.28 | 0.20 | ✅ tient |
| XAUUSD | Sans jours fériés US (+ 2 demi-journées) | 83 | 44.4% | 2.16 | 0.69 | 42 | 38.1% | 1.74 | 0.48 | ✅ tient |
| XAUUSD | Sans jours NFP (1er vendredi du mois) | 82 | 42.5% | 2.00 | 0.62 | 39 | 35.9% | 1.59 | 0.40 | ✅ tient |
| XAUUSD | Sans jours FOMC | 85 | 44.6% | 2.17 | 0.70 | 40 | 37.5% | 1.70 | 0.45 | ✅ tient |
| XAUUSD | Sans jours CPI | 78 | 47.4% | 2.44 | 0.82 | 39 | 38.5% | 1.76 | 0.49 | ✅ tient |
| XAUUSD | Tout combiné (fériés+NFP+FOMC+CPI+lundi+vendredi) | 52 | 46.0% | 2.35 | 0.78 | 24 | 29.2% | 1.17 | 0.12 | ⚠️ affaibli |