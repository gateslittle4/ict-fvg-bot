# Stratégie exploratoire non-ICT #3 : retour à la moyenne RSI(2) (Larry Connors)

⚠ Choisie pour combiner ce que Turtle et ORB avaient chacun manqué : un vrai historique documenté (Connors, 2004) ET une durée de position courte (max 10 jours, compatible avec le netting - contrairement à Turtle). Contrairement à la Divergence, c'est un signal sur UN SEUL instrument (RSI extrême + filtre de tendance EMA200), pas une relation entre deux instruments. Bougies journalières. Entrée = RSI(2) < 5 en tendance haussière (EMA200) ou RSI(2) > 95 en tendance baissière, remplissage à l'ouverture du jour SUIVANT. Stop = 2xATR(14). Sortie = clôture qui retraverse la SMA(5) (cible classique de Connors), stop touché, ou 10 jours max. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 176 | 71.0% | 1.52 | 0.12 | 54 | 70.4% | 1.38 | 0.09 | ✅ tient |
| US500 | 181 | 64.6% | 1.29 | 0.07 | 58 | 63.8% | 1.26 | 0.07 | ✅ tient |
| GBPUSD | 171 | 59.1% | 0.96 | -0.01 | 60 | 63.3% | 1.62 | 0.12 | ⚠️ affaibli |