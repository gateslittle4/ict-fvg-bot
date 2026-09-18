# Stratégie exploratoire quantitative : VWAP ancré (mean-reversion, bandes 2σ)

⚠ Concept quantitatif publié, jamais testé jusqu'ici dans ce projet. **Limite de données à noter** : les CSV de ce projet n'ont AUCUNE colonne de volume — l'amplitude (high-low) de chaque bougie sert de substitut de pondération (proxy d'activité), donc ceci calcule une moyenne pondérée par l'amplitude, appelée "VWAP" seulement parce que c'est le nom publié du mécanisme testé. Ancrage réinitialisé à chaque nouveau jour calendaire NY. Signal = première clôture confirmée au-delà de la bande ±2σ, fade vers la moyenne courante (cible = le niveau de VWAP au moment du signal, pas un multiple R:R synthétique — même convention que le Midnight Open). Entrée une bougie après le signal, stop au-delà de l'extrême de cette bougie, minimum 4 bougies dans la journée avant qu'un signal soit valide. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 1739 | 31.6% | 1.48 | 0.38 | 671 | 30.8% | 2.00 | 0.79 | ✅ tient |
| US500 | 1341 | 30.4% | 1.10 | 0.09 | 385 | 33.2% | 1.60 | 0.48 | ✅ tient |
| XAUUSD | 641 | 32.1% | 0.93 | -0.06 | 278 | 28.8% | 1.04 | 0.04 | ⚠️ affaibli |
| EURUSD | 208 | 33.2% | 1.01 | 0.01 | 59 | 40.7% | 1.40 | 0.29 | ✅ tient |
| GBPUSD | 219 | 35.2% | 1.01 | 0.01 | 45 | 33.3% | 0.99 | -0.01 | ❌ ne tient pas |
| USDJPY | 511 | 31.9% | 0.99 | -0.01 | 215 | 39.5% | 1.36 | 0.27 | ⚠️ affaibli |
| USDCAD | 279 | 30.8% | 0.87 | -0.11 | 23 | 39.1% | 1.16 | 0.12 | ⚠️ affaibli |
| GER40 | 3459 | 31.0% | 1.57 | 0.45 | 673 | 33.6% | 1.91 | 0.69 | ✅ tient |
| UKX | 466 | 33.7% | 0.98 | -0.02 | 136 | 34.6% | 1.05 | 0.04 | ⚠️ affaibli |
| AUX | 453 | 32.7% | 0.99 | -0.01 | 182 | 37.4% | 1.09 | 0.07 | ⚠️ affaibli |