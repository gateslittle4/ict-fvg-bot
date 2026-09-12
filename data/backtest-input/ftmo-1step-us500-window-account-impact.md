# FTMO 1-Step, US500 FVG seul — 8h-12h vs 10h-11h (moteur single-touch, celui réellement en production)

Suite directe du déploiement de la fenêtre 8h-12h sur US100 (2026-09-12) : "US500 n'a jamais été testé sur 8h-12h ? Sinon teste-le." US500 n'a pas de multi-contact validé, donc ce script utilise le moteur single-touch RÉELLEMENT en production pour US500 aujourd'hui (`CONFIG.fvg.perSymbol.US500`, RR=5), seule la fenêtre horaire change entre les deux passages. US500 FVG seul, aucune autre source (pas de Divergence), pour isoler exactement l'effet de la fenêtre.

## 10h-11h (fenêtre production actuelle)

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 12 | 33.3% | 0.0% | 1.8% | non | jamais | $10520 |
| 2020 (train) | 19 | 57.9% | 1.2% | 2.3% | non | jour 113 | $12435 |
| 2021 (train) | 11 | 9.1% | 3.2% | 3.8% | non | jamais | $9676 |
| 2022 (train) | 19 | 36.8% | 0.6% | 3.2% | non | jour 284 | $11091 |
| 2023 (train) | 8 | 12.5% | 2.1% | 2.1% | non | jamais | $9869 |
| 2024 (test) | 9 | 71.4% | 0.0% | 0.6% | non | jour 192 | $11373 |
| 2025 (test) | 19 | 27.8% | 4.5% | 4.5% | non | jamais | $10503 |

## 8h-12h

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 28 | 29.6% | 0.0% | 5.6% | non | jour 78 | $11048 |
| 2020 (train) | 37 | 45.9% | 2.9% | 2.9% | non | jour 99 | $13418 |
| 2021 (train) | 43 | 20.9% | 4.5% | 4.9% | non | jamais | $10240 |
| 2022 (train) | 51 | 21.6% | 3.6% | 5.2% | non | jamais | $10508 |
| 2023 (train) | 40 | 27.5% | 0.6% | 2.9% | non | jour 248 | $11072 |
| 2024 (test) | 31 | 31.0% | 0.3% | 2.6% | non | jour 227 | $11319 |
| 2025 (test) | 56 | 23.6% | 7.3% | 9.4% | non | jamais | $10848 |

## Comparaison directe

| Année | Jour de passage 10h-11h | Jour de passage 8h-12h | Drawdown trailing max 10h-11h | Drawdown trailing max 8h-12h |
|---|---|---|---|---|
| 2019 (train) | jamais (DD 1.8%, busté: non) | jour 78 (DD 5.6%, busté: non) | 1.8% | 5.6% |
| 2020 (train) | jour 113 (DD 2.3%, busté: non) | jour 99 (DD 2.9%, busté: non) | 2.3% | 2.9% |
| 2021 (train) | jamais (DD 3.8%, busté: non) | jamais (DD 4.9%, busté: non) | 3.8% | 4.9% |
| 2022 (train) | jour 284 (DD 3.2%, busté: non) | jamais (DD 5.2%, busté: non) | 3.2% | 5.2% |
| 2023 (train) | jamais (DD 2.1%, busté: non) | jour 248 (DD 2.9%, busté: non) | 2.1% | 2.9% |
| 2024 (test) | jour 192 (DD 0.6%, busté: non) | jour 227 (DD 2.6%, busté: non) | 0.6% | 2.6% |
| 2025 (test) | jamais (DD 4.5%, busté: non) | jamais (DD 9.4%, busté: non) | 4.5% | 9.4% |

**Verdict** : moyenne test (2024-2025) — 10h-11h 192 jours, 8h-12h 227 jours. Drawdown trailing max sur les 7 ans — 10h-11h 4.5% (busté: non), 8h-12h 9.4% (busté: non).