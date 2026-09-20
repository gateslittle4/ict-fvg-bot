# FTMO 1-Step sur les 7 mois réels — cycles de +10 %, trois conventions de règlement

Données : vraies bougies du broker 2026-02-10 → 2026-09-17 (décalées en temps moteur), 8 mécanismes du bot, garde-fous réels, filtre « stop ≥ 3× le spread », risque 0.5 %/trade, 10000 $ par tentative. Règles FTMO 1-Step : cible +10 %, perte quotidienne 3 %, perte max 10 % trailing (fin de journée).

## Convention « script »

- 347 trades, 101 gagnants, R net total 110.7
- **5 défi(s) réussi(s) (+10 %), 1 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-04-01 | 66 | PASS | $11152 | $11152 / $9899 |
| 2 | 2026-04-01 | 2026-05-19 | 74 | FAIL (perte max 10 %) | $9753 | $10942 / $9353 |
| 3 | 2026-05-21 | 2026-06-02 | 17 | PASS | $11187 | $11187 / $10000 |
| 4 | 2026-06-02 | 2026-07-06 | 54 | PASS | $11181 | $11181 / $9934 |
| 5 | 2026-07-06 | 2026-08-13 | 76 | PASS | $11248 | $11248 / $9680 |
| 6 | 2026-08-13 | 2026-09-15 | 58 | PASS | $11031 | $11031 / $9258 |
| 7 | 2026-09-16 | 2026-09-16 | 2 | EN COURS | $10084 | $10135 / $10000 |

## Convention « mi-chemin »

- 347 trades (12 gagnants du script corrigés en pertes), 89 gagnants, R net total 60.7
- **3 défi(s) réussi(s) (+10 %), 1 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-04-16 | 92 | PASS | $11045 | $11045 / $9849 |
| 2 | 2026-04-16 | 2026-05-19 | 48 | FAIL (perte max 10 %) | $9371 | $10513 / $9371 |
| 3 | 2026-05-21 | 2026-06-02 | 19 | PASS | $11178 | $11178 / $10000 |
| 4 | 2026-06-02 | 2026-08-13 | 128 | PASS | $11170 | $11170 / $9554 |
| 5 | 2026-08-13 | 2026-09-16 | 60 | EN COURS | $10271 | $10391 / $9075 |

## Convention « prudent »

- 347 trades (27 gagnants du script corrigés en pertes), 74 gagnants, R net total -28.3
- **0 défi(s) réussi(s) (+10 %), 3 échec(s)**, 1 tentative en cours

| # | Début | Fin | Trades | Résultat | Solde fin | Plus haut / plus bas |
|---|---|---|---|---|---|---|
| 1 | 2026-02-16 | 2026-05-19 | 140 | FAIL (perte max 10 %) | $9468 | $10621 / $9468 |
| 2 | 2026-05-21 | 2026-07-29 | 118 | FAIL (perte max 10 %) | $9858 | $10995 / $9858 |
| 3 | 2026-07-29 | 2026-08-24 | 48 | FAIL (perte max 10 %) | $9035 | $10047 / $9035 |
| 4 | 2026-08-24 | 2026-09-16 | 41 | EN COURS | $10129 | $10247 / $9557 |

## Limites

- La liste de trades vient d'une seule course continue (les garde-fous ont vu ce solde-là) ; chaque tentative recalcule seulement le P&L en R net à 0,5 % de SON solde.
- Le spread élargi autour de 17 h NY, le glissement et les rejets d'ordre ne sont pas modélisés.
- 7 mois = un échantillon, pas une garantie statistique.