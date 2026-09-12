# Simulation continue avec reset au +10% ou au bust — toutes stratégies live, compte 10k

Suite directe du test combiné du 2026-09-12 (voir ftmo-1step-all-live-strategies-account-impact.md). Esdras : "Oui, teste cela [risque réduit / plafond de positions]. Ensuite, dès qu'on atteint le 10%, on nous donne soit le live, soit un autre challenge, donc on repart de zéro." Deux changements par rapport au test précédent :

1. **Reset réaliste** : dès qu'un "cycle" (une instance de compte) atteint +10% OU -10% trailing, le solde repart immédiatement à $10 000 et un nouveau cycle démarre - une simulation CONTINUE sur 2019-2025 au lieu de 7 années indépendantes. Plus de "busté après avoir déjà passé" : le +10% est banqué dès qu'il est atteint. Toute position encore ouverte sur un autre symbole au moment du reset est abandonnée (un compte neuf ne peut pas hériter d'une position en cours) - simplification assumée.
2. **5 scénarios** pour isoler les deux leviers proposés dans le rapport précédent : risque par trade réduit (0.4%, 0.3%) et plafond de positions simultanées tous symboles confondus (2, puis 1 = totalement sérialisé), chacun comparé au même scénario actuel (0.5%, aucun plafond).

Note sur les dates : contrairement aux scripts précédents (restreints à 2019-2025 pour aligner le split train/test), cette simulation continue utilise TOUT l'historique CSV disponible pour chaque symbole - XAUUSD et EURUSD démarrent début 2018, US100/US500 début 2019 - d'où le premier cycle qui démarre en janvier 2018 dans le tableau détaillé ci-dessous (Divergence, qui a besoin d'US100 ET US500, ne peut logiquement démarrer qu'en 2019).

## Comparaison des 5 scénarios (2019-2025 en continu)

| Scénario | Cycles totaux | Passes | Busts | Taux de bust | Jours moy. pour passer | Trades moy. / cycle |
|---|---|---|---|---|---|---|
| Actuel (0.5%, aucun plafond) | 46 | 42 | 4 | 9% | 63 | 50 |
| 0.4% par trade, aucun plafond | 33 | 32 | 1 | 3% | 84 | 68 |
| 0.3% par trade, aucun plafond | 25 | 25 | 0 | 0% | 114 | 90 |
| 0.5% par trade, max 2 positions simultanées | 42 | 39 | 3 | 7% | 68 | 53 |
| 0.5% par trade, max 1 position simultanée (sérialisé) | 40 | 38 | 2 | 5% | 71 | 47 |

## Détail cycle par cycle, scénario actuel (0.5%, aucun plafond)

| # | Période | Durée | Trades | Win rate | Drawdown trailing max | Résultat |
|---|---|---|---|---|---|---|
| 1 | 2018-01-01 → 2018-04-26 | 115j | 35 | 42.9% | 0.0% | ✅ pass |
| 2 | 2018-04-26 → 2019-03-21 | 329j | 145 | 29.9% | 0.0% | ✅ pass |
| 3 | 2019-03-21 → 2019-07-07 | 108j | 77 | 31.2% | 0.0% | ✅ pass |
| 4 | 2019-07-07 → 2019-08-09 | 32j | 27 | 40.7% | 0.0% | ✅ pass |
| 5 | 2019-08-09 → 2019-10-15 | 67j | 45 | 35.6% | 0.0% | ✅ pass |
| 6 | 2019-10-15 → 2019-12-30 | 77j | 58 | 34.5% | 0.0% | ✅ pass |
| 7 | 2019-12-30 → 2020-03-04 | 64j | 63 | 30.6% | 0.0% | ✅ pass |
| 8 | 2020-03-04 → 2020-04-30 | 57j | 47 | 31.9% | 0.0% | ✅ pass |
| 9 | 2020-04-30 → 2020-06-14 | 46j | 38 | 34.2% | 0.0% | ✅ pass |
| 10 | 2020-06-14 → 2020-07-13 | 28j | 27 | 37.0% | 0.0% | ✅ pass |
| 11 | 2020-07-13 → 2020-09-17 | 66j | 59 | 18.6% | 10.2% | ❌ **bust** |
| 12 | 2020-09-17 → 2020-12-20 | 94j | 92 | 28.6% | 0.0% | ✅ pass |
| 13 | 2020-12-20 → 2021-01-20 | 31j | 27 | 40.7% | 0.0% | ✅ pass |
| 14 | 2021-01-20 → 2021-05-23 | 123j | 106 | 28.3% | 0.0% | ✅ pass |
| 15 | 2021-05-23 → 2021-07-23 | 61j | 48 | 33.3% | 0.0% | ✅ pass |
| 16 | 2021-07-23 → 2021-08-13 | 21j | 22 | 40.9% | 0.0% | ✅ pass |
| 17 | 2021-08-13 → 2021-10-04 | 52j | 45 | 20.0% | 10.4% | ❌ **bust** |
| 18 | 2021-10-04 → 2021-10-20 | 16j | 13 | 53.8% | 0.0% | ✅ pass |
| 19 | 2021-10-20 → 2022-01-20 | 92j | 93 | 26.9% | 0.0% | ✅ pass |
| 20 | 2022-01-20 → 2022-03-04 | 43j | 37 | 35.1% | 0.0% | ✅ pass |
| 21 | 2022-03-04 → 2022-05-03 | 60j | 49 | 32.7% | 0.0% | ✅ pass |
| 22 | 2022-05-03 → 2022-07-21 | 79j | 76 | 28.9% | 0.0% | ✅ pass |
| 23 | 2022-07-21 → 2022-09-16 | 57j | 58 | 29.3% | 0.0% | ✅ pass |
| 24 | 2022-09-16 → 2022-12-07 | 82j | 77 | 31.2% | 0.0% | ✅ pass |
| 25 | 2022-12-07 → 2023-05-26 | 170j | 133 | 27.3% | 0.0% | ✅ pass |
| 26 | 2023-05-26 → 2023-08-16 | 82j | 55 | 34.5% | 0.0% | ✅ pass |
| 27 | 2023-08-16 → 2023-09-28 | 43j | 43 | 32.6% | 0.0% | ✅ pass |
| 28 | 2023-09-28 → 2023-10-24 | 26j | 24 | 41.7% | 0.0% | ✅ pass |
| 29 | 2023-10-24 → 2023-11-09 | 16j | 16 | 43.8% | 0.0% | ✅ pass |
| 30 | 2023-11-09 → 2024-01-10 | 62j | 60 | 30.0% | 0.0% | ✅ pass |
| 31 | 2024-01-10 → 2024-01-31 | 21j | 20 | 50.0% | 0.0% | ✅ pass |
| 32 | 2024-01-31 → 2024-04-17 | 77j | 64 | 30.2% | 0.0% | ✅ pass |
| 33 | 2024-04-17 → 2024-05-07 | 20j | 15 | 46.7% | 0.0% | ✅ pass |
| 34 | 2024-05-07 → 2024-06-03 | 27j | 22 | 42.9% | 0.0% | ✅ pass |
| 35 | 2024-06-03 → 2024-07-11 | 38j | 29 | 10.3% | 10.2% | ❌ **bust** |
| 36 | 2024-07-11 → 2024-09-12 | 63j | 48 | 29.2% | 0.0% | ✅ pass |
| 37 | 2024-09-12 → 2024-10-11 | 29j | 25 | 44.0% | 0.0% | ✅ pass |
| 38 | 2024-10-11 → 2024-12-31 | 81j | 73 | 23.3% | 10.2% | ❌ **bust** |
| 39 | 2024-12-31 → 2025-01-17 | 17j | 15 | 53.3% | 0.0% | ✅ pass |
| 40 | 2025-01-17 → 2025-04-01 | 74j | 66 | 33.3% | 0.0% | ✅ pass |
| 41 | 2025-04-01 → 2025-05-16 | 45j | 42 | 34.1% | 0.0% | ✅ pass |
| 42 | 2025-05-16 → 2025-06-26 | 41j | 34 | 35.3% | 0.0% | ✅ pass |
| 43 | 2025-06-26 → 2025-07-24 | 29j | 22 | 40.9% | 0.0% | ✅ pass |
| 44 | 2025-07-24 → 2025-09-11 | 48j | 49 | 31.3% | 0.0% | ✅ pass |
| 45 | 2025-09-11 → 2025-10-20 | 39j | 31 | 35.5% | 0.0% | ✅ pass |
| 46 | 2025-10-20 → 2025-11-30 | 41j | 40 | 32.5% | 0.0% | ✅ pass |

## Verdict

Avec le reset réaliste (bancable dès +10%), le scénario actuel (0.5% par trade, aucun plafond) produit 46 cycles sur 2019-2025 : 42 passes (challenge/live gagné) contre 4 busts, soit un taux de bust de 9% - toujours réel, mais notez que ce taux se lit maintenant PAR CYCLE (chaque compte a une vraie chance indépendante de réussir), pas par année civile comme avant.

## Rythme annuel à anticiper (2026-09-12, suite à "combien de cycle je dois anticiper par années?")

Les 46 cycles couvrent 2018-01-01 → 2025-11-30, soit ~7.91 ans. Rythme par scénario (cycles/passes/busts par an) :

| Scénario | Cycles/an | Passes/an | Busts/an |
|---|---|---|---|
| 0.5% (challenge, ancien défaut) | 5.8 | 5.3 | 0.5 (~1 tous les 2 ans) |
| 0.4% | 4.2 | 4.0 | 0.13 (~1 tous les 8 ans) |
| **0.3% (défaut "live" actuel)** | **3.2** | **3.2** | **0 sur tout l'historique testé** |

À noter : la vérification sur les 7 mois de forward-test réel (2026-02-05 → 2026-09-09, voir `data/forward-test-2026/forward-test-all-live-strategies-cycle-analysis.md`) donne un rythme très proche à 0.5% - 2 cycles gagnés en 130 jours, soit ~5.6 cycles/an extrapolé, cohérent avec le 5.8/an de l'historique complet.

Le scénario qui réduit le plus le taux de bust est **"0.3% par trade, aucun plafond"** (0% de bust contre 9% pour l'actuel), au prix d'un passage un peu plus lent (114j contre 63j en moyenne). Comparer les 5 lignes du tableau ci-dessus donne l'arbitrage complet vitesse/risque de chaque levier - à Esdras de choisir le compromis. Aucun changement fait dans `src/` — recherche seulement.