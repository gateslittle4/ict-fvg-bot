# "Aller plus vite en augmentant le risque" — test direct, 30 premiers jours de chaque année

⚠ Setup actuel (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h) testé SANS et AVEC le filtre liquidity sweep - sweep = moins de trades mais meilleure qualité, donc moins de munitions disponibles en 30 jours ; sans sweep = plus de trades, l'autre levier possible pour aller plus vite. Seul le risque/trade change dans chaque bloc, de 0.25% à 5%. Objectif combiné visé ≈ +13.4% (Phase 1 +8% puis Phase 2 +5% du nouveau solde) en 30 jours. Bust = solde tombé sous 90% du départ (repère indicatif, non revérifié sur fundingpips.com). Un bust arrête tout : un objectif atteint APRÈS un bust ne compte pas, exactement comme un vrai challenge qui s'arrête à la limite de perte.

## Avec liquidity sweep (setup recommandé)
| Risque/trade | 2019* | 2020* | 2021* | 2022* | 2023* | 2024 | 2025 |
|---|---|---|---|---|---|---|---|
| 0.25% | pas atteint (1 trades, solde $10074) | pas atteint (1 trades, solde $9971) | pas atteint (1 trades, solde $9969) | pas atteint (2 trades, solde $10045) | pas atteint (2 trades, solde $9946) | pas atteint (1 trades, solde $10071) | pas atteint (1 trades, solde $9972) |
| 0.5% | pas atteint (1 trades, solde $10148) | pas atteint (1 trades, solde $9941) | pas atteint (1 trades, solde $9937) | pas atteint (2 trades, solde $10090) | pas atteint (2 trades, solde $9893) | pas atteint (1 trades, solde $10143) | pas atteint (1 trades, solde $9944) |
| 1% | pas atteint (1 trades, solde $10296) | pas atteint (1 trades, solde $9883) | pas atteint (1 trades, solde $9875) | pas atteint (2 trades, solde $10177) | pas atteint (2 trades, solde $9786) | pas atteint (1 trades, solde $10285) | pas atteint (1 trades, solde $9887) |
| 2% | pas atteint (1 trades, solde $10593) | pas atteint (1 trades, solde $9765) | pas atteint (1 trades, solde $9749) | pas atteint (2 trades, solde $10348) | pas atteint (2 trades, solde $9574) | pas atteint (1 trades, solde $10570) | pas atteint (1 trades, solde $9775) |
| 3% | pas atteint (1 trades, solde $10889) | pas atteint (1 trades, solde $9648) | pas atteint (1 trades, solde $9624) | pas atteint (2 trades, solde $10512) | pas atteint (2 trades, solde $9365) | pas atteint (1 trades, solde $10856) | pas atteint (1 trades, solde $9662) |
| 5% | ✅ 2019-01-17 | pas atteint (1 trades, solde $9413) | pas atteint (1 trades, solde $9373) | pas atteint (2 trades, solde $10820) | 💥 busté (2023-01-13) | ✅ 2024-01-10 | pas atteint (1 trades, solde $9436) |

## Sans liquidity sweep (plus de trades)
| Risque/trade | 2019* | 2020* | 2021* | 2022* | 2023* | 2024 | 2025 |
|---|---|---|---|---|---|---|---|
| 0.25% | pas atteint (3 trades, solde $10216) | pas atteint (4 trades, solde $9979) | pas atteint (5 trades, solde $9959) | pas atteint (10 trades, solde $10027) | pas atteint (4 trades, solde $9992) | pas atteint (4 trades, solde $10081) | pas atteint (6 trades, solde $9832) |
| 0.5% | pas atteint (3 trades, solde $10435) | pas atteint (4 trades, solde $9958) | pas atteint (5 trades, solde $9918) | pas atteint (10 trades, solde $10052) | pas atteint (4 trades, solde $9983) | pas atteint (4 trades, solde $10162) | pas atteint (6 trades, solde $9666) |
| 1% | pas atteint (3 trades, solde $10883) | pas atteint (4 trades, solde $9913) | pas atteint (5 trades, solde $9833) | pas atteint (10 trades, solde $10096) | pas atteint (4 trades, solde $9963) | pas atteint (4 trades, solde $10321) | pas atteint (6 trades, solde $9341) |
| 2% | ✅ 2019-01-30 | pas atteint (4 trades, solde $9816) | pas atteint (5 trades, solde $9655) | pas atteint (10 trades, solde $10161) | pas atteint (4 trades, solde $9915) | pas atteint (4 trades, solde $10634) | 💥 busté (2025-01-28) |
| 3% | ✅ 2019-01-17 | 💥 busté (2020-01-15) | pas atteint (5 trades, solde $9468) | 💥 busté (2022-01-13) | pas atteint (4 trades, solde $9855) | pas atteint (4 trades, solde $10936) | 💥 busté (2025-01-24) |
| 5% | ✅ 2019-01-04 | 💥 busté (2020-01-08) | 💥 busté (2021-01-15) | 💥 busté (2022-01-10) | 💥 busté (2023-01-13) | ✅ 2024-01-10 | 💥 busté (2025-01-15) |

*années 2019-2023 = train (utilisées pour choisir la config, résultats optimistes) ; 2024-2025 = test (fiables).