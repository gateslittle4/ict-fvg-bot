# Résultat — F2 avec un plancher de RR de 5 et de 6 (entraînement 2011–2022)

Règle et critères : `PREREG-F2-RR-5-ET-6.md` (SHA-256 `bed2e350…4b8a`, 2026-10-06 21:08 heure de New York), commité avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse | R total / pire baisse |
|---|---|---|---|---|---|---|---|
| F2C (3 R) 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 | 4,73 |
| **RR5** 2011–2016 | 641 | 23 % | 69,4 | +0,108 | 1,25 | 39,8 | |
| **RR5** 2017–2022 | 621 | 25 % | 108,3 | +0,174 | 1,97 | 39,4 | |
| **RR5** 2011–2022 | 1 262 | 24 % | 177,7 | **+0,141** | 2,28 | 39,8 | 4,47 |
| **RR6** 2011–2016 | 642 | 22 % | 77,8 | +0,121 | 1,33 | 30,2 | |
| **RR6** 2017–2022 | 619 | 24 % | 124,4 | +0,201 | 2,11 | 44,4 | |
| **RR6** 2011–2022 | 1 261 | 23 % | 202,3 | **+0,160** | 2,43 | 44,4 | 4,56 |

Avec un plancher de 6 R : 9,8 % des trades touchent le TP, 13,5 % sortent au temps (96 bougies) avec un R moyen de **+2,46**. Avec 5 R : 13,3 % de TP et 10,8 % de sorties au temps à **+2,09** R en moyenne. Autrement dit, une partie des trades monte bien au-delà de 3 R mais n'atteint pas 5 ou 6 R en 24 heures.

## Critères (tous requis)
| Critère | RR5 | RR6 |
|---|---|---|
| R moyen ≥ F2C + 0,03 | +0,141 : ok | +0,160 : ok |
| t apparié ≥ 1,96 | 1,70 : échec | **1,97 : ok** (de justesse) |
| Moitiés A et B > F2C et > 0 | ok | ok |
| Pire baisse ≤ 1,25 × F2C (34,3 R) | 39,8 : **échec** | 44,4 : **échec** |
| Rythme ≥ 1,5 / semaine (2023–2025) | 2,16 : ok | 2,12 : ok |

**Les deux sont rejetées** (RR5 sur le t et la baisse, RR6 sur la seule pire baisse). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : pas de 4 R, 7 R ni de variante voisine.

## Ce que ça dit
1. **Tu avais en partie raison** : un plancher plus haut améliore le R moyen (+0,141 et +0,160 contre +0,106) et le R total (+177,7 et +202,3 contre +129,7), sans casser les deux moitiés d'années. C'est la première idée de cette série qui fait mieux que F2C sur le gain, y compris sur les deux moitiés.
2. **Le prix à payer est la baisse** : moins de trades gagnants (23–24 % contre 29 %), donc des séries de pertes plus longues. La pire baisse monte de 27,4 à 39,8 (RR5) et 44,4 R (RR6). Rapporté à la baisse, le gain est à peu près le même que F2C : R total / pire baisse = 4,47 et 4,56 contre 4,73. On gagne plus, mais on souffre proportionnellement autant.
3. **RR6 est un échec d'un seul critère**, celui de la pire baisse, fixé d'avance à 1,25 × F2C. Ce seuil était mon choix de prudence, pas un fait de la nature : mais le modifier maintenant que je connais le résultat serait exactement ce que le protocole interdit. Le t apparié de RR6 (1,97) passe aussi de très peu.
4. Cette étude ne mesure pas ton trading réel : tu gères tes trades à la main (sorties, partiels, contexte). Elle dit seulement que, sur les entrées de F2, viser plus loin rapporte plus en moyenne et fait plus mal à la baisse.

## Chemins honnêtes pour la suite (à ta décision)
- **Arrêter ici** : F2 reste à 3 R.
- **Lecture exploratoire de 2023–2025 pour RR6**, avec un critère écrit avant (comme pour H1) : elle ne pourrait jamais compter comme « passe » (RR6 est rejetée), seulement comme indice ; elle consommerait la lecture vierge de 2023–2025 pour un plancher de RR.
- **Suivre RR3 et RR6 côte à côte sur des signaux en temps réel après le 21/09/2026** : seule confirmation propre, elle demande du temps.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs. Le t de RR6 est à 1,97 pour 1,96 requis.
- 82 à 92 trades sont ajoutés par rapport à F2C (ordres libérés par la position) et 42 à 53 retirés.
- Les sorties au temps (96 bougies) sont une convention du moteur : un trade laissé courir plus longtemps pourrait finir autrement.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAA_rr.mjs <data> train` (≈ 15 s). Tests : `node --test scripts/comboFvgV6/comboAA_rr.test.mjs` (3 tests : identité à 3 R, structure des TP et des sorties, nombre de trades).
