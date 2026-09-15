# Impact d'un blackout "±10 min autour des red news" sur le portefeuille combiné (5 mécanismes)

⚠ Demande explicite d'Esdras ("si on nous demande de ne pas trader les news ou 10 min avant et 10 min apres Red News, quel serait l'impact...") puis ("les props firms ont l'habitude de dire Red News, donc je pense que c'est TOUS les red news"). 130 événements réels, sources publiques officielles (BLS, Fed, BEA, Census, BCE) - voir `src/backtest/newsEvents.js` pour le détail exact des sources et des exclusions volontaires (Ifo/ZEW allemands, PMI ISM, demandes de chômage hebdomadaires - considérés "orange" plutôt que "red" sur la plupart des calendriers, pas chassés davantage). Appliqué sur tout le compte (une règle prop firm "pas de news" est typiquement compte-global, pas par instrument), construit par-dessus les correctifs déjà livrés cette session (cooldown par symbole, pyramidage soumis au garde-fou).

## Fenêtre : 2025-05-31 → 2025-12-31

| | Sans exclusion news | Avec exclusion ±10min |
|---|---|---|
| Trades | 208 | 208 (1 exclus) |
| Solde final | 21788.52 (117.89%) | 21788.52 (117.89%) |
| Drawdown max | 5.07% | 5.07% |

Répartition des 1 candidats exclus par les news :

| Source | Trades exclus |
|---|---|
| fvg | 1 |
