# Stratégie exploratoire ICT : CBDR (Central Bank Dealer Range, fade à la projection 2x)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. CBDR = range 14:00-20:00 NY, sa hauteur est traitée comme 1 écart-type. Fade déclenché quand un prix ultérieur atteint la projection 2x (haut du range + 2×hauteur, ou bas du range − 2×hauteur) — niveau que la littérature ICT cite comme la zone naturelle de premier retournement. Entrée une bougie après le toucher, stop au-delà de l'extrême de cette bougie, cible fixe 1:3, timeout 480 bougies M15. Filtre "hauteur idéale 20-40 pips" de la littérature ICT délibérément PAS appliqué (concept forex, ne se traduit pas proprement sur les indices). Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 694 | 30.7% | 1.14 | 0.11 | 166 | 31.3% | 1.24 | 0.18 | ✅ tient |
| US500 | 624 | 27.0% | 0.91 | -0.08 | 123 | 35.0% | 1.40 | 0.28 | ⚠️ affaibli |
| XAUUSD | 1035 | 27.5% | 0.93 | -0.06 | 211 | 35.1% | 1.37 | 0.27 | ⚠️ affaibli |
| EURUSD | 457 | 30.3% | 1.05 | 0.04 | 139 | 32.1% | 1.17 | 0.13 | ✅ tient |
| GBPUSD | 392 | 30.2% | 1.04 | 0.04 | 102 | 32.4% | 1.14 | 0.11 | ✅ tient |
| USDJPY | 471 | 27.2% | 0.90 | -0.08 | 156 | 30.7% | 1.16 | 0.12 | ⚠️ affaibli |
| USDCAD | 672 | 29.6% | 1.01 | 0.01 | 57 | 19.6% | 0.58 | -0.40 | ❌ ne tient pas |
| GER40 | 1447 | 29.7% | 1.14 | 0.10 | 279 | 32.0% | 1.29 | 0.21 | ✅ tient |
| UKX | 404 | 28.5% | 0.97 | -0.02 | 145 | 21.4% | 0.67 | -0.30 | ❌ ne tient pas |
| AUX | 222 | 26.6% | 0.87 | -0.11 | 69 | 26.1% | 0.86 | -0.12 | ❌ ne tient pas |