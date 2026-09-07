# Stratégie exploratoire non-ICT : breakout Donchian / suivi de tendance ("Turtle Trading")

⚠ Edge complètement différent, mécanique différente (pas de cible 1:3 fixe - sortie sur retournement de canal ou stop initial 2xATR(20), ce qui vient en premier). Bougies journalières (regroupement UTC). Les deux jeux de paramètres testés (20/10 et 55/20 jours) sont les réglages ORIGINAUX publiés du système Turtle des années 1980 - pas ajustés sur nos propres données, pour éviter le piège du data-snooping déjà rencontré dans ce projet (voir l'exclusion du vendredi, rejetée pour la même raison). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. XAUUSD n'a pas de données pour 2022 (zip source jamais fourni).

| Symbole | Système | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| US100 | Turtle System 1 (20j entrée / 10j sortie) | 70 | 47.1% | 1.34 | 0.13 | 26 | 38.5% | 0.98 | -0.01 | ❌ ne tient pas |
| US100 | Turtle System 2 (55j entrée / 20j sortie) | 29 | 44.8% | 1.68 | 0.33 | 10 | 40.0% | 1.70 | 0.42 | ✅ tient |
| US500 | Turtle System 1 (20j entrée / 10j sortie) | 74 | 48.6% | 1.02 | 0.01 | 30 | 33.3% | 0.80 | -0.10 | ❌ ne tient pas |
| US500 | Turtle System 2 (55j entrée / 20j sortie) | 33 | 36.4% | 1.16 | 0.08 | 12 | 41.7% | 1.32 | 0.17 | ✅ tient |
| XAUUSD | Turtle System 1 (20j entrée / 10j sortie) | 66 | 36.4% | 1.22 | 0.10 | 26 | 34.6% | 2.19 | 0.57 | ✅ tient |
| XAUUSD | Turtle System 2 (55j entrée / 20j sortie) | 28 | 28.6% | 1.63 | 0.35 | 7 | 71.4% | 4.35 | 0.96 | ✅ tient |