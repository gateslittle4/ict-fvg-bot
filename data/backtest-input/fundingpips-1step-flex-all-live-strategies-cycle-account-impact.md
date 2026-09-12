# Simulation continue avec reset au +12% ou au bust (-12% statique) — FundingPips 1-Step Flex, toutes stratégies live, compte 10k

Fork direct de ftmo-1step-all-live-strategies-cycle-account-impact.md, cti-1step-... et ment-funding-1step-... (même architecture de reset continu). Esdras (2026-09-12) : "Verifie une autre platforme, on doit avoir au moins 5 pour trancher." En revérifiant la politique EA de **FundingPips** (déjà étudiée plus tôt dans la session pour les délais de retrait, avant que le filtre EA-autonome soit connu) : elle passe déjà - les EA tiers sont limités à l'assistance, mais "full automation is permitted on your own EA" avec preuve de propriété (ce bot qualifie : code source propre, historique git). Pas besoin d'une nouvelle firme - ceci complète le slot #4 (après FTMO, CTI, Ment Funding) avec les règles déjà vérifiées dans src/propFirms/fundingPips.js (FUNDINGPIPS_1STEP_FLEX).

**Règles** : target **+12%** (le plus généreux des 4 - FTMO 10%, CTI 8%), drawdown max **12% STATIQUE** (fixé sous le solde DE DÉPART, même mécanisme non-trailing que Ment Funding - voir son rapport pour pourquoi un plancher statique bat un plancher trailing à % nominal égal). Perte journalière 3%, aucun minimum de jours de trading. Prix $25k confirmé ~$185-211 (fourchette FTMO). Split 85% fixe bi-hebdomadaire (pas de palier VIP à débloquer, contrairement à CTI/Ment Funding).

**6 scénarios**, identiques aux rapports précédents pour comparaison directe ligne à ligne entre les 4 rapports.

Note sur les dates : simulation continue sur TOUT l'historique CSV disponible par symbole, identique aux rapports précédents.

## Comparaison des 6 scénarios (historique complet en continu)

| Scénario | Cycles totaux | Passes | Busts | Taux de bust | Jours moy. pour passer | Trades moy. / cycle |
|---|---|---|---|---|---|---|
| Actuel (0.5%, aucun plafond) | 33 | 33 | 0 | 0% | 88 | 73 |
| 0.4% par trade, aucun plafond | 27 | 27 | 0 | 0% | 108 | 89 |
| 0.3% par trade, aucun plafond | 20 | 20 | 0 | 0% | 142 | 116 |
| 0.2% par trade, aucun plafond | 14 | 14 | 0 | 0% | 204 | 167 |
| 0.5% par trade, max 2 positions simultanées | 33 | 33 | 0 | 0% | 87 | 70 |
| 0.5% par trade, max 1 position simultanée (sérialisé) | 30 | 29 | 1 | 3% | 97 | 62 |

## Détail cycle par cycle, scénario actuel (0.5%, aucun plafond)

