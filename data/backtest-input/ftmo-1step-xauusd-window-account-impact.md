# FTMO 1-Step, XAUUSD FVG seul — 8h-12h vs 7h-10h (moteur single-touch, celui réellement en production)

Suite directe de la vérification US500 (2026-09-12) : "teste XAUUSD aussi sur 8h-12h." XAUUSD tourne sur 7h-10h (London-NY overlap) en production, pas 10h-11h - c'est sa vraie fenêtre de référence ici. XAUUSD n'a pas de multi-contact validé non plus, donc ce script utilise le moteur single-touch RÉELLEMENT en production (`CONFIG.fvg.perSymbol.XAUUSD`, stop `swing`, RR=4), seule la fenêtre horaire change entre les deux passages. XAUUSD FVG seul, aucune autre source, pour isoler exactement l'effet de la fenêtre.

## 7h-10h (fenêtre production actuelle)

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 12 | 41.7% | 1.2% | 1.2% | non | jamais | $10566 |
| 2020 (train) | 15 | 57.1% | 0.0% | 2.1% | non | jour 134 | $11439 |
| 2021 (train) | 16 | 25.0% | 2.6% | 2.6% | non | jamais | $10131 |
| 2022 (train) | — | | | | | | |
| 2023 (train) | 20 | 42.1% | 0.0% | 1.6% | non | jour 359 | $11034 |
| 2024 (test) | 18 | 29.4% | 0.0% | 3.1% | non | jamais | $10436 |
| 2025 (test) | 21 | 33.3% | 0.0% | 3.1% | non | jamais | $10673 |

## 8h-12h

| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 26 | 28.0% | 0.6% | 4.3% | non | jamais | $10374 |
| 2020 (train) | 27 | 38.5% | 0.5% | 6.1% | non | jour 96 | $11294 |
| 2021 (train) | 29 | 11.5% | 4.4% | 4.4% | non | jamais | $9562 |
| 2022 (train) | — | | | | | | |
| 2023 (train) | 33 | 34.4% | 0.2% | 2.9% | non | jour 333 | $11086 |
| 2024 (test) | 40 | 27.0% | 2.0% | 2.7% | non | jour 315 | $10844 |
| 2025 (test) | 35 | 30.3% | 0.7% | 5.5% | non | jamais | $10971 |

## Comparaison directe

| Année | Jour de passage 7h-10h | Jour de passage 8h-12h | Drawdown trailing max 7h-10h | Drawdown trailing max 8h-12h |
|---|---|---|---|---|
| 2019 (train) | jamais (DD 1.2%, busté: non) | jamais (DD 4.3%, busté: non) | 1.2% | 4.3% |
| 2020 (train) | jour 134 (DD 2.1%, busté: non) | jour 96 (DD 6.1%, busté: non) | 2.1% | 6.1% |
| 2021 (train) | jamais (DD 2.6%, busté: non) | jamais (DD 4.4%, busté: non) | 2.6% | 4.4% |
| 2023 (train) | jour 359 (DD 1.6%, busté: non) | jour 333 (DD 2.9%, busté: non) | 1.6% | 2.9% |
| 2024 (test) | jamais (DD 3.1%, busté: non) | jour 315 (DD 2.7%, busté: non) | 3.1% | 2.7% |
| 2025 (test) | jamais (DD 3.1%, busté: non) | jamais (DD 5.5%, busté: non) | 3.1% | 5.5% |

**Verdict** : moyenne test (2024-2025) — 7h-10h jamais complété, 8h-12h 315 jours. Drawdown trailing max sur les 7 ans — 7h-10h 3.1% (busté: non), 8h-12h 6.1% (busté: non).