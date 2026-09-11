# Filtre macro (régime VIX) sur le combo déjà validé — améliore-t-il quelque chose ?

Question posée directement par Esdras après avoir dropé l'idée d'un nouvel instrument macro : le combo FVG (US100+US500+XAUUSD) + Divergence (US100/US500), déjà validé et en production, se comporte-t-il différemment selon le régime de volatilité macro (VIX) ? Seuil décidé AVANT de voir un seul résultat : VIX < 20 = 'calme', VIX ≥ 20 = 'élevé' (convention standard CBOE/médias financiers, pas ajustée sur ces données). Régime lu depuis la dernière clôture VIX STRICTEMENT AVANT le jour d'entrée du trade (aucun regard en avant).

| Période | Régime | Trades | WR | PF | Espérance (R) |
|---|---|---|---|---|---|
| TRAIN (2019-2023) | Calme (VIX<20) | 315 | 34.5% | 1.98 | 0.64 |
| TRAIN (2019-2023) | Élevé (VIX≥20) | 232 | 34.3% | 2.15 | 0.75 |
| TRAIN (2019-2023) | **Tous régimes (référence)** | 547 | 34.4% | 2.05 | 0.68 |
| TEST (2024-2025) | Calme (VIX<20) | 183 | 34.1% | 2.03 | 0.67 |
| TEST (2024-2025) | Élevé (VIX≥20) | 29 | 42.9% | 3.00 | 1.10 |
| TEST (2024-2025) | **Tous régimes (référence)** | 212 | 35.3% | 2.15 | 0.73 |

⚠ La lecture agrégée ci-dessus mélange 4 sous-populations différentes (3 FVG + 1 Divergence) qui peuvent réagir dans des sens OPPOSÉS au régime VIX — décomposée ci-dessous, par instrument/source, avant de tirer une conclusion.

| Période | Instrument/source | Calme (n / exp R) | Élevé (n / exp R) |
|---|---|---|---|
| TRAIN | US100/fvg | 50 / 1.28 | 46 / 1.48 |
| TRAIN | US500/fvg | 35 / 0.54 | 53 / 1.38 |
| TRAIN | XAUUSD/fvg | 65 / 1.03 | 22 / 0.64 |
| TRAIN | US500/divergence | 165 / 0.31 | 111 / 0.16 |
| TEST | US100/fvg | 36 / 1.17 | 8 / 3.50 |
| TEST | US500/fvg | 25 / 1.28 | 1 / -1.00 |
| TEST | XAUUSD/fvg | 37 / 0.78 | 4 / -1.00 |
| TEST | US500/divergence | 85 / 0.22 | 16 / 0.56 |