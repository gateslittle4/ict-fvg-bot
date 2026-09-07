# Stratégie exploratoire non-ICT #2 : Opening Range Breakout (ORB), intraday

⚠ Choisie spécifiquement pour être COMPATIBLE avec le netting strict (contrairement à Turtle, qui bloquait Divergence ~46% du temps à cause de positions tenues des semaines - voir three-strategy-two-pairs-account-impact.md). Range = haut/bas des 30 premières minutes après l'ouverture NY (09h30-10h00, différent du Silver Bullet 10h-11h du FVG). Cassure surveillée de 10h00 à 15h45, stop = côté opposé du range, cible 1:3, clôture forcée à 16h00 (heure NY) si ni stop ni cible atteints - une vraie position intraday, quelques heures maximum. Un seul trade par jour par instrument. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. Deux variantes testées : brute, et avec un filtre de tendance standard (achat seulement si la clôture de la veille est au-dessus de l'EMA50 quotidienne, vente seulement si en-dessous) - un raffinement classique de manuel, décidé AVANT de regarder les résultats test, pas ajusté après coup comme l'exclusion du vendredi rejetée plus tôt dans ce projet.

| Symbole | Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | brut (sans filtre) | 1220 | 37.8% | 1.07 | 0.04 | 515 | 36.5% | 1.01 | 0.01 | ⚠️ affaibli |
| US100 | + filtre tendance (EMA50 quotidien) | 943 | 37.8% | 1.03 | 0.02 | 401 | 37.4% | 1.03 | 0.02 | ✅ tient |
| US500 | brut (sans filtre) | 1228 | 35.3% | 0.99 | -0.00 | 515 | 32.6% | 0.83 | -0.11 | ❌ ne tient pas |
| US500 | + filtre tendance (EMA50 quotidien) | 966 | 36.7% | 1.03 | 0.02 | 424 | 32.5% | 0.77 | -0.15 | ❌ ne tient pas |