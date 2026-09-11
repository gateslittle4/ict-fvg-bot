# Stratégie exploratoire #16 : Divergence Momentum (opposé de la Divergence de production)

⚠ Idée proposée à la demande explicite d'Esdras ("on continue à chercher d'autres idées comme ça" — inversions de mécanismes déjà testés). La Divergence de production (validée, en direct sur US100/US500) achète TOUJOURS le retardataire (laggard), pariant sur la convergence de l'écart de log-prix. Ceci parie l'inverse : achète le LEADER (celui qui vient de prendre l'avance), pariant sur la CONTINUATION de l'écart (momentum) plutôt que sa convergence. Même déclencheur (z-score du log-ratio, seuil 2, lookback 100), même entrée (bougie suivante), même stop (1.5×ATR), même cible 1:3, même timeout 480 bougies M15 — seul le choix du symbole (leader au lieu de laggard) change. Testé sur US100/US500 (la paire réellement validée/live) et EURUSD/GBPUSD (même comparaison déjà faite pour la version convergence). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Paire | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict (règle mécanique) |
|---|---|---|---|---|---|---|---|---|---|
| US100/US500 | 540 | 28.1% | 1.14 | 0.10 | 217 | 27.1% | 1.11 | 0.08 | ✅ tient (voir mise en garde ci-dessous) |
| EURUSD/GBPUSD | 615 | 24.3% | 0.90 | -0.08 | 246 | 22.4% | 0.79 | -0.17 | ❌ ne tient pas |

## ⚠️ US100/US500 "tient" mécaniquement, mais c'est très probablement confondu avec la dérive haussière du marché, pas un vrai edge

Cette version est TOUJOURS acheteuse (même convention que la Divergence de production), sur des instruments en tendance haussière marquée sur toute la période testée. Vérifié avant de considérer ce résultat comme valide : un test de référence "toujours acheteur, entrée à intervalle fixe arbitraire (aucun signal de divergence), même stop 1.5×ATR, même cible 1:3, même timeout" donne une espérance quasiment IDENTIQUE :

| Symbole | Référence "achat arbitraire" train | Référence "achat arbitraire" test |
|---|---|---|
| US100 | n=2096, +0.09R | n=835, +0.11R |
| US500 | n=2144, +0.11R | n=808, +0.05R |

**Même ordre de grandeur que les +0.10R/+0.08R du signal "Divergence Momentum" ci-dessus** — le déclencheur de divergence n'ajoute donc aucun pouvoir sélectif réel ici, le "edge" observé est presque entièrement une dérive haussière générale du marché captée par n'importe quelle entrée longue avec cette structure de stop/cible/timeout, pas un signal spécifique à la divergence. À comparer avec la Divergence de production elle-même (espérance validée 0.7-2R) : un ordre de grandeur trop élevé pour s'expliquer par la seule dérive — donc ce contrôle NE remet PAS en cause la Divergence de production, seulement cette version miroir.

**Conclusion révisée : rejeté en pratique, malgré le "✅ tient" mécanique.** Ne pas activer.