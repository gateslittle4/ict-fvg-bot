# Stratégie exploratoire ICT #10 : NWOG (New Week Opening Gap, pari sur le comblement)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Gap détecté directement depuis les horodatages réels des données (aucune heure de session codée en dur) — vérifié empiriquement que les vrais gaps de week-end de ce projet se regroupent entre ~24h et ~80h, un seul point aberrant (~1 an, XAUUSD, qualité de donnée) exclu par la borne haute. Direction = pari sur le comblement (gap haussier → trade baissier, et inversement). Entrée une bougie après la bougie de gap, stop au-delà de l'extrême de cette même bougie, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 437 | 30.7% | 1.16 | 0.12 | 94 | 36.2% | 1.58 | 0.39 | ✅ tient |
| US500 | 448 | 28.6% | 1.02 | 0.02 | 92 | 35.9% | 1.50 | 0.34 | ✅ tient |
| XAUUSD | 370 | 25.4% | 0.83 | -0.15 | 93 | 24.7% | 0.87 | -0.11 | ❌ ne tient pas |
| EURUSD | 146 | 25.3% | 0.80 | -0.18 | 48 | 27.1% | 0.86 | -0.12 | ❌ ne tient pas |
| GBPUSD | 144 | 29.9% | 1.01 | 0.01 | 61 | 34.4% | 1.24 | 0.18 | ✅ tient |
| USDJPY | 228 | 28.9% | 0.98 | -0.01 | 68 | 41.2% | 1.72 | 0.49 | ⚠️ affaibli |
| USDCAD | 227 | 27.8% | 0.90 | -0.09 | 48 | 33.3% | 1.14 | 0.12 | ⚠️ affaibli |
| GER40 | 518 | 30.9% | 1.19 | 0.14 | 87 | 40.2% | 1.83 | 0.53 | ✅ tient |
| UKX | 201 | 28.4% | 0.98 | -0.01 | 64 | 29.7% | 1.02 | 0.02 | ⚠️ affaibli |
| AUX | 204 | 27.9% | 1.00 | 0.00 | 85 | 32.9% | 1.27 | 0.20 | ✅ tient |