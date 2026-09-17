# Validation hors-échantillon (train/test) — ICT FVG (M15)

⚠ Méthode : chaque instrument est coupé en deux à 2024-01-01T00:00:00Z — TRAIN (avant, utilisé pour choisir les meilleures configs) et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top 5 est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité (stop ≥ 3x le spread) appliqués des deux côtés, comme dans le rapport principal.

⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / surapprentissage).

## AUX
TRAIN: 100678 bougies (2019-01-01 → 2023-12-29) — TEST: 41912 bougies (2024-01-01 → 2025-12-30).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA50 / fvg-edge / 1:3 | ON | ON | 555 / 229 | 33.5% / 28.4% | 0.18 / -0.05 | 1.23 / 0.95 | ❌ ne tient pas (négatif en test) |
| 2 | H1_EMA200 / fvg-edge / 1:3 | ON | ON | 601 / 256 | 31.7% / 28.5% | 0.11 / -0.04 | 1.14 / 0.95 | ❌ ne tient pas (négatif en test) |
| 3 | H4_EMA20 / fvg-edge / 1:3 | ON | ON | 565 / 216 | 31.9% / 29.6% | 0.11 / 0.01 | 1.13 / 1.01 | ⚠️ positif mais nettement affaibli vs train |
| 4 | H4_EMA50 / fvg-edge / 1:3 | off | ON | 782 / 317 | 31.5% / 25.9% | 0.09 / -0.15 | 1.11 / 0.83 | ❌ ne tient pas (négatif en test) |
| 5 | baseline / swing / 1:3 | ON | ON | 1020 / 409 | 28.4% / 25.7% | 0.08 / -0.01 | 1.10 / 0.98 | ❌ ne tient pas (négatif en test) |
