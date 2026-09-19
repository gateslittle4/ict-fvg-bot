# Comparaison : 8 mécanismes actuels vs 7 mécanismes (sans CBDR) + pyramidage — 7 mois + semaine dernière

Question d'Esdras : "les 8 strategy live... performance globale dans un compte 10k vs la performance sans les derniers ajouts et pyramid enable", sur les 7 derniers mois + la semaine dernière. Même méthode que la simulation FTMO précédente (`LiveStrategyEngine.warmUp()`, config/garde-fous réels via `accountRegistry.buildEffectiveConfig`), mêmes données réelles fusionnées (`data/real-data-2026-02-to-09/` + `data/real-data-2026-09-17/`, dédupliquées) — **2026-02-10 → 2026-09-17**. Solde de départ $10000.00, risque 0.5%/trade. Cible FTMO +10% désactivée dans les DEUX passages (comparaison de performance pure sur fenêtre fixe, pas un test "passe/rate" — sinon celui qui atteint +10% en premier s'arrêterait artificiellement plus tôt que l'autre). Perte quotidienne 3% et drawdown max 10% (trailing fin de journée) restent actifs et rapportés.

⚠ Le pyramidage n'est pas résolu par `LiveStrategyEngine` lui-même (une fois la demande envoyée, le moteur "n'a plus rien à suivre" - la résolution réelle passe par les événements du broker en production, hors de cette classe). Simulé ici : remplissage immédiat au prix calculé (pas de glissement/rejet modélisé, comme pour toutes les autres entrées de ce projet), résolution par scan des bougies suivantes (stop/cible/timeout 480 bougies, même convention que tous les autres modules de backtest).

## A — 8 mécanismes actuels (avec CBDR), pyramidage OFF (état de production actuel)

- **347 trades** (82 gagnants, 265 perdants, WR 23.6%)
- Solde final : $10731.74 (+7.32%)
- ❌ **Drawdown max 10% franchi** le 2026-09-02T03:45:00.000Z (solde $10731.74 <= plancher $10780.42)
- ✅ Perte quotidienne max 3% jamais atteinte

| Mécanisme | Trades | Gagnants | R net moyen | PnL total |
|---|---|---|---|---|
| fvg | 111 | 22 | 0.06R | $327.39 |
| silverbullet | 95 | 24 | -0.03R | $-184.57 |
| cbdr | 46 | 10 | -0.19R | $-544.12 |
| judaswing | 35 | 7 | -0.41R | $-819.13 |
| weeklysweep | 24 | 6 | 0.46R | $541.34 |
| divergence | 22 | 8 | 0.45R | $535.13 |
| nwog | 14 | 5 | 1.11R | $875.71 |

**Semaine dernière** (2026-09-10 → fin) : 11 trade(s), 4 gagnant(s), PnL $409.16.

| Date entrée | Symbole | Mécanisme | Direction | Issue | R net | PnL |
|---|---|---|---|---|---|---|
| 2026-09-11 00:15 | US500 | weeklysweep | bullish | win | 4.96R | $248.76 |
| 2026-09-11 09:00 | US500 | fvg | bullish | loss | -1.02R | $-52.59 |
| 2026-09-15 03:15 | US500 | weeklysweep | bullish | win | 4.97R | $254.28 |
| 2026-09-10 23:00 | US100 | divergence | bullish | win | 3.00R | $161.40 |
| 2026-09-11 08:00 | US100 | cbdr | bearish | loss | -1.10R | $-60.40 |
| 2026-09-13 17:15 | US100 | nwog | bullish | loss | -1.01R | $-55.19 |
| 2026-09-14 09:30 | US100 | silverbullet | bullish | win | 2.99R | $161.81 |
| 2026-09-16 09:00 | US100 | cbdr | bearish | loss | -1.30R | $-71.40 |
| 2026-09-11 07:30 | XAUUSD | fvg | bearish | loss | -1.02R | $-60.08 |
| 2026-09-11 08:15 | XAUUSD | fvg | bullish | loss | -1.00R | $-58.53 |
| 2026-09-16 10:15 | XAUUSD | fvg | bullish | loss | -1.01R | $-58.88 |

## B — 7 mécanismes sans CBDR (le dernier ajouté), pyramidage ON

- **85 trades** (17 gagnants, 68 perdants, WR 20.0%)
- Solde final : $9563.61 (-4.36%)
- ❌ **Drawdown max 10% franchi** le 2026-06-28T18:00:00.000Z (solde $9616.33 <= plancher $9633.81)
- ✅ Perte quotidienne max 3% jamais atteinte

| Mécanisme | Trades | Gagnants | R net moyen | PnL total |
|---|---|---|---|---|
| silverbullet | 34 | 10 | 0.14R | $226.89 |
| pyramid | 19 | 1 | -0.75R | $-718.05 |
| fvg | 17 | 4 | 0.30R | $241.06 |
| weeklysweep | 15 | 2 | -0.23R | $-186.28 |

**Semaine dernière** (2026-09-10 → fin) : 0 trade(s), 0 gagnant(s), PnL $0.00.

## Écart

B − A : $-1168.13 (-11.68% du solde de départ), -262 trade(s) de différence.