| # | Période | Durée | Trades | Win rate | Drawdown vs départ (statique) | Résultat |
|---|---|---|---|---|---|---|
| 1 | 2018-01-01 → 2019-06-11 | 526j | 252 | 29.2% | 0.0% | ✅ pass |
| 2 | 2019-06-11 → 2019-08-09 | 59j | 45 | 37.8% | 0.0% | ✅ pass |
| 3 | 2019-08-09 → 2019-10-28 | 80j | 62 | 33.9% | 0.0% | ✅ pass |
| 4 | 2019-10-28 → 2019-12-31 | 64j | 46 | 37.8% | 0.0% | ✅ pass |
| 5 | 2019-12-31 → 2020-03-04 | 64j | 66 | 30.8% | 0.0% | ✅ pass |
| 6 | 2020-03-04 → 2020-04-29 | 56j | 49 | 32.7% | 0.0% | ✅ pass |
| 7 | 2020-04-29 → 2020-06-23 | 55j | 47 | 34.0% | 0.0% | ✅ pass |
| 8 | 2020-06-23 → 2021-01-18 | 209j | 201 | 26.5% | 0.0% | ✅ pass |
| 9 | 2021-01-18 → 2021-05-23 | 126j | 111 | 28.8% | 0.0% | ✅ pass |
| 10 | 2021-05-23 → 2021-07-25 | 63j | 51 | 33.3% | 0.0% | ✅ pass |
| 11 | 2021-07-25 → 2021-08-23 | 29j | 34 | 36.4% | 0.0% | ✅ pass |
| 12 | 2021-08-23 → 2022-02-11 | 172j | 164 | 25.8% | 0.0% | ✅ pass |
| 13 | 2022-02-11 → 2022-03-29 | 46j | 36 | 36.1% | 0.0% | ✅ pass |
| 14 | 2022-03-29 → 2022-06-16 | 79j | 75 | 29.3% | 0.0% | ✅ pass |
| 15 | 2022-06-16 → 2022-09-16 | 92j | 88 | 29.5% | 0.0% | ✅ pass |
| 16 | 2022-09-16 → 2022-12-07 | 82j | 77 | 31.2% | 0.0% | ✅ pass |
| 17 | 2022-12-07 → 2023-05-26 | 170j | 136 | 27.4% | 0.0% | ✅ pass |
| 18 | 2023-05-26 → 2023-07-24 | 59j | 44 | 36.4% | 0.0% | ✅ pass |
| 19 | 2023-07-24 → 2023-09-28 | 66j | 61 | 32.8% | 0.0% | ✅ pass |
| 20 | 2023-09-28 → 2023-10-24 | 26j | 25 | 44.0% | 0.0% | ✅ pass |
| 21 | 2023-10-24 → 2023-12-08 | 45j | 48 | 33.3% | 0.0% | ✅ pass |
| 22 | 2023-12-08 → 2024-01-18 | 41j | 37 | 37.8% | 0.0% | ✅ pass |
| 23 | 2024-01-18 → 2024-03-08 | 50j | 44 | 34.9% | 0.0% | ✅ pass |
| 24 | 2024-03-08 → 2024-05-22 | 75j | 57 | 32.1% | 0.0% | ✅ pass |
| 25 | 2024-05-22 → 2024-09-13 | 114j | 101 | 26.7% | 0.0% | ✅ pass |
| 26 | 2024-09-13 → 2024-10-15 | 32j | 24 | 45.8% | 0.0% | ✅ pass |
| 27 | 2024-10-15 → 2025-03-03 | 139j | 134 | 28.6% | 0.0% | ✅ pass |
| 28 | 2025-03-03 → 2025-05-14 | 72j | 65 | 32.8% | 0.0% | ✅ pass |
| 29 | 2025-05-14 → 2025-06-26 | 43j | 35 | 37.1% | 0.0% | ✅ pass |
| 30 | 2025-06-26 → 2025-07-25 | 29j | 23 | 43.5% | 0.0% | ✅ pass |
| 31 | 2025-07-25 → 2025-09-12 | 49j | 51 | 32.0% | 0.0% | ✅ pass |
| 32 | 2025-09-12 → 2025-10-23 | 41j | 40 | 35.0% | 0.0% | ✅ pass |
| 33 | 2025-10-23 → 2025-12-26 | 64j | 65 | 30.8% | 0.0% | ✅ pass |

## Verdict

Contre le plancher STATIQUE de FundingPips (12% sous le départ, jamais trailing), le scénario actuel (0.5% par trade, aucun plafond) produit 33 cycles sur l'historique complet : 33 passes (challenge/live gagné) contre 0 busts, soit un taux de bust de 0% - à comparer directement aux taux de bust FTMO (9% à 0.5%, plancher 10% trailing), CTI (34% à 0.5%, plancher 5% trailing) et Ment Funding (7% à 0.5%, plancher 6% statique) pour situer l'effet d'un plancher deux fois plus large ET statique.

Le scénario qui réduit le plus le taux de bust est **"Actuel (0.5%, aucun plafond)"** (0% de bust contre 0% pour l'actuel), sans ralentir le passage (88j contre 88j). Comparer les 6 lignes du tableau ci-dessus donne l'arbitrage complet vitesse/risque de chaque levier - à Esdras de choisir le compromis. Aucun changement fait dans `src/` — recherche seulement.