# Stratégie exploratoire ICT : Midnight Open (rétracement vers l'ouverture 00h NY)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Niveau d'ancrage = ouverture de la bougie M15 00:00 NY (DST-aware). Biais établi à l'ouverture de la killzone Londres (02:00 NY, fenêtre déjà utilisée par Judas Swing) : prix au-dessus de l'ouverture minuit → pari baissier (retour vers ce niveau) ; en dessous → pari haussier. Entrée une bougie après la bougie de biais, stop au-delà de l'extrême de cette même bougie, cible = le niveau d'ouverture minuit lui-même (pas un multiple R:R synthétique — la seule mécanique de ce projet dont la cible est un niveau fixe plutôt qu'un ratio choisi), timeout 480 bougies M15. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 465 | 40.4% | 1.19 | 0.13 | 112 | 28.6% | 0.57 | -0.34 | ❌ ne tient pas |
| US500 | 460 | 44.1% | 1.16 | 0.11 | 98 | 37.8% | 0.87 | -0.10 | ❌ ne tient pas |
| XAUUSD | 318 | 45.3% | 0.70 | -0.20 | 91 | 38.5% | 0.65 | -0.25 | ❌ ne tient pas |
| EURUSD | 183 | 51.9% | 0.69 | -0.18 | 52 | 57.7% | 0.78 | -0.12 | ❌ ne tient pas |
| GBPUSD | 152 | 50.0% | 0.73 | -0.16 | 49 | 53.1% | 0.46 | -0.31 | ❌ ne tient pas |
| USDJPY | 261 | 45.2% | 0.82 | -0.12 | 85 | 34.1% | 0.54 | -0.36 | ❌ ne tient pas |
| USDCAD | 243 | 48.1% | 0.48 | -0.33 | 26 | 57.7% | 0.41 | -0.31 | ❌ ne tient pas |
| GER40 | 126 | 36.5% | 1.04 | 0.02 | 126 | 34.9% | 0.79 | -0.15 | ❌ ne tient pas |
| UKX | 202 | 45.0% | 0.83 | -0.11 | 82 | 53.7% | 0.75 | -0.14 | ❌ ne tient pas |
| AUX | 167 | 41.3% | 0.75 | -0.18 | 63 | 46.0% | 0.55 | -0.31 | ❌ ne tient pas |