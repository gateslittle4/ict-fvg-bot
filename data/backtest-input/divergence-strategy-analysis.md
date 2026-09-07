# Stratégie exploratoire : divergence US100 / US500 (achat du "retardataire")

⚠ Edge complètement différent du FVG - pas un filtre dessus, un signal indépendant basé sur l'écart relatif entre les deux indices. Bougies H1, z-score du log-ratio sur fenêtre glissante (jamais la bougie courante), entrée déclenchée au premier franchissement du seuil, achat du RETARDATAIRE (pari de rattrapage), stop 1.5x ATR(14), cible 1:3 (même convention que le FVG), remplissage à l'ouverture de la bougie SUIVANTE. Écran TRAIN (2019-2023) / vérification TEST (2024-2025).

Corrélation US100/US500 sur rendements H1 (recalculée ici) : 0.935 — confirme que les deux bougent quasiment ensemble, donc un vrai décrochage est un événement rare, pas du bruit permanent.

| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| lookback 20, seuil 1.5 | 1206 | 29.0% | 1.19 | 0.14 | 504 | 29.8% | 1.24 | 0.17 | ✅ tient |
| lookback 20, seuil 2 | 1132 | 29.3% | 1.20 | 0.15 | 470 | 32.1% | 1.38 | 0.26 | ✅ tient |
| lookback 20, seuil 2.5 | 985 | 30.1% | 1.25 | 0.18 | 418 | 30.8% | 1.31 | 0.22 | ✅ tient |
| lookback 50, seuil 1.5 | 861 | 27.5% | 1.12 | 0.09 | 377 | 31.6% | 1.36 | 0.25 | ✅ tient |
| lookback 50, seuil 2 | 701 | 29.4% | 1.21 | 0.15 | 295 | 28.8% | 1.21 | 0.15 | ✅ tient |
| lookback 50, seuil 2.5 | 527 | 28.3% | 1.15 | 0.11 | 217 | 29.4% | 1.25 | 0.18 | ✅ tient |
| lookback 100, seuil 1.5 | 642 | 27.7% | 1.12 | 0.09 | 280 | 29.9% | 1.26 | 0.18 | ✅ tient |
| lookback 100, seuil 2 | 519 | 31.8% | 1.37 | 0.26 | 209 | 29.8% | 1.25 | 0.18 | ✅ tient |
| lookback 100, seuil 2.5 | 307 | 30.3% | 1.26 | 0.19 | 141 | 30.9% | 1.35 | 0.24 | ✅ tient |