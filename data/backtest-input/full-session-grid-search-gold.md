# Recherche exhaustive : fenêtre horaire x tout le reste — XAUUSD (or)

⚠ Recherche la plus complète à ce jour : 6 fenêtres horaires candidates x 168 configs (variante HTF x structure x stop x R:R x liquidity sweep) = 1008 configs par symbole, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST. Contrairement à silver-bullet-grid-search.md qui fixait déjà 10h-11h, ici la fenêtre elle-même fait partie de ce qu'on cherche.

## XAUUSD
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 08h-09h30 | H4_EMA20 | ON | swing | 1:3 | ON | 39/29 | 48.6%/31.0% | 0.89/0.21 | 2.65/1.29 | ⚠️ affaibli vs train |
| 2 | 08h-09h30 | H4_EMA200 | ON | swing | 1:3 | ON | 43/27 | 48.8%/22.2% | 0.89/-0.15 | 2.66/0.82 | ❌ ne tient pas |
| 3 | 07h-10h (overlap Londres-NY) | H4_EMA20 | ON | swing | 1:3 | ON | 85/42 | 44.6%/38.1% | 0.70/0.48 | 2.17/1.74 | ✅ tient |
| 4 | 09h-10h30 | H4_EMA20 | ON | swing | 1:3 | ON | 80/30 | 44.9%/34.5% | 0.69/0.39 | 2.18/1.59 | ✅ tient |
| 5 | 08h-09h30 | H1_EMA200 | ON | swing | 1:3 | ON | 46/30 | 44.4%/25.0% | 0.69/-0.05 | 2.15/0.94 | ❌ ne tient pas |
