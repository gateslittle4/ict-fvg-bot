# Plafond de 3 trades/jour : vérification de runMaxTradesPerDayRealismCheck.js sur M1 réel

Esdras a fait remarquer que l'analyse originale (`runMaxTradesPerDayRealismCheck.js`) tournait sur les bougies M15 de `data/backtest-input/` (règlement « stop gagne en cas d'égalité » quand stop et cible sont touchés dans la même bougie de 15 min), alors que le sweep de plafonds d'une autre session (`runMaxTradesSweepFullM1.js`) tournait sur le vrai M1 sans trous et trouvait la conclusion inverse. `scripts/runMaxTradesPerDayRealismCheckM1.js` refait EXACTEMENT la même analyse (même moteur réel `LiveStrategyEngine`/`GuardrailEngine`, même classification des raisons de veto) mais résout chaque trade minute par minute sur `data/real-m1-full/*.csv.gz` au lieu de faire confiance à l'événement `closed` du moteur sur M15 (même méthode que `scripts/runM1Truth.js`).

Combo actuel (`CONFIG` importé en direct, donc SANS GER40 - retiré le 2026-09-21, pas encore déployé), fenêtre 2024-01-01 → 2026-01-01 (clippée par la couverture M1 réelle).

## Sortie brute du script

```
Symboles (config actuelle) : US100, US500, XAUUSD, EURUSD

Chargement du M1 réel et reconstruction des M15...
Phase 1 : warmUp() sur tout l'historique M15 reconstruit du M1...
Candidats (netting/filtres de direction déjà appliqués, plafond/cooldown/perte pas encore) : 2494
Résolution M1 exacte de chaque candidat (bougie par bougie, minute par minute)...
Trades dans la fenêtre, résolus en M1 exact : 1232 (40 entrées FVG jamais touchées, écartées)

Phase 2 : rejeu à travers UN SEUL GuardrailEngine réel et persistant (maxTradesPerDay=3, cooldown=30min, dailyLossLimitPct=2%)...

Trades pris : 993 / 1232 (80.6%), R net = 157.2, moyenne 0.158R
Trades vétoés (au moins une raison) : 239 (19.4%)

Répartition des raisons de veto (un trade vétoé peut cumuler plusieurs raisons) :
  max_trades_reached           181 (14.7% de tous les trades candidats)
  cooldown_active              99 (8.0% de tous les trades candidats)

Vétoés PAR max_trades_reached SEUL : 140 (11.4% de tous les trades candidats)
  R net de ces trades vétoés = -13.3, moyenne -0.095R (comparer à la moyenne des trades pris ci-dessus)
Jours où max_trades_reached (seul) a coûté au moins 1 trade : 76 / 474 jours actifs (16.0%)

Exemples (jusqu'à 10) :
  2024-01-02T12:45:00.000Z weeklysweep/US500 netR=-1.04
  2024-01-10T14:30:00.000Z weeklysweep/US500 netR=-1.12
  2024-01-31T16:15:00.000Z weeklysweep/US500 netR=4.96
  2024-02-07T11:00:00.000Z silverbullet/US100 netR=-1.03
  2024-02-07T11:45:00.000Z silverbullet/US100 netR=2.99
  2024-02-12T14:30:00.000Z weeklysweep/US500 netR=4.97
  2024-03-05T11:45:00.000Z silverbullet/US500 netR=-1.02
  2024-03-27T13:30:00.000Z silverbullet/US100 netR=-1.02
  2024-04-02T09:30:00.000Z fvg/XAUUSD netR=-1.02
  2024-04-02T14:45:00.000Z weeklysweep/US500 netR=-1.06
```

## Conclusion

Sur M1 exact, les trades vétoés PAR le seul plafond de 3/jour ont une espérance moyenne de **-0,095R** (R net total -13,3 sur 140 trades), contre **+0,158R** pour les trades effectivement pris. Le signe s'inverse par rapport à l'analyse M15 originale (+0,117R pour les trades vétoés) - conforme au biais connu du règlement M15 (« le stop gagne l'égalité »), qui classait à tort en gagnants certains trades réellement perdants. Confirme la conclusion de `max-trades-per-day-sweep-full-m1.md` (autre session, M1 également) : le plafond de 3/jour n'est pas destructeur, il filtre même une petite part de bruit négatif. Ne pas relever le plafond sur la base de l'analyse M15 originale, qui est invalidée par ce contrôle.
