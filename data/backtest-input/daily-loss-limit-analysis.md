# Pire perte journalière réalisée — config actuelle (0.5%/trade, aucun plafond de positions)

Esdras, avant de trancher challenge-vs-live : "la plupart des challenges demandent -5% max risque par jour. Est-on dans cela ?" Mesure directe sur la même simulation combinée que celle déjà confirmée (0.5% par trade, aucun plafond de positions simultanées, reset au +10%/bust) : perte RÉALISÉE par jour calendaire UTC (même convention que `CONFIG.guardrails.dayBoundaryHourUTC`), en % du solde en DÉBUT de ce jour-là.

**Limite importante à lire avant les chiffres** : ceci mesure la perte RÉALISÉE (trades clôturés) uniquement - exactement comme le garde-fou interne `dailyLossLimitPct`. Ça n'inclut PAS la perte FLOTTANTE intra-jour sur une position encore ouverte quand une mauvaise journée se termine - la plupart des prop firms (FTMO incluse) définissent la perte journalière sur l'ÉQUITÉ (solde + P&L flottant), pas seulement sur le réalisé. Ce chiffre est donc un PLANCHER du pire cas réel, pas une garantie de conformité - la vraie pire journée a pu être temporairement pire en intra-journée avant de se refermer moins mal.

**Total** : 1642 jours de trading avec au moins un trade clôturé, sur 46 cycles de compte (reset au +10%/-10%).

- Jours ≤ -2% : 0
- Jours ≤ -3% : 0
- Jours ≤ -4% : 0
- Jours ≤ -5% : 0

## 20 pires journées réalisées

| Date | Solde en début de journée | P&L du jour | P&L (% du solde) | Trades clôturés ce jour-là |
|---|---|---|---|---|
| 2025-10-29 | $10747 | $-186 | -1.73% | 3 |
| 2021-09-10 | $10288 | $-177 | -1.72% | 3 |
| 2023-09-18 | $10597 | $-181 | -1.71% | 3 |
| 2024-12-09 | $10808 | $-183 | -1.70% | 3 |
| 2021-05-03 | $10630 | $-180 | -1.69% | 3 |
| 2019-06-25 | $10579 | $-177 | -1.67% | 3 |
| 2020-01-24 | $9769 | $-163 | -1.67% | 3 |
| 2020-08-13 | $9696 | $-156 | -1.61% | 3 |
| 2021-03-26 | $10176 | $-161 | -1.59% | 3 |
| 2021-12-17 | $10694 | $-169 | -1.58% | 3 |
| 2024-05-23 | $10893 | $-170 | -1.56% | 3 |
| 2025-04-16 | $10064 | $-155 | -1.54% | 3 |
| 2024-01-02 | $10477 | $-161 | -1.54% | 3 |
| 2020-04-01 | $10116 | $-154 | -1.52% | 3 |
| 2024-12-26 | $10236 | $-134 | -1.30% | 2 |
| 2021-08-05 | $10417 | $-135 | -1.29% | 2 |
| 2020-02-11 | $9655 | $-124 | -1.28% | 2 |
| 2024-07-11 | $9070 | $-115 | -1.27% | 2 |
| 2019-06-12 | $10340 | $-131 | -1.27% | 2 |
| 2021-02-04 | $10412 | $-131 | -1.26% | 2 |

## Verdict

La pire journée RÉALISÉE trouvée est 2025-10-29 à -1.73% (3 trades clôturés ce jour-là). Aucun jour ne dépasse -5% en réalisé sur tout l'historique testé - on reste sous le seuil typique des challenges (souvent -5%), avec de la marge. Le garde-fou interne (`dailyLossLimitPct` = 2%) bloque les NOUVELLES entrées une fois ce seuil de perte réalisée franchi dans la journée, donc en théorie le système lui-même ne devrait jamais dépasser ~2% de perte réalisée AJOUTÉE par de nouveaux trades un jour donné - un dépassement au-delà vient forcément de positions ouvertes AVANT ce jour-là (multi-jours, jusqu'à ~5 jours) qui se résolvent en perte le même jour qu'une autre. Rappel : ceci ne couvre pas le flottant intra-jour (voir la limite en tête de rapport) - à traiter comme une évidence directionnelle rassurante, pas une garantie contractuelle.