# Pré-enregistrement « nouveaux instruments » — ENTRAÎNEMENT (avant 2025-01-01)

Règles : `data/backtest-input/preregistration-new-instruments-2026-09-21.md` (clarifications comprises). Vrai moteur, M1 exact, garde-fous réels rejoués (0,3 %), spread = 2 × le frère (décision). Spreads absolus : XAGUSD 0.00732, US30 2.51, XTIUSD 0.00647.

| Hypothèse | Trades | R net / trade | R net total | 1re moitié | 2e moitié | Verdict |
|---|---|---|---|---|---|---|
| FVG XAGUSD (config XAUUSD) | 98 | +0.299 | +29.3 | +1.9 (38) | +27.4 (60) | **RETENUE** (test à lire) |
| FVG US30 (config US100) | 220 | -0.055 | -12.2 | +12.8 (109) | -25.0 (111) | rejetée |
| FVG XTIUSD (config US500) | 78 | +0.331 | +25.8 | +12.2 (37) | +13.7 (41) | **RETENUE** (test à lire) |
| Weekly Sweep XAGUSD | 104 | -0.168 | -17.5 | -14.1 (55) | -3.4 (49) | rejetée |
| Weekly Sweep US30 | 93 | +0.122 | +11.4 | +7.9 (47) | +3.5 (46) | **RETENUE** (test à lire) |
| Weekly Sweep XTIUSD | 90 | -0.258 | -23.2 | -0.8 (41) | -22.4 (49) | rejetée |
| NWOG XAGUSD (bidirectionnel, config GER40) | 94 | -0.594 | -55.9 | -31.3 (46) | -24.6 (48) | rejetée |
| NWOG US30 (achat seul, config US100) | 19 | -0.487 | -9.3 | -5.3 (10) | -4.0 (9) | rejetée |
| NWOG XTIUSD (bidirectionnel, config GER40) | 90 | -0.075 | -6.8 | -7.4 (41) | +0.6 (49) | rejetée |
| Divergence XAUUSD/XAGUSD | 282 | +0.135 | +38.0 | -9.8 (143) | +47.8 (139) | rejetée |
| Divergence US100/US30 | 204 | +0.028 | +5.7 | +14.3 (106) | -8.6 (98) | rejetée |

Retenues pour la lecture du test : H-fvg-XAGUSD, H-fvg-XTIUSD, H-weekly-US30.

Règle appliquée : ≥ 60 trades, R net par trade ≥ +0,10 à 2 × le spread du frère, et R net positif sur les DEUX moitiés de l'entraînement (repli prévu quand il y a moins de 3 années civiles complètes). Aucune hypothèse rejetée ici n'a vu son test.