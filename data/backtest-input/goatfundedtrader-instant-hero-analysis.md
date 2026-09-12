# GoatFundedTrader Instant HERO — perte flottante, équité 5% ET la règle de consistance 15%

Esdras, après avoir trouvé Instant Premium trop cher : "teste le Instant HERO model, il a beaucoup de règles, surtout le 15% consistency." Vérifié en direct sur la page d'aide officielle de GoatFundedTrader - Instant HERO est un programme DIFFÉRENT d'Instant Premium (pas le même sous un autre nom) : perte totale plus serrée (5% au lieu de 6%), la MÊME règle de perte flottante (-1%, fermeture instantanée), MAIS en plus une vraie règle de consistance à 15% qu'Instant Premium n'a pas du tout - et un meilleur split (90% au lieu de 80%).

**Trois mécanismes testés** :
1. **Perte flottante -1%** : même suivi intra-bougie que pour Instant Premium (voir `runGoatFundedTraderFloatingLossAnalysis.js`) - P&L flottant NET du compte, sommé sur les 4 symboles.
2. **Perte totale 5%**, trailing sur l'équité temps réel - même mécanisme qu'Instant Premium, juste plus serré. La source précise que ce plancher "reset après chaque paiement" - NON modélisé ici (le rythme réel des retraits est une décision du trader, pas quelque chose que la stratégie seule détermine), donc le taux de bust ci-dessous est une estimation CONSERVATRICE (pire cas, plancher qui ne remonte jamais) - le vrai taux serait probablement plus bas avec de vrais retraits réguliers.
3. **La règle de consistance 15%** - celle demandée explicitement. Confirmée par la source : NE ferme PAS le compte, bloque seulement une demande de retrait tant que le jour le plus profitable dépasse 15% du profit total de la période. Modélisée ici comme une fenêtre glissante de 14 jours calendaires (le cycle de retrait) - la source ne précise pas la fenêtre exacte utilisée pour évaluer la règle, c'est une hypothèse de modélisation documentée, pas un mécanisme confirmé. Le "total" utilisé est le profit NET de la fenêtre (gains moins pertes des autres jours) - si les autres jours de la fenêtre sont globalement perdants, ce total net peut être petit, et le meilleur jour peut alors en représenter largement plus de 100% (un artefact réel et connu de ce type de règle, pas un bug de ce script - visible dans les tableaux ci-dessous sous forme de pourcentages parfois très supérieurs à 100%).

La perte quotidienne (3%) reste un simple garde-fou (bloque les nouvelles entrées, pas un bust) - même convention que partout ailleurs ce mois-ci.

## Risque 0.5%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 88 | 29.5% | 4.6% | 0.79% | **ÉQUITÉ 5%** (2019-04-12) | **43/64** (pire: 2967% le 2019-02-07) | $10700 |
| 2020 (train) | 19 | 15.8% | 4.6% | 0.46% | **ÉQUITÉ 5%** (2020-01-30) | 0/16 | $9542 |
| 2021 (train) | 34 | 29.4% | 4.9% | 0.46% | **ÉQUITÉ 5%** (2021-02-22) | **19/27** (pire: 771% le 2021-01-10) | $10128 |
| 2022 (train) | 133 | 30.1% | 4.2% | 0.92% | **ÉQUITÉ 5%** (2022-06-13) | **72/93** (pire: 4746% le 2022-02-23) | $12254 |
| 2023 (train) | 14 | 7.1% | 4.8% | 0.49% | **ÉQUITÉ 5%** (2023-01-18) | 0/10 | $9517 |
| 2024 (test) | 71 | 34.3% | 4.7% | 0.59% | **ÉQUITÉ 5%** (2024-04-04) | **42/55** (pire: 583% le 2024-03-12) | $11357 |
| 2025 (test) | 20 | 35.0% | 4.8% | 0.49% | **ÉQUITÉ 5%** (2025-01-27) | **12/15** (pire: 100% le 2025-01-01) | $10385 |

**Bilan 0.5%** : 7/7 années busted (0 par perte flottante — 7 par équité 5%). Pire perte flottante atteinte : **0.92%**. Consistance 15% : 188/280 jours-fenêtres en violation (67% du temps un retrait aurait été bloqué pour cette raison).

