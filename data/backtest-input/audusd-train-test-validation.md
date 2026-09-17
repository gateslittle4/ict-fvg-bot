# Validation hors-échantillon (train/test) — ICT FVG (M15)

⚠ Méthode : chaque instrument est coupé en deux à 2024-01-01T00:00:00Z — TRAIN (avant, utilisé pour choisir les meilleures configs) et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top 5 est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité (stop ≥ 3x le spread) appliqués des deux côtés, comme dans le rapport principal.

⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / surapprentissage).

## AUDUSD
TRAIN: 121195 bougies (2019-01-01 → 2023-12-29) — TEST: 49819 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA200 / fvg-edge / 1:3 | ON | ON | 367 / 128 | 31.9% / 27.8% | 0.07 / -0.09 | 1.09 / 0.89 | ❌ ne tient pas (négatif en test) |
| 2 | H1_EMA200 / fvg-edge / 1:3 | off | ON | 484 / 152 | 31.8% / 28.0% | 0.06 / -0.09 | 1.08 / 0.90 | ❌ ne tient pas (négatif en test) |
| 3 | H4_EMA20 / fvg-edge / 1:3 | ON | ON | 344 / 102 | 31.5% / 25.7% | 0.05 / -0.18 | 1.07 / 0.80 | ❌ ne tient pas (négatif en test) |
| 4 | H4_EMA50 / fvg-edge / 1:3 | ON | ON | 316 / 105 | 31.4% / 27.2% | 0.05 / -0.12 | 1.06 / 0.86 | ❌ ne tient pas (négatif en test) |
| 5 | H1_EMA50 / fvg-edge / 1:3 | ON | ON | 451 / 146 | 31.1% / 26.6% | 0.04 / -0.13 | 1.05 / 0.85 | ❌ ne tient pas (négatif en test) |
