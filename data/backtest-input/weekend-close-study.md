# Fermer les positions intraday avant le week-end — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-weekend-close-2026-09-25.md` (commité avant ce calcul). Rejeu fidèle `WEEKEND_CLOSE=1 NO_AB=1` sur les 8 tranches, comparé aux tranches existantes. Scripts : `scripts/runWeekendCloseStudy.js`, `scripts/lib/ftmoChallenge.js`, `scripts/lib/weekendClose.js`.

## Challenge FTMO 1-Step (départ chaque lundi, 0,5 % par trade)

| Départs | Nombre | Réussis sans règle | Réussis avec règle | Bustés sans / avec | Durée médiane sans / avec |
|---|---|---|---|---|---|
| 2011-2016 | 313 | 49 % (152) | 50 % (155) | 51 % / 50 % | 120 j / 101 j |
| 2017-2022 | 313 | 77 % (240) | 71 % (223) | 23 % / 29 % | 75 j / 100 j |
| Test 2023-2025 | 157 | 42 % (66) | 42 % (66) | 58 % / 58 % | 93 j / 71 j |
| 2026 (→ 21/09) | 33 | 33 % (11) | 33 % (11) | 12 % / 12 % | 49 j / 38 j |

## Descriptif : R et pertes extrêmes (trades entrés dans la période)

| Période | R total sans / avec | Trades sans / avec | Pire trade sans / avec | Pire jour sans / avec |
|---|---|---|---|---|
| 2011-2016 | +39.3 / +62.6 R | 1772 / 1853 | -3.8 / -2.4 R | -4.4 / -4.4 R |
| 2017-2022 | +296.2 / +212.5 R | 1976 / 1743 | -6.6 / -2.2 R | -7.6 / -5.0 R |
| Test 2023-2025 | +21.6 / +47.8 R | 1040 / 1097 | -3.6 / -1.3 R | -4.1 / -4.1 R |
| 2026 (→ 21/09) | -13.3 / +12.7 R | 270 / 289 | -9.5 / -1.2 R | -11.3 / -4.2 R |

Fermetures du vendredi : 298 trades, +230.4 R au moment de la fermeture.

| Stratégie | Fermés le vendredi | R sans règle (toutes périodes) | R avec règle |
|---|---|---|---|
| cbdr US100 | 3 | +10.4 | +16.9 |
| divergence US100 | 88 | +7.8 | -8.5 |
| divergence US500 | 90 | +73.6 | +66.7 |
| nwog US100 | 1 | +50.3 | +94.1 |
| rsi2-daily US500 | 0 | +6.2 | +7.0 |
| silverbullet US100 | 71 | +86.2 | +115.9 |
| silverbullet US500 | 37 | +52.3 | +29.1 |
| weeklysweep US500 | 8 | +57.0 | +14.4 |

## Verdict (critère pré-enregistré)

**NON RETENU** (le taux de réussite baisse sur au moins une moitié de l'entraînement)

## Limites

- Vendredi saint et fermetures anticipées non traités.
- A et B non incluses (tranches sans A/B) ; elles ferment déjà le soir même.
- Jour FTMO approché par UTC + 1 h ; soldes réalisés (pas de perte latente en cours de trade).
