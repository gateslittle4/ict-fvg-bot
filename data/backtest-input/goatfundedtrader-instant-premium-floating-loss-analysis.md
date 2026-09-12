# GoatFundedTrader Instant Premium — la règle de perte flottante tient-elle avec notre config actuelle?

Esdras : "construis l'analyse de perte flottante pour GoatFundedTrader." Suite directe de la vérification de l'Instant Premium Model (HANDOFF.md, 2026-09-12) : une règle jamais modélisée dans ce projet - perte NON RÉALISÉE de **-1%** (comptes achetés à partir du 2026-09-02, donc celle qui s'applique à tout nouvel achat aujourd'hui ; -1.5% pour les comptes plus anciens) du solde, À N'IMPORTE QUEL MOMENT, ferme le compte DÉFINITIVEMENT - avant même qu'un stop soit touché. Tous les autres tests de ce projet (chaque script FTMO/FundingPips, GuardrailEngine) ne regardent que le solde RÉALISÉ à la clôture d'un trade - aucun ne voyait le creux intermédiaire d'une position encore ouverte. Ce script construit ce suivi depuis zéro : P&L flottant réel à chaque bougie (pire excursion dans la bougie, même convention que les vérifications stop/target existantes), sommé sur TOUS les symboles ayant une position ouverte en même temps (jusqu'à 4 : US100/US500/XAUUSD/EURUSD).

**Deux mécanismes de bust testés** : (1) la règle de perte flottante ci-dessus, et (2) la perte totale de 6% - qui, chez GoatFundedTrader Instant Premium, est AUSSI basée sur l'équité en temps réel ("trailing, sur l'équité, ne redescend jamais"), pas seulement le solde réalisé comme FTMO/FundingPips - donc elle a besoin du même suivi flottant. La perte quotidienne (3%) reste un simple garde-fou qui bloque les nouvelles entrées (comme partout ailleurs ce mois-ci), pas un bust - rien dans les règles sourcées ne dit explicitement que la dépasser ferme le compte, contrairement à la règle de perte flottante.

⚠️ **Hypothèse de modélisation à connaître** : la "perte flottante" est lue ici comme le P&L flottant NET du compte (un gain flottant sur un symbole peut compenser une perte flottante sur un autre - exactement comme l'équité réelle d'un courtier), pas la pire position seule. Si GoatFundedTrader mesure en réalité chaque position individuellement, leur vraie règle serait encore plus stricte que ce qui est modélisé ici. Fenêtre week-end/news de l'Instant Premium non modélisée (conséquence "profit annulé/plafonné", pas un bust, contrairement à Zero - hors scope ici).

## Risque 0.5%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 90 | 28.9% | 4.6% | 0.79% | **ÉQUITÉ 6%** (2019-04-15) | $10582 |
| 2020 (train) | 22 | 13.6% | 6.0% | 0.61% | **ÉQUITÉ 6%** (2020-01-31) | $9396 |
| 2021 (train) | 102 | 26.5% | 5.8% | 0.79% | **ÉQUITÉ 6%** (2021-05-09) | $10309 |
| 2022 (train) | 206 | 29.6% | 6.2% | 0.92% | **ÉQUITÉ 6%** (2022-08-30) | $13436 |
| 2023 (train) | 16 | 6.3% | 5.9% | 0.49% | **ÉQUITÉ 6%** (2023-01-20) | $9414 |
| 2024 (test) | 77 | 32.9% | 5.8% | 0.59% | **ÉQUITÉ 6%** (2024-04-11) | $11217 |
| 2025 (test) | 205 | 35.6% | 5.3% | 0.65% | **ÉQUITÉ 6%** (2025-08-22) | $17212 |

**Bilan 0.5%** : 7/7 années busted (0 par perte flottante : aucune — 7 par équité 6% : 2019, 2020, 2021, 2022, 2023, 2024, 2025). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.92%**.

## Risque 0.3%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 3.7% | 0.52% | non | $13390 |
| 2020 (train) | 228 | 29.5% | 6.2% | 0.40% | **ÉQUITÉ 6%** (2020-09-15) | $12147 |
| 2021 (train) | 232 | 29.4% | 6.0% | 0.47% | **ÉQUITÉ 6%** (2021-10-04) | $11919 |
| 2022 (train) | 319 | 30.4% | 4.0% | 0.55% | non | $13662 |
| 2023 (train) | 312 | 31.2% | 4.5% | 0.55% | non | $13748 |
| 2024 (test) | 163 | 30.0% | 5.5% | 0.57% | **ÉQUITÉ 6%** (2024-07-30) | $11473 |
| 2025 (test) | 343 | 34.8% | 3.2% | 0.39% | non | $17476 |

**Bilan 0.3%** : 3/7 années busted (0 par perte flottante : aucune — 3 par équité 6% : 2020, 2021, 2024). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.57%**.

