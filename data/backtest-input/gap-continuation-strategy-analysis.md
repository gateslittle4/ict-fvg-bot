# Stratégie exploratoire #15 : "Gap and Go" (continuation de gap, opposé de NWOG/NDOG)

⚠ Idée proposée à la demande explicite d'Esdras ("tu pourrais pas inventer une stratégie novatrice ?") après une longue série de concepts publiés testés/rejetés. Pas une invention arbitraire : c'est l'exact opposé d'un mécanisme DÉJÀ testé dans ce projet (NWOG/NDOG parient sur le COMBLEMENT du gap ; ceci parie sur sa CONTINUATION), un vrai concept cité dans la littérature générale de trading d'indices ("gap and go"), jamais essayé ici malgré le sens inverse déjà testé deux fois. Mêmes seuils de détection de gap que NWOG/NDOG (pas re-choisis), entrée une bougie après le gap, stop au-delà de l'extrême de la bougie de gap (côté adapté au nouveau sens), cible fixe 1:3, timeout 480 bougies M15. Testé aux deux échelles (quotidien et hebdomadaire) sur les 6 instruments. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

## Échelle : Quotidien (1-3h)

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 983 | 26.9% | 0.94 | -0.05 | 300 | 28.7% | 1.03 | 0.03 | ⚠️ affaibli |
| US500 | 793 | 25.7% | 0.86 | -0.12 | 271 | 31.7% | 1.16 | 0.13 | ⚠️ affaibli |
| XAUUSD | 485 | 26.2% | 0.84 | -0.14 | 215 | 26.0% | 0.87 | -0.11 | ❌ ne tient pas |
| EURUSD | 230 | 29.6% | 1.00 | -0.00 | 2 | 50.0% | 2.18 | 0.77 | ❓ pas assez de trades |
| GBPUSD | 188 | 23.9% | 0.75 | -0.23 | 1 | 100.0% | ∞ | 2.72 | ❓ pas assez de trades |
| USDJPY | 312 | 29.8% | 1.04 | 0.03 | 4 | 0.0% | 0.00 | -1.14 | ❓ pas assez de trades |

## Échelle : Hebdomadaire (20-100h)

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 211 | 29.9% | 1.12 | 0.10 | 92 | 23.9% | 0.85 | -0.13 | ❌ ne tient pas |
| US500 | 190 | 29.5% | 1.07 | 0.06 | 96 | 21.9% | 0.73 | -0.23 | ❌ ne tient pas |
| XAUUSD | 155 | 26.5% | 0.89 | -0.10 | 77 | 35.1% | 1.42 | 0.30 | ⚠️ affaibli |
| EURUSD | 97 | 18.6% | 0.53 | -0.46 | 22 | 18.2% | 0.51 | -0.50 | ❌ ne tient pas |
| GBPUSD | 76 | 21.1% | 0.63 | -0.35 | 16 | 0.0% | 0.00 | -1.24 | ❌ ne tient pas |
| USDJPY | 125 | 25.6% | 0.80 | -0.18 | 38 | 28.9% | 0.98 | -0.02 | ❌ ne tient pas |
