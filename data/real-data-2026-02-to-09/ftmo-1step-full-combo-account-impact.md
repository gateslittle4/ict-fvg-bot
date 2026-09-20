# Simulation compte complet — tous les mécanismes live combinés, cycle FTMO 1-Step (10%)

Question d'Esdras : "tous les strategy combiné, le cycle de 10% de FTMO avec tous ses contraintes, pour les 7 derniers mois et cette semaine." Rejoue la VRAIE logique de production (`LiveStrategyEngine.warmUp()`, la config réelle de `config.js`, les 8 mécanismes actuellement live : FVG, Divergence, NWOG, Judas Swing, Weekly Sweep, Breaker Block, Silver Bullet, CBDR) contre un vrai `GuardrailEngine` configuré EXACTEMENT comme un compte FTMO 1-Step Challenge réel (via `accountRegistry.buildEffectiveConfig`, pas des valeurs recopiées à la main) : cible +10%, perte quotidienne max 3%, drawdown max 10% (trailing fin de journée), plus les garde-fous propres du bot (max 3 trades/jour, cooldown 30 min après une perte). Données : vraies bougies cTrader jamais retouchées, fusion de `data/real-data-2026-02-to-09/` et `data/real-data-2026-09-17/` (déduplique par timestamp) — **2026-02-10 → 2026-09-17**. Solde de départ $10000.00 (purement pour le calcul en %, la taille réelle du compte ne change rien aux seuils), risque 0.5% par trade (valeur validée, déjà utilisée dans toutes les simulations FTMO de ce projet).

⚠ Le pyramidage (`CONFIG.pyramid`) est EXCLU de cette simulation — désactivé par défaut (`PYRAMID_ENABLED`), non reproduit ici pour rester sur les 8 mécanismes générateurs de signaux. Si le pyramidage est actif en réel, ce résultat sous-estime légèrement le volume de trades (pas le risque par trade, chaque unité de pyramidage a son propre stop indépendant).

⚠ Deux passages distincts, MÊMES données/config, une seule différence : le passage "réel" applique la règle FTMO réelle (cible +10% atteinte = plus aucun nouveau trade, comportement authentique du bot en production depuis le 2026-09) et répond à "est-ce que le challenge passe". Le passage "activité continue" retire uniquement ce blocage de cible (perte quotidienne/drawdown/cooldown/max-trades restent identiques et actifs) pour ne pas que la section "cette semaine" affiche zéro trade juste parce que le compte réel se serait déjà arrêté des mois plus tôt après avoir gagné le challenge — ce second passage n'est PAS un vrai compte FTMO (personne ne continue de trader un challenge déjà réussi), il sert uniquement à montrer l'activité récente du combo.

## Résultat sur les 7 mois complets (passage "réel", cible FTMO active)

- **156 trades** au total (40 gagnants, 116 perdants, WR 25.6%)
- Solde final : $11134.76 (+11.35%)
- **✅ Cible +10% atteinte** le 2026-04-17T09:30:00.000Z (solde $11134.76 >= cible $11000.00) — le challenge aurait passé à ce moment. La règle "profit_target_reached" bloque alors toute nouvelle ouverture (comportement réel du bot depuis le 2026-09, voir HANDOFF.md), d'où le peu de trades après cette date dans ce passage.
- ✅ Drawdown max de 10% jamais franchi sur cette fenêtre.
- ✅ Perte quotidienne max de 3% jamais atteinte.

| Mécanisme | Trades | Gagnants | R net moyen | PnL total |
|---|---|---|---|---|
| silverbullet | 69 | 19 | 0.06R | $215.81 |
| fvg | 38 | 7 | 0.00R | $-19.39 |
| weeklysweep | 24 | 6 | 0.46R | $541.34 |
| cbdr | 15 | 6 | 0.53R | $413.85 |
| nwog | 7 | 1 | -0.16R | $-69.43 |
| divergence | 3 | 1 | 0.33R | $52.57 |

## Cette semaine (2026-09-10 → 2026-09-17, passage "activité continue")

- **11 trade(s)** (4 gagnant(s)) — PnL $409.16 (+4.09% du solde de départ de ce passage)

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

Statut garde-fous à la fin de cette semaine (passage "réel") : 🔴 bloqué (profit_target_reached).