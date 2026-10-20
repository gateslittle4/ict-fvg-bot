# Résultat — F2 : ordres posés plus tard dans la matinée

Calculé le 2026-10-06, après `PREREG-F2-HEURE-TARDIVE.md` (écrit et sauvegardé avant la lecture, aucune règle modifiée depuis). Lecture unique de 2023–2025, puis 2026 en descriptif.

## Verdict
**Les deux hypothèses échouent. F2 reste telle quelle.** L'effet vu sur 2011–2022 (ordres tardifs meilleurs) **ne se retrouve pas** sur 2023–2025 : les ordres posés tôt y valent autant, voire plus, que les tardifs.

## Test 2023–2025 (R moyen par trade ; n)
| Variante | Gardés (après l'heure limite) | Exclus (avant l'heure limite) | t de Welch | Rythme (gardés) |
|---|---|---|---|---|
| T-9 : [09 ; 16[ | +0,160 (219), t 1,24 | +0,232 (106), t 1,19 | −0,31 | 1,41 /sem. |
| T-11 : [11 ; 16[ | +0,164 (174), t 1,15 | +0,206 (151), t 1,26 | −0,19 | 1,12 /sem. |

Critères : (1) gardés > 0 : oui pour les deux ; (2) gardés > exclus : **non** pour les deux (les ordres tôt sont un peu meilleurs) ; (3) t ≥ 1,96 : **non** (t négatifs) ; (4) rythme ≥ 1,0 : oui. Il fallait les quatre.

## 2026 (au 21/09), descriptif sans critère
| Variante | Gardés | Exclus |
|---|---|---|
| T-9 | −0,330 (63), t −1,76 | +0,001 (24) |
| T-11 | −0,215 (46), t −0,90 | −0,265 (41) |

En 2026, les ordres tôt (T-9, 24 trades) sont à zéro et les tardifs à −0,33 : à l'inverse de ce que 2011–2022 suggérait. Les effectifs sont petits.

## Ce que ça veut dire
Sur 2011–2022, les ordres tardifs étaient nettement meilleurs (+0,18 contre −0,06 R pour le 9 h, +0,26 contre −0,07 pour le 11 h). Sur 2023–2025, la différence a disparu et change même de signe, et en 2026 aussi. C'est le signe classique d'un effet vu après coup dans l'entraînement qui ne résiste pas à l'épreuve hors échantillon : il ressemblait à une régularité et c'était du hasard, ou une particularité de cette période. Aucune raison de modifier l'heure de F2, ni de raffiner (10 h, 12 h…) : la règle écrite d'avance interdit de chercher des variantes voisines.

## Réserves
- Test peu puissant (≈ 325 trades en tout, trades corrélés) : l'échec ne prouve pas que l'heure n'a aucun effet, il montre que l'effet de 2011–2022 n'est pas confirmé.
- 2023–2025 n'était pas vierge pour F2 en général, mais l'était pour cette découpe par heure ; il ne l'est plus maintenant, donc aucun autre test sur les heures ne peut s'y appuyer.
- Cette étude porte sur F2 (mécanique), pas sur ton jugement manuel du matin.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboI.mjs <data> test H-E,COMBO:11-16-0`. Sortie conservée dans l'analyse du 2026-10-06.
