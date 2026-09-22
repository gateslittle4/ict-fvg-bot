# RSI(2) journalier, règle figée du lot 3, généralisation à d'autres indices

Aucun paramètre changé. Coûts : 2× le spread par défaut + swap 0,01 %/jour (même hypothèse que le lot 3).

| Indice | Trades | R net/trade | R total | t | 1re moitié | 2e moitié |
|---|---|---|---|---|---|---|
| GER40 | 119 | +0.090 | +10.7 | 2.18 | +5.8 (59) | +4.9 (60) |
| UKX | 49 | -0.059 | -2.9 | -0.86 | -1.0 (24) | -1.9 (25) |
| AUX | 48 | +0.074 | +3.6 | 1.12 | +1.2 (24) | +2.4 (24) |

## Limites

- Contrôle de robustesse d'une règle déjà décidée, pas une nouvelle recherche de paramètres.
- Historique plus court pour UKX (2018-2025) et AUX (2019-2025) que pour US500/GER40.
- Swap supposé, non mesuré ; règlement M15 « stop d'abord ».