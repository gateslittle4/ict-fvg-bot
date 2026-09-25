# A (ORB 5 min, US100) gardée jusqu'à la clôture du lendemain — résultat du pré-enregistrement

Règles : `data/backtest-input/preregistration-orb-hold-next-day-2026-09-25.md` (commité avant ce calcul). Code : `scripts/lib/orbHold.js` (testé), `scripts/runOrbHoldNextDayStudy.js`. Mêmes entrées pour les deux colonnes.

| Période | Trades | A actuelle (15:59) | Gagnants | A gardée jusqu'au lendemain | Gagnants | Écart |
|---|---|---|---|---|---|---|
| Entraînement 2011-2022 | 3062 | +450.4 R | 23 % | +533.8 R | 16 % | +83.4 R |
| 2011-2016 | 1526 | +203.4 R | 22 % | +155.8 R | 15 % | -47.5 R |
| 2017-2022 | 1536 | +247.0 R | 24 % | +377.9 R | 18 % | +130.9 R |
| Test 2023-2025 | 766 | +106.4 R | 24 % | +103.7 R | 16 % | -2.8 R |
| 2026 (→ 21/09) | 185 | -28.3 R | 26 % | -24.2 R | 15 % | +4.2 R |

Trades encore ouverts à 15:59 (les seuls que la variante change) : 862 sur 4013 ; sorties de la variante pour eux : close2 431, target 130, stop 301.

## Verdict (critère pré-enregistré)

**NON RETENUE** (ne bat pas la référence à l'entraînement, ou pas sur les deux moitiés)

## Limites

- HistData ≠ prix du broker ; spread par défaut ; swap du courtier ; la nuit, le spread réel est souvent plus large que le spread par défaut (non modélisé).
