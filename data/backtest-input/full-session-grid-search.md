# Recherche exhaustive : fenêtre horaire x tout le reste — US100 / US500

⚠ Recherche la plus complète à ce jour : 6 fenêtres horaires candidates x 168 configs (variante HTF x structure x stop x R:R x liquidity sweep) = 1008 configs par symbole, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST. Contrairement à silver-bullet-grid-search.md qui fixait déjà 10h-11h, ici la fenêtre elle-même fait partie de ce qu'on cherche.

## US100
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 10h-11h (Silver Bullet) | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 68/38 | 47.1%/44.7% | 0.79/0.70 | 2.37/2.19 | ✅ tient |
| 2 | 10h-11h (Silver Bullet) | H1_EMA200 | ON | fvg-edge | 1:3 | ON | 87/42 | 43.7%/45.2% | 0.65/0.74 | 2.06/2.28 | ✅ tient |
| 3 | 10h-11h (Silver Bullet) | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 72/39 | 43.1%/46.2% | 0.62/0.76 | 1.99/2.31 | ✅ tient |
| 4 | 10h-11h (Silver Bullet) | H1_EMA50 | ON | fvg-edge | 1:3 | ON | 89/56 | 42.0%/39.3% | 0.57/0.50 | 1.90/1.77 | ✅ tient |
| 5 | 09h30-11h | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 84/44 | 41.7%/45.5% | 0.57/0.73 | 1.89/2.24 | ✅ tient |

## US500
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 08h-09h30 | H1_EMA200 | ON | fvg-edge | 1:3 | ON | 26/20 | 46.2%/35.0% | 0.67/0.24 | 2.08/1.33 | ✅ tient |
| 2 | 08h-09h30 | H4_EMA50 | ON | fvg-edge | 1:3 | ON | 26/18 | 46.2%/33.3% | 0.67/0.18 | 2.08/1.24 | ⚠️ affaibli vs train |
| 3 | 10h-11h (Silver Bullet) | H1_EMA50 | ON | fvg-edge | 1:3 | ON | 71/30 | 43.7%/42.9% | 0.63/0.70 | 1.99/2.16 | ✅ tient |
| 4 | 10h-11h (Silver Bullet) | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 53/19 | 43.4%/33.3% | 0.60/0.32 | 1.94/1.45 | ✅ tient |
| 5 | 10h-11h (Silver Bullet) | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 60/24 | 43.3%/30.4% | 0.60/0.19 | 1.94/1.26 | ✅ tient |
