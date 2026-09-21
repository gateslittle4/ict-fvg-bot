# Combo actuel (inchangé) sur tout l'historique M1 réel du broker — protocole pré-enregistré

Données : bougies M1 réelles FP Markets (EURUSD/XAUUSD dès 2022-05-19, indices dès 2023-01-11, jusqu'à 2026-09-21), fenêtres d'export de 8 jours (sans les trous du premier export), M15 reconstruits du M1, 30 jours de chauffe par paire ignorés (trades du 2022-06-20 au 2026-09-21). Règlement à la minute (M1 exact). Protocole : `protocol-m1-full-history-validation` dans `data/research-memory.json`.

**Lecture :** garde-fous approximés (3 trades/jour, 1 position par paire, pause 30 min après perte, arrêt du jour à -4R, stop ≥ 3× le spread), coûts (commission, swap, glissement) non modélisés : le niveau absolu est surestimé (sur 7 mois, ~+53 % ici contre ~+31 % pour le vrai moteur). Lire les différences entre périodes, pas les dollars.

## 1. Combo actuel, figé

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| **Tout l'historique** | 2574 | 25 % | +305.1 | +0.119 | $39815 | 22 % | 23 / 14 |
| Entraînement (avant 2025) | 1378 | 24 % | +76.8 | +0.056 | $13640 | 22 % | 11 / 10 |
| Test (2025-01-01 → fin) | 1196 | 26 % | +228.4 | +0.191 | $29190 | 17 % | 13 / 4 |

### Année par année

| Année | Trades | R net | R / trade | Baisse max |
|---|---|---|---|---|
| 2022 (à partir de juin, 2 paires) | 73 | -16.1 | -0.220 | 9 % |
| 2023 | 637 | +48.1 | +0.075 | 16 % |
| 2024 | 668 | +44.8 | +0.067 | 19 % |
| 2025 | 678 | +143.3 | +0.211 | 11 % |
| 2026 (jusqu'à septembre) | 518 | +85.1 | +0.164 | 12 % |

Années positives : 4 sur 5.

### Mois par mois

| Mois | Trades | R net | R / trade |
|---|---|---|---|
| 2022-06 | 5 | -5.5 | -1.099 |
| 2022-07 | 13 | -4.1 | -0.313 |
| 2022-08 | 10 | -6.9 | -0.694 |
| 2022-09 | 12 | +9.9 | +0.828 |
| 2022-10 | 15 | -2.9 | -0.197 |
| 2022-11 | 7 | -2.5 | -0.363 |
| 2022-12 | 11 | -4.0 | -0.365 |
| 2023-01 | 16 | -0.8 | -0.051 |
| 2023-02 | 41 | +5.4 | +0.132 |
| 2023-03 | 57 | +8.1 | +0.143 |
| 2023-04 | 57 | +7.4 | +0.130 |
| 2023-05 | 56 | -6.9 | -0.123 |
| 2023-06 | 59 | +20.8 | +0.352 |
| 2023-07 | 55 | -2.7 | -0.049 |
| 2023-08 | 62 | +41.3 | +0.666 |
| 2023-09 | 61 | -3.6 | -0.060 |
| 2023-10 | 66 | -10.8 | -0.164 |
| 2023-11 | 53 | -1.6 | -0.031 |
| 2023-12 | 54 | -8.5 | -0.157 |
| 2024-01 | 58 | +15.7 | +0.271 |
| 2024-02 | 52 | -7.6 | -0.147 |
| 2024-03 | 51 | -5.8 | -0.113 |
| 2024-04 | 54 | -12.3 | -0.227 |
| 2024-05 | 55 | +25.5 | +0.464 |
| 2024-06 | 50 | -24.1 | -0.482 |
| 2024-07 | 59 | +5.2 | +0.087 |
| 2024-08 | 68 | +10.7 | +0.157 |
| 2024-09 | 55 | +28.6 | +0.519 |
| 2024-10 | 59 | +23.0 | +0.389 |
| 2024-11 | 55 | +1.7 | +0.032 |
| 2024-12 | 52 | -15.8 | -0.304 |
| 2025-01 | 56 | +10.9 | +0.195 |
| 2025-02 | 58 | +30.9 | +0.533 |
| 2025-03 | 56 | +14.3 | +0.255 |
| 2025-04 | 52 | -3.9 | -0.075 |
| 2025-05 | 55 | +0.3 | +0.005 |
| 2025-06 | 50 | +1.0 | +0.019 |
| 2025-07 | 59 | +13.9 | +0.236 |
| 2025-08 | 55 | -6.1 | -0.111 |
| 2025-09 | 61 | +28.3 | +0.464 |
| 2025-10 | 59 | +55.3 | +0.938 |
| 2025-11 | 57 | +2.1 | +0.037 |
| 2025-12 | 60 | -3.7 | -0.062 |
| 2026-01 | 61 | -19.4 | -0.318 |
| 2026-02 | 52 | +24.2 | +0.465 |
| 2026-03 | 65 | +14.7 | +0.226 |
| 2026-04 | 55 | +14.9 | +0.272 |
| 2026-05 | 54 | +27.9 | +0.517 |
| 2026-06 | 63 | -8.3 | -0.132 |
| 2026-07 | 67 | +9.8 | +0.147 |
| 2026-08 | 60 | +10.2 | +0.170 |
| 2026-09 | 41 | +11.0 | +0.269 |

Mois positifs : 29 sur 52.
Meilleur mois : 2025-10 (+55.3 R, soit 18 % du total) ; total sans ce mois : +249.8 R.

### Par paire et par année (R net / trades)

| Paire | 2022 | 2023 | 2024 | 2025 | 2026 | Tout |
|---|---|---|---|---|---|---|
| US100 | — | +83.4 / 188 | +52.9 / 213 | +102.4 / 215 | +39.4 / 188 | +278.2 / 804 (+0.346 R/trade) |
| US500 | — | +22.1 / 108 | -6.1 / 127 | +23.2 / 134 | +7.8 / 102 | +47.1 / 471 (+0.100 R/trade) |
| GER40 | — | -48.4 / 201 | -34.9 / 228 | -2.1 / 218 | +14.2 / 162 | -71.2 / 809 (-0.088 R/trade) |
| XAUUSD | -7.8 / 23 | +2.7 / 37 | +14.3 / 38 | +11.4 / 29 | +31.6 / 23 | +52.3 / 150 (+0.349 R/trade) |
| EURUSD | -8.3 / 50 | -11.8 / 103 | +18.5 / 62 | +8.4 / 82 | -7.9 / 43 | -1.2 / 340 (-0.004 R/trade) |

## 2. Hypothèses de modification (3 testées, aucune autre)

Règle écrite avant le calcul : lecture du test seulement si, à l'entraînement, la paire retirée a un R net total ≤ 0. Rejet si R/trade du test < combo, OU pire baisse plus grande, OU amélioration de R/trade présente dans moins de la moitié des tranches annuelles (2023 à 2026). Voir aussi la note sur le biais de sélection ci-dessus.

### H1 retirer GER40

- Entraînement : R net des paires retirées = -83.2 → retenue pour lecture du test.

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Test — combo actuel | 1196 | 26 % | +228.4 | +0.191 | $29190 | 17 % | 13 / 4 |
| Test — H1 retirer GER40 | 925 | 27 % | +183.3 | +0.198 | $23725 | 13 % | 11 / 3 |

| Année | R/trade combo | R/trade modifié | Amélioré |
|---|---|---|---|
| 2023 | +0.075 | +0.171 | oui |
| 2024 | +0.067 | +0.138 | oui |
| 2025 | +0.211 | +0.305 | oui |
| 2026 | +0.164 | +0.062 | non |

- Critères : R/trade du test ≥ combo : oui ; pire baisse ≤ combo : oui ; amélioré dans ≥ moitié des tranches (3/4) : oui.
- Verdict : **candidate, à confirmer en démo (jamais adoptée sur ce seul test)**. R net total du test : combo +228.4 R contre +183.3 R modifié (un R/trade plus haut avec moins de trades peut donner MOINS de R au total).

### H2 retirer EURUSD

- Entraînement : R net des paires retirées = -1.7 → retenue pour lecture du test.

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Test — combo actuel | 1196 | 26 % | +228.4 | +0.191 | $29190 | 17 % | 13 / 4 |
| Test — H2 retirer EURUSD | 1134 | 25 % | +221.8 | +0.196 | $28304 | 20 % | 12 / 3 |

| Année | R/trade combo | R/trade modifié | Amélioré |
|---|---|---|---|
| 2023 | +0.075 | +0.111 | oui |
| 2024 | +0.067 | +0.039 | non |
| 2025 | +0.211 | +0.204 | non |
| 2026 | +0.164 | +0.184 | oui |

- Critères : R/trade du test ≥ combo : oui ; pire baisse ≤ combo : NON ; amélioré dans ≥ moitié des tranches (2/4) : oui.
- Verdict : **REJETÉE**. R net total du test : combo +228.4 R contre +221.8 R modifié (un R/trade plus haut avec moins de trades peut donner MOINS de R au total).

### H3 retirer GER40 et EURUSD

- Entraînement : R net des paires retirées = -84.9 → retenue pour lecture du test.

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Test — combo actuel | 1196 | 26 % | +228.4 | +0.191 | $29190 | 17 % | 13 / 4 |
| Test — H3 retirer GER40 et EURUSD | 827 | 26 % | +167.6 | +0.203 | $22039 | 15 % | 8 / 1 |

| Année | R/trade combo | R/trade modifié | Amélioré |
|---|---|---|---|
| 2023 | +0.075 | +0.285 | oui |
| 2024 | +0.067 | +0.094 | oui |
| 2025 | +0.211 | +0.291 | oui |
| 2026 | +0.164 | +0.097 | non |

- Critères : R/trade du test ≥ combo : oui ; pire baisse ≤ combo : oui ; amélioré dans ≥ moitié des tranches (3/4) : oui.
- Verdict : **candidate, à confirmer en démo (jamais adoptée sur ce seul test)**. R net total du test : combo +228.4 R contre +167.6 R modifié (un R/trade plus haut avec moins de trades peut donner MOINS de R au total).

## Limites

- Combo réglé sur 2010-2025 (plusieurs découpages, nombreuses comparaisons) : le M1 des mêmes années est une remesure exacte, pas une preuve indépendante. Seule la démo (depuis 2026-09-21) est vierge.
- Garde-fous simulés de façon approximative ; commissions, swap, glissement, spread variable non modélisés.
- Un mois extrême peut dominer (voir « Meilleur mois »).
- Les indices n'ont de M1 que depuis 2023-01 : la composition du portefeuille change entre 2022 et 2023.
- Le chiffre de référence du vrai moteur (~+31 % sur les 7 derniers mois) reste celui à citer pour le niveau.