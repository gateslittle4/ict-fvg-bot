# Stratégie exploratoire : divergence US100 / US500 (achat du "retardataire")

⚠ Edge complètement différent du FVG - pas un filtre dessus, un signal indépendant basé sur l'écart relatif entre les deux indices. Bougies H1, z-score du log-ratio sur fenêtre glissante (jamais la bougie courante), entrée déclenchée au premier franchissement du seuil, achat du RETARDATAIRE (pari de rattrapage), stop 1.5x ATR(14), cible 1:3 (même convention que le FVG), remplissage à l'ouverture de la bougie SUIVANTE. Écran TRAIN (2019-2023) / vérification TEST (2024-2025).

Corrélation US100/US500 sur rendements H1 (recalculée ici) : 0.928 — confirme que les deux bougent quasiment ensemble, donc un vrai décrochage est un événement rare, pas du bruit permanent.

| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| lookback 20, seuil 1.5 | 3249 | 28.8% | 1.16 | 0.12 | 504 | 29.8% | 1.26 | 0.18 | ✅ tient |
| lookback 20, seuil 2 | 3052 | 28.7% | 1.15 | 0.11 | 470 | 32.1% | 1.40 | 0.27 | ✅ tient |
| lookback 20, seuil 2.5 | 2739 | 28.8% | 1.16 | 0.11 | 418 | 30.8% | 1.32 | 0.23 | ✅ tient |
| lookback 50, seuil 1.5 | 2453 | 28.2% | 1.13 | 0.10 | 377 | 31.6% | 1.37 | 0.26 | ✅ tient |
| lookback 50, seuil 2 | 1929 | 28.9% | 1.17 | 0.13 | 295 | 28.8% | 1.22 | 0.16 | ✅ tient |
| lookback 50, seuil 2.5 | 1430 | 28.0% | 1.12 | 0.09 | 217 | 29.4% | 1.27 | 0.19 | ✅ tient |
| lookback 100, seuil 1.5 | 1789 | 28.7% | 1.16 | 0.12 | 280 | 29.9% | 1.27 | 0.19 | ✅ tient |
| lookback 100, seuil 2 | 1421 | 29.6% | 1.21 | 0.16 | 209 | 29.8% | 1.26 | 0.19 | ✅ tient |
| lookback 100, seuil 2.5 | 875 | 28.3% | 1.14 | 0.11 | 141 | 30.9% | 1.36 | 0.25 | ✅ tient |