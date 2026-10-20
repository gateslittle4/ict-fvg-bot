# Résultat — F2 avec ordres posés 12 h–16 h NY (AP1)

Règle et critères : `PREREG-F2-APRES-MIDI.md` (SHA-256 `ba8bf387…4198`, 2026-10-07 08:43 heure de New York), écrit avant le calcul de AP1 par la règle. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R ; A +0,067 (617), B +0,146 (605)). Code : `scripts/comboFvgV6/comboAJ_apres_midi.mjs` (+ test, 5 tests passent).

## Entraînement 2011–2022
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **AP1** 2011–2016 | 321 | 34 % | 103,2 | +0,321 | 3,04 | 14,0 |
| **AP1** 2017–2022 | 303 | 32 % | 67,9 | +0,224 | 2,13 | 17,2 |
| **AP1** 2011–2022 | 624 | 33 % | 171,1 | **+0,274** | 3,68 | 17,2 |

Retirés (trades de F2C posés avant 12 h) : 721, R moyen −0,002. Ajoutés (position libre) : 123, R moyen +0,324.

| Critère | AP1 |
|---|---|
| R moyen ≥ F2C + 0,03 | +0,274 contre +0,106 : ok |
| Welch ≥ 1,96 | 2,78 : ok |
| Moitiés A et B > F2C et > 0 | A +0,321, B +0,224 : ok |
| Pire baisse ≤ 34,3 | 17,2 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | 1,17 : ok |

Palier : **validée** à l'entraînement (cinq sur cinq). Comme écrit dans le pré-enregistrement, ce n'était pas un test à l'aveugle : j'avais calculé avant la variante 6 h–12 h (−0,050 R).

## Test 2023–2025 (lecture unique)
| | Trades | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|
| **AP1** 2023–2025 | 182 | 1,4 | **+0,008** | 0,06 | 20,0 |
| F2C 2023–2025 | 331 | 56,5 | +0,171 | 1,61 | 24,8 |
| Retirés (posés avant 12 h) | 199 | — | **+0,196** | — | — |
| Ajoutés (position libre) | 50 | — | −0,323 | — | — |
| AP1 2026 (descriptif) | 48 | −16,4 | −0,342 | −1,63 | 18,0 |
| F2C 2026 (descriptif) | 87 | −20,8 | −0,239 | −1,42 | 23,2 |

Verdict écrit d'avance : AP1 > F2C ? +0,008 contre +0,171 : non. AP1 > 0 ? oui, de justesse. Retirés < AP1 ? +0,196 contre +0,008 : non. **KO.** AP1 est rejetée ; pas de variante voisine, pas de relecture.

## Lecture honnête
1. **L'inversion est nette.** Sur 2011–2022, les ordres du matin valaient −0,002 R et ceux de l'après-midi +0,274 R. Sur 2023–2025, c'est l'inverse : le matin +0,196 R (199 trades), l'après-midi +0,008 R.
2. **Ton souvenir (« les trades après 12 h marchaient ») est vrai sur 2011–2022 et faux sur 2023–2025.** L'hypothèse « le bruit du matin passe » n'est donc pas confirmée : la différence matin/après-midi n'est pas stable dans le temps.
3. Les 50 trades ajoutés par effet de position libre perdent (−0,323 R) : ce que l'on gagne à retirer le matin, on le reperd en partie par des trades différents.
4. Même cause probable que pour les autres quasi-réussites : à l'entraînement, trier les trades sur une caractéristique (ici l'heure) trouve un sous-ensemble qui paraît très bon ; hors échantillon, il ne tient pas. Ici le test a même retourné le signe, ce qui est typique d'un tri fait sur du bruit.
5. 2026 (descriptif) : AP1 −0,342 R sur 48 trades, F2C −0,239 R sur 87 ; rien à conclure.

## Conséquence
F2 reste la référence inchangée, sans restriction d'heure. Pour toi, qui ne veux trader que le matin : le matin a bien fonctionné en 2023–2025 (+0,196 R), mais il a été nul en 2011–2022 (−0,002 R). Aucune des deux plages n'est fiable seule ; les deux périodes se compensent dans F2 entière.

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs.
- 2023–2025 n'est pas vierge pour F2 (son R global a été lu).
- Plus de 40 hypothèses testées sur les mêmes données.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAJ_apres_midi.mjs <data> train` puis `... test`. Tests : `node --test scripts/comboFvgV6/comboAJ_apres_midi.test.mjs`.
