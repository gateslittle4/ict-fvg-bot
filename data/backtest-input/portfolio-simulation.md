# Simulation de compte avec garde-fous — ICT FVG (M15)

⚠ Simule EXACTEMENT le même GuardrailEngine que le bot en direct (max 2 trades/jour, cooldown 30 min après une perte, arrêt à -2%/jour, budget PARTAGÉ entre US100 et US500). Risque composé sur le solde courant (pas fixe). Configs utilisées : le meilleur combo trouvé en fixant la fenêtre 10h-11h "Silver Bullet" dès le départ de la recherche (voir silver-bullet-grid-search.md), pas juste la config recyclée de la fenêtre 08h-12h : US100 = H4/EMA200, structure ON, session 10h-11h, fvg-edge, 1:3, liquidity sweep ON — US500 = H1/EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, liquidity sweep ON.

⚠⚠ Repères FundingPips (2-Step Standard, à revérifier sur fundingpips.com car ça varie selon la formule choisie et peut changer) : perte quotidienne max ~5%, perte totale max ~10% (statique), objectif +8% (phase 1) puis +5% (phase 2).

⚠⚠⚠ US100 et US500 sont corrélés à 0.93 entre eux (voir backtest-report.md) — ce compte à 2 symboles ne diversifie presque rien, c'est plus proche du même pari pris deux fois qu'un vrai portefeuille à 2 actifs indépendants. Les spreads US100 (1.0 point) et US500 (0.4 point) restent des valeurs INDICATIVES non vérifiées contre les vraies specs FundingPips/cTrader.

# Compte : US100 + US500 (session 10h-11h Silver Bullet)

## Historique complet
- US100: 156715 bougies M15, du 2019-01-01 au 2025-12-31.
- US500: 156795 bougies M15, du 2019-01-01 au 2025-12-31.

| Risque/trade | Solde final | Rendement total | Max drawdown | Trades pris | Win rate | Signaux bloqués (garde-fous) | dont max/jour | dont cooldown | dont stop journalier | Jours pour +8% | Jours pour +5% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.5% | 20788 | +107.9% | 4.5% | 208 | 45.1% | 9 | 2 | 9 | 0 | 324 | 96 |
| 0.25% | 14466 | +44.7% | 2.3% | 208 | 45.1% | 9 | 2 | 9 | 0 | 484 | 339 |

## Test seul (2024-2025, hors-échantillon)
- US100: 45560 bougies M15, du 2024-01-01 au 2025-12-31.
- US500: 45630 bougies M15, du 2024-01-01 au 2025-12-31.

| Risque/trade | Solde final | Rendement total | Max drawdown | Trades pris | Win rate | Signaux bloqués (garde-fous) | dont max/jour | dont cooldown | dont stop journalier | Jours pour +8% | Jours pour +5% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.5% | 12702 | +27.0% | 3.2% | 67 | 44.6% | 3 | 2 | 3 | 0 | 227 | 186 |
| 0.25% | 11282 | +12.8% | 1.6% | 67 | 44.6% | 3 | 2 | 3 | 0 | 560 | 263 |
