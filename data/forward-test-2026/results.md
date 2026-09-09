# Forward-test 2026 — données réelles cTrader, ~7 mois (2026-02-05 → 2026-09-09)

⚠ Exporté LIVE depuis le vrai compte cTrader via `/api/admin/export-candles` (endpoint temporaire, voir server.js), pas les CSV historiques 2019-2025 habituels. Config de PRODUCTION utilisée telle quelle (`CONFIG.fvg.perSymbol` — rrMultiple 5/5/4, variants/stops/sessions inchangés) — pas de nouveau grid-search, c'est un vrai test out-of-sample sur une période qui n'a jamais servi à choisir cette config.

| Symbole | Signaux bruts | Signaux net | Win rate net | R net moyen | Profit factor net | Max DD net (R) | Total R net |
|---|---|---|---|---|---|---|---|
| US100 (1:5) | 4 (1 écarté) | 3 | 66.7% | 2.87 | 8.49 | 1.15 | **+8.62R** |
| US500 (1:5) | 6 (2 écartés) | 4 | 75.0% | 3.33 | 11.73 | 1.24 | **+13.34R** |
| XAUUSD (1:4) | 7 | 7 | 14.3% | -0.31 | 0.65 | 3.10 | **-2.15R** |
| **Total portefeuille** | | **14** | | | | | **+19.81R** |

## Lecture honnête

**US100 et US500 : très positifs sur cette période, mais échantillon minuscule** (3 et 4 trades net respectivement) — pas assez pour en tirer une conclusion statistique, mais la DIRECTION confirme ce que le backtest 2019-2025 prédisait (win rate 66-75% cohérent avec le régime "extended target" déjà documenté).

**XAUUSD : signal d'alerte réel.** 1 seul gain sur 7 trades (14.3% win rate) — sous le seuil de rentabilité mécanique de 1:4 (20% nécessaire). Résultat net négatif (-2.15R) sur les 7 derniers mois. Le max drawdown (3.10R) est aussi le plus élevé des trois. Cohérent avec ce qui était déjà noté dans HANDOFF.md : XAUUSD est le résultat le plus fragile des trois instruments FVG (celui qui redonne du terrain à 1:5, seul à utiliser une fenêtre de session différente). Ce forward-test ne le CONDAMNE pas (7 trades, aucune signification statistique), mais confirme qu'il mérite une vigilance particulière plutôt qu'une confiance égale à US100/US500.

**Portefeuille global : positif** (+19.81R sur ~7 mois, 14 trades), porté presque entièrement par US100/US500 — XAUUSD a été un frein net sur cette période précise, pas un moteur.

## Limites à garder en tête

- Échantillon TOTAL minuscule (14 trades sur 7 mois) — la config validée sur 2019-2025 génère naturellement peu de signaux (voir HANDOFF.md, "production config très sélective"), donc ceci n'a jamais eu vocation à être une validation statistique forte, plutôt une confirmation directionnelle.
- Une seule fenêtre historique, comme partout ailleurs dans ce projet — pas un remplacement du train/test 2019-2025, un complément.
- Pas de nouvelle décision de config prise suite à ce test — XAUUSD reste en production à 1:4, à surveiller sur les prochains mois plutôt qu'à couper immédiatement sur la base de 7 trades.
