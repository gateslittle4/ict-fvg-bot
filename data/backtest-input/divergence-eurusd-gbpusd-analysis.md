# Stratégie exploratoire : divergence EURUSD / GBPUSD (achat du "retardataire")

⚠ Même méthode EXACTE que la stratégie Divergence déjà validée sur US100/US500 (voir divergence-strategy-analysis.md) - même grille de lookback/seuil, même stop 1.5xATR(14), même cible 1:3, même timeout 120 bougies H1 - appliquée telle quelle à une nouvelle paire, sans aucun paramètre réajusté sur les données EURUSD/GBPUSD elles-mêmes (pas de data-snooping). Bougies H1, z-score du log-ratio sur fenêtre glissante (jamais la bougie courante), entrée déclenchée au premier franchissement du seuil, achat du RETARDATAIRE, remplissage à l'ouverture de la bougie SUIVANTE. Écran TRAIN (2019-2023) / vérification TEST (2024-2025).

Corrélation EURUSD/GBPUSD sur rendements H1 (recalculée ici) : 0.685 — nettement plus faible que le 0.935 de US100/US500 : les deux paires partagent le dollar mais pas la même paire de base, donc un décrochage est un événement moins rare a priori. Ce test répond directement à la question, plutôt que de la supposer.

| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| lookback 20, seuil 1.5 | 1228 | 25.4% | 0.95 | -0.04 | 496 | 28.5% | 1.10 | 0.08 | ⚠️ affaibli |
| lookback 20, seuil 2 | 1187 | 25.7% | 0.97 | -0.02 | 449 | 28.0% | 1.08 | 0.06 | ⚠️ affaibli |
| lookback 20, seuil 2.5 | 1071 | 23.8% | 0.87 | -0.11 | 417 | 26.7% | 1.00 | -0.00 | ❌ ne tient pas |
| lookback 50, seuil 1.5 | 981 | 24.3% | 0.91 | -0.08 | 420 | 26.9% | 1.02 | 0.01 | ⚠️ affaibli |
| lookback 50, seuil 2 | 794 | 25.1% | 0.94 | -0.05 | 342 | 25.9% | 0.96 | -0.03 | ❌ ne tient pas |
| lookback 50, seuil 2.5 | 586 | 25.0% | 0.93 | -0.05 | 225 | 27.8% | 1.07 | 0.05 | ⚠️ affaibli |
| lookback 100, seuil 1.5 | 744 | 26.2% | 0.99 | -0.01 | 335 | 28.0% | 1.08 | 0.06 | ⚠️ affaibli |
| lookback 100, seuil 2 | 589 | 23.0% | 0.84 | -0.13 | 245 | 26.7% | 1.02 | 0.01 | ⚠️ affaibli |
| lookback 100, seuil 2.5 | 357 | 20.6% | 0.73 | -0.22 | 153 | 27.6% | 1.06 | 0.05 | ⚠️ affaibli |