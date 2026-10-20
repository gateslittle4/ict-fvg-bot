# Résultat — F2 contre le combo complet du site (celui qui trade en ce moment)

Calculé le 2026-10-06, après `PREREG-COMPARAISON-F2-VS-COMBO-LIVE.md` (écrit avant le calcul, aucune règle modifiée depuis). Remplace `RESULTAT-COMPARAISON-F2-VS-SITE.md`, qui portait sur le FVG seul (arrêté en live), donc sur la mauvaise cible.

## Verdict
**Selon la règle écrite d'avance : aucun ne fait mieux.** F2 gagne 3 points sur 5, le combo 2 ; il fallait 4. L'écart est mince, et il se joue sur des choses différentes : F2 a un meilleur rendement par trade, le combo a un meilleur t et fait moins mal en 2026.

## Les 5 contrôles (bot complet contre F2)
| Contrôle | F2 | Combo live | Point |
|---|---|---|---|
| 1. R moyen 2011–2022 | +0,106 | +0,088 | F2 |
| 2. Deux moitiés > 0 (la plus faible des deux) | +0,067 / +0,146 | +0,053 / +0,127 | F2 (les deux y arrivent) |
| 3. t 2011–2022 | 2,04 | 3,44 | Combo |
| 4. R moyen test 2023–2025 | +0,183 | +0,074 | F2 |
| 5. R moyen 2026 | −0,239 | −0,029 | Combo |

## Résultats détaillés du combo (R moyen par trade ; n)
| Bloc | Bot complet | Sans A ni B | A + B seuls | US100 seulement |
|---|---|---|---|---|
| 2011–2016 | +0,053 (3 315) | +0,014 (1 264) | +0,077 (2 051) | +0,077 (1 880) |
| 2017–2022 | +0,127 (3 054) | +0,142 (1 233) | +0,117 (1 821) | +0,149 (2 081) |
| 2011–2022 | +0,088 (6 369), t 3,44 | +0,077 (2 497), t 2,07 | +0,095 (3 872), t 2,74 | +0,115 (3 961), t 3,02 |
| Test 2023–2025 | +0,074 (1 776), t 1,63 | +0,044 (734), t 0,66 | +0,095 (1 042), t 1,55 | +0,091 (1 053), t 1,33 |
| 2026 (au 21/09) | −0,029 (463), t −0,36 | +0,071 (210), t 0,51 | −0,111 (253), t −1,23 | −0,097 (271), t −0,83 |

Bot complet : environ 10 à 12 trades par semaine, 27 % de gagnants, pire baisse 113 R (2011–2016), 47 R (test), 37 R (2026). Seule l'année 2011 (−0,11) et 2017 (−0,06) sont négatives avant 2026.

## Par stratégie (R moyen (n) : 2011–2016 | 2017–2022 | 2023–2025 | 2026)
| Stratégie | 2011–16 | 2017–22 | 2023–25 | 2026 |
|---|---|---|---|---|
| A, ORB 5 min US100 | +0,116 (1 251) | +0,150 (1 298) | +0,112 (648) | −0,169 (151) |
| B, noise US500 | +0,015 (800) | +0,034 (523) | +0,066 (394) | −0,026 (102) |
| Silver Bullet US100 | +0,010 (274) | +0,146 (279) | +0,080 (165) | −0,159 (45) |
| Silver Bullet US500 | +0,057 (177) | +0,166 (128) | −0,202 (101) | −0,006 (27) |
| CBDR US100 | +0,300 (123) | +0,033 (221) | −0,021 (119) | −0,193 (38) |
| Divergence US100 | −0,186 (163) | +0,021 (172) | +0,259 (92) | +0,145 (24) |
| Divergence US500 | +0,025 (263) | +0,136 (186) | +0,094 (132) | +0,136 (33) |
| NWOG US100 | −0,152 (69) | +0,577 (111) | −0,393 (29) | +0,781 (13) |
| Weekly Sweep US500 | +0,013 (169) | +0,102 (103) | +0,167 (75) | +0,438 (24) |
| RSI(2) US500 | +0,029 (26) | +0,060 (33) | +0,214 (21) | +0,141 (6) |

