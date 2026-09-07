# Impact au niveau du COMPTE — 3 STRATÉGIES (FVG + Divergence + Turtle System 2), seulement US100/US500, règles FTMO 1-Step

⚠ Compte $10000, AUCUN 3e instrument (pas d'or ici) - test direct de : empiler des stratégies sur les mêmes 2 paires suffit-il, sans avoir besoin d'un nouvel instrument ? Un seul budget de garde-fous PARTAGÉ entre les 3 mécanismes (FVG, Divergence, Turtle System 2), garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après perte, perte quotidienne max 2% - plus strict que le 3% réel de FTMO 1-Step). NETTING À TROIS : au plus une position ouverte par instrument, tous mécanismes confondus. Turtle System 2 = 55j entrée / 20j sortie, stop 2xATR(20), paramètres ORIGINAUX publiés (pas ajustés sur nos données - voir breakout-strategy-analysis.md). **Cible = +10% une seule fois (FTMO 1-Step). Perte totale max = TRAILING sur le plus haut solde jamais atteint (10%).**

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 75 (11 FVG + 56 div. + 8 turtle) | 38.7% | 1.2% | 4.3% | non | jour 300 | $11665 |
| 2020 (train) | 69 (14 FVG + 49 div. + 6 turtle) | 41.2% | 1.8% | 3.4% | non | jour 119 | $11939 |
| 2021 (train) | 79 (14 FVG + 54 div. + 11 turtle) | 32.9% | 5.3% | 6.6% | non | jamais | $10681 |
| 2022 (train) | 99 (15 FVG + 72 div. + 12 turtle) | 30.6% | 3.8% | 6.6% | non | jour 312 | $11311 |
| 2023 (train) | 71 (11 FVG + 52 div. + 8 turtle) | 33.8% | 2.6% | 4.6% | non | jour 225 | $11405 |
| 2024 (test) | 64 (11 FVG + 44 div. + 9 turtle) | 36.5% | 0.5% | 5.4% | non | jour 263 | $11124 |
| 2025 (test) | 65 (15 FVG + 43 div. + 7 turtle) | 36.9% | 0.0% | 4.2% | non | jour 135 | $11446 |