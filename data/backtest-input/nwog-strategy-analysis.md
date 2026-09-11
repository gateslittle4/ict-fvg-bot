# Stratégie exploratoire ICT #10 : NWOG (New Week Opening Gap, pari sur le comblement)

⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Gap détecté directement depuis les horodatages réels des données (aucune heure de session codée en dur) — vérifié empiriquement que les vrais gaps de week-end de ce projet se regroupent entre ~24h et ~80h, un seul point aberrant (~1 an, XAUUSD, qualité de donnée) exclu par la borne haute. Direction = pari sur le comblement (gap haussier → trade baissier, et inversement). Entrée une bougie après la bougie de gap, stop au-delà de l'extrême de cette même bougie, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris le garde-fou "pas assez de trades").

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 224 | 31.3% | 1.20 | 0.15 | 90 | 35.6% | 1.49 | 0.34 | ✅ tient |
| US500 | 202 | 29.7% | 1.09 | 0.07 | 83 | 34.9% | 1.39 | 0.28 | ✅ tient |
| XAUUSD | 144 | 26.4% | 0.89 | -0.09 | 93 | 24.7% | 0.87 | -0.11 | ❌ ne tient pas |
| EURUSD | 163 | 27.6% | 0.90 | -0.08 | 51 | 29.4% | 0.98 | -0.02 | ❌ ne tient pas |
| GBPUSD | 144 | 29.9% | 1.01 | 0.01 | 61 | 34.4% | 1.24 | 0.18 | ✅ tient |
| USDJPY | 228 | 28.9% | 0.98 | -0.01 | 68 | 41.2% | 1.72 | 0.49 | ⚠️ affaibli |