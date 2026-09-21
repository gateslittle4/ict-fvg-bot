# Les annonces macro changent-elles la performance du bot ? (étage 1)

7132 trades indépendants 2019-2025, stops d'origine, spread inclus, 328 annonces officielles (CPI, emplois, Fed, PIB avancé, PCE ; sans BCE ni ventes au détail). **Trouvaille = |t| ≥ 2,6 sur 2019-2023, même signe sur 2024-2025, même signe avec les deux règles d'égalité stop/objectif.**

| Groupe | Trades (entr. / test) | R moyen entr. : stop d'abord / objectif d'abord | t (entr.) | R moyen test (stop d'abord / objectif d'abord) | Trouvaille ? |
|---|---|---|---|---|---|
| Tous les trades | 4902 / 2230 | +0.032 / +0.319 | 1.1 | +0.064 / +0.440 | — |
| REST (loin des annonces) | 4719 / 2150 | +0.021 / +0.283 | 0.7 | +0.081 / +0.445 | non |
| POST : 0-2 h après une annonce | 148 / 70 | +0.296 / +1.472 | 1.6 | -0.293 / +0.422 | non |
| PRE : 2 h avant une annonce | 35 / 10 | +0.338 / +0.338 | 0.8 | -1.073 / -0.473 | non |
| POST · FOMC | 12 / 8 | -0.215 / +0.285 | -0.4 | -0.531 / -0.531 | non |
| POST · CPI | 50 / 27 | +0.274 / +1.114 | 0.9 | +0.035 / +0.627 | non |
| POST · NFP | 53 / 18 | +0.496 / +2.081 | 1.4 | -0.177 / +1.379 | non |
| POST · PIB/PCE | 33 / 17 | +0.194 / +1.467 | 0.5 | -0.823 / -0.470 | non |

**Trouvailles retenues : aucune.**

## Limites

- Calendrier 2019-2025 sans BCE (2024+ seulement) ni ventes au détail ; heures BEA supposées à 08:30 ET ; annonces non programmées absentes.
- Règlement M15 borné par les deux règles d'égalité ; entrées des modules de backtest ; pas de valeurs macro (chiffres publiés) ni de « surprise » : seulement la proximité temporelle.
- 8 groupes définis à l'avance ; toute nouvelle coupe ajoutée après coup augmenterait le risque de hasard.