En 2026, ce qui tire le combo vers le bas, c'est surtout A (−0,169 sur 151 trades), Silver Bullet US100 et CBDR. Sans A ni B, le combo est à +0,071 en 2026.

## Validation absolue du combo (indépendante de F2)
Contre les trois critères d'origine : t ≥ 2,6 sur 2011–2022 (3,44 : oui), deux moitiés > 0 (+0,053 et +0,127 : oui), test 2023–2025 > 0 (+0,074 : oui). **Il passe les trois, ce que F2 ne fait pas** (t 2,04). Il faut lire ça avec les réserves ci-dessous : c'est moins net qu'il n'y paraît.

## Réserves à lire avant de conclure
- **A et B ont été retenues sur 2010–2022** (elles pèsent 3 872 des 6 369 trades). Le t de 3,44 est donc en partie « dans l'échantillon ». Sans A ni B, le t tombe à 2,07 (sous le seuil de 2,6) et la première moitié est à +0,014.
- **Le test 2023–2025 n'est pas significatif** (t 1,63) et 2026 est légèrement négatif. Les filtres du combo ont été conçus sur 2019–2025 : le test n'est pas vierge pour lui, ni pour F2.
- **Trades corrélés.** Le combo prend plusieurs trades le même jour sur deux instruments ; le t suppose des trades indépendants et est probablement trop flatteur. C'est aussi le cas de F2, mais moins.
- **Le « R » n'est pas le même objet.** Le combo mélange des définitions de risque (stop de la bougie 9:30 pour A, stop de secours à 3 sigma pour B, 3 × ATR pour RSI(2)). Le R par trade du combo et celui de F2 ne se lisent pas exactement pareil. La vue « US100 seulement » (+0,115, t 3,02) est la plus proche de F2 par l'instrument, mais elle contient A.
- **Rythme.** Le combo fait ≈ 0,9 R par semaine (2011–2022) et ≈ 0,8 (test) ; F2, d'après ses chiffres (≈ 2 trades par semaine × +0,106 puis × +0,183), ≈ 0,2 puis ≈ 0,4 R par semaine. Le combo gagne plus par semaine parce qu'il trade 5 fois plus ; il expose aussi davantage (pire baisse 113 R contre un chiffre non calculé pour F2).
- **Coûts différents.** Combo : spread + swap du broker en % du prix. F2 : spread 0,6 × prix/8200, sans swap.
- **Contrôle de cohérence : écart de 2 %.** 2017–2022 : 3 054 trades, identique au rapport du projet. 2011–2016 : 3 315 contre 3 250 dans `vol-regime-step0.md` (+65, soit 2 %). Je n'ai pas cherché la cause (probablement le début de 2011 ou des tranches régénérées). Ça ne change pas le verdict.

## Ce que ça veut dire
Ni l'un ni l'autre ne l'emporte nettement sous cette règle. Le combo est le seul des deux à passer les critères d'origine, mais en partie parce que A et B ont été choisies sur ces mêmes années, et il est à −0,029 en 2026. F2 rapporte plus par trade, mais reste sous le seuil statistique et à −0,239 en 2026. Le départ propre, c'est la démo en direct, pour les deux.

## Reproduction
- 2011–2022 : tranches existantes `data/live-replay/hist-*.json` (non relancées). 2023 → 21/09/2026 : `node --max-old-space-size=6144 scripts/runLiveReplay.js broker 0.5 2023 2027`, résultat copié dans `data/comparaison-f2-combo/broker-2023-2027.json` (je ne l'ai pas mis dans `data/live-replay/` pour ne pas fausser la commande `summary`, qui lit tous les fichiers de ce dossier).
- Analyse : `node scripts/comboFvgV6/analyse_combo.mjs` depuis la racine du projet. Pas de test dédié ; la cohérence avec le rapport du projet sert de contrôle.
