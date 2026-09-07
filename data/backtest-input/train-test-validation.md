# Validation hors-échantillon (train/test) — ICT FVG (M15)

⚠ Méthode : chaque instrument est coupé en deux à 2024-01-01T00:00:00Z — TRAIN (avant, utilisé pour choisir les meilleures configs) et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top 5 est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité (stop ≥ 3x le spread) appliqués des deux côtés, comme dans le rapport principal.

⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / surapprentissage).

## EURUSD
TRAIN: 146135 bougies (2018-01-01 → 2023-12-29) — TEST: 49866 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | baseline / swing / 1:3 | ON | ON | 918 / 323 | 28.4% / 21.5% | 0.12 / -0.13 | 1.16 / 0.83 | ❌ ne tient pas (négatif en test) |
| 2 | H4_EMA20 / swing / 1:3 | ON | ON | 631 / 216 | 28.4% / 26.7% | 0.11 / 0.06 | 1.16 / 1.09 | ✅ tient (net positif, proche du train) |
| 3 | baseline / swing / 1:2 | ON | ON | 1153 / 376 | 38.1% / 33.2% | 0.09 / -0.02 | 1.15 / 0.97 | ❌ ne tient pas (négatif en test) |
| 4 | H4_EMA50 / swing / 1:3 | ON | ON | 626 / 226 | 27.7% / 23.0% | 0.08 / -0.09 | 1.11 / 0.89 | ❌ ne tient pas (négatif en test) |
| 5 | H1_EMA200 / swing / 1:3 | ON | ON | 658 / 225 | 27.3% / 23.9% | 0.08 / -0.01 | 1.11 / 0.98 | ❌ ne tient pas (négatif en test) |

## GBPUSD
TRAIN: 121159 bougies (2019-01-01 → 2023-12-29) — TEST: 49864 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA20 / swing / 1:3 | off | ON | 652 / 262 | 26.6% / 24.7% | 0.06 / 0.01 | 1.09 / 1.01 | ⚠️ positif mais nettement affaibli vs train |
| 2 | H4_EMA20 / swing / 1:3 | off | ON | 658 / 270 | 26.8% / 26.6% | 0.05 / 0.04 | 1.07 / 1.05 | ✅ tient (net positif, proche du train) |
| 3 | baseline / swing / 1:3 | ON | ON | 784 / 316 | 26.5% / 22.2% | 0.05 / -0.11 | 1.06 / 0.86 | ❌ ne tient pas (négatif en test) |
| 4 | H1_EMA200 / fvg-edge / 1:3 | ON | ON | 650 / 236 | 30.0% / 23.3% | 0.04 / -0.24 | 1.04 / 0.73 | ❌ ne tient pas (négatif en test) |
| 5 | H4_EMA20 / swing / 1:3 | ON | ON | 528 / 206 | 26.0% / 25.0% | 0.03 / -0.01 | 1.04 / 0.98 | ❌ ne tient pas (négatif en test) |

## US100
TRAIN: 111155 bougies (2019-01-01 → 2023-12-29) — TEST: 45560 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA200 / swing / 1:3 | ON | off | 883 / 342 | 29.3% / 26.1% | 0.20 / 0.07 | 1.29 / 1.10 | ✅ tient (net positif, proche du train) |
| 2 | H4_EMA200 / fvg-edge / 1:3 | ON | ON | 968 / 424 | 31.3% / 35.8% | 0.14 / 0.34 | 1.19 / 1.48 | ✅ tient (net positif, proche du train) |
| 3 | baseline / fvg-edge / 1:3 | ON | ON | 1790 / 820 | 31.0% / 34.6% | 0.13 / 0.30 | 1.17 / 1.41 | ✅ tient (net positif, proche du train) |
| 4 | H4_EMA200 / swing / 1:3 | ON | ON | 694 / 274 | 28.3% / 29.5% | 0.13 / 0.17 | 1.18 / 1.24 | ✅ tient (net positif, proche du train) |
| 5 | baseline / swing / 1:3 | ON | off | 943 / 361 | 27.3% / 22.7% | 0.13 / -0.02 | 1.18 / 0.98 | ❌ ne tient pas (négatif en test) |

## US500
TRAIN: 111165 bougies (2019-01-01 → 2023-12-29) — TEST: 45630 bougies (2024-01-01 → 2025-12-31).

### Top 5 sur TRAIN, réévalué sur TEST
| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA200 / fvg-edge / 1:3 | ON | ON | 891 / 375 | 34.2% / 29.8% | 0.24 / 0.08 | 1.32 / 1.10 | ✅ tient (net positif, proche du train) |
| 2 | H4_EMA50 / fvg-edge / 1:3 | ON | ON | 809 / 328 | 34.0% / 30.6% | 0.22 / 0.09 | 1.30 / 1.12 | ✅ tient (net positif, proche du train) |
| 3 | H1_EMA200 / fvg-edge / 1:3 | off | ON | 1204 / 500 | 32.9% / 28.4% | 0.18 / 0.01 | 1.23 / 1.01 | ⚠️ positif mais nettement affaibli vs train |
| 4 | H4_EMA50 / fvg-edge / 1:3 | off | ON | 1114 / 455 | 32.8% / 28.0% | 0.17 / -0.02 | 1.22 / 0.98 | ❌ ne tient pas (négatif en test) |
| 5 | H4_EMA200 / fvg-edge / 1:3 | ON | ON | 799 / 314 | 32.5% / 29.7% | 0.17 / 0.06 | 1.22 / 1.07 | ✅ tient (net positif, proche du train) |
