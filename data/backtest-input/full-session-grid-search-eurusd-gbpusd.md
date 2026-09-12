# Recherche exhaustive FVG (contact unique) : fenêtre horaire x tout le reste — EURUSD / GBPUSD

⚠ Réponse à "je me rappelais que le FVG fonctionnait sur EURUSD/GBPUSD" (2026-09-12) - jusqu'ici, tous les tests FVG sur ces deux paires reprenaient la config US100 TELLE QUELLE (délibérément, pour éviter de surajuster une config juste pour elles). Ceci est la PREMIÈRE vraie recherche de config propre à EURUSD/GBPUSD dans ce projet : même recherche exhaustive que celle qui a trouvé les configs US100/US500 (full-session-grid-search.md) - 6 fenêtres horaires candidates x 168 configs (variante HTF x structure x stop x R:R x liquidity sweep) = 1008 configs par symbole, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST.

## EURUSD
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 08h-09h30 | H1_EMA20 | ON | swing | 1:2 | ON | 47/17 | 46.7%/17.6% | 0.38/-0.51 | 1.72/0.40 | ❌ ne tient pas |
| 2 | 08h-09h30 | H1_EMA20 | ON | swing | 1:3 | ON | 44/17 | 33.3%/5.9% | 0.37/-0.81 | 1.59/0.18 | ❌ ne tient pas |
| 3 | 09h30-11h | H4_EMA50 | off | fvg-edge | 1:3 | ON | 102/34 | 36.3%/30.3% | 0.27/0.04 | 1.37/1.05 | ⚠️ affaibli vs train |
| 4 | 10h-11h (Silver Bullet) | H4_EMA50 | off | fvg-edge | 1:3 | ON | 75/28 | 36.0%/25.9% | 0.26/-0.11 | 1.35/0.87 | ❌ ne tient pas |
| 5 | 08h-12h | baseline | ON | swing | 1:3 | ON | 295/111 | 31.4%/25.5% | 0.25/0.03 | 1.36/1.04 | ⚠️ affaibli vs train |

## GBPUSD
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 09h-10h30 | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 20/9 | 40.0%/28.6% | 0.40/0.10 | 1.56/1.14 | ⚠️ affaibli vs train |
| 2 | 09h30-11h | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 23/10 | 39.1%/22.2% | 0.40/-0.22 | 1.58/0.74 | ❌ ne tient pas |
| 3 | 09h-10h30 | H4_EMA20 | off | fvg-edge | 1:3 | ON | 48/23 | 39.6%/28.6% | 0.39/-0.01 | 1.54/0.98 | ❌ ne tient pas |
| 4 | 08h-09h30 | H1_EMA20 | off | swing | 1:2 | ON | 63/21 | 46.8%/26.3% | 0.35/-0.25 | 1.65/0.66 | ❌ ne tient pas |
| 5 | 08h-09h30 | H1_EMA50 | off | swing | 1:2 | ON | 90/48 | 44.3%/37.8% | 0.26/0.07 | 1.46/1.11 | ⚠️ affaibli vs train |
