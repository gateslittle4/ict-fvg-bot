# Combo actuel (US100/US500/XAUUSD/EURUSD, GER40 retiré) — entraînement / test-forward 2026-01-01 → aujourd'hui, sur M1 réel sans trous

Données : `data/real-m1-full/*.csv.gz` (FP Markets, M1 réel, EURUSD/XAUUSD dès 2022-05-19, US100/US500 dès 2023-01-11, jusqu'à ~2026-09-21), M15 reconstruits du M1. Un seul `warmUp()` sur tout l'historique disponible par risque% testé (mécanismes réels, `LiveStrategyEngine`), puis rejeu dans un vrai `GuardrailEngine` (garde-fous du combo en prod : 3 trades/jour, pause 30 min après perte, arrêt du jour à -2%). **Entraînement** = avant 2026-01-01 (contexte + référence, aucun réglage fait ici). **Test/forward** = 2026-01-01 → dernière bougie dispo, jamais vu par aucun réglage antérieur du combo (tous arrêtés à 2025).

**Lecture :** garde-fous réels mais coûts partiels (spread mesuré par paire, sans commission/swap/glissement réel ni le correctif de géométrie d'ordre au marché encore non déployé — voir `order-geometry-live-vs-backtest.md`) : niveau absolu encore surestimé par rapport à la démo réelle (~+31 % du vrai moteur sur 7 mois de suivi réel). Lire les écarts relatifs entre configurations, pas les dollars comme une promesse.

## Risque 0.25%/trade

| Fenêtre | Trades | Vétos garde-fou | Compte continu $10k (résultat en %) | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | 2002 | 365 | +17.81% ($11781) | 14.3% | 4/3/1 |
| **Test/forward (2026-01-01 → 2026-09-21)** | **491** | **91** | **+3.22% ($10322)** | **8.3%** | **0/0/1** |

### Détail des cycles FTMO 1-Step — fenêtre test/forward (2026-01-01 → aujourd'hui)

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-09-21 | 262 | 400 | en cours (+3.22%) | $10322.47 |

## Risque 0.3%/trade

| Fenêtre | Trades | Vétos garde-fou | Compte continu $10k (résultat en %) | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | 2002 | 365 | +21.11% ($12111) | 17.0% | 4/3/1 |
| **Test/forward (2026-01-01 → 2026-09-21)** | **491** | **91** | **+3.75% ($10375)** | **9.9%** | **1/0/1** |

### Détail des cycles FTMO 1-Step — fenêtre test/forward (2026-01-01 → aujourd'hui)

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-07-20 | 199 | 299 | RÉUSSI (+10%) | $11044.09 |
| 2 | 2026-07-20 | 2026-09-21 | 63 | 101 | en cours (-6.06%) | $9394.45 |

## Risque 0.5%/trade

| Fenêtre | Trades | Vétos garde-fou | Compte continu $10k (résultat en %) | Pire baisse | FTMO 1-Step (réussis/ratés/en cours) |
|---|---|---|---|---|---|
| Entraînement (< 2026-01-01) | 2002 | 365 | +33.01% ($13301) | 27.5% | 11/14/1 |
| **Test/forward (2026-01-01 → 2026-09-21)** | **491** | **91** | **+5.46% ($10546)** | **16.0%** | **2/2/1** |

### Détail des cycles FTMO 1-Step — fenêtre test/forward (2026-01-01 → aujourd'hui)

| Cycle | Début | Fin | Jours | Trades | Résultat | Solde final |
|---|---|---|---|---|---|---|
| 1 | 2026-01-01 | 2026-03-10 | 68 | 106 | RATÉ (drawdown -10%) | $9161.44 |
| 2 | 2026-03-10 | 2026-04-21 | 42 | 65 | RÉUSSI (+10%) | $11061.12 |
| 3 | 2026-04-21 | 2026-07-06 | 76 | 106 | RÉUSSI (+10%) | $11096.35 |
| 4 | 2026-07-06 | 2026-08-20 | 45 | 79 | RATÉ (drawdown -10%) | $9271.22 |
| 5 | 2026-08-20 | 2026-09-21 | 32 | 45 | en cours (+0.65%) | $10065.06 |
