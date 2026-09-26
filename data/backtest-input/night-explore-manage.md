# Recherche de nuit — exploration 2011-2018, famille C (gestion des règles FVG sélectionnées)

Script `scripts/runNightManageExplore.js`. Chaque variante change UNE chose à la règle de base. Retenue = t ≥ 2, deux moitiés positives, ≥ 60 trades (la base elle-même ne compte pas comme variante C).

| Base | Marché | Variante | Trades | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux | Réentrées |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | US100 | base (sans changement) | 684 | +0.163 | +111.4 | 2.49 | +72.6 / +38.8 | 1.25 | 41.3 | 0 |
| A1 | US100 | réentrée sur le même FVG après un stop | 776 | +0.172 | +133.2 | 2.79 | +85.2 / +48.0 | 1.26 | 39.5 | 92 |
| A1 | US100 | seuil de rentabilité à +1R | 684 | +0.121 | +83.1 | 2.17 | +36.7 / +46.4 | 1.25 | 26.9 | 0 |
| A1 | US100 | sortie à 12h | 684 | +0.169 | +115.3 | 2.50 | +73.8 / +41.5 | 1.25 | 43.5 | 0 |
| A1 | US100 | sortie à 16h | 684 | +0.186 | +127.6 | 2.70 | +82.2 / +45.3 | 1.27 | 46.9 | 0 |
| A1 | US100 | un seul trade par jour | 635 | +0.145 | +91.8 | 2.15 | +59.6 / +32.2 | 1.22 | 35.7 | 0 |
| A2 | XAUUSD | base (sans changement) | 1636 | +0.083 | +136.4 | 2.41 | +54.7 / +81.8 | 1.14 | 40.8 | 0 |
| A2 | XAUUSD | réentrée sur le même FVG après un stop | 1645 | +0.082 | +135.2 | 2.38 | +54.7 / +80.5 | 1.14 | 40.8 | 11 |
| A2 | XAUUSD | seuil de rentabilité à +1R | 1671 | +0.059 | +99.0 | 1.92 | +45.7 / +53.3 | 1.12 | 40.7 | 0 |
| A2 | XAUUSD | sortie à 12h | 1636 | +0.082 | +133.6 | 2.34 | +59.0 / +74.6 | 1.13 | 42.7 | 0 |
| A2 | XAUUSD | sortie à 16h | 1636 | +0.074 | +120.7 | 2.09 | +55.4 / +65.3 | 1.12 | 42.0 | 0 |
| A2 | XAUUSD | un seul trade par jour | 1391 | +0.104 | +144.8 | 2.75 | +47.1 / +97.6 | 1.17 | 34.9 | 0 |
| B1 | US100 | base (sans changement) | 842 | +0.133 | +112.3 | 2.26 | +73.3 / +39.0 | 1.20 | 36.3 | 0 |
| B1 | US100 | réentrée sur le même FVG après un stop | 974 | +0.162 | +157.8 | 2.94 | +93.2 / +64.5 | 1.25 | 37.0 | 136 |
| B1 | US100 | seuil de rentabilité à +1R | 844 | +0.106 | +89.2 | 2.09 | +38.7 / +50.6 | 1.22 | 24.8 | 0 |
| B1 | US100 | sortie à 12h | 842 | +0.142 | +119.6 | 2.34 | +79.2 / +40.5 | 1.21 | 41.0 | 0 |
| B1 | US100 | sortie à 16h | 842 | +0.157 | +131.9 | 2.53 | +87.6 / +44.3 | 1.22 | 43.9 | 0 |
| B1 | US100 | un seul trade par jour | 774 | +0.116 | +90.0 | 1.91 | +58.5 / +31.5 | 1.17 | 33.7 | 0 |

## Sélection C (figée pour la validation)

1. B1 (US100, âge 5-12, 9h30-11h — aucun — marché, stop derrière la zone, 3R) + réentrée sur le même FVG après un stop : 974 trades, +0.162 R/trade, t 2.94
2. A1 (US100, âge 5-12, 9h30-11h — 4 h en faveur — marché, stop derrière la zone, 3R) + réentrée sur le même FVG après un stop : 776 trades, +0.172 R/trade, t 2.79

