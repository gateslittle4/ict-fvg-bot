# Stratégie exploratoire ICT #3 : FVG inversé (IFVG)

⚠ Mêmes zones à 3 bougies que le FvgEngine du projet, mais déclencheur différent : au lieu de trader la zone dans SON sens dès le premier contact (le FVG normal), on attend une clôture qui traverse complètement le bord opposé (invalidation complète, pas juste un contact) puis on trade la CONTINUATION dans l'autre sens - une zone de support cassée devient résistance, et vice-versa. Complémentaire par construction : sur une même zone, soit elle valide (trade FVG normal), soit elle s'invalide (trade IFVG) - jamais les deux. Remplissage à l'ouverture de la bougie SUIVANTE, stop = bord opposé de la zone, cible 1:3, timeout 480 bougies M15 (mêmes conventions que le FVG). Un seul guet et une seule position à la fois. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 4883 | 27.1% | 0.97 | -0.02 | 2118 | 28.5% | 1.07 | 0.06 | ⚠️ affaibli |
| US500 | 4479 | 27.1% | 0.94 | -0.05 | 1864 | 28.8% | 1.02 | 0.02 | ⚠️ affaibli |