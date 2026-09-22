# Pré-enregistrement « nouveaux instruments » — ENTRAÎNEMENT (avant 2025-01-01)

Règles (LOT 2, critères durcis) : `data/backtest-input/preregistration-batch2-2026-09-21.md`. Vrai moteur, M1 exact, garde-fous réels rejoués (0,3 %), spread = 2 × le frère (décision). Spreads absolus : XAGUSD 0.00732, US30 2.51, XTIUSD 0.00647.

| Hypothèse | Trades | R net / trade | R net total | 1re moitié | 2e moitié | Verdict |
|---|---|---|---|---|---|---|
| Silver Bullet XAGUSD | 192 | +0.095 | +18.3 | +18.1 (90) | +0.1 (102) | rejetée |
| Silver Bullet US30 | 155 | -0.177 | -27.4 | -12.2 (81) | -15.2 (74) | rejetée |
| Silver Bullet XTIUSD | 148 | +0.211 | +31.3 | +17.0 (63) | +14.3 (85) | **RETENUE** (test à lire) |
| CBDR XAGUSD | 241 | -0.186 | -44.9 | -19.2 (99) | -25.7 (142) | rejetée |
| CBDR US30 | 111 | -0.295 | -32.8 | -20.2 (50) | -12.5 (61) | rejetée |
| CBDR XTIUSD | 269 | -0.253 | -68.1 | -47.5 (145) | -20.6 (124) | rejetée |
| Judas Swing XAGUSD | 171 | -0.009 | -1.5 | -10.4 (81) | +8.8 (90) | rejetée |
| Judas Swing US30 | 144 | +0.004 | +0.5 | +11.2 (75) | -10.7 (69) | rejetée |
| Judas Swing XTIUSD | 190 | -0.055 | -10.4 | -4.3 (95) | -6.1 (95) | rejetée |
| Breaker Block XAGUSD | 292 | -0.171 | -49.8 | -12.8 (134) | -37.0 (158) | rejetée |
| Breaker Block US30 | 267 | -0.095 | -25.4 | -12.2 (134) | -13.2 (133) | rejetée |
| Breaker Block XTIUSD | 295 | -0.184 | -54.3 | +28.6 (151) | -82.9 (144) | rejetée |

Retenues pour la lecture du test : B-silverBulletConfig-XTIUSD.

Règle appliquée : ≥ 80 trades, R net par trade ≥ +0,15 à 2 × le spread du frère, et R net positif sur les DEUX moitiés de l'entraînement (repli prévu quand il y a moins de 3 années civiles complètes). Aucune hypothèse rejetée ici n'a vu son test.