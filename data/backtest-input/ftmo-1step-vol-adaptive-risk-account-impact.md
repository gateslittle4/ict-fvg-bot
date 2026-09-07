# Position sizing par volatilité (ATR) — testé sur le VRAI combo, règles FTMO 1-Step

⚠ Compte $10000, combo recommandé réel (FVG US100+US500+XAUUSD + Divergence US100/US500, netting), règles FTMO 1-Step (cible +10% unique, perte max TRAILING 10%). **Vérification préalable** (checkVolatilityRegimeImpactFullCombo.js) : régime de volatilité = ATR(14) quotidien de l'instrument vs sa propre SMA(100), seuils 0.8x/1.5x fixés avant tout résultat. Constat robuste train ET test : le régime 'normal' porte l'essentiel de l'edge (train 0.48R, test 0.44R, 585/994 trades), 'high' reste solide (train 0.24R, test 0.13R), mais 'low' (marché calme) est le maillon faible (train à peine positif 0.09R, TEST NÉGATIF -0.04R). **C'est l'INVERSE du sizing par volatilité classique** (qui réduit la taille quand la vol est HAUTE, pas basse) - ici c'est la vol BASSE qui pose problème. Schéma testé : risque réduit à 0.25% spécifiquement en régime 'low', 0.5% ailleurs (normal et high). ⚠️ Écart de discipline assumé : contrairement aux seuils de régime (fixés avant résultat), le choix de cibler 'low' plutôt que 'high' pour la réduction a été informé par ce constat lui-même - à ne pas confondre avec un résultat totalement anti-data-snooping.

## Risque fixe — 0.5%/trade (RÉFÉRENCE PRODUCTION ACTUELLE)
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 0.9% | 7.8% | non | jour 96 | $13507 | 0.50%-0.50% (moy 0.50%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 1.6% | 9.4% | non | jour 61 | $13457 | 0.50%-0.50% (moy 0.50%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 3.4% | 7.5% | non | jour 311 | $10954 | 0.50%-0.50% (moy 0.50%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 3.3% | 6.1% | non | jour 254 | $11463 | 0.50%-0.50% (moy 0.50%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 1.8% | 4.9% | non | jour 197 | $13577 | 0.50%-0.50% (moy 0.50%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.5% | 5.7% | non | jour 107 | $11785 | 0.50%-0.50% (moy 0.50%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 3.3% | non | jour 49 | $12947 | 0.50%-0.50% (moy 0.50%) |

## Sizing par volatilité — 0.25% en régime 'low', 0.5% en 'normal'/'high'
| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |
|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21+12+104) | 38.0% | 0.9% | 7.8% | non | jour 96 | $13474 | 0.25%-0.50% (moy 0.44%) |
| 2020 (train) | 146 (27+16+103) | 36.1% | 0.8% | 9.4% | non | jour 49 | $13101 | 0.25%-0.50% (moy 0.41%) |
| 2021 (train) | 138 (21+16+101) | 29.7% | 2.6% | 3.8% | non | jour 285 | $11617 | 0.25%-0.50% (moy 0.41%) |
| 2022 (train) | 135 (26+0+109) | 30.6% | 3.3% | 6.1% | non | jour 252 | $11488 | 0.25%-0.50% (moy 0.46%) |
| 2023 (train) | 126 (16+22+88) | 38.4% | 2.5% | 4.1% | non | jour 225 | $12644 | 0.25%-0.50% (moy 0.42%) |
| 2024 (test) | 135 (17+19+99) | 31.6% | 0.3% | 5.7% | non | jour 102 | $12316 | 0.25%-0.50% (moy 0.46%) |
| 2025 (test) | 148 (31+21+96) | 34.7% | 0.0% | 3.3% | non | jour 49 | $12505 | 0.25%-0.50% (moy 0.44%) |
