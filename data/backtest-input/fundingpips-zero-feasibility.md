# Faisabilité "FundingPips Zero, $20,000, sans challenge" — US100 + US500

⚠ Compte $20000, risque 0.25%/trade (garde le risque ouvert combiné à 0.5%, sous la limite Zero de 1%), setup actuel validé, garde-fous ajustés aux VRAIES règles Zero (perte quotidienne max 3%, perte trailing max 5% - approximée ici par une perte statique max de 5% depuis le départ, une approximation au moins aussi stricte que la vraie règle qui se base sur le plus haut équity jamais atteint). Chaque année simulée indépendamment depuis $20,000 le 1er janvier de cette année (pas de report d'une année à l'autre). Pas de Phase 1/2 ici (compte déjà 'live' dès le jour 1) - la seule question est QUAND (si jamais) les conditions de déblocage de retrait sont remplies : 7 jours profitables (chacun ≥0.25% net) sur une fenêtre glissante de 30 jours calendaires, ET un score de consistance ≤15% (le meilleur jour ne doit pas représenter plus de 15% du profit total cumulé à ce moment-là).

## Avec liquidity sweep (setup recommandé)
| Année | Trades | Win rate | Drawdown max | Busté (perte trailing >5%)? | Premier déblocage de retrait | Score de consistance au déblocage |
|---|---|---|---|---|---|---|
| 2019 | 24 | 45.8% | 1.4% | non | jamais (max 10 jours profitables/an, sur 22 jours de trading) | — |
| 2020 | 35 | 60.0% | 0.9% | non | jamais (max 17 jours profitables/an, sur 30 jours de trading) | — |
| 2021 | 24 | 33.3% | 2.0% | non | jamais (max 8 jours profitables/an, sur 24 jours de trading) | — |
| 2022 | 30 | 43.3% | 1.9% | non | jamais (max 11 jours profitables/an, sur 23 jours de trading) | — |
| 2023 | 19 | 26.3% | 1.8% | non | jamais (max 5 jours profitables/an, sur 16 jours de trading) | — |
| 2024 | 24 | 45.5% | 1.1% | non | jamais (max 11 jours profitables/an, sur 22 jours de trading) | — |
| 2025 | 40 | 45.0% | 1.6% | non | jamais (max 16 jours profitables/an, sur 29 jours de trading) | — |

## Sans liquidity sweep (plus de trades)
| Année | Trades | Win rate | Drawdown max | Busté (perte trailing >5%)? | Premier déblocage de retrait | Score de consistance au déblocage |
|---|---|---|---|---|---|---|
| 2019 | 83 | 34.9% | 3.7% | non | jamais (max 25 jours profitables/an, sur 69 jours de trading) | — |
| 2020 | 130 | 31.8% | 4.1% | non | jamais (max 32 jours profitables/an, sur 100 jours de trading) | — |
| 2021 | 116 | 36.2% | 2.9% | non | ✅ 2021-03-26 | 20% ❌ ÉCHOUE |
| 2022 | 116 | 34.2% | 3.3% | non | ✅ 2022-11-30 | 6% ✅ |
| 2023 | 90 | 30.0% | 4.1% | non | jamais (max 24 jours profitables/an, sur 72 jours de trading) | — |
| 2024 | 114 | 33.0% | 4.1% | non | jamais (max 35 jours profitables/an, sur 92 jours de trading) | — |
| 2025 | 136 | 33.8% | 3.9% | non | ✅ 2025-06-19 | 9% ✅ |
