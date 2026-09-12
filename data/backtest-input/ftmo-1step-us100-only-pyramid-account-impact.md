# FTMO 1-Step, US100 multi-contact SEUL, AVEC pyramidage (stops indépendants) — simulation de compte complète

Suite de `ftmo-1step-us100-only-account-impact.md` (US100 multi-contact seul, sans pyramide) - Esdras a demandé de faire tourner la simulation complète avec le pyramidage inclus, pour vérifier que le léger surcroît de drawdown observé en R purs (fvg-us100-pre-deploy-risk-analysis.md) ne change rien au verdict "jamais busté" une fois branché dans une vraie simulation de compte jour par jour, avec la vraie règle de drawdown trailing FTMO ET le guardrail de production (2 trades/jour max, perte quotidienne max 2%, pause 30min après une perte - `CONFIG.guardrails`). Le pyramidage ("stops indépendants", `runBacktestPyramidIndependentStops` porté ici candle par candle) : dès que le prix bouge de 1×D en notre faveur, une 2e unité de même taille s'ajoute, avec son propre stop et le même target ; le stop de l'unité originale n'est jamais déplacé. La 2e unité est un vrai second engagement de capital, sizée sur le solde COURANT et soumise au même filtre guardrail qu'un nouveau signal.

| Année | Groupes ouverts | Pyramidés (dont bloqués guardrail) | Legs fermés | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 37 | 9/37 | 46 | 23.9% | 3.5% | 5.7% | non | jamais | $10574 |
| 2020 (train) | 48 | 11/48 | 59 | 30.5% | 0.0% | 5.5% | non | jour 133 | $12194 |
| 2021 (train) | 46 | 7/46 | 53 | 47.2% | 0.6% | 2.2% | non | jour 115 | $15460 |
| 2022 (train) | 52 | 10/52 | 62 | 32.3% | 0.0% | 5.2% | non | jour 141 | $12852 |
| 2023 (train) | 37 | 5/37 | 42 | 33.3% | 2.2% | 5.0% | non | jour 260 | $11902 |
| 2024 (test) | 45 | 7/45 | 52 | 34.6% | 1.4% | 3.8% | non | jour 142 | $12746 |
| 2025 (test) | 50 | 11/50 | 61 | 49.2% | 0.0% | 3.3% | non | jour 92 | $17351 |

**Comparaison directe avec `ftmo-1step-us100-only-account-impact.md` (sans pyramide, chiffres déjà publiés)** :

| Année | Jour de passage sans pyramide | Jour de passage avec pyramide | Solde final sans | Solde final avec |
|---|---|---|---|---|
| 2019 (train) | jamais | jamais | $10824 | $10574 |
| 2020 (train) | jour 173 | jour 133 | $11509 | $12194 |
| 2021 (train) | jour 171 | jour 115 | $14300 | $15460 |
| 2022 (train) | jour 142 | jour 141 | $11920 | $12852 |
| 2023 (train) | jour 301 | jour 260 | $11540 | $11902 |
| 2024 (test) | jour 206 | jour 142 | $12124 | $12746 |
| 2025 (test) | jour 128 | jour 92 | $14990 | $17351 |

**Verdict** : le pyramidage ne fait JAMAIS busté sur les 7 années testées (drawdown trailing max jamais au-delà de 5.7%, loin du plafond FTMO de 10%) - le verdict "jamais busté" de la version sans pyramide tient donc aussi avec pyramidage. Il accélère nettement le passage du challenge dans 6 années sur 7 (ex. 2025 : jour 92 au lieu de 128 ; 2024 : jour 142 au lieu de 206) et augmente le solde final dans les mêmes 6 années. **Seule exception : 2019**, où le pyramidage donne un solde final plus bas ($10574 contre $10824) et un drawdown trailing un peu plus haut (5.7% contre 4.5%) - les deux versions ne complètent de toute façon pas le challenge cette année-là ("jamais" dans les deux cas), donc ce n'est pas un échec supplémentaire, juste une année où les unités ajoutées ont coûté plus qu'elles n'ont rapporté. Le guardrail de production (2 trades/jour, perte quotidienne max 2%) n'a bloqué aucun ajout de 2e unité sur les 7 années - ce filtre reste actif en cas de besoin mais n'a jamais eu à intervenir dans ces données.