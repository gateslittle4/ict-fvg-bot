# Bloquer une stratégie après une série de pertes, la réactiver après un gain virtuel — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-streak-block-2026-09-24.md` (commité avant ce calcul, rien changé depuis). Script : `scripts/runStreakBlockStudy.js`. Par jambe : 3 pertes consécutives prises → bloquée ; trades suivis à blanc ; premier gagnant virtuel → réactivée. Jambes en R : combo live (rejeu fidèle 2010-2026) + A ; B (en %) à part.

## K = 3 (règle pré-enregistrée)

- Entraînement : trades pris 3960 (moyenne +0.087 R), sautés 2850 (moyenne +0.151 R) → écart pris − sautés -0.063 R, **t = -1.17** ; 2010-2016 +0.113, 2017-2022 -0.245.
- Test 2023-2025 : pris 1052 (+0.008 R), sautés 754 (+0.159 R) → écart -0.151 R (t -1.48).
- Verdict : **INUTILE à l'entraînement**

| Période | R total sans règle | R total avec règle | R évité (trades sautés) |
|---|---|---|---|
| Entraînement 2010-2022 | +776.5 | +346.4 | -430.1 |
| Test 2023-2025 | +128.0 | +8.4 | -119.6 |
| 2026 (→ fin des données) | -41.6 | -48.8 | -7.2 |

### Par jambe, entraînement (R moyen des pris / des sautés)

| Jambe | Pris | Sautés |
|---|---|---|
| divergence US500 | +0.013 (373) | +0.240 (211) |
| silverbullet US500 | +0.182 (443) | +0.037 (247) |
| silverbullet US100 | +0.140 (523) | +0.110 (286) |
| cbdr US100 | +0.098 (336) | -0.030 (209) |
| nwog US100 | -0.158 (96) | +0.803 (78) |
| divergence US100 | -0.080 (272) | -0.023 (194) |
| weeklysweep US500 | +0.236 (187) | -0.040 (218) |
| rsi2-daily US500 | -0.102 (74) | +0.173 (1) |
| A (ORB) US100 | +0.094 (1656) | +0.210 (1406) |

Contrôle direct (entraînement) : trade qui suit 3 pertes de suite de la même jambe +0.151 R (2850) contre +0.114 R pour tous les trades.

## K = 2 (sensibilité)

- Entraînement : trades pris 3015 (moyenne +0.090 R), sautés 3795 (moyenne +0.133 R) → écart pris − sautés -0.042 R, **t = -0.80** ; 2010-2016 +0.151, 2017-2022 -0.227.
- Test 2023-2025 : pris 790 (-0.045 R), sautés 1016 (+0.161 R) → écart -0.206 R (t -2.10).
- Verdict : (sensibilité, jamais retenue)

| Période | R total sans règle | R total avec règle | R évité (trades sautés) |
|---|---|---|---|
| Entraînement 2010-2022 | +776.5 | +272.6 | -503.9 |
| Test 2023-2025 | +128.0 | -35.5 | -163.5 |
| 2026 (→ fin des données) | -41.6 | -29.8 | +11.9 |

## K = 4 (sensibilité)

- Entraînement : trades pris 4666 (moyenne +0.086 R), sautés 2144 (moyenne +0.174 R) → écart pris − sautés -0.088 R, **t = -1.48** ; 2010-2016 +0.020, 2017-2022 -0.214.
- Test 2023-2025 : pris 1247 (+0.023 R), sautés 559 (+0.177 R) → écart -0.154 R (t -1.38).
- Verdict : (sensibilité, jamais retenue)

| Période | R total sans règle | R total avec règle | R évité (trades sautés) |
|---|---|---|---|
| Entraînement 2010-2022 | +776.5 | +403.3 | -373.2 |
| Test 2023-2025 | +128.0 | +29.0 | -99.0 |
| 2026 (→ fin des données) | -41.6 | -50.2 | -8.6 |

## B (noise area US500, en % du nominal, descriptif, K = 3)

| Période | Pris (n, moyenne) | Sautés (n, moyenne) | Total sans / avec règle |
|---|---|---|---|
| Entraînement 2010-2022 | 2329, +0.016 % | 783, +0.026 % | +57.1 % / +36.9 % |
| Test 2023-2025 | 596, +0.016 % | 136, +0.043 % | +15.7 % / +9.8 % |
| 2026 (→ fin des données) | 147, -0.022 % | 62, -0.028 % | -4.9 % / -3.2 % |

## Limites

- Rejeu fidèle du combo : ses trades ont déjà subi le garde-fou et la position unique par paire ; bloquer une jambe pourrait libérer des places pour d'autres (non simulé).
- Tranches du rejeu recollées (chaque tranche repart de 90 jours de préchauffage).
