# Silver Bullet en 2e position malgré une paire déjà ouverte (netting) — impact historique complet

Esdras (2026-09-21, en direct) : signal Silver Bullet US500 haussier bloqué par netting (Divergence US500 déjà ouverte). Question : Silver Bullet étant rare, le laisser s'ouvrir en 2e position améliorerait-il le résultat ? Tout l'historique M1 réel (`data/real-m1-full`), vrai moteur (`LiveStrategyEngine`), TOUS les signaux Silver Bullet bloqués par "netting" capturés (pas seulement l'exécuté), réglés en M1 exact comme des positions indépendantes.

**1026 signaux Silver Bullet au total sur tout l'historique, 667 exécutés normalement, 196 bloqués par netting** (une autre position déjà ouverte sur la même paire) — confirme "Silver Bullet est rare" ET que le cas "bloqué par netting" est rare aussi.

**Si tous avaient été ouverts en 2e position indépendante : 196 trades, 16 gagnants (8%), R net total -6.52 R, -0.033 R/trade.**

| Paire | Direction | Entrée | Heure (UTC) | Résultat | R net |
|---|---|---|---|---|---|
| US500 | bearish | 4117.92 | 2023-04-12T16:00:00.000Z | loss | -1.04 |
| US500 | bullish | 4179.5 | 2023-05-18T15:00:00.000Z | loss | -1.02 |
| US500 | bearish | 4213.32 | 2023-05-30T14:30:00.000Z | loss | -1.03 |
| US500 | bearish | 4173.97 | 2023-05-31T15:00:00.000Z | loss | -1.05 |
| US500 | bearish | 4181.17 | 2023-05-31T17:30:00.000Z | loss | -1.04 |
| US500 | bullish | 4397.12 | 2023-06-15T14:45:00.000Z | loss | -1.02 |
| US500 | bullish | 4533.52 | 2023-07-18T14:30:00.000Z | timeout (encore ouvert à la fin des données) | +7.73 |
| US500 | bullish | 4466.17 | 2023-08-29T15:00:00.000Z | timeout (encore ouvert à la fin des données) | +3.94 |
| US500 | bearish | 4366.82 | 2023-10-11T14:45:00.000Z | loss | -1.10 |
| US500 | bearish | 4369.320000000001 | 2023-10-11T15:15:00.000Z | loss | -1.07 |
| US500 | bullish | 4512.32 | 2023-11-16T15:30:00.000Z | loss | -1.09 |
| US500 | bullish | 4597.27 | 2023-12-08T15:45:00.000Z | loss | -1.10 |
| US500 | bullish | 5054.889999999999 | 2024-02-22T16:00:00.000Z | timeout (encore ouvert à la fin des données) | +4.60 |
| US500 | bullish | 5108.79 | 2024-03-01T15:45:00.000Z | loss | -1.02 |
| US500 | bullish | 5185.29 | 2024-03-08T15:30:00.000Z | loss | -1.02 |
| US500 | bearish | 5238.14 | 2024-04-01T20:00:00.000Z | loss | -1.03 |
| US500 | bearish | 5141.79 | 2024-04-12T15:15:00.000Z | loss | -1.03 |
| US500 | bullish | 5323.95 | 2024-05-16T15:30:00.000Z | loss | -1.04 |
| US500 | bullish | 5321.72 | 2024-05-20T16:30:00.000Z | loss | -1.04 |
| US500 | bullish | 5316.650000000001 | 2024-05-21T15:45:00.000Z | loss | -1.10 |
| US500 | bearish | 5316.22 | 2024-05-23T14:30:00.000Z | loss | -1.03 |
| US500 | bullish | 5478.35 | 2024-06-24T14:30:00.000Z | loss | -1.02 |
| US500 | bullish | 5514.84 | 2024-06-28T14:45:00.000Z | loss | -1.02 |
| US500 | bullish | 5649.52 | 2024-07-15T16:30:00.000Z | loss | -1.04 |
| US500 | bearish | 5305.19 | 2024-08-02T15:00:00.000Z | loss | -1.01 |
| US500 | bullish | 5855.93 | 2024-10-14T14:30:00.000Z | loss | -1.02 |
| US500 | bearish | 5883.21 | 2024-11-20T15:45:00.000Z | loss | -1.03 |
| US500 | bearish | 5824.78 | 2025-01-10T15:45:00.000Z | loss | -1.02 |
| US500 | bullish | 6021.93 | 2025-02-04T15:45:00.000Z | loss | -1.01 |
| US500 | bullish | 6003.57 | 2025-02-05T04:00:00.000Z | loss | -1.04 |
| US500 | bullish | 6055.77 | 2025-02-10T16:30:00.000Z | loss | -1.03 |
| US500 | bullish | 6060.9 | 2025-02-11T16:45:00.000Z | loss | -1.04 |
| US500 | bullish | 6079.49 | 2025-02-13T16:30:00.000Z | loss | -1.07 |
| US500 | bullish | 6072.99 | 2025-02-13T17:00:00.000Z | loss | -1.07 |
| US500 | bullish | 6074.49 | 2025-02-13T18:30:00.000Z | timeout (encore ouvert à la fin des données) | +3.29 |
| US500 | bearish | 5437.58 | 2025-04-03T14:45:00.000Z | loss | -1.01 |
| US500 | bullish | 5010.2699999999995 | 2025-04-07T14:45:00.000Z | loss | -1.01 |
| US500 | bearish | 5930.11 | 2025-06-19T14:30:00.000Z | loss | -1.19 |
| US500 | bullish | 5999.12 | 2025-06-23T14:45:00.000Z | loss | -1.03 |
| US500 | bullish | 5989.12 | 2025-06-23T15:00:00.000Z | loss | -1.03 |
| US500 | bearish | 6294.96 | 2025-07-22T14:30:00.000Z | loss | -1.02 |
| US500 | bearish | 6459.54 | 2025-08-15T14:30:00.000Z | loss | -1.03 |
| US500 | bullish | 6645.45 | 2025-09-18T14:45:00.000Z | loss | -1.02 |
| US500 | bearish | 6660.78 | 2025-09-24T14:30:00.000Z | loss | -1.08 |
| US500 | bearish | 6729.35 | 2025-10-22T15:00:00.000Z | loss | -1.03 |
| US500 | bullish | 6898.22 | 2025-12-05T15:45:00.000Z | loss | -1.03 |
| US500 | bearish | 6839.25 | 2025-12-15T15:45:00.000Z | loss | -1.04 |
| US500 | bearish | 6912.5 | 2026-01-22T15:30:00.000Z | loss | -1.04 |
| US500 | bearish | 6901.8 | 2026-01-29T16:15:00.000Z | loss | -1.02 |
| US500 | bearish | 6932.05 | 2026-01-29T17:15:00.000Z | loss | -1.03 |
| US500 | bearish | 6858.25 | 2026-02-23T18:30:00.000Z | loss | -1.05 |
| US500 | bullish | 6874.7 | 2026-02-24T16:00:00.000Z | loss | -1.02 |
| US500 | bullish | 7137.9 | 2026-04-21T14:30:00.000Z | loss | -1.13 |
| US500 | bullish | 7413.08 | 2026-05-11T14:30:00.000Z | loss | -1.41 |
| US500 | bullish | 7367.75 | 2026-06-26T14:45:00.000Z | loss | -1.02 |
| US500 | bullish | 7505.75 | 2026-07-01T14:45:00.000Z | loss | -1.02 |
| US100 | bullish | 12014.42 | 2023-01-31T17:15:00.000Z | timeout (encore ouvert à la fin des données) | +22.56 |
| US100 | bearish | 12298.35 | 2023-02-10T16:15:00.000Z | loss | -1.02 |
| US100 | bullish | 11897.97 | 2023-03-02T15:30:00.000Z | timeout (encore ouvert à la fin des données) | +3.56 |
| US100 | bullish | 12438.82 | 2023-03-06T16:30:00.000Z | loss | -1.06 |
| US100 | bullish | 12403.82 | 2023-03-06T17:45:00.000Z | loss | -1.05 |
| US100 | bullish | 12381.9 | 2023-03-06T18:00:00.000Z | loss | -1.36 |
| US100 | bullish | 13012.570000000002 | 2023-04-13T14:45:00.000Z | loss | -1.01 |
| US100 | bullish | 13048.65 | 2023-04-20T14:45:00.000Z | loss | -1.07 |
| US100 | bearish | 12925.37 | 2023-04-24T15:15:00.000Z | loss | -1.01 |
| US100 | bullish | 14359.8 | 2023-06-01T15:15:00.000Z | loss | -1.01 |
| US100 | bearish | 14500.55 | 2023-06-02T14:30:00.000Z | loss | -1.03 |
| US100 | bullish | 14516.5 | 2023-06-04T23:30:00.000Z | loss | -1.13 |
| US100 | bullish | 14616.12 | 2023-06-05T17:45:00.000Z | loss | -1.05 |
| US100 | bearish | 14440.35 | 2023-06-07T15:45:00.000Z | loss | -1.01 |
| US100 | bearish | 14893.22 | 2023-06-21T15:45:00.000Z | loss | -1.02 |
| US100 | bullish | 14914.599999999999 | 2023-06-22T14:45:00.000Z | loss | -1.02 |
| US100 | bearish | 15642.7 | 2023-07-20T15:15:00.000Z | loss | -1.01 |
| US100 | bearish | 15238.92 | 2023-08-08T18:15:00.000Z | loss | -1.05 |
| US100 | bullish | 15161.2 | 2023-08-14T15:30:00.000Z | loss | -1.01 |
| US100 | bearish | 15079.77 | 2023-08-15T15:00:00.000Z | loss | -1.01 |
| US100 | bearish | 15119.4 | 2023-08-15T15:45:00.000Z | loss | -1.02 |
| US100 | bearish | 14778.5 | 2023-08-25T15:15:00.000Z | loss | -1.01 |
| US100 | bullish | 15450.57 | 2023-09-14T15:45:00.000Z | loss | -1.01 |
| US100 | bearish | 15104 | 2023-09-19T15:15:00.000Z | loss | -1.14 |
| US100 | bearish | 15020.15 | 2023-10-18T15:30:00.000Z | loss | -1.02 |
| US100 | bearish | 14620.3 | 2023-10-20T16:00:00.000Z | loss | -1.02 |
| US100 | bearish | 14668.42 | 2023-10-20T17:00:00.000Z | loss | -1.06 |
| US100 | bearish | 14267.8 | 2023-10-26T15:00:00.000Z | loss | -1.03 |
| US100 | bearish | 14264.449999999999 | 2023-10-30T15:00:00.000Z | loss | -1.01 |
| US100 | bearish | 14320.27 | 2023-10-30T17:45:00.000Z | loss | -1.01 |
| US100 | bullish | 15310.05 | 2023-11-07T17:00:00.000Z | loss | -1.02 |
| US100 | bullish | 15298.3 | 2023-11-07T17:45:00.000Z | loss | -1.01 |
| US100 | bearish | 15312.199999999999 | 2023-11-08T19:15:00.000Z | loss | -1.06 |
| US100 | bullish | 16028.47 | 2023-11-23T16:15:00.000Z | loss | -1.11 |
| US100 | bearish | 16080 | 2023-11-29T15:45:00.000Z | timeout (encore ouvert à la fin des données) | +3.13 |
| US100 | bearish | 15889.25 | 2023-11-30T16:15:00.000Z | loss | -1.02 |
| US100 | bullish | 16007.849999999999 | 2023-12-08T15:45:00.000Z | loss | -1.03 |
| US100 | bullish | 16574.5 | 2024-01-09T15:45:00.000Z | timeout (encore ouvert à la fin des données) | +6.05 |
| US100 | bullish | 17571.100000000002 | 2024-01-24T16:15:00.000Z | loss | -1.67 |
| US100 | bullish | 17584.2 | 2024-01-24T16:30:00.000Z | loss | -1.02 |
| US100 | bullish | 17470.8 | 2024-01-26T16:45:00.000Z | loss | -1.01 |
| US100 | bearish | 17525.3 | 2024-01-30T15:45:00.000Z | loss | -1.03 |
| US100 | bearish | 17698.35 | 2024-02-16T15:30:00.000Z | loss | -1.00 |
| US100 | bullish | 18159.3 | 2024-03-12T15:15:00.000Z | loss | -1.01 |
| US100 | bullish | 18085 | 2024-03-12T16:45:00.000Z | loss | -1.02 |
| US100 | bearish | 18051.25 | 2024-03-14T14:30:00.000Z | loss | -1.02 |
| US100 | bullish | 18277.4 | 2024-03-25T14:45:00.000Z | loss | -1.02 |
| US100 | bullish | 18270.149999999998 | 2024-03-28T15:15:00.000Z | loss | -1.27 |
| US100 | bullish | 18188.300000000003 | 2024-04-03T16:00:00.000Z | loss | -1.02 |
| US100 | bullish | 18199.75 | 2024-04-03T16:45:00.000Z | loss | -1.00 |
| US100 | bullish | 18145.85 | 2024-04-08T15:15:00.000Z | loss | -1.02 |
| US100 | bearish | 17069.65 | 2024-04-22T15:45:00.000Z | loss | -1.01 |
| US100 | bullish | 18075.25 | 2024-05-09T16:00:00.000Z | timeout (encore ouvert à la fin des données) | +37.05 |
| US100 | bearish | 18155.3 | 2024-05-10T18:15:00.000Z | loss | -1.06 |
| US100 | bullish | 18554.25 | 2024-05-17T15:15:00.000Z | loss | -1.42 |
| US100 | bullish | 18660.600000000002 | 2024-05-20T15:30:00.000Z | loss | -1.01 |
| US100 | bullish | 18836.210000000003 | 2024-05-28T00:15:00.000Z | loss | -1.06 |
| US100 | bullish | 19092.92 | 2024-06-11T15:30:00.000Z | loss | -1.02 |
| US100 | bullish | 19946.88 | 2024-06-28T14:45:00.000Z | loss | -1.01 |
| US100 | bullish | 19889.13 | 2024-06-28T15:00:00.000Z | loss | -1.02 |
| US100 | bullish | 20343.98 | 2024-07-12T14:30:00.000Z | loss | -1.01 |
| US100 | bullish | 20448.23 | 2024-07-12T15:30:00.000Z | loss | -1.01 |
| US100 | bullish | 20502.38 | 2024-07-15T15:45:00.000Z | loss | -1.04 |
| US100 | bullish | 20503.88 | 2024-07-15T16:00:00.000Z | loss | -1.03 |
| US100 | bearish | 20365.25 | 2024-07-16T14:45:00.000Z | loss | -1.06 |
| US100 | bearish | 20380.25 | 2024-07-16T15:15:00.000Z | timeout (encore ouvert à la fin des données) | +10.03 |
| US100 | bearish | 19642.35 | 2024-07-19T15:00:00.000Z | loss | -1.03 |
| US100 | bearish | 18314.32 | 2024-08-02T14:45:00.000Z | loss | -1.01 |
| US100 | bearish | 19536.16 | 2024-08-26T15:30:00.000Z | loss | -1.02 |
| US100 | bearish | 19148.45 | 2024-09-03T15:30:00.000Z | timeout (encore ouvert à la fin des données) | +3.68 |
| US100 | bearish | 18512.1 | 2024-09-06T15:15:00.000Z | loss | -1.01 |
| US100 | bearish | 18560.88 | 2024-09-09T15:45:00.000Z | loss | -1.02 |
| US100 | bearish | 18612.38 | 2024-09-09T16:00:00.000Z | loss | -1.05 |
| US100 | bearish | 18663.21 | 2024-09-11T15:15:00.000Z | loss | -1.05 |
| US100 | bullish | 20040.39 | 2024-10-08T15:15:00.000Z | loss | -1.01 |
| US100 | bullish | 20177.13 | 2024-10-09T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 20248.93 | 2024-10-11T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 20470.98 | 2024-10-14T14:30:00.000Z | loss | -1.02 |
| US100 | bearish | 20019.11 | 2024-10-31T14:30:00.000Z | loss | -1.00 |
| US100 | bullish | 20078.829999999998 | 2024-11-01T14:45:00.000Z | loss | -1.02 |
| US100 | bullish | 20160.49 | 2024-11-05T15:30:00.000Z | loss | -1.02 |
| US100 | bearish | 20524.63 | 2024-11-18T00:30:00.000Z | loss | -1.04 |
| US100 | bearish | 20561.01 | 2024-11-18T04:30:00.000Z | loss | -1.02 |
| US100 | bullish | 20585.48 | 2024-11-18T17:00:00.000Z | loss | -1.01 |
| US100 | bullish | 20583.48 | 2024-11-18T19:00:00.000Z | loss | -1.00 |
| US100 | bearish | 20801.11 | 2025-01-10T15:30:00.000Z | loss | -1.01 |
| US100 | bullish | 21295.84 | 2025-01-28T16:00:00.000Z | loss | -1.01 |
| US100 | bearish | 21454.62 | 2025-01-30T17:00:00.000Z | loss | -1.02 |
| US100 | bullish | 21745.85 | 2025-02-10T16:00:00.000Z | loss | -1.04 |
| US100 | bullish | 21710.48 | 2025-02-10T17:15:00.000Z | loss | -1.03 |
| US100 | bullish | 21707.32 | 2025-02-11T16:30:00.000Z | loss | -1.09 |
| US100 | bearish | 21998.010000000002 | 2025-02-20T15:30:00.000Z | loss | -1.01 |
| US100 | bearish | 21435.78 | 2025-02-24T15:30:00.000Z | timeout (encore ouvert à la fin des données) | +5.87 |
| US100 | bearish | 19974.73 | 2025-03-07T16:00:00.000Z | loss | -1.01 |
| US100 | bearish | 20081.6 | 2025-03-07T18:45:00.000Z | loss | -1.06 |
| US100 | bullish | 19615.65 | 2025-03-19T14:45:00.000Z | loss | -1.04 |
| US100 | bearish | 18162.91 | 2025-04-17T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 21819.51 | 2025-06-09T15:00:00.000Z | loss | -1.02 |
| US100 | bullish | 21851.309999999998 | 2025-06-18T15:00:00.000Z | loss | -1.02 |
| US100 | bullish | 21823.309999999998 | 2025-06-18T15:45:00.000Z | loss | -1.02 |
| US100 | bullish | 21738.4 | 2025-06-23T15:00:00.000Z | loss | -1.02 |
| US100 | bullish | 21728.78 | 2025-06-23T15:45:00.000Z | loss | -1.01 |
| US100 | bullish | 22596.17 | 2025-06-27T14:45:00.000Z | loss | -1.01 |
| US100 | bullish | 23001.51 | 2025-07-17T14:30:00.000Z | loss | -1.02 |
| US100 | bullish | 23876 | 2025-08-14T15:00:00.000Z | loss | -1.04 |
| US100 | bullish | 24070.11 | 2025-09-12T15:30:00.000Z | loss | -1.05 |
| US100 | bullish | 24492.61 | 2025-09-18T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 25004.21 | 2025-10-08T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 24521.01 | 2025-10-14T15:00:00.000Z | loss | -1.01 |
| US100 | bullish | 24909.34 | 2025-10-15T15:15:00.000Z | loss | -1.01 |
| US100 | bullish | 25004.42 | 2025-10-23T14:30:00.000Z | timeout (encore ouvert à la fin des données) | +14.26 |
| US100 | bullish | 25680.66 | 2025-11-04T16:00:00.000Z | loss | -1.05 |
| US100 | bearish | 25235.62 | 2025-11-06T16:15:00.000Z | loss | -1.01 |
| US100 | bearish | 25206.6 | 2025-12-15T15:45:00.000Z | loss | -1.01 |
| US100 | bearish | 25283.85 | 2025-12-15T16:30:00.000Z | loss | -1.02 |
| US100 | bullish | 25659.3 | 2026-01-09T16:00:00.000Z | loss | -1.01 |
| US100 | bearish | 25543.75 | 2026-01-16T16:00:00.000Z | loss | -1.02 |
| US100 | bearish | 25525.8 | 2026-02-03T16:00:00.000Z | timeout (encore ouvert à la fin des données) | +46.32 |
| US100 | bearish | 25166.05 | 2026-02-12T15:30:00.000Z | timeout (encore ouvert à la fin des données) | +3.82 |
| US100 | bearish | 24633.3 | 2026-02-16T16:00:00.000Z | loss | -1.01 |
| US100 | bearish | 24465.35 | 2026-02-17T15:30:00.000Z | loss | -1.01 |
| US100 | bearish | 24073.15 | 2026-03-20T15:30:00.000Z | loss | -1.00 |
| US100 | bullish | 23329.25 | 2026-03-31T14:45:00.000Z | loss | -1.02 |
| US100 | bullish | 26857.7 | 2026-04-22T15:15:00.000Z | loss | -1.01 |
| US100 | bearish | 28680.75 | 2026-05-19T14:45:00.000Z | loss | -1.00 |
| US100 | bullish | 29098.65 | 2026-05-20T22:15:00.000Z | loss | -1.02 |
| US100 | bearish | 30362.25 | 2026-05-29T15:30:00.000Z | loss | -1.01 |
| US100 | bullish | 29646.8 | 2026-06-23T14:45:00.000Z | loss | -1.01 |
| US100 | bullish | 29545.6 | 2026-06-24T15:15:00.000Z | loss | -1.01 |
| US100 | bearish | 29369.4 | 2026-06-25T14:45:00.000Z | loss | -1.00 |
| US100 | bullish | 29263.300000000003 | 2026-06-26T14:45:00.000Z | loss | -1.02 |
| US100 | bullish | 29362.15 | 2026-06-26T15:30:00.000Z | loss | -1.00 |
| US100 | bearish | 29361.449999999997 | 2026-06-29T14:45:00.000Z | loss | -1.24 |
| US100 | bearish | 29116.55 | 2026-07-07T15:15:00.000Z | loss | -1.03 |
| US100 | bearish | 29185.3 | 2026-07-07T16:00:00.000Z | loss | -1.02 |
| US100 | bearish | 29553.45 | 2026-07-15T18:30:00.000Z | timeout (encore ouvert à la fin des données) | +5.28 |
| US100 | bullish | 28662.449999999997 | 2026-07-17T14:45:00.000Z | loss | -1.00 |
| US100 | bearish | 29495.95 | 2026-08-19T14:45:00.000Z | loss | -1.19 |
| US100 | bearish | 29223.5 | 2026-08-25T15:30:00.000Z | loss | -1.04 |
| US100 | bullish | 29096.2 | 2026-09-02T15:00:00.000Z | loss | -1.07 |

## Limites (IMPORTANTES avant tout changement de code)

- **Contrainte broker non vérifiée** : `openPositions` est un Map PAR SYMBOLE partagé par tous les mécanismes (voir `liveStrategyEngine.js` ligne ~231) - le blocage "netting" reflète peut-être une VRAIE contrainte du compte cTrader (mode netting du broker : un 2e ordre sur la même paire fusionne avec la position existante au lieu de créer un stop/cible indépendant), pas juste une règle du bot. À vérifier auprès de FP Markets/cTrader (le compte doit supporter le mode HEDGING pour que 2 positions indépendantes sur la même paire aient chacune leur propre stop/cible réel) AVANT toute décision de code - sinon le changement ne ferait rien de plus qu'agrandir la position existante avec un stop/cible différent, pas ouvrir un vrai 2e trade.
- Le calcul ci-dessus suppose que la 2e position n'a AUCUNE interaction avec la 1ère (sizing indépendant, pas de garde-fou partagé) - une vraie implémentation devrait aussi décider comment le risque total du compte est plafonné avec 2 positions simultanées sur la même paire.
- Coûts partiels (spread mesuré, pas de commission/swap/glissement réel, pas le correctif de géométrie d'ordre).