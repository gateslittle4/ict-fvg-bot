# Combo inchangé sur ~16 mois réels, M1 exact

Données : bougies M1 réelles FP Markets (2025-05-16 → 2026-09-18), M15 reconstruits du M1, 30 jours de chauffe ignorés (2025-06-15 → 2026-09-18). Mêmes garde-fous approximés que `runFinalBacktestReport.js` : lire les différences entre périodes, le niveau absolu est surestimé (~+53 % ici contre ~+31 % pour le vrai moteur sur les 7 derniers mois).

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| **Tout** | 849 | 26 % | +180.2 | +0.212 | $23390 | 15 % | 10 / 2 |
| Période NOUVELLE (avant 16 janv. 2026) | 395 | 26 % | +72.3 | +0.183 | $14033 | 12 % | 5 / 2 |
| Période déjà vue (16 janv. → sept. 2026) | 454 | 26 % | +107.8 | +0.237 | $16668 | 9 % | 5 / 0 |

## Mois par mois

| Mois | Trades | R net | R / trade |
|---|---|---|---|
| 2025-06 | 26 | +0.7 | +0.026 |
| 2025-07 | 58 | +2.8 | +0.048 |
| 2025-08 | 51 | -4.3 | -0.084 |
| 2025-09 | 61 | +8.6 | +0.141 |
| 2025-10 | 56 | +65.1 | +1.162 |
| 2025-11 | 56 | +15.2 | +0.271 |
| 2025-12 | 56 | -9.3 | -0.167 |
| 2026-01 | 59 | -13.5 | -0.229 |
| 2026-02 | 49 | +21.1 | +0.431 |
| 2026-03 | 56 | +24.2 | +0.432 |
| 2026-04 | 48 | +16.8 | +0.351 |
| 2026-05 | 55 | +21.0 | +0.383 |
| 2026-06 | 58 | -9.1 | -0.157 |
| 2026-07 | 65 | +0.1 | +0.002 |
| 2026-08 | 54 | +13.8 | +0.256 |
| 2026-09 | 41 | +27.0 | +0.659 |

Mois positifs : 12 sur 16.

## Par paire

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US100 | 298 | +100.7 | +0.338 |
| US500 | 161 | +40.0 | +0.248 |
| GER40 | 279 | +4.7 | +0.017 |
| XAUUSD | 38 | +46.2 | +1.216 |
| EURUSD | 73 | -11.4 | -0.157 |

## Limites

- Combo inchangé, rien n'est choisi sur cette période : la partie mai 2025 → janvier 2026 est un vrai échantillon hors de tout réglage récent (mais 2010-2025 avait servi à bâtir le combo).
- Non modélisés : commissions, swap, glissement, spread réel variable. Garde-fous approximés.
- Aucune borne M15 ici : les M15 viennent du M1, le règlement est exact à la minute.