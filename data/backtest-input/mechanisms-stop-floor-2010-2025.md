> ⚠️ **INVALIDÉ en partie (2026-09-20)** : ce rapport règle en faveur du stop un stop et un objectif touchés dans la même bougie M15. Avec les vraies bougies d'une minute (`data/real-m1/m1-truth-report.md`), cette règle pénalise à tort les stops serrés d'origine : la conclusion « un plancher de stop en ATR améliore » ne tient PAS en M1 exact (2026 : stop d'origine +53 %, 1× ATR +51 %, 2× ATR +15 %, 3× ATR +20 %). Ne pas s'en servir pour changer le bot.

# Mécanisme par mécanisme : qui tire vers le bas, qui garde, quel plancher de stop

Chaque mécanisme (paire + stratégie) est joué SEUL sur 2010-2025 (une position à la fois par mécanisme), avec 5 planchers de stop (0 = stop d'origine, sinon k × ATR14 M15, même R:R), entrée jugée dès sa bougie, spread inclus, filtre « stop ≥ 3× le spread ». **Décision prise sur l'entraînement seul (≤ 2023)** ; le test (2024+) sert à vérifier. Règle : meilleur plancher = plus haut R moyen par trade à l'entraînement ; GARDER si ce R moyen > 0 avec t ≥ 1,5 ; COUPER s'il est ≤ 0 pour tous les planchers ; sinon A SURVEILLER.

| Mécanisme | Verdict (entraînement) | Meilleur plancher | Entraînement : trades / R total / R par trade / t | Test 2024+ : trades / R total / R par trade | Stop d'origine : R total (entr. / test) | Années positives (meilleur plancher) |
|---|---|---|---|---|---|---|
| XAUUSD fvg | **A SURVEILLER** | 3× ATR | 453 / +38.3 / +0.085 / 0.9 | 72 / +18.9 / +0.263 | +17.1 / +34.2 | 9/16 |
| EURUSD judas | **A SURVEILLER** | 3× ATR | 1423 / +30.6 / +0.022 / 0.5 | 200 / +3.1 / +0.016 | -103.9 / +12.1 | 11/16 |
| US100 silver | **GARDER** | 3× ATR | 1150 / +117.9 / +0.102 / 1.9 | 175 / +36.7 / +0.210 | -66.2 / -36.0 | 10/16 |
| US500 silver | **COUPER** | 1× ATR | 1510 / -12.4 / -0.008 / -0.2 | 233 / -12.6 / -0.054 | -89.4 / -50.9 | 8/16 |
| GER40 silver | **GARDER** | 2× ATR | 1157 / +101.0 / +0.087 / 1.7 | 189 / -9.2 / -0.049 | -47.5 / -17.0 | 10/16 |
| US500 fvg | **GARDER** | origine | 348 / +153.9 / +0.442 / 3.1 | 85 / +20.6 / +0.243 | +153.9 / +20.6 | 14/16 |
| GER40 nwog | **GARDER** | 3× ATR | 556 / +105.4 / +0.190 / 1.9 | 103 / +15.0 / +0.145 | +33.3 / +55.0 | 13/16 |
| GER40 weekly | **GARDER** | origine | 573 / +134.5 / +0.235 / 2.3 | 97 / +3.0 / +0.031 | +134.5 / +3.0 | 12/16 |
| GER40 breaker | **A SURVEILLER** | 2× ATR | 1035 / +71.6 / +0.069 / 1.0 | 247 / -2.5 / -0.010 | -116.2 / -14.1 | 9/16 |
| US100 cbdr | **COUPER** | origine | 694 / -21.5 / -0.031 / -0.5 | 166 / -26.9 / -0.162 | -21.5 / -26.9 | 7/16 |
| US500 divergence | **GARDER** | 1× ATR | 800 / +132.9 / +0.166 / 2.6 | 106 / +26.6 / +0.251 | +132.9 / +26.6 | 12/16 |
| US500 weekly | **A SURVEILLER** | origine | 617 / +82.5 / +0.134 / 1.4 | 94 / +19.8 / +0.210 | +82.5 / +19.8 | 8/16 |
| US100 divergence | **A SURVEILLER** | 3× ATR | 580 / +25.8 / +0.044 / 0.6 | 100 / +21.2 / +0.212 | -13.2 / +10.2 | 10/16 |
| US100 nwog | **GARDER** | 1× ATR | 294 / +86.9 / +0.295 / 2.0 | 39 / +26.4 / +0.677 | +42.8 / +44.1 | 10/16 |
| US100 fvg | **GARDER** | 1× ATR | 1574 / +183.6 / +0.117 / 1.9 | 267 / +62.7 / +0.235 | +13.9 / +61.3 | 11/15 |

## Détail : R moyen par trade, par plancher (entraînement · test)

| Mécanisme | origine | 1× ATR | 1.5× ATR | 2× ATR | 3× ATR |
|---|---|---|---|---|---|
| XAUUSD fvg | +0.035 · +0.450 | +0.044 · +0.450 | +0.000 · +0.321 | +0.046 · +0.334 | +0.085 · +0.263 |
| EURUSD judas | -0.082 · +0.080 | -0.100 · +0.085 | -0.097 · +0.138 | -0.074 · +0.156 | +0.022 · +0.016 |
| US100 silver | -0.052 · -0.150 | -0.015 · -0.060 | +0.070 · +0.126 | +0.059 · +0.184 | +0.102 · +0.210 |
| US500 silver | -0.072 · -0.234 | -0.008 · -0.054 | -0.037 · -0.096 | -0.038 · -0.014 | -0.044 · -0.086 |
| GER40 silver | -0.040 · -0.081 | -0.011 · +0.027 | +0.028 · +0.025 | +0.087 · -0.049 | +0.018 · -0.070 |
| US500 fvg | +0.442 · +0.243 | +0.207 · +0.531 | +0.141 · +0.381 | +0.156 · +0.481 | +0.179 · +0.381 |
| GER40 nwog | +0.064 · +0.625 | +0.094 · +0.230 | -0.028 · -0.203 | +0.061 · -0.198 | +0.190 · +0.145 |
| GER40 weekly | +0.235 · +0.031 | +0.141 · -0.021 | +0.057 · +0.056 | +0.198 · +0.253 | +0.140 · -0.134 |
| GER40 breaker | -0.096 · -0.047 | +0.042 · +0.164 | -0.004 · +0.116 | +0.069 · -0.010 | -0.131 · -0.093 |
| US100 cbdr | -0.031 · -0.162 | -0.039 · -0.014 | -0.041 · +0.107 | -0.043 · +0.070 | -0.060 · -0.010 |
| US500 divergence | +0.166 · +0.251 | +0.166 · +0.251 | +0.157 · +0.251 | +0.121 · +0.229 | +0.030 · +0.235 |
| US500 weekly | +0.134 · +0.210 | +0.082 · +0.414 | +0.123 · +0.664 | +0.011 · +0.418 | -0.037 · +0.368 |
| US100 divergence | -0.020 · +0.087 | -0.020 · +0.087 | -0.019 · +0.087 | +0.001 · +0.168 | +0.044 · +0.212 |
| US100 nwog | +0.184 · +1.161 | +0.295 · +0.677 | +0.175 · +0.836 | +0.244 · +0.827 | +0.254 · +0.737 |
| US100 fvg | +0.014 · +0.249 | +0.117 · +0.235 | +0.068 · +0.240 | +0.018 · +0.217 | +0.086 · +0.126 |

## Portefeuilles (garde-fous simplifiés du bot : 1 position par paire, 3 trades/jour, pause 30 min après perte)

| Portefeuille | Mécanismes | Entraînement (R) | **Test 2024+ (R, trades)** | Compte 10 000 $ sur le test (0,5 %) | Pire baisse du test | Défis FTMO sur le test (réussis / échoués) |
|---|---|---|---|---|---|---|
| Tout, stop d'origine (le bot aujourd'hui) | 15 | -13.9 | **+92.2** (1376) | $14691 | 28 % | 9 / 9 |
| Tout, plancher 2× ATR partout | 15 | +310.6 | **+96.3** (1264) | $15156 | 29 % | 10 / 7 |
| Sans les mécanismes à COUPER, meilleur plancher par mécanisme | 13 | +745.0 | **+145.2** (1125) | $19427 | 23 % | 12 / 6 |
| Seulement les GARDER, meilleur plancher par mécanisme | 8 | +779.2 | **+100.2** (744) | $15846 | 17 % | 7 / 4 |

## Limites

- Un mécanisme joué seul ignore les interactions du portefeuille (il peut manquer de trades quand un autre occupe la paire).
- Le test 2024-2025 ne contient que ~2 ans : quelques dizaines de trades par mécanisme, donc un verdict « test » sur un seul mécanisme est bruité.
- Entrées issues des modules de backtest ; spread constant ; pas de glissement ni d'élargissement du spread au rollover.