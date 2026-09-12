# FundingPips Zero — analyse préliminaire AVEC la fermeture forcée avant le week-end codée

Suite du verdict "non conforme tel quel" (voir HANDOFF.md, 2026-09-11) — Esdras : "si on code la partie funding pips pour CE challenge, fais quelque analyse préliminaire pour voir comment ça se comporterait." Contrairement à `runFundingPipsZeroAccountImpact.js` (config datée : contact unique, fenêtres 10h-11h/7h-10h, sans NWOG/Judas Swing), cette version lit la config de PRODUCTION ACTUELLE directement depuis `src/config.js` (US100 multi-contact 8h-12h, US500 10h-11h, XAUUSD 8h-12h, Divergence, NWOG, Judas Swing) et CODE réellement la fermeture forcée avant le week-end (au lieu de juste la détecter) - un vrai changement de comportement, pas un rapport. Testé à 3 niveaux de risque contre les vraies règles Zero (5% trailing verrouillé au solde de départ, 1% de risque ouvert max tous symboles confondus).

⚠️ **Le filtre news N'EST PAS codé ici** (voir l'en-tête du script) - seul un chevauchement avec le NFP (premier vendredi du mois, 8h-9h NY, seul motif public fixe sans besoin de calendrier externe) est compté, à titre de PLANCHER seulement. CPI, FOMC, PPI et le reste ne sont PAS comptés - l'exposition réelle à la règle news est plus élevée que le chiffre affiché ici.

## Risque 0.5%/trade

| Année | Trades (détail par source) | Win rate | Drawdown trailing max | Busté (-5%, verrouillé au solde départ)? | Risque ouvert max (limite 1%) | Fermetures forcées (week-end) | Chevauchements NFP (plancher) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 294 (97 FVG + 89 div. + 43 NWOG + 65 Judas) | 29.3% | 6.1% | non | **1.50%** (1592x) | 22 | 16 | $15922 |
| 2020 (train) | 20 (3 FVG + 7 div. + 3 NWOG + 7 Judas) | 10.0% | 5.3% | **OUI** (2020-01-30) | **1.01%** (104x) | 1 | 0 | $9468 |
| 2021 (train) | 326 (112 FVG + 90 div. + 39 NWOG + 85 Judas) | 27.0% | 13.9% | non | **2.00%** (1245x) | 10 | 12 | $13986 |
| 2022 (train) | 328 (104 FVG + 97 div. + 41 NWOG + 86 Judas) | 28.4% | 6.3% | non | **1.50%** (129x) | 12 | 12 | $16232 |
| 2023 (train) | 16 (4 FVG + 7 div. + 2 NWOG + 3 Judas) | 6.3% | 5.4% | **OUI** (2023-01-18) | 1.00% | 1 | 0 | $9460 |
| 2024 (test) | 320 (121 FVG + 91 div. + 37 NWOG + 71 Judas) | 26.9% | 10.4% | non | **1.51%** (804x) | 20 | 11 | $14935 |
| 2025 (test) | 349 (120 FVG + 99 div. + 39 NWOG + 91 Judas) | 30.7% | 5.6% | non | **1.51%** (2023x) | 21 | 16 | $23546 |

**Bilan 0.5%** : 2/7 années busted (2020, 2023), 87 fermetures forcées avant week-end sur 7 ans, 67 chevauchements NFP détectés (plancher, pas le total réel).

## Risque 0.3%/trade

| Année | Trades (détail par source) | Win rate | Drawdown trailing max | Busté (-5%, verrouillé au solde départ)? | Risque ouvert max (limite 1%) | Fermetures forcées (week-end) | Chevauchements NFP (plancher) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 294 (97 FVG + 89 div. + 43 NWOG + 65 Judas) | 29.3% | 3.7% | non | 0.90% | 22 | 16 | $13267 |
| 2020 (train) | 347 (123 FVG + 91 div. + 40 NWOG + 93 Judas) | 26.8% | 7.3% | non | 0.90% | 21 | 20 | $13395 |
| 2021 (train) | 326 (112 FVG + 90 div. + 39 NWOG + 85 Judas) | 27.0% | 8.6% | non | **1.20%** (4x) | 10 | 12 | $12285 |
| 2022 (train) | 328 (104 FVG + 97 div. + 41 NWOG + 86 Judas) | 28.4% | 3.8% | non | 0.90% | 12 | 12 | $13432 |
| 2023 (train) | 66 (11 FVG + 21 div. + 8 NWOG + 26 Judas) | 18.2% | 5.1% | **OUI** (2023-03-19) | **1.20%** (8x) | 4 | 4 | $9558 |
| 2024 (test) | 320 (121 FVG + 91 div. + 37 NWOG + 71 Judas) | 26.9% | 6.3% | non | 0.90% | 20 | 11 | $12773 |
| 2025 (test) | 349 (120 FVG + 99 div. + 39 NWOG + 91 Judas) | 30.7% | 3.4% | non | 0.90% | 21 | 16 | $16807 |

**Bilan 0.3%** : 1/7 années busted (2023), 110 fermetures forcées avant week-end sur 7 ans, 91 chevauchements NFP détectés (plancher, pas le total réel).

## Risque 0.25%/trade

| Année | Trades (détail par source) | Win rate | Drawdown trailing max | Busté (-5%, verrouillé au solde départ)? | Risque ouvert max (limite 1%) | Fermetures forcées (week-end) | Chevauchements NFP (plancher) | Solde final |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 294 (97 FVG + 89 div. + 43 NWOG + 65 Judas) | 29.3% | 3.1% | non | 0.75% | 22 | 16 | $12666 |
| 2020 (train) | 347 (123 FVG + 91 div. + 40 NWOG + 93 Judas) | 26.8% | 6.1% | non | 0.75% | 21 | 20 | $12772 |
| 2021 (train) | 326 (112 FVG + 90 div. + 39 NWOG + 85 Judas) | 27.0% | 7.2% | non | 1.00% | 10 | 12 | $11882 |
| 2022 (train) | 328 (104 FVG + 97 div. + 41 NWOG + 86 Judas) | 28.4% | 3.2% | non | 0.75% | 12 | 12 | $12799 |
| 2023 (train) | 322 (112 FVG + 76 div. + 34 NWOG + 100 Judas) | 27.6% | 4.2% | non | 1.00% | 23 | 8 | $12835 |
| 2024 (test) | 320 (121 FVG + 91 div. + 37 NWOG + 71 Judas) | 26.9% | 5.3% | non | 0.75% | 20 | 11 | $12273 |
| 2025 (test) | 349 (120 FVG + 99 div. + 39 NWOG + 91 Judas) | 30.7% | 2.8% | non | 0.75% | 21 | 16 | $15431 |

**Bilan 0.25%** : 0/7 années busted (aucune), 129 fermetures forcées avant week-end sur 7 ans, 95 chevauchements NFP détectés (plancher, pas le total réel).

## Ce que ça veut dire

Coder la fermeture forcée avant le week-end est FAISABLE et mesurable (voir les tableaux ci-dessus) - reste à décider si l'edge après coupure prématurée reste acceptable, et à quel risque par trade le bust rate devient confortable sous le plancher de 5% de Zero (plus serré que le 10% de FTMO). Le filtre news, en revanche, n'est PAS testé ici au-delà du NFP seul - une vraie mise en conformité demanderait un calendrier économique réel (source externe, pas encore choisie) pour couvrir CPI/FOMC/PPI/etc., sans quoi le chiffre de risque de rupture de règle news resterait sous-estimé. Rien codé dans `src/` - script de recherche seulement.