## Risque 0.25%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 3.1% | 0.44% | non | $12765 |
| 2020 (train) | 230 | 29.3% | 5.7% | 0.34% | **ÉQUITÉ 6%** (2020-09-17) | $11708 |
| 2021 (train) | 236 | 28.9% | 6.1% | 0.39% | **ÉQUITÉ 6%** (2021-10-08) | $11451 |
| 2022 (train) | 319 | 30.4% | 3.4% | 0.46% | non | $12982 |
| 2023 (train) | 312 | 31.2% | 3.8% | 0.46% | non | $13051 |
| 2024 (test) | 306 | 30.8% | 5.3% | 0.47% | non | $13049 |
| 2025 (test) | 343 | 34.8% | 2.7% | 0.32% | non | $15944 |

**Bilan 0.25%** : 2/7 années busted (0 par perte flottante : aucune — 2 par équité 6% : 2020, 2021). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.47%**.

## Risque 0.15%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 1.9% | 0.26% | non | $11588 |
| 2020 (train) | 336 | 29.0% | 4.4% | 0.22% | non | $11463 |
| 2021 (train) | 324 | 28.3% | 4.5% | 0.24% | non | $11145 |
| 2022 (train) | 319 | 30.4% | 2.0% | 0.28% | non | $11708 |
| 2023 (train) | 312 | 31.2% | 2.3% | 0.28% | non | $11747 |
| 2024 (test) | 306 | 30.8% | 3.2% | 0.28% | non | $11746 |
| 2025 (test) | 343 | 34.8% | 1.6% | 0.19% | non | $13251 |

**Bilan 0.15%** : 0/7 années busted (0 par perte flottante : aucune — 0 par équité 6% : aucune). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.28%**.

## Risque 0.1%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 1.3% | 0.17% | non | $11036 |
| 2020 (train) | 336 | 29.0% | 2.9% | 0.15% | non | $10958 |
| 2021 (train) | 324 | 28.3% | 3.0% | 0.16% | non | $10753 |
| 2022 (train) | 319 | 30.4% | 1.4% | 0.18% | non | $11113 |
| 2023 (train) | 312 | 31.2% | 1.5% | 0.18% | non | $11138 |
| 2024 (test) | 306 | 30.8% | 2.1% | 0.19% | non | $11137 |
| 2025 (test) | 343 | 34.8% | 1.1% | 0.13% | non | $12070 |

**Bilan 0.1%** : 0/7 années busted (0 par perte flottante : aucune — 0 par équité 6% : aucune). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.19%**.

## Risque 0.05%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil 1%) | Busté? | Solde final |
|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 0.6% | 0.09% | non | $10507 |
| 2020 (train) | 336 | 29.0% | 1.5% | 0.07% | non | $10470 |
| 2021 (train) | 324 | 28.3% | 1.5% | 0.08% | non | $10372 |
| 2022 (train) | 319 | 30.4% | 0.7% | 0.09% | non | $10544 |
| 2023 (train) | 312 | 31.2% | 0.8% | 0.09% | non | $10556 |
| 2024 (test) | 306 | 30.8% | 1.1% | 0.09% | non | $10555 |
| 2025 (test) | 343 | 34.8% | 0.5% | 0.06% | non | $10989 |

**Bilan 0.05%** : 0/7 années busted (0 par perte flottante : aucune — 0 par équité 6% : aucune). Pire perte flottante atteinte sur ces 7 années (busted incluses) : **0.09%**.

## Verdict

| Risque | Années bustées | Dont perte flottante | Dont équité 6% | Pire perte flottante (toutes années) |
|---|---|---|---|---|
| 0.5% | 7/7 | 0 | 7 | 0.92% |
| 0.3% | 3/7 | 0 | 3 | 0.57% |
| 0.25% | 2/7 | 0 | 2 | 0.47% |
| 0.15% | 0/7 | 0 | 0 | 0.28% |
| 0.1% | 0/7 | 0 | 0 | 0.19% |
| 0.05% | 0/7 | 0 | 0 | 0.09% |

**Le risque le plus élevé qui ne busait AUCUNE année testée (ni perte flottante, ni équité 6%) est 0.15%/trade** (pire perte flottante atteinte : 0.28%, sous le seuil de 1%). À comparer avec le risque actuel de production (0.3% en mode "live") - à ce niveau, 3/7 années bustent déjà.

**Résultat inattendu, à souligner** : sur les 12 busts trouvés tous risques confondus, 0 viennent de la règle de perte flottante (celle qu'on cherchait à mesurer) contre **12 de la règle de perte totale 6% équité**. Même à 0.5%/trade avec 4 positions ouvertes en même temps, la perte flottante ne dépasse jamais 0.92% (sous le seuil de 1%) - c'est la règle des 6% qui casse le compte en premier, presque à chaque fois, PARCE QU'elle suit l'équité en temps réel (chaque pic flottant intra-trade compte comme un nouveau sommet, contrairement au FTMO 10% qui ne suit que le solde réalisé) - un mécanisme bien plus strict en pratique que son chiffre nominal (6%) ne le suggère.

**Rien codé dans `src/` au-delà du profil `GOATFUNDEDTRADER_INSTANT_PREMIUM` déjà ajouté à `src/propFirms/` (documentaire, pas encore branché sur un vrai compte)** - ce script est une analyse de recherche seulement. Aucune décision de trading réelle prise ici.