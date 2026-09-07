# Simulation "challenge 2025" — $10,000, setup actuel (US100 + US500)

⚠ Simule un compte de $10000 qui aurait ouvert le 2025-01-01 et tradé toute l'année 2025 avec le setup actuellement recommandé (docs/STRATEGY.md) : US100 = baseline, structure ON, session 10h-11h NY, fvg-edge, 1:3 — US500 = H1/EMA200, structure ON, session 10h-11h NY, fvg-edge, 1:3. Sans le filtre liquidity sweep (celui-ci reste optionnel/prudence, voir liquidity-sweep-comparison.md). Même GuardrailEngine que le bot réel (2 trades/jour partagés, cooldown 30 min après perte, stop journalier interne -2%).

⚠⚠ Repères FundingPips utilisés ici (2-Step Standard, NON reverifiés sur fundingpips.com cette session — à confirmer avant un vrai challenge) : Phase 1 = +8% du solde de départ, Phase 2 = +5% du solde ATTEINT à la fin de la Phase 1 (pas +5% du solde de départ), perte totale max ~10% (on teste ici la version "statique" : solde qui ne descend jamais sous 90% du solde de départ - à distinguer du drawdown "trailing"/pic-à-creux que le simulateur calcule par ailleurs, les deux sont rapportés séparément).

- US100: 22753 bougies M15 en 2025, du 2025-01-01 au 2025-12-31.
- US500: 22761 bougies M15 en 2025, du 2025-01-01 au 2025-12-31.

| Risque/trade | Trades pris | Win rate | Solde min. atteint | Drawdown statique (vs $10,000 initial) | Drawdown trailing (pic-à-creux) | Busté (>10% statique)? | Phase 1 (+8%) atteinte | Phase 2 (+5% du nouveau solde) atteinte |
|---|---|---|---|---|---|---|---|---|
| 0.25% | 180 | 39.7% | $10000 | 0.0% | 3.4% | non | 2025-04-08 (jour 97, solde $10881) | 2025-06-18 (jour 168, solde $11475) |
| 0.5% | 180 | 39.7% | $10000 | 0.0% | 6.7% | non | 2025-02-25 (jour 55, solde $10846) | 2025-02-27 (jour 57, solde $11488) |

Note : "busté" ici veut dire que le solde est descendu sous $9,000 (perte statique de 10% depuis le départ) à un moment de l'année - un vrai challenge se serait arrêté à cet instant précis, donc tout ce qui arrive APRÈS cette date dans la simulation n'aurait jamais eu lieu en réalité (le calcul continue quand même ici, pour information).