# Comparaison : 8 mécanismes actuels vs 7 mécanismes (sans CBDR) + pyramidage — 7 mois + semaine dernière

Question d'Esdras : "les 8 strategy live... performance globale dans un compte 10k vs la performance sans les derniers ajouts et pyramid enable", sur les 7 derniers mois + la semaine dernière. Même méthode que la simulation FTMO précédente (`LiveStrategyEngine.warmUp()`, config/garde-fous réels via `accountRegistry.buildEffectiveConfig`), mêmes données réelles fusionnées (`data/real-data-2026-02-to-09/` + `data/real-data-2026-09-17/`, dédupliquées) — **2026-02-10 → 2026-09-17**. Solde de départ $10000.00, risque 0.5%/trade. Cible FTMO +10% désactivée dans les DEUX passages (comparaison de performance pure sur fenêtre fixe, pas un test "passe/rate" — sinon celui qui atteint +10% en premier s'arrêterait artificiellement plus tôt que l'autre). Perte quotidienne 3% et drawdown max 10% (trailing fin de journée) restent actifs et rapportés.

⚠ Le pyramidage n'est pas résolu par `LiveStrategyEngine` lui-même (une fois la demande envoyée, le moteur "n'a plus rien à suivre" - la résolution réelle passe par les événements du broker en production, hors de cette classe). Simulé ici : remplissage immédiat au prix calculé (pas de glissement/rejet modélisé, comme pour toutes les autres entrées de ce projet), résolution par scan des bougies suivantes (stop/cible/timeout 480 bougies, même convention que tous les autres modules de backtest).

## A — 8 mécanismes actuels (avec CBDR), pyramidage OFF (état de production actuel)

- **347 trades** (101 gagnants, 246 perdants, WR 29.1%)
- Solde final : $17021.57 (+70.22%)
- ❌ **Drawdown max 10% franchi** le 2026-09-02T03:45:00.000Z (solde $17021.57 <= plancher $17098.79)
- ✅ Perte quotidienne max 3% jamais atteinte

| Mécanisme | Trades | Gagnants | R net moyen | PnL total |
|---|---|---|---|---|
| fvg | 106 | 30 | 0.56R | $4136.54 |
| silverbullet | 97 | 27 | 0.07R | $247.56 |
| cbdr | 47 | 17 | 0.39R | $1278.55 |
| judaswing | 35 | 7 | -0.41R | $-1299.22 |
| weeklysweep | 26 | 6 | 0.35R | $526.71 |
| divergence | 22 | 8 | 0.45R | $719.18 |
| nwog | 14 | 6 | 1.54R | $1412.25 |

**Semaine dernière** (2026-09-10 → fin) : 12 trade(s), 6 gagnant(s), PnL $1008.84.

| Date entrée | Symbole | Mécanisme | Direction | Issue | R net | PnL |
|---|---|---|---|---|---|---|
| 2026-09-11 00:15 | US500 | weeklysweep | bullish | win | 4.96R | $281.52 |
| 2026-09-11 09:00 | US500 | fvg | bullish | loss | -1.02R | $-59.51 |
| 2026-09-15 03:15 | US500 | weeklysweep | bullish | win | 4.97R | $287.77 |
| 2026-09-10 23:00 | US100 | divergence | bullish | win | 3.00R | $241.18 |
| 2026-09-11 08:00 | US100 | cbdr | bearish | win | 2.90R | $236.67 |
| 2026-09-11 08:15 | US100 | fvg | bullish | loss | -1.01R | $-83.89 |
| 2026-09-13 17:15 | US100 | nwog | bullish | loss | -1.01R | $-83.71 |
| 2026-09-14 09:30 | US100 | silverbullet | bullish | win | 2.99R | $245.41 |
| 2026-09-16 09:00 | US100 | cbdr | bearish | win | 2.70R | $224.92 |
| 2026-09-11 07:30 | XAUUSD | fvg | bearish | loss | -1.02R | $-95.30 |
| 2026-09-11 08:15 | XAUUSD | fvg | bullish | loss | -1.00R | $-92.84 |
| 2026-09-16 10:15 | XAUUSD | fvg | bullish | loss | -1.01R | $-93.39 |

## B — 7 mécanismes sans CBDR (le dernier ajouté), pyramidage ON

- **87 trades** (19 gagnants, 68 perdants, WR 21.8%)
- Solde final : $9946.15 (-0.54%)
- ❌ **Drawdown max 10% franchi** le 2026-06-29T08:30:00.000Z (solde $9946.15 <= plancher $9961.71)
- ✅ Perte quotidienne max 3% jamais atteinte

| Mécanisme | Trades | Gagnants | R net moyen | PnL total |
|---|---|---|---|---|
| silverbullet | 35 | 11 | 0.22R | $379.30 |
| pyramid | 20 | 1 | -0.76R | $-812.82 |
| weeklysweep | 17 | 2 | -0.33R | $-302.46 |
| fvg | 15 | 5 | 0.88R | $682.11 |

**Semaine dernière** (2026-09-10 → fin) : 0 trade(s), 0 gagnant(s), PnL $0.00.

## Écart

B − A : $-7075.43 (-70.75% du solde de départ), -260 trade(s) de différence.