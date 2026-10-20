# Résultat — FVG formé 4 h–7 h, testé 7 h–10 h, heures UTC (FM2), entraînement 2011–2022

> **ERRATUM (2026-10-08, 04 h 29 heure locale) : FM2 repose sur une mauvaise lecture de ton graphique ; ne pas s'en servir.** J'avais conclu que ton graphique est en UTC à partir des **repères de l'axe** (06:00, 12:00, 18:00). Ta capture suivante montre que **l'heure affichée pour une bougie** (le curseur) est celle de ton ordinateur, donc New York : la bougie en cours, ouverte à 08 h 15 UTC, s'affiche « 08/10/2026 04:15:00 ». Les repères de l'axe sont décalés de 4 h par rapport à cette heure. Tes heures « 4 h–7 h » et « 7 h–10 h » sont donc des heures de New York, c'est-à-dire la règle de **FM1**, pas celle de FM2. Le résultat de FM2 ci-dessous reste exact pour ce qu'il a calculé (heures UTC fixes), mais il ne teste pas ta règle ; le résultat de ta règle est celui de FM1 (rejetée, R moyen −0,009).

Règle et critères : `PREREG-FVG-FORME-4-7-TESTE-7-10-UTC.md` (SHA-256 `4a0f7b42…8032`, 2026-10-08 04:25 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R). Code : `scripts/comboFvgV6/comboAL_fvg_matin_utc.mjs` (+ test, 4 tests passent, dont : tout trade a son FVG formé entre 4 h et 7 h UTC et son remplissage entre 7 h 00 et 9 h 45 UTC, heure recalculée sans le moteur).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| **FM2** 2011–2016 | 573 | 21 % | −4,7 | −0,008 | −0,09 | 86,7 |
| **FM2** 2017–2022 | 610 | 19 % | −65,6 | **−0,107** | −1,37 | 114,9 |
| **FM2** 2011–2022 | 1 183 | 20 % | −70,3 | **−0,059** | −1,02 | **152,2** |

## Critères (tous requis)
| Critère | FM2 |
|---|---|
| R moyen > 0 et t ≥ 1,96 | −0,059, t −1,02 : **échec** |
| Deux moitiés > 0 | A −0,008, B −0,107 : **échec** |
| Pire baisse ≤ 34,3 R | 152,2 : **échec** |
| Rythme ≥ 1,0 / semaine (2023–2025) | 2,15 : ok |

**FM2 est rejetée** (trois critères sur quatre échouent ; palier : rejetée). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : l'idée « plage horaire matinale » est close, dans la lecture New York (FM1 : −0,009 R) comme dans la lecture UTC (FM2 : −0,059 R).

## Descriptif (non jugé)
Sur 2011–2022 : achats 631 trades, +0,032 R (t 0,39) ; ventes 552 trades, −0,164 R (t −1,95). Ce découpage est fait après coup ; il ne sert pas à choisir une version « achats seuls ».

## Lecture honnête
1. Les deux lectures possibles de tes heures ont été testées avec les mêmes règles d'entrée, de stop et de cible : aucune n'a d'avantage mesurable sur 2011–2022.
2. FM2 est pire que FM1 : plage 3 h–6 h à New York (avant l'ouverture américaine), où les mouvements sont plus petits et où le spread réel est probablement plus large que le 0,6 point du test.
3. Le test ne mesure pas ta lecture à l'œil (FVG choisi, contexte H4/daily, profondeur d'entrée) ; une règle écrite avec les définitions de ce test n'est pas ta stratégie réelle.
4. Deux essais sur la même idée et les mêmes données : même un résultat positif aurait été à prendre avec prudence.

## Limites
- Définitions de « formé » et « testé » choisies par moi.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAL_fvg_matin_utc.mjs <data> train`. Tests : `node --test scripts/comboFvgV6/comboAL_fvg_matin_utc.test.mjs`.
