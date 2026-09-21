# Backtest du combo avec les spreads RÉELS mesurés (sensibilité aux coûts)

Combo inchangé, M1 réel sans trous (2022-06 → 2026-09), règlement à la minute. Spreads mesurés sur le compte démo (`bot_spread_samples`, **seulement dimanche 22:30 → lundi 07:45 UTC**, sans séance de New York ni annonces). EURUSD 0,00011, US100 0,6, US500 0,25, XAUUSD 0,24 mesurés constants ; GER40 varie selon l'heure UTC d'entrée (voir script). Les heures 8-21 h UTC de GER40 ne sont pas observées : scénario optimiste (0,5) et prudent (0,5 de 8 h à 16 h, 2,3 de 17 h à 21 h). Filtre « stop ≥ 3× le spread » appliqué avec le spread de l'heure. **Sensibilité aux coûts, pas un nouveau test d'hypothèse : rien n'est adopté.** Le risque réel du bot est 0,3 % par trade (colonne « compte 0,3 % »), les simulations précédentes utilisaient 0,5 %.

## Tout l'historique

| Variante | Trades | R net | R / trade | Compte 10 000 $ (0,5 %) | Compte (0,3 %, réel) | Pire baisse (0,5 %) | FTMO (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Spreads supposés (référence, comme le rapport précédent) | 2574 | +305.1 | +0.119 | $39815 | $23711 | 22 % | 23 / 14 |
| Spreads mesurés — GER40 optimiste — combo actuel | 2467 | +264.3 | +0.107 | $32724 | $21039 | 20 % | 19 / 10 |
| Spreads mesurés — GER40 optimiste — SANS GER40 | 1994 | +322.4 | +0.162 | $44946 | $25288 | 13 % | 20 / 7 |
| Spreads mesurés — GER40 prudent — combo actuel | 2461 | +257.6 | +0.105 | $31659 | $20622 | 20 % | 19 / 11 |
| Spreads mesurés — GER40 prudent — SANS GER40 | 1994 | +322.4 | +0.162 | $44946 | $25288 | 13 % | 20 / 7 |

## Entraînement (avant 2025)

| Variante | Trades | R net | R / trade | Compte 10 000 $ (0,5 %) | Compte (0,3 %, réel) | Pire baisse (0,5 %) | FTMO (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Spreads supposés (référence, comme le rapport précédent) | 1378 | +76.8 | +0.056 | $13640 | $12260 | 22 % | 11 / 10 |
| Spreads mesurés — GER40 optimiste — combo actuel | 1310 | +91.8 | +0.070 | $14752 | $12840 | 17 % | 8 / 5 |
| Spreads mesurés — GER40 optimiste — SANS GER40 | 1069 | +138.9 | +0.130 | $18922 | $14861 | 12 % | 9 / 4 |
| Spreads mesurés — GER40 prudent — combo actuel | 1305 | +89.1 | +0.068 | $14560 | $12739 | 17 % | 8 / 5 |
| Spreads mesurés — GER40 prudent — SANS GER40 | 1069 | +138.9 | +0.130 | $18922 | $14861 | 12 % | 9 / 4 |

## Test (2025-01-01 → fin)

| Variante | Trades | R net | R / trade | Compte 10 000 $ (0,5 %) | Compte (0,3 %, réel) | Pire baisse (0,5 %) | FTMO (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| Spreads supposés (référence, comme le rapport précédent) | 1196 | +228.4 | +0.191 | $29190 | $19340 | 17 % | 13 / 4 |
| Spreads mesurés — GER40 optimiste — combo actuel | 1157 | +172.6 | +0.149 | $22183 | $16385 | 19 % | 11 / 5 |
| Spreads mesurés — GER40 optimiste — SANS GER40 | 925 | +183.5 | +0.198 | $23753 | $17016 | 13 % | 11 / 3 |
| Spreads mesurés — GER40 prudent — combo actuel | 1156 | +168.5 | +0.146 | $21743 | $16188 | 19 % | 11 / 6 |
| Spreads mesurés — GER40 prudent — SANS GER40 | 925 | +183.5 | +0.198 | $23753 | $17016 | 13 % | 11 / 3 |

## GER40 par plage horaire d'entrée (UTC), spreads mesurés, scénario prudent

| Plage | Trades | R net | R / trade | Spread moyen |
|---|---|---|---|---|
| Nuit (22-05 h) | 94 | -13.8 | -0.146 | 5.32 |
| Ouverture Francfort (06-08 h) | 189 | -35.9 | -0.190 | 0.52 |
| Journée européenne/NY (09-16 h) | 367 | -48.6 | -0.132 | 0.50 |
| Soir (17-21 h) | 42 | +0.3 | +0.008 | 2.30 |

## Par paire, spreads mesurés (prudent), tout l'historique

| Paire | Trades | R net | R / trade |
|---|---|---|---|
| US100 | 804 | +264.1 | +0.328 |
| US500 | 474 | +40.4 | +0.085 |
| GER40 | 692 | -98.0 | -0.142 |
| XAUUSD | 150 | +53.5 | +0.357 |
| EURUSD | 341 | -2.4 | -0.007 |

## Limites

- Spreads mesurés sur 9 heures seulement (Asie/Europe du matin) : la séance de New York, les annonces et le rollover de 17 h NY ne sont pas mesurés. À refaire quand la table `bot_spread_samples` couvre plusieurs jours.
- Glissement supposé égal au spread (constaté sur un seul trade réel). Commission 0 constatée. Swap non modélisé.
- Garde-fous approximés : le niveau absolu reste surestimé ; lire les différences entre variantes.
- « Sans GER40 » a déjà été lu sur le test dans le rapport du protocole (H1) : ici, seule la sensibilité aux coûts est regardée, pas une nouvelle décision.