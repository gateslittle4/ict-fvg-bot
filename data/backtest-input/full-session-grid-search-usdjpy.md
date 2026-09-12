# Recherche exhaustive FVG (contact unique) : fenêtre horaire x tout le reste — USDJPY

⚠ Suite directe de "et pour usdjpy ?" (2026-09-12), après le même test sur EURUSD/GBPUSD. Le seul résultat FVG connu sur USDJPY (multi-contact) reprenait la config US100 TELLE QUELLE et s'est révélé fragile à l'examen (voir HANDOFF.md). Ceci est la PREMIÈRE vraie recherche de config propre à USDJPY dans ce projet : même recherche exhaustive que celle qui a trouvé les configs US100/US500 (full-session-grid-search.md) - 6 fenêtres horaires candidates x 168 configs (variante HTF x structure x stop x R:R x liquidity sweep) = 1008 configs, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST.

## USDJPY
| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 08h-09h30 | H4_EMA200 | ON | fvg-edge | 1:3 | ON | 24/9 | 56.5%/33.3% | 1.07/0.15 | 3.04/1.18 | ⚠️ affaibli vs train |
| 2 | 08h-09h30 | H4_EMA50 | ON | fvg-edge | 1:3 | ON | 25/15 | 54.2%/26.7% | 0.97/-0.09 | 2.76/0.89 | ❌ ne tient pas |
| 3 | 08h-09h30 | H4_EMA20 | ON | fvg-edge | 1:3 | ON | 24/14 | 54.2%/21.4% | 0.96/-0.31 | 2.66/0.66 | ❌ ne tient pas |
| 4 | 08h-09h30 | H1_EMA20 | ON | fvg-edge | 1:3 | ON | 24/14 | 52.2%/21.4% | 0.95/-0.29 | 2.72/0.68 | ❌ ne tient pas |
| 5 | 08h-09h30 | H1_EMA200 | ON | fvg-edge | 1:3 | ON | 29/16 | 53.6%/25.0% | 0.94/-0.15 | 2.67/0.82 | ❌ ne tient pas |
