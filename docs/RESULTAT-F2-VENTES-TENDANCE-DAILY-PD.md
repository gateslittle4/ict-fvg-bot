# Résultat — F2 en miroir (ventes) avec tendance daily baissière (TD2S), entraînement 2011–2022

Règle et critères : `PREREG-F2-VENTES-TENDANCE-DAILY-PD.md` (SHA-256 `b495244c…d2d261`, 2026-10-07 06:43 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Code : `scripts/comboFvgV6/comboAE_dailyPD_ventes.mjs` (+ test, 4 tests passent). **Contrôle F2S recoupé après coup avec `RESULTAT-F2-AJOUT-VENTES.md` (2026-10-07, une fois le lien avec ton ordinateur revenu) : identique** — 1 579 ventes, +0,025 R, t 0,53, 39,4 R, pire baisse 84,4 ; moitiés +0,054 (A) et −0,005 (B). Le pré-enregistrement, écrit avant, reste inchangé et dit toujours que ce recoupement n'était pas fait à ce moment-là.

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2S (ventes, sans filtre daily) 2011–2022 | 1 579 | 25 % | 39,4 | +0,025 | 0,53 | 84,4 |
| **TD2S** 2011–2016 | 340 | 30 % | 70,5 | +0,207 | 1,99 | 27,2 |
| **TD2S** 2017–2022 | 333 | 23 % | −8,3 | **−0,025** | −0,24 | 32,4 |
| **TD2S** 2011–2022 | 673 | 26 % | 62,2 | +0,092 | 1,26 | 35,6 |

Retirés (ventes de F2S prises quand la daily n'est pas baissière) : 907 trades (57 %), R moyen −0,022. Ajouté : 1 trade.

## Critères (tous requis)
| Critère | TD2S |
|---|---|
| R moyen ≥ F2S + 0,03 | +0,092 contre +0,025 : ok |
| Welch ≥ 1,96 (TD2S contre retirés) | **1,20 : échec** |
| Moitiés A et B > F2S et > 0 | A +0,207 (F2S +0,054) ok ; B **−0,025** (F2S −0,005) : **échec** |
| Pire baisse ≤ 1,25 × celle de F2S (105,5) | 35,6 : ok |
| Rythme ≥ 1,0 / semaine (2023–2025) | **0,94 : échec** |

**TD2S est rejetée** (trois critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine.

## Descriptif (non jugé)
Sur F2S 2011–2022 : ventes prises quand la daily est baissière +0,088 R (672) ; quand elle est haussière −0,022 R (907) ; aucune en état neutre.

## Lecture honnête
1. **Pas de signal fiable côté baissier.** Les ventes miroir de F2 sont presque à zéro sans filtre (+0,025 R, pire baisse 84 R). Le filtre daily baissier réduit la baisse (35,6 R) et améliore la moyenne (+0,092), mais tout vient de la première moitié (2011–2016 : +0,207) ; en 2017–2022 les ventes en daily baissière perdent (−0,025).
2. **Contraste avec le versant haussier** : pour les achats, TD2 était positive dans les deux moitiés à l'entraînement, mais elle n'a pas tenu sur 2023–2025 (+0,088 contre +0,171 pour F2C). Aucun des deux versants ne montre un avantage robuste.
3. **Rappel** : tu as dit que les ventes sont difficiles ; ce test ne dit rien sur tes ventes à la main (contexte H4, FVG H4 haussier à gauche, BMS).

## Limites
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAE_dailyPD_ventes.mjs <data> train` (≈ 35 s). Tests : `node --test scripts/comboFvgV6/comboAE_dailyPD_ventes.test.mjs`.
