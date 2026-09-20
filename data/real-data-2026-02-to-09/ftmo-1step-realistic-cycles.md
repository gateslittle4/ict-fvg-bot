# FTMO 1-Step sur les 7 mois réels — cycles de +10 %, trois conventions de règlement

Données : vraies bougies du broker 2026-02-10 → 2026-09-17 (décalées en temps moteur), 8 mécanismes du bot, garde-fous réels, filtre « stop ≥ 3× le spread », risque 0.5 %/trade, 10000 $ par tentative. Règles FTMO 1-Step : cible +10 %, perte quotidienne 3 %, perte max 10 % trailing (fin de journée).

## Convention « script »

- 347 trades, 82 gagnants, R net total 17.8
- **2 défi(s) réussi(s) (+10 %), 1 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-04-26 | 104 | PASS | $11053 | $11053 / $9609 |
| 2 | 2026-04-26 | 2026-07-15 | 126 | PASS | $11025 | $11025 / $9509 |
| 3 | 2026-07-15 | 2026-08-18 | 71 | FAIL (perte max 10 %) | $8945 | $10073 / $8945 |
| 4 | 2026-08-19 | 2026-09-16 | 46 | EN COURS | $9845 | $10000 / $9242 |

## Convention « mi-chemin »

- 347 trades, 82 gagnants, R net total 17.8
- **2 défi(s) réussi(s) (+10 %), 1 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-04-26 | 104 | PASS | $11053 | $11053 / $9609 |
| 2 | 2026-04-26 | 2026-07-15 | 126 | PASS | $11025 | $11025 / $9509 |
| 3 | 2026-07-15 | 2026-08-18 | 71 | FAIL (perte max 10 %) | $8945 | $10073 / $8945 |
| 4 | 2026-08-19 | 2026-09-16 | 46 | EN COURS | $9845 | $10000 / $9242 |

## Convention « prudent »

- 347 trades, 82 gagnants, R net total 17.8
- **2 défi(s) réussi(s) (+10 %), 1 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-04-26 | 104 | PASS | $11053 | $11053 / $9609 |
| 2 | 2026-04-26 | 2026-07-15 | 126 | PASS | $11025 | $11025 / $9509 |
| 3 | 2026-07-15 | 2026-08-18 | 71 | FAIL (perte max 10 %) | $8945 | $10073 / $8945 |
| 4 | 2026-08-19 | 2026-09-16 | 46 | EN COURS | $9845 | $10000 / $9242 |

## Limites

- La liste de trades vient d'une seule course continue (les garde-fous ont vu ce solde-là) ; chaque tentative recalcule seulement le P&L en R net à 0,5 % de SON solde.
- Le spread élargi autour de 17 h NY, le glissement et les rejets d'ordre ne sont pas modélisés.
- 7 mois = un échantillon, pas une garantie statistique.