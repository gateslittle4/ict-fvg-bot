# Recherche du meilleur setup, fenêtre 10h-11h FIXÉE — US100 / US500

⚠ Contrairement à avant (où on a juste repris la config choisie pour 08h-12h et changé la fenêtre), ceci refait une recherche complète (168 configs : variante HTF x structure x stop x R:R x liquidity sweep) avec la fenêtre 10h-11h FIXÉE dès le départ, pour voir si une autre combinaison ferait mieux une fois cette fenêtre choisie. Criblé sur TRAIN (avant 2024-01-01T00:00:00Z), Top 5 réévalué sur TEST (jamais utilisé pour choisir).

## US100
| # | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 68/38 | 47.1%/44.7% | 0.79/0.70 | 2.37/2.19 | ✅ tient |
| 2 | H1_EMA200 | ON | fvg-edge | 1:3 | ON | 87/42 | 43.7%/45.2% | 0.65/0.74 | 2.06/2.28 | ✅ tient |
| 3 | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 72/39 | 43.1%/46.2% | 0.62/0.76 | 1.99/2.31 | ✅ tient |
| 4 | H1_EMA50 | ON | fvg-edge | 1:3 | ON | 89/56 | 42.0%/39.3% | 0.57/0.50 | 1.90/1.77 | ✅ tient |
| 5 | H4_EMA50 | ON | fvg-edge | 1:3 | ON | 76/36 | 40.8%/50.0% | 0.53/0.92 | 1.82/2.73 | ✅ tient |

## US500
| # | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA50 | ON | fvg-edge | 1:3 | ON | 71/30 | 43.7%/42.9% | 0.63/0.70 | 1.99/2.16 | ✅ tient |
| 2 | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 53/19 | 43.4%/33.3% | 0.60/0.32 | 1.94/1.45 | ✅ tient |
| 3 | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 60/24 | 43.3%/30.4% | 0.60/0.19 | 1.94/1.26 | ✅ tient |
| 4 | H1_EMA200 | ON | fvg-edge | 1:3 | ON | 70/26 | 41.4%/37.5% | 0.53/0.51 | 1.80/1.78 | ✅ tient |
| 5 | baseline | ON | fvg-edge | 1:3 | ON | 131/52 | 41.2%/38.0% | 0.52/0.47 | 1.79/1.71 | ✅ tient |
