# RRR du Silver Bullet au rejeu fidèle au live — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-silverbullet-rr-2026-09-24.md` (commité avant ce calcul, avec son AMENDEMENT écrit avant tout résultat : entraînement ramené à 2010-2016). Rejeux : `SB_RR=<n> node scripts/runLiveReplay.js …` (config live, 0,3 %, 6 tranches avec 90 jours de préchauffage chacune), rapport : `scripts/runSilverBulletRrReport.js`.

## Chaque jambe par RRR (R net, trades, t)

### Silver Bullet US100

| RRR | Entraînement 2010-2016 | 2010-2013 | 2014-2016 | Test 2023-2025 | 2026 (→ 21/09) |
|---|---|---|---|---|---|
| 1:2 | +58.0 (394, t 2.02) | +17.5 (191, t 0.88) | +40.5 (203, t 1.95) | -8.8 (256, t -0.39) | -8.7 (65, t -0.59) |
| 1:3 (actuel) | +13.6 (383, t 0.40) | +21.6 (185, t 0.87) | -7.9 (198, t -0.33) | -7.8 (252, t -0.28) | -11.0 (65, t -0.66) |
| 1:4 | -1.4 (377, t -0.03) | +5.1 (182, t 0.19) | -6.4 (195, t -0.23) | -30.6 (245, t -1.02) | -4.2 (64, t -0.22) |
| 1:5 | +36.1 (372, t 0.79) | +27.4 (180, t 0.82) | +8.7 (192, t 0.28) | -14.7 (239, t -0.44) | +8.4 (65, t 0.38) |
| 1:6 | +40.3 (368, t 0.82) | +42.9 (179, t 1.16) | -2.6 (189, t -0.08) | -15.9 (234, t -0.44) | +14.1 (66, t 0.58) |
| 1:7 | +72.7 (363, t 1.34) | +74.5 (176, t 1.81) | -1.9 (187, t -0.05) | -22.3 (229, t -0.59) | +6.4 (64, t 0.24) |

### Silver Bullet US500

| RRR | Entraînement 2010-2016 | 2010-2013 | 2014-2016 | Test 2023-2025 | 2026 (→ 21/09) |
|---|---|---|---|---|---|
| 1:2 | +37.2 (351, t 1.38) | +6.3 (189, t 0.32) | +30.9 (162, t 1.68) | -24.8 (199, t -1.31) | -10.7 (48, t -1.19) |
| 1:3 (actuel) | +32.2 (343, t 0.98) | +13.6 (185, t 0.57) | +18.6 (158, t 0.84) | -20.2 (197, t -0.88) | -17.4 (48, t -1.72) |
| 1:4 | +31.7 (338, t 0.84) | +31.2 (183, t 1.09) | +0.6 (155, t 0.02) | -24.2 (193, t -0.93) | -18.5 (47, t -1.66) |
| 1:5 | +15.5 (329, t 0.38) | -1.5 (177, t -0.05) | +17.0 (152, t 0.60) | -30.5 (190, t -1.09) | -24.4 (47, t -2.18) |
| 1:6 | +43.9 (331, t 0.93) | +21.5 (181, t 0.60) | +22.5 (150, t 0.72) | -3.4 (188, t -0.11) | -21.5 (48, t -1.65) |
| 1:7 | +2.0 (329, t 0.04) | +11.4 (179, t 0.31) | -9.4 (150, t -0.30) | +6.0 (188, t 0.17) | -25.5 (48, t -1.98) |

## Décision (règle pré-enregistrée)

- **Silver Bullet US100** : meilleur à l'entraînement 1:7 (+72.7 R, t 1.34, moitiés +74.5 / -1.9) mais t < 2 ou une moitié négative → **on garde 1:3**
- **Silver Bullet US500** : meilleur à l'entraînement 1:6 (+43.9 R, t 0.93, moitiés +21.5 / +22.5) mais t < 2 ou une moitié négative → **on garde 1:3**

## Combo entier par RRR du Silver Bullet (descriptif)

| RRR | Entraînement | Test 2023-2025 | 2026 | FTMO 1-Step 0,3 % réussis / ratés (entr. · test · 2026) |
|---|---|---|---|---|
| 1:2 | +86.6 R (1809, t 1.20) | +18.3 R (1057, t 0.34) | -9.4 R (275, t -0.32) | 5/2 · 1/1 · 0/1 |
| 1:3 (actuel) | +30.0 R (1772, t 0.39) | +21.6 R (1040, t 0.38) | -13.3 R (270, t -0.43) | 5/4 · 1/2 · 0/1 |
| 1:4 | +8.5 R (1748, t 0.11) | -0.3 R (1021, t -0.00) | -3.6 R (264, t -0.11) | 3/3 · 1/2 · 0/1 |
| 1:5 | +24.0 R (1724, t 0.28) | +0.0 R (1008, t 0.00) | +4.2 R (264, t 0.12) | 5/5 · 1/2 · 1/1 |
| 1:6 | +44.6 R (1706, t 0.50) | +35.1 R (996, t 0.53) | +14.7 R (264, t 0.40) | 4/4 · 1/2 · 1/1 |
| 1:7 | +43.2 R (1687, t 0.47) | +34.2 R (981, t 0.51) | -1.8 R (261, t -0.05) | 4/6 · 2/2 · 1/1 |

## Limites

- Même RRR sur les deux paires dans chaque rejeu ; A et B (momentum intraday) absents du rejeu.
- 6 RRR comparés sur la même période : le meilleur à l'entraînement contient une part de chance (d'où la lecture du test).
- HistData ≠ prix du broker ; spread par défaut, pas de glissement au-delà du spread.