## Risque 0.3%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 3.7% | 0.52% | non | **144/196** (pire: 4123% le 2019-04-26) | $13390 |
| 2020 (train) | 211 | 30.5% | 4.9% | 0.40% | **ÉQUITÉ 5%** (2020-08-26) | **92/143** (pire: 3097% le 2020-08-21) | $12321 |
| 2021 (train) | 229 | 29.8% | 5.0% | 0.47% | **ÉQUITÉ 5%** (2021-09-27) | **97/161** (pire: 903% le 2021-02-26) | $12041 |
| 2022 (train) | 319 | 30.4% | 4.0% | 0.55% | non | **165/223** (pire: 10669% le 2022-07-13) | $13662 |
| 2023 (train) | 63 | 21.0% | 4.4% | 0.55% | **ÉQUITÉ 5%** (2023-03-20) | **15/44** (pire: 1036% le 2023-01-24) | $9624 |
| 2024 (test) | 144 | 31.9% | 4.7% | 0.57% | **ÉQUITÉ 5%** (2024-07-03) | **73/108** (pire: 1209% le 2024-06-06) | $11573 |
| 2025 (test) | 343 | 34.8% | 3.2% | 0.39% | non | **188/228** (pire: 5146% le 2025-03-28) | $17476 |

**Bilan 0.3%** : 4/7 années busted (0 par perte flottante — 4 par équité 5%). Pire perte flottante atteinte : **0.57%**. Consistance 15% : 774/1103 jours-fenêtres en violation (70% du temps un retrait aurait été bloqué pour cette raison).

## Risque 0.25%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 3.1% | 0.44% | non | **144/196** (pire: 3879% le 2019-04-26) | $12765 |
| 2020 (train) | 228 | 29.5% | 5.2% | 0.34% | **ÉQUITÉ 5%** (2020-09-15) | **97/156** (pire: 2795% le 2020-08-21) | $11768 |
| 2021 (train) | 232 | 29.4% | 5.0% | 0.39% | **ÉQUITÉ 5%** (2021-10-04) | **97/163** (pire: 868% le 2021-02-26) | $11583 |
| 2022 (train) | 319 | 30.4% | 3.4% | 0.46% | non | **166/223** (pire: 32507% le 2022-07-07) | $12982 |
| 2023 (train) | 312 | 31.2% | 3.8% | 0.46% | non | **157/217** (pire: 2617% le 2023-09-11) | $13051 |
| 2024 (test) | 163 | 30.0% | 4.6% | 0.47% | **ÉQUITÉ 5%** (2024-07-30) | **81/123** (pire: 11573% le 2024-07-24) | $11219 |
| 2025 (test) | 343 | 34.8% | 2.7% | 0.32% | non | **188/228** (pire: 4294% le 2025-03-28) | $15944 |

**Bilan 0.25%** : 3/7 années busted (0 par perte flottante — 3 par équité 5%). Pire perte flottante atteinte : **0.47%**. Consistance 15% : 930/1306 jours-fenêtres en violation (71% du temps un retrait aurait été bloqué pour cette raison).

## Risque 0.15%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 1.9% | 0.26% | non | **144/196** (pire: 3469% le 2019-04-26) | $11588 |
| 2020 (train) | 336 | 29.0% | 4.4% | 0.22% | non | **137/227** (pire: 2339% le 2020-08-21) | $11463 |
| 2021 (train) | 324 | 28.3% | 4.5% | 0.24% | non | **127/223** (pire: 2695% le 2021-11-25) | $11145 |
| 2022 (train) | 319 | 30.4% | 2.0% | 0.28% | non | **166/223** (pire: 8531% le 2022-07-07) | $11708 |
| 2023 (train) | 312 | 31.2% | 2.3% | 0.28% | non | **158/217** (pire: 25123% le 2023-05-17) | $11747 |
| 2024 (test) | 306 | 30.8% | 3.2% | 0.28% | non | **148/221** (pire: 6936% le 2024-07-24) | $11746 |
| 2025 (test) | 343 | 34.8% | 1.6% | 0.19% | non | **188/228** (pire: 3347% le 2025-11-25) | $13251 |

**Bilan 0.15%** : 0/7 années busted (0 par perte flottante — 0 par équité 5%). Pire perte flottante atteinte : **0.28%**. Consistance 15% : 1068/1535 jours-fenêtres en violation (70% du temps un retrait aurait été bloqué pour cette raison).

