# Filtre de sens par la moyenne 200 jours sur le combo — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-sma200-direction-filter-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runSma200DirectionFilterStudy.js`. Trades du combo au rejeu fidèle ; un achat est gardé si la dernière clôture journalière est au-dessus de la moyenne 200 jours, une vente si elle est en dessous.

| Période | Combo actuel | Trades gardés | Trades retirés | R/trade gardés | R/trade retirés |
|---|---|---|---|---|---|
| Entraînement 2011-2022 | +326.2 R (3748) | +192.6 R (2304, t 2.16) | +133.6 R (1444) | +0.084 | +0.093 |
| 2011-2016 | +30.0 R (1772) | -11.5 R (1138, t -0.19) | +41.5 R (634) | -0.010 | +0.066 |
| 2017-2022 | +296.2 R (1976) | +204.1 R (1166, t 3.14) | +92.0 R (810) | +0.175 | +0.114 |
| Test 2023-2025 | +21.6 R (1040) | +50.2 R (651, t 1.09) | -28.6 R (389) | +0.077 | -0.074 |
| 2026 (→ 21/09) | -13.3 R (270) | -6.7 R (184, t -0.25) | -6.6 R (86) | -0.036 | -0.076 |

## Trades retirés, par stratégie et par sens (toutes périodes)

| Stratégie | Achats retirés (sous la moyenne) | Ventes retirées (au-dessus) |
|---|---|---|
| cbdr US100 | -5.6 R (68) | -19.6 R (304) |
| divergence US100 | +1.0 R (132) | +0.0 R (0) |
| divergence US500 | +58.6 R (114) | +0.0 R (0) |
| nwog US100 | -4.1 R (57) | +0.0 R (0) |
| rsi2-daily US500 | +1.2 R (3) | +0.0 R (0) |
| silverbullet US100 | +0.2 R (102) | +4.7 R (412) |
| silverbullet US500 | -9.2 R (83) | +39.1 R (349) |
| weeklysweep US500 | -1.4 R (54) | +33.5 R (241) |

## Verdict (critère pré-enregistré)

**NON RETENU** (les trades retirés ne sont pas négatifs sur les deux moitiés : 2011-2016 +41.5 R, 2017-2022 +92.0 R)

## Limites

- Filtre appliqué aux trades déjà rejoués : la place libérée sur la paire n'est pas réutilisée par un autre signal (à vérifier par un rejeu complet si retenu).
