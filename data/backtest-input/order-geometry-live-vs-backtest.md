# Géométrie des ordres : backtest contre live (stop relatif au prix de remplissage)

Combo actuel sans GER40, M1 réel sans trous, spreads mesurés. **A** = stop/cible aux niveaux de la stratégie, spread payé à l'entrée (ce que le backtest simule). **C** = correctif proposé : après le remplissage, amender la position avec le stop et la cible ABSOLUS de la stratégie, et calculer les lots sur d + s pour que la perte maximale reste 1 R du risque prévu (résultat de A recalculé par d/(d+s)). **B** = ce que fait le bot en MARKET : stop et cible relatifs au prix de remplissage (l'API cTrader n'accepte pas de stop absolu sur un ordre au marché) : le stop est plus serré du spread (distance en prix bid = d - s), la cible plus loin (3d + s), la perte est exactement -1 R. Trouvé après le trade EURUSD du 2026-09-21 (stop 3,4 pips, spread 1,1 pip).

| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |
|---|---|---|---|---|---|---|---|
| A — backtest — Tout | 1994 | 27 % | +322.4 | +0.162 | $44946 | 13 % | 20 / 7 |
| B — live — Tout | 1994 | 25 % | +266.2 | +0.134 | $34202 | 14 % | 17 / 6 |
| C — niveaux absolus, lots sur d+s — Tout | 1994 | 27 % | +316.3 | +0.159 | $44189 | 13 % | 18 / 5 |
| A — backtest — Entraînement (avant 2025) | 1069 | 27 % | +138.9 | +0.130 | $18922 | 12 % | 9 / 4 |
| B — live — Entraînement (avant 2025) | 1067 | 24 % | +100.4 | +0.094 | $15687 | 14 % | 7 / 3 |
| C — niveaux absolus, lots sur d+s — Entraînement (avant 2025) | 1069 | 27 % | +141.8 | +0.133 | $19345 | 12 % | 9 / 2 |
| A — backtest — Test (2025 →) | 925 | 27 % | +183.5 | +0.198 | $23753 | 13 % | 11 / 3 |
| B — live — Test (2025 →) | 927 | 25 % | +165.8 | +0.179 | $21802 | 12 % | 10 / 3 |
| C — niveaux absolus, lots sur d+s — Test (2025 →) | 925 | 27 % | +174.5 | +0.189 | $22843 | 13 % | 9 / 2 |

## Par paire (tout l'historique)

| Paire | Trades A | R net A | Trades B | R net B | Écart B - A |
|---|---|---|---|---|---|
| US100 | 924 | +255.0 | 924 | +226.3 | -28.7 |
| US500 | 564 | +17.8 | 566 | -5.3 | -23.1 |
| XAUUSD | 157 | +57.3 | 154 | +55.2 | -2.1 |
| EURUSD | 349 | -7.7 | 350 | -10.0 | -2.3 |

Part du spread dans la distance du stop (s/d) : médiane 4 %, 90e centile 21 %, maximum 33 % (le filtre impose ≤ 33 %).

## Limites

- Garde-fous approximés ; spreads mesurés sur 9 h seulement ; glissement = spread. Le chiffre absolu est surestimé, lire l'écart entre A et B.
- B suppose que le broker exécute le stop relatif exactement à distance d du prix de remplissage (constaté : stop rempli 1,1472 pour un remplissage 1,14755, soit 3,5 pips).