## Risque 0.1%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 1.3% | 0.17% | non | **144/196** (pire: 3295% le 2019-04-26) | $11036 |
| 2020 (train) | 336 | 29.0% | 2.9% | 0.15% | non | **137/227** (pire: 2163% le 2020-08-21) | $10958 |
| 2021 (train) | 324 | 28.3% | 3.0% | 0.16% | non | **127/223** (pire: 2386% le 2021-11-25) | $10753 |
| 2022 (train) | 319 | 30.4% | 1.4% | 0.18% | non | **166/223** (pire: 6235% le 2022-07-07) | $11113 |
| 2023 (train) | 312 | 31.2% | 1.5% | 0.18% | non | **158/217** (pire: 14383% le 2023-05-17) | $11138 |
| 2024 (test) | 306 | 30.8% | 2.1% | 0.19% | non | **149/221** (pire: 57142% le 2024-09-09) | $11137 |
| 2025 (test) | 343 | 34.8% | 1.1% | 0.13% | non | **188/228** (pire: 3063% le 2025-11-25) | $12070 |

**Bilan 0.1%** : 0/7 années busted (0 par perte flottante — 0 par équité 5%). Pire perte flottante atteinte : **0.19%**. Consistance 15% : 1069/1535 jours-fenêtres en violation (70% du temps un retrait aurait été bloqué pour cette raison).

## Risque 0.05%/trade

| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil 1%) | Busté? | Jours en violation consistance 15% | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 281 | 33.2% | 0.6% | 0.09% | non | **145/196** (pire: 49552% le 2019-02-08) | $10507 |
| 2020 (train) | 336 | 29.0% | 1.5% | 0.07% | non | **137/227** (pire: 2011% le 2020-08-21) | $10470 |
| 2021 (train) | 324 | 28.3% | 1.5% | 0.08% | non | **127/223** (pire: 2141% le 2021-11-25) | $10372 |
| 2022 (train) | 319 | 30.4% | 0.7% | 0.09% | non | **166/223** (pire: 4915% le 2022-07-07) | $10544 |
| 2023 (train) | 312 | 31.2% | 0.8% | 0.09% | non | **158/217** (pire: 10089% le 2023-05-17) | $10556 |
| 2024 (test) | 306 | 30.8% | 1.1% | 0.09% | non | **149/221** (pire: 22653% le 2024-09-09) | $10555 |
| 2025 (test) | 343 | 34.8% | 0.5% | 0.06% | non | **188/228** (pire: 2824% le 2025-11-25) | $10989 |

**Bilan 0.05%** : 0/7 années busted (0 par perte flottante — 0 par équité 5%). Pire perte flottante atteinte : **0.09%**. Consistance 15% : 1070/1535 jours-fenêtres en violation (70% du temps un retrait aurait été bloqué pour cette raison).

## Verdict

| Risque | Années bustées | Dont perte flottante | Dont équité 5% | Pire perte flottante | Violations consistance 15% |
|---|---|---|---|---|---|
| 0.5% | 7/7 | 0 | 7 | 0.92% | 188/280 |
| 0.3% | 4/7 | 0 | 4 | 0.57% | 774/1103 |
| 0.25% | 3/7 | 0 | 3 | 0.47% | 930/1306 |
| 0.15% | 0/7 | 0 | 0 | 0.28% | 1068/1535 |
| 0.1% | 0/7 | 0 | 0 | 0.19% | 1069/1535 |
| 0.05% | 0/7 | 0 | 0 | 0.09% | 1070/1535 |

**Le risque le plus élevé qui ne busait AUCUNE année testée (ni perte flottante, ni équité 5%) est 0.15%/trade** (pire perte flottante atteinte : 0.28%, sous le seuil de 1%). Comme pour Instant Premium, sur les 14 busts trouvés tous risques confondus, 0 viennent de la perte flottante contre **14 de la règle d'équité 5%** - encore une fois le vrai facteur limitant, pas celle qu'on regardait au départ (et encore plus stricte ici que les 6% d'Instant Premium).

**Sur la règle de consistance 15%, spécifiquement demandée** : 5099/7294 jours-fenêtres (70%) tous risques confondus auraient bloqué une demande de retrait à ce moment-là - elle mord régulièrement mais ne casse jamais le compte (juste retarde un retrait), donc nettement moins grave que les deux autres règles.

**Rappel important** : le taux de bust de la règle d'équité ci-dessus est CONSERVATEUR - elle "reset après chaque paiement" selon la source, non modélisé ici. Rien codé dans `src/` au-delà du profil `GOATFUNDEDTRADER_INSTANT_HERO` déjà ajouté à `src/propFirms/` (documentaire, pas branché sur un vrai compte). Analyse de recherche seulement - aucune décision de trading réelle prise ici.