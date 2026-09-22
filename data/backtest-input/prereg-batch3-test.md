# Pré-enregistrement lot 3 — TEST (2020-2025), lecture unique des hypothèses retenues

Règles : `data/backtest-input/preregistration-batch3-2026-09-21.md`. Bougies journalières 17:00-17:00 (temps moteur) reconstruites des M15, spread = 2 × le défaut, swap 0,01 %/jour du notionnel, R net.

| Hypothèse | Trades | R net/trade | R total | t | Corrélation mensuelle (2023-2025) | Pire baisse à 0,3 % | Verdict |
|---|---|---|---|---|---|---|---|
| RSI(2) retour à la moyenne US500 | 58 | +0.135 | +7.8 | 2.23 | -0.12 | 0.8 % | **RÉUSSIE : candidate (mode alerte)** |
| ↳ sensibilité swap 0,02 %/jour (sans effet sur la décision) | 58 | +0.122 | +7.1 | 2.02 | — | — | — |

Test lu UNE fois. Aucune adoption directe. Le complément forward 2026 (données M1 réelles) n'a pas été calculé ici : à faire séparément pour toute candidate.