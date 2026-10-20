# Résultat — FVG formé entre 4 h et 7 h, testé entre 7 h et 10 h (FM1), entraînement 2011–2022

> **ERRATUM (2026-10-08, 04 h 29 heure locale) : FM1 est la bonne lecture de ta règle.** Les heures que tu donnes sont celles que ton graphique **affiche pour une bougie** (curseur), soit l'heure de ton ordinateur = New York (la bougie ouverte à 08 h 15 UTC s'affiche 04:15). Les repères de l'axe, eux, sont en UTC (décalés de 4 h) et m'avaient induit en erreur : je les avais pris pour l'heure du graphique, ce qui a donné FM2 (mauvaise lecture). Conséquence sur ce document : la remarque de la « Lecture honnête » (point 4) et du pré-enregistrement disant que tes deux captures montrent des FVG « vers 10 h–11 h, hors plage » est **fausse** : ces FVG se sont formés vers 06 h 45–07 h 15 à New York, donc au bord de ta plage 4 h–7 h. Le résultat de FM1 (R moyen −0,009, trois critères échoués) n'est pas modifié.

Règle et critères : `PREREG-FVG-FORME-4-7-TESTE-7-10.md` (SHA-256 `a4825126…ba574`, 2026-10-08 04:10 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R). Code : `scripts/comboFvgV6/comboAK_fvg_matin.mjs` (+ test, 7 tests passent, dont : tout trade a son FVG formé entre 4 h et 7 h et son remplissage entre 7 h et 9 h 45).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| **FM1** 2011–2016 | 726 | 24 % | 35,7 | +0,049 | 0,67 | 42,8 |
| **FM1** 2017–2022 | 797 | 20 % | −49,7 | **−0,062** | −0,90 | 74,0 |
| **FM1** 2011–2022 | 1 523 | 22 % | −14,0 | **−0,009** | −0,18 | **93,4** |

## Critères (tous requis)
| Critère | FM1 |
|---|---|
| R moyen > 0 et t ≥ 1,96 | −0,009, t −0,18 : **échec** |
| Deux moitiés > 0 | A +0,049, B −0,062 : **échec** |
| Pire baisse ≤ 34,3 R | 93,4 : **échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 2,43 : ok |

**FM1 est rejetée** (trois critères sur quatre échouent ; palier : rejetée, le R moyen n'est même pas positif). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine (autres heures, entrée au bord, achats seuls, ventes seules).

## Descriptif (non jugé)
Sur 2011–2022 : achats 764 trades, −0,069 R (t −1,02) ; ventes 759 trades, +0,051 R (t 0,69). Rien de significatif dans l'un ou l'autre sens, et ce découpage est fait après coup : il ne sert pas à choisir une version « ventes seules ».

## Lecture honnête
1. **Cette règle, telle que je l'ai écrite, n'a pas d'avantage mesurable** : environ 1 520 trades pour −14 R au total, avec une baisse de 93 R. Le rythme est élevé (2,4 par semaine), mais sans rendement.
2. **Le filtre « plage horaire » ne suffit pas.** F2, qui ajoute le balayage H4 comme condition, garde un petit avantage ; ici, sans ce filtre, on retrouve un résultat voisin de zéro, comme pour les ventes miroir de F2 sans filtre (+0,025 R).
3. **Ce que le test ne mesure pas** : ton « testé » à n'importe quelle profondeur de la zone (ici, l'entrée est au 50 %), ton choix du FVG à l'œil, le contexte H4/daily que tu lis avant d'entrer, et l'entrée sur un timeframe plus bas. Ta stratégie réelle peut contenir ce que cette règle écrite n'a pas.
4. Les captures que tu as envoyées montrent des FVG vers 10 h–11 h, hors de la plage 4 h–7 h : elles n'ont servi à aucun réglage.

## Limites
- Définitions de « formé » et « testé » choisies par moi (voir le pré-enregistrement).
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAK_fvg_matin.mjs <data> train`. Tests : `node --test scripts/comboFvgV6/comboAK_fvg_matin.test.mjs`.
