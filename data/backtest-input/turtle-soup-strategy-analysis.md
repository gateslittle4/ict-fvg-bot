# Stratégie exploratoire ICT/Raschke : Turtle Soup (fausse cassure du canal 20 jours)

⚠ Proche conceptuellement du filtre `liquiditySweepEnabled` déjà utilisé comme CONFLUENCE pour le FVG - testée seule ici pour voir si elle ajoute une vraie valeur indépendante ou si elle re-détecte juste les mêmes moments. Bougies journalières. Signal = plus bas (ou plus haut) sur 20 jours cassé puis clôture qui revient à l'intérieur du canal (fausse cassure). Entrée à l'ouverture du jour SUIVANT, stop = extrême du jour de la fausse cassure, cible 1:3, 10 jours max. Paramètres ORIGINAUX (Raschke/Turtle, canal 20 jours), pas ajustés sur nos données. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 183 | 25.1% | 0.83 | -0.13 | 69 | 21.7% | 0.75 | -0.19 | ❌ ne tient pas |
| US500 | 197 | 24.9% | 0.83 | -0.13 | 81 | 23.5% | 0.81 | -0.14 | ❌ ne tient pas |