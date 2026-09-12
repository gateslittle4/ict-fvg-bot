# US100 multi-contact — 8h-12h vs 10h-11h vs journée entière, sur les 7 mois RÉELS de forward-test

Question directe d'Esdras (2026-09-12) : "maintenant tu as accès aux données de 7 mois live, dis-moi 8h-12h vs 10h-11h, lequel aurait été meilleur ?" Bougies RÉELLES exportées du compte cTrader (`2026-02-06 04:15` → `2026-09-09 10:45`, voir `data/forward-test-2026/results.md`), jamais utilisées pour choisir un paramètre - un vrai hors-échantillon, pas un troisième découpage des mêmes données historiques 2019-2025. US100 multi-contact, config production verbatim à part la fenêtre testée.

⚠ **Échantillon minuscule, à lire avant les chiffres** : 7 MOIS réels, pas 7 ans. Le forward-test déjà publié (contact unique) ne trouvait que 3 trades nets sur toute la période pour US100 — le multi-contact en prend plus (un contact raté ne tue plus la zone), mais on reste très loin d'un échantillon statistiquement valable dans les deux cas. Ceci décrit ce qui est arrivé, ce n'est pas une preuve de laquelle des deux fenêtres est la meilleure.

| Fenêtre | Trades | Win rate | Espérance (R) | R total | Drawdown max (R) |
|---|---|---|---|---|---|
| 08h-12h | 26 | 34.6% | 0.99 | 25.74 | 6.39 |
| 10h-11h (production) | 9 | 44.4% | 1.56 | 14.06 | 2.23 |
| toute la journée | 133 | 24.8% | 0.41 | 54.55 | 11.78 |

## Détail des trades, fenêtre par fenêtre

### 08h-12h (n=26)
| Entrée | Direction | Résultat | R |
|---|---|---|---|
| 2026-03-24 08:00 | vente | loss | -1.02 |
| 2026-03-24 09:45 | vente | win | +4.97 |
| 2026-03-31 07:30 | vente | loss | -1.04 |
| 2026-04-14 07:00 | achat | win | +4.84 |
| 2026-04-14 07:45 | achat | win | +4.96 |
| 2026-04-16 09:45 | achat | win | +4.81 |
| 2026-04-17 07:30 | achat | win | +4.74 |
| 2026-05-01 08:45 | achat | loss | -1.15 |
| 2026-05-04 08:00 | achat | loss | -1.12 |
| 2026-05-11 07:15 | achat | loss | -1.03 |
| 2026-05-19 07:00 | achat | loss | -1.01 |
| 2026-05-25 07:15 | achat | win | +4.93 |
| 2026-05-25 08:00 | achat | loss | -1.11 |
| 2026-05-25 09:15 | achat | loss | -1.15 |
| 2026-05-26 10:45 | achat | loss | -1.08 |
| 2026-06-08 08:00 | achat | win | +4.99 |
| 2026-06-12 09:15 | achat | win | +4.70 |
| 2026-06-12 10:15 | achat | loss | -1.04 |
| 2026-06-24 09:45 | achat | loss | -1.02 |
| 2026-07-24 09:00 | vente | win | +4.98 |
| 2026-07-30 09:00 | vente | loss | -1.01 |
| 2026-08-19 07:15 | achat | loss | -1.15 |
| 2026-08-20 07:00 | achat | loss | -1.17 |
| 2026-08-20 07:15 | achat | loss | -1.02 |
| 2026-08-27 07:00 | achat | loss | -1.01 |
| 2026-09-03 07:00 | vente | loss | -1.04 |

### 10h-11h (production) (n=9)
| Entrée | Direction | Résultat | R |
|---|---|---|---|
| 2026-03-24 09:45 | vente | win | +4.97 |
| 2026-04-16 09:00 | achat | loss | -1.13 |
| 2026-04-16 09:45 | achat | win | +4.81 |
| 2026-05-04 09:00 | achat | loss | -1.12 |
| 2026-05-25 09:15 | achat | loss | -1.11 |
| 2026-06-12 09:15 | achat | win | +4.70 |
| 2026-06-24 09:45 | achat | loss | -1.02 |
| 2026-07-24 09:00 | vente | win | +4.98 |
| 2026-07-30 09:00 | vente | loss | -1.01 |

### toute la journée (n=133)
| Entrée | Direction | Résultat | R |
|---|---|---|---|
| 2026-03-24 08:00 | vente | loss | -1.02 |
| 2026-03-24 09:45 | vente | win | +4.97 |
| 2026-03-26 03:30 | vente | win | +4.89 |
| 2026-03-26 14:45 | vente | loss | -1.13 |
| 2026-03-31 07:30 | vente | loss | -1.04 |
| 2026-04-03 02:15 | vente | loss | -1.08 |
| 2026-04-03 02:45 | vente | loss | -1.05 |
| 2026-04-06 18:15 | vente | loss | -1.07 |
| 2026-04-09 13:30 | achat | loss | -1.09 |
| 2026-04-09 16:30 | achat | loss | -1.03 |
| 2026-04-10 16:00 | achat | loss | -1.09 |
| 2026-04-14 05:30 | achat | loss | -1.16 |
| 2026-04-14 07:45 | achat | win | +4.96 |
| 2026-04-15 02:30 | achat | loss | -1.17 |
| 2026-04-16 09:45 | achat | win | +4.81 |
| 2026-04-16 15:30 | achat | loss | -1.02 |
| 2026-04-17 07:30 | achat | win | +4.74 |
| 2026-04-27 13:00 | achat | loss | -1.09 |
| 2026-04-28 02:45 | achat | loss | -1.02 |
| 2026-04-28 03:45 | achat | loss | -1.10 |
| 2026-04-29 14:30 | achat | loss | -1.09 |
| 2026-04-29 15:00 | achat | loss | -1.04 |
| 2026-05-01 08:45 | achat | loss | -1.15 |
| 2026-05-01 12:30 | achat | win | +4.96 |
| 2026-05-01 18:45 | achat | loss | -1.02 |
| 2026-05-04 08:00 | achat | loss | -1.12 |
| 2026-05-05 01:30 | achat | win | +4.81 |
| 2026-05-10 22:15 | achat | win | +4.97 |
| 2026-05-11 16:15 | achat | loss | -1.05 |
| 2026-05-12 13:30 | achat | loss | -1.15 |
| 2026-05-13 11:30 | achat | loss | -1.11 |
| 2026-05-13 13:00 | achat | win | +4.91 |
| 2026-05-14 13:30 | achat | loss | -1.08 |
| 2026-05-18 14:30 | achat | loss | -1.11 |
| 2026-05-19 07:00 | achat | loss | -1.01 |
| 2026-05-20 13:15 | achat | loss | -1.09 |
| 2026-05-20 13:30 | achat | win | +4.88 |
| 2026-05-20 16:00 | achat | loss | -1.09 |
| 2026-05-22 18:30 | achat | loss | -1.13 |
| 2026-05-25 07:15 | achat | win | +4.93 |
| 2026-05-25 08:00 | achat | loss | -1.11 |
| 2026-05-25 09:15 | achat | loss | -1.15 |
| 2026-05-25 14:00 | achat | loss | -1.09 |
| 2026-05-26 10:45 | achat | loss | -1.08 |
| 2026-05-29 15:00 | achat | win | +4.91 |
| 2026-05-29 16:30 | achat | loss | -1.19 |
| 2026-06-02 14:15 | achat | loss | -1.11 |
| 2026-06-02 15:30 | achat | win | +4.91 |
| 2026-06-02 23:15 | achat | loss | -1.28 |
| 2026-06-03 01:00 | achat | loss | -1.12 |
| 2026-06-04 15:30 | achat | loss | -1.01 |
| 2026-06-08 08:00 | achat | win | +4.99 |
| 2026-06-09 01:30 | achat | win | +4.98 |
| 2026-06-11 13:45 | vente | loss | -1.04 |
| 2026-06-11 15:15 | vente | loss | -1.18 |
| 2026-06-12 05:30 | achat | loss | -1.01 |
| 2026-06-12 10:15 | achat | loss | -1.04 |
| 2026-06-12 13:45 | achat | win | +4.98 |
| 2026-06-12 14:30 | achat | loss | -1.01 |
| 2026-06-12 15:30 | achat | loss | -1.04 |
| 2026-06-16 01:00 | achat | win | +4.74 |
| 2026-06-17 18:30 | achat | loss | -1.07 |
| 2026-06-18 11:00 | achat | loss | -1.13 |
| 2026-06-18 13:30 | achat | loss | -1.05 |
| 2026-06-23 13:45 | achat | win | +4.97 |
| 2026-06-23 14:30 | achat | loss | -1.01 |
| 2026-06-24 09:45 | achat | loss | -1.02 |
| 2026-06-24 14:45 | achat | loss | -1.03 |
| 2026-06-24 15:00 | achat | loss | -1.02 |
| 2026-06-25 02:15 | achat | loss | -1.01 |
| 2026-06-25 22:30 | achat | loss | -1.01 |
| 2026-06-25 23:45 | achat | win | +4.77 |
| 2026-06-26 13:45 | vente | loss | -1.08 |
| 2026-06-28 22:15 | vente | loss | -1.07 |
| 2026-06-29 13:30 | achat | loss | -1.02 |
| 2026-06-30 12:30 | achat | loss | -1.08 |
| 2026-07-02 01:00 | achat | loss | -1.04 |
| 2026-07-02 14:15 | achat | loss | -1.03 |
| 2026-07-06 13:30 | achat | win | +4.92 |
| 2026-07-06 23:15 | achat | loss | -1.03 |
| 2026-07-10 14:30 | achat | loss | -1.05 |
| 2026-07-12 23:45 | achat | loss | -1.03 |
| 2026-07-13 00:30 | achat | loss | -1.01 |
| 2026-07-15 12:45 | achat | loss | -1.12 |
| 2026-07-15 13:00 | achat | loss | -1.02 |
| 2026-07-17 14:00 | vente | loss | -1.02 |
| 2026-07-23 20:00 | vente | loss | -1.04 |
| 2026-07-24 09:00 | vente | win | +4.98 |
| 2026-07-27 19:00 | vente | loss | -1.01 |
| 2026-07-28 15:30 | vente | loss | -1.08 |
| 2026-07-29 12:15 | vente | loss | -1.18 |
| 2026-07-29 12:45 | vente | loss | -1.06 |
| 2026-07-30 09:00 | vente | loss | -1.01 |
| 2026-07-31 13:30 | vente | win | +4.98 |
| 2026-07-31 14:30 | vente | loss | -1.02 |
| 2026-07-31 19:45 | vente | loss | -1.02 |
| 2026-08-04 01:00 | vente | loss | -1.06 |
| 2026-08-04 01:30 | vente | loss | -1.21 |
| 2026-08-05 14:45 | achat | loss | -1.05 |
| 2026-08-06 14:00 | achat | win | +4.95 |
| 2026-08-06 14:30 | achat | loss | -1.05 |
| 2026-08-07 04:00 | achat | loss | -1.02 |
| 2026-08-07 05:30 | achat | win | +4.96 |
| 2026-08-11 01:00 | achat | win | +4.74 |
| 2026-08-11 13:30 | achat | loss | -1.06 |
| 2026-08-11 14:30 | achat | win | +4.78 |
| 2026-08-12 12:30 | achat | win | +4.93 |
| 2026-08-12 13:30 | achat | loss | -1.06 |
| 2026-08-12 20:15 | achat | loss | -1.20 |
| 2026-08-13 13:30 | achat | win | +4.93 |
| 2026-08-13 19:45 | achat | loss | -1.19 |
| 2026-08-13 20:00 | achat | loss | -1.01 |
| 2026-08-17 12:00 | achat | loss | -1.06 |
| 2026-08-19 07:15 | achat | loss | -1.15 |
| 2026-08-19 22:00 | achat | loss | -1.01 |
| 2026-08-20 22:00 | vente | loss | -1.02 |
| 2026-08-21 13:15 | achat | loss | -1.04 |
| 2026-08-24 00:15 | achat | loss | -1.02 |
| 2026-08-24 13:30 | vente | win | +4.95 |
| 2026-08-24 18:30 | vente | loss | -1.01 |
| 2026-08-25 16:00 | vente | loss | -1.04 |
| 2026-08-25 20:15 | vente | loss | -1.06 |
| 2026-08-26 00:15 | vente | win | +4.91 |
| 2026-08-26 12:30 | vente | loss | -1.12 |
| 2026-08-27 05:45 | achat | loss | -1.01 |
| 2026-09-01 14:45 | vente | win | +4.80 |
| 2026-09-02 02:15 | vente | loss | -1.06 |
| 2026-09-02 07:00 | vente | loss | -1.26 |
| 2026-09-02 13:15 | vente | loss | -1.04 |
| 2026-09-03 05:30 | vente | loss | -1.02 |
| 2026-09-03 07:00 | vente | loss | -1.13 |
| 2026-09-08 00:15 | achat | win | +4.88 |
| 2026-09-08 01:00 | achat | win | +4.94 |

**Sur ces 7 mois précis**, la fenêtre au R total le plus haut est **toute la journée** (54.55R). Avec un échantillon aussi petit, un seul trade gagnant ou perdant suffit à faire basculer ce classement - ce résultat en dit plus sur CE QUI EST ARRIVÉ que sur QUELLE FENÊTRE EST STRUCTURELLEMENT MEILLEURE (voir plutôt fvg-multi-touch-window-weekday-analysis.md et ftmo-1step-us100-only-8to12-account-impact.md pour ça, sur 7 ANNÉES).