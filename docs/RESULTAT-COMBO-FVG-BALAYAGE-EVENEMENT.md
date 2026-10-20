# Résultat — Balayage H4 « événementiel » (G1)

Calculé le 2026-10-06 avec les critères de `PREREG-COMBO-FVG-BALAYAGE-EVENEMENT.md`. Achats US100 M15, R par trade (nombre de trades).

| Bloc | G1 événementiel | F2 (W = 32), pour mémoire |
|---|---|---|
| Entraînement A 2011–2016 | +0,046 (221), t 0,37 | +0,067 (617) |
| Entraînement B 2017–2022 | +0,225 (223), t 1,80 | +0,146 (605) |
| Entraînement 2011–2022 | +0,136 (444), t 1,54 | +0,106 (1 222), t 2,04 |
| Test 2023–2025 | +0,138 (141) | +0,183 (325) |
| 2026 | −0,397 (33) | −0,239 (87) |
| Trades par semaine (2023–25) | 0,90 | 2,08 |

## Verdict
Non validée. Critères : 0,90 trade par semaine (il en fallait 1,5) ÉCHEC ; t = 1,54 (il fallait 2,5) ÉCHEC ; moyenne > 0 dans les deux moitiés OK ; meilleure que sans filtre OK ; test > 0 OK. La règle événementielle est plus sélective que F2 (moins de trades), pas plus rentable de façon prouvée, et 2026 est négatif. Pas d'autre essai sur ces données.

Cas de la capture (2 oct. 2026) : le trade est retrouvé par « achats sans filtre » ; G1 n'a pas été rejoué dessus (données live hors protocole).
