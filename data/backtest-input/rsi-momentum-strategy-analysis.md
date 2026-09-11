# Stratégie exploratoire non-ICT #4 : RSI(2) Momentum (opposé de Connors, déjà validé)

⚠ Idée proposée à la demande explicite d'Esdras ("on continue à chercher d'autres idées comme ça"). RSI(2) Connors (déjà validé sur US100/US500) achète le SURVENDU en tendance haussière, pariant sur un rebond vers la moyenne. Ceci achète le SURACHETÉ en tendance haussière à la place, pariant sur la continuation de la force plutôt que son retour à la moyenne (et le miroir en tendance baissière : vend le SURVENDU au lieu du SURACHETÉ). Même filtre de tendance (EMA200), même RSI(2), même stop 2xATR(14), même plafond de détention (10 jours, repris de Connors) — seule la cible change : 1:3 fixe (convention déjà utilisée par les stratégies momentum/cassure de ce projet — ORB, Asian Range Breakout) au lieu de la cible de retour à la SMA(5) de Connors, qui n'aurait aucun sens pour un pari de continuation. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict (règle mécanique) |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 121 | 0.0% | 1.13 | 0.05 | 38 | 7.1% | 1.33 | 0.12 | ✅ tient (voir mise en garde) |
| US500 | 127 | 2.0% | 1.02 | 0.01 | 35 | 7.7% | 1.31 | 0.13 | ✅ tient (voir mise en garde) |
| GBPUSD | 123 | 9.1% | 1.08 | 0.03 | 39 | 0.0% | 0.83 | -0.08 | ❌ ne tient pas |
| USDJPY | 204 | 6.5% | 1.05 | 0.02 | 40 | 0.0% | 0.58 | -0.19 | ❌ ne tient pas |

## ⚠️ US100/US500 "tient" mécaniquement, mais taux de gain quasi nul (0-8%) et confondu avec la simple tendance — même piège que Divergence Momentum

Signal d'alerte immédiat : le taux de gain réel (cible 1:3 atteinte) est de **0% sur US100 (0/121 trades train) et 2% sur US500** — la quasi-totalité des trades sortent en TIMEOUT (10 jours), pas en touchant la cible. Vérifié : `wins=0, losses=45, timeouts=76` (US100 train), R moyen des timeouts = +0.68 — la cible 1:3 n'est presque jamais atteinte, mais la sortie à 10 jours est modérément positive parce que le prix a globalement dérivé dans le bon sens sur la période.

**Test de référence construit (même piège que Divergence Momentum plus haut)** : "trade AVEC la tendance EMA200 à intervalle fixe arbitraire (aucun RSI du tout), même stop 2×ATR/cible 1:3/timeout 10 jours" → US100 train +0,078R (n=144) / test **+0,212R** (n=42) ; US500 train +0,091R (n=142) / test **+0,245R** (n=42). **Même ordre de grandeur, voire supérieur, à ce que "RSI(2) Momentum" obtient** — le déclencheur RSI extrême n'ajoute donc aucun pouvoir sélectif réel au-delà du simple fait de trader dans le sens de la tendance ; c'est la dérive de tendance qui porte tout, pas le timing RSI.

**Conclusion révisée : rejeté en pratique, malgré le "✅ tient" mécanique.** Ne pas activer. (Ce contrôle ne remet pas en cause la validation initiale de Connors — sélection et règle de sortie différentes, taux de gain documenté bien plus élevé — juste cette inversion momentum.)