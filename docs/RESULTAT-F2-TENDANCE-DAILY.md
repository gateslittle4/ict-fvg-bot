# Résultat — F2 avec tendance daily (TD1), entraînement 2011–2022

Règle et critères : `PREREG-F2-TENDANCE-DAILY.md` (SHA-256 `97db3834…9f90`, 2026-10-06 23:00 heure de New York), enregistré dans le dossier avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R, A +0,067 (617), B +0,146 (605)). Code : `scripts/comboFvgV6/comboAC_daily.mjs` (+ test, 5 tests passent).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **TD1** 2011–2016 | 351 | 27 % | 22,3 | +0,063 | 0,67 | 33,1 |
| **TD1** 2017–2022 | 416 | 30 % | 55,3 | +0,133 | 1,54 | 29,5 |
| **TD1** 2011–2022 | 767 | 29 % | 77,6 | **+0,101** | 1,58 | 33,1 |

Retirés (trades de F2C pris quand la daily n'était pas haussière) : 455 trades (37 %), R moyen **+0,115**. Ajoutés : 0.

## Critères (tous requis)
| Critère | TD1 |
|---|---|
| R moyen ≥ F2C + 0,03 | +0,101 contre +0,106 : **échec** |
| Welch ≥ 1,96 (TD1 contre retirés) | **−0,12 : échec** |
| Moitiés A et B > F2C et > 0 | A +0,063 (F2C +0,067), B +0,133 (F2C +0,146) : **échec** |
| Pire baisse ≤ 34,3 | 33,1 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,46 : ok |

**TD1 est rejetée** (trois critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : pas de 3 clôtures, pas d'autre pivot, pas de daily alignée sur 17 h, pas de fenêtre d'un jour.

## Descriptif (non jugé)
- Sur F2C 2011–2022 : les trades pris quand la daily est haussière font +0,101 R (767) ; quand elle est baissière +0,115 R (455) ; aucun en état neutre (l'état initial ne dure que les premières semaines).
- Part du temps en tendance haussière : de 47 % (2022) à 82 % (2013). L'état change 7 à 17 fois par an.

## Lecture honnête
1. **Dans les données, cette tendance daily ne sépare pas les bons achats des mauvais.** Les achats F2 pris contre une daily baissière font autant (+0,115) que ceux pris avec une daily haussière (+0,101). Écart sans signification (Welch −0,12) : ni pour ton idée, ni contre ; juste aucun effet mesurable.
2. **Ça rejoint ce que le test H4 avait donné** (tendance H4 : signes opposés selon la période). Une explication possible (non testée) : une tendance définie par « cassure d'un sommet avec clôtures au-dessus » arrive après le mouvement, alors que F2 achète des balayages de creux H4.
3. **Ce que ce test ne mesure pas** : (a) tes achats sur plusieurs jours de suite (la fenêtre reste de 32 bougies), (b) la cible lointaine « daily low pris puis rejeté → daily opposé » (non codée ; la cible reste le FVG M15 à gauche), (c) ta lecture à l'œil du graphique daily : mon « haussier » est un calcul avec pivot de 2 barres et 2 clôtures, pas ton œil.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs.
- La daily est alignée sur minuit NY (comme les barres H4 du moteur) ; les barres courtes du dimanche soir comptent. Rien d'autre n'a été essayé.

## Pour la suite (décision de Krystofia)
Une définition différente de ta daily (cible lointaine, BMS daily visible, ton œil) demanderait une définition précise et un nouveau pré-enregistrement avant tout calcul. La daily comme aide à ton jugement (au lieu d'une règle) peut aller dans le tableau prospectif.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAC_daily.mjs <data> train`. Tests : `node --test scripts/comboFvgV6/comboAC_daily.test.mjs`.
