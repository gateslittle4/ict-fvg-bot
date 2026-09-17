# Stratégie exploratoire #15 : "Gap and Go" (continuation de gap, opposé de NWOG/NDOG)

⚠ Idée proposée à la demande explicite d'Esdras ("tu pourrais pas inventer une stratégie novatrice ?") après une longue série de concepts publiés testés/rejetés. Pas une invention arbitraire : c'est l'exact opposé d'un mécanisme DÉJÀ testé dans ce projet (NWOG/NDOG parient sur le COMBLEMENT du gap ; ceci parie sur sa CONTINUATION), un vrai concept cité dans la littérature générale de trading d'indices ("gap and go"), jamais essayé ici malgré le sens inverse déjà testé deux fois. Mêmes seuils de détection de gap que NWOG/NDOG (pas re-choisis), entrée une bougie après le gap, stop au-delà de l'extrême de la bougie de gap (côté adapté au nouveau sens), cible fixe 1:3, timeout 480 bougies M15. Testé aux deux échelles (quotidien et hebdomadaire) sur les 6 instruments. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

## Échelle : Quotidien (1-3h)

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1446 | 26.9% | 0.96 | -0.04 | 339 | 29.5% | 1.11 | 0.09 | ⚠️ affaibli |
| US500 | 1325 | 25.5% | 0.85 | -0.13 | 314 | 33.8% | 1.32 | 0.24 | ⚠️ affaibli |
| XAUUSD | 662 | 23.9% | 0.74 | -0.24 | 215 | 26.0% | 0.87 | -0.11 | ❌ ne tient pas |
| EURUSD | 214 | 30.8% | 1.05 | 0.04 | 1 | 100.0% | ∞ | 2.82 | ❓ pas assez de trades |
| GBPUSD | 188 | 23.9% | 0.75 | -0.23 | 1 | 100.0% | ∞ | 2.72 | ❓ pas assez de trades |
| USDJPY | 312 | 29.8% | 1.04 | 0.03 | 4 | 0.0% | 0.00 | -1.14 | ❓ pas assez de trades |
| USDCAD | 178 | 27.5% | 0.89 | -0.10 | 1 | 0.0% | 0.00 | -1.24 | ❓ pas assez de trades |
| GER40 | 480 | 29.6% | 1.08 | 0.06 | 335 | 24.8% | 0.86 | -0.12 | ❌ ne tient pas |
| UKX | 685 | 21.5% | 0.65 | -0.33 | 184 | 17.4% | 0.49 | -0.50 | ❌ ne tient pas |
| AUX | 816 | 31.4% | 1.13 | 0.10 | 316 | 28.2% | 0.99 | -0.01 | ❌ ne tient pas |

## Échelle : Hebdomadaire (20-100h)

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 423 | 27.9% | 1.00 | 0.00 | 98 | 22.4% | 0.80 | -0.16 | ❌ ne tient pas |
| US500 | 428 | 30.0% | 1.08 | 0.06 | 100 | 23.0% | 0.81 | -0.15 | ❌ ne tient pas |
| XAUUSD | 374 | 28.2% | 0.95 | -0.04 | 77 | 35.1% | 1.42 | 0.30 | ⚠️ affaibli |
| EURUSD | 87 | 18.4% | 0.52 | -0.48 | 22 | 18.2% | 0.49 | -0.52 | ❌ ne tient pas |
| GBPUSD | 76 | 21.1% | 0.63 | -0.35 | 16 | 0.0% | 0.00 | -1.24 | ❌ ne tient pas |
| USDJPY | 125 | 25.6% | 0.80 | -0.18 | 38 | 28.9% | 0.98 | -0.02 | ❌ ne tient pas |
| USDCAD | 140 | 19.3% | 0.55 | -0.44 | 24 | 12.5% | 0.33 | -0.70 | ❌ ne tient pas |
| GER40 | 515 | 31.5% | 1.23 | 0.17 | 96 | 20.8% | 0.72 | -0.24 | ❌ ne tient pas |
| UKX | 162 | 25.3% | 0.83 | -0.14 | 52 | 15.4% | 0.43 | -0.56 | ❌ ne tient pas |
| AUX | 194 | 33.0% | 1.26 | 0.20 | 74 | 25.7% | 0.88 | -0.10 | ❌ ne tient pas |
