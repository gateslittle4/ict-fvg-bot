# Validation hors-échantillon (train/test) — ICT FVG (M15)

⚠ Méthode : chaque instrument est coupé en deux à 2024-01-01T00:00:00Z — TRAIN (avant, utilisé pour choisir les meilleures configs) et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top 5 est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité (stop ≥ 3x le spread) appliqués des deux côtés, comme dans le rapport principal.

⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / surapprentissage).

## UKX
TRAIN: 124670 bougies (2018-01-02 → 2023-12-29) — TEST: 45681 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA200 / swing / 1:2 | ON | ON | 840 / 297 | 34.9% / 34.4% | 0.01 / -0.01 | 1.02 / 0.98 | ❌ ne tient pas (négatif en test) |
| 2 | baseline / swing / 1:2 | ON | off | 1458 / 551 | 34.4% / 34.1% | 0.01 / -0.01 | 1.02 / 0.99 | ❌ ne tient pas (négatif en test) |
| 3 | H1_EMA50 / swing / 1:2 | ON | off | 1372 / 470 | 34.3% / 31.2% | 0.01 / -0.09 | 1.01 / 0.88 | ❌ ne tient pas (négatif en test) |
| 4 | H1_EMA20 / swing / 1:2 | ON | off | 1352 / 459 | 34.1% / 30.0% | 0.01 / -0.11 | 1.01 / 0.84 | ❌ ne tient pas (négatif en test) |
| 5 | H4_EMA50 / swing / 1:2 | ON | ON | 797 / 290 | 34.7% / 34.6% | 0.00 / -0.01 | 1.01 / 0.98 | ❌ ne tient pas (négatif en test) |
