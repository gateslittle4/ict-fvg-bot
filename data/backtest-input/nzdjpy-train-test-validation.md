# Validation hors-échantillon (train/test) — ICT FVG (M15)

⚠ Méthode : chaque instrument est coupé en deux à 2024-01-01T00:00:00Z — TRAIN (avant, utilisé pour choisir les meilleures configs) et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top 5 est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité (stop ≥ 3x le spread) appliqués des deux côtés, comme dans le rapport principal.

⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / surapprentissage).

## NZDJPY
TRAIN: 121101 bougies (2019-01-01 → 2023-12-29) — TEST: 49838 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA20 / swing / 1:3 | ON | off | 843 / 328 | 25.5% / 22.6% | -0.06 / -0.15 | 0.93 / 0.82 | ❌ ne tient pas (négatif en test) |
| 2 | H1_EMA20 / swing / 1:3 | off | off | 844 / 329 | 25.4% / 22.5% | -0.06 / -0.16 | 0.92 / 0.80 | ❌ ne tient pas (négatif en test) |
| 3 | baseline / swing / 1:2 | ON | off | 1211 / 507 | 35.6% / 33.2% | -0.08 / -0.14 | 0.89 / 0.82 | ❌ ne tient pas (négatif en test) |
| 4 | baseline / swing / 1:2 | off | off | 1257 / 545 | 35.3% / 32.5% | -0.09 / -0.16 | 0.88 / 0.79 | ❌ ne tient pas (négatif en test) |
| 5 | H1_EMA20 / swing / 1:2 | off | off | 1137 / 483 | 34.7% / 34.3% | -0.09 / -0.10 | 0.87 / 0.86 | ❌ ne tient pas (négatif en test) |
