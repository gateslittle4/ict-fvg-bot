# Résultats du backtest — ICT FVG (M15) : biais HTF, structure de marché (BOS), session NY AM

⚠ Hypothèses : entrée au bord de la zone FVG, une seule position ouverte à la fois par instrument, stop supposé touché en premier en cas d'ambiguïté sur une même bougie, config classées seulement si ≥ 10 signaux (sinon échantillon trop petit pour être fiable). H1/H4 sont recalculés depuis les mêmes bougies M15 (pas de fichier séparé nécessaire).

⚠ **Structure de marché (ICT BOS)** : pivot haut/bas confirmé après 5 bougies de chaque côté (fractale symétrique, aucune anticipation). Le biais passe à haussier dès qu'une clôture dépasse le dernier pivot haut confirmé (Break of Structure), et inversement pour baissier. Une entrée FVG n'est gardée que si elle va dans le sens du biais de structure en cours — exactement le même principe que le filtre de biais HTF, mais basé sur les swings de prix plutôt que sur une EMA.

⚠ **Session NY AM (8h-12h, heure de New York)** : n'autorise une entrée que si la bougie de validation FVG tombe dans cette fenêtre, en heure LOCALE de New York réelle (donc sensible à l'heure d'été — les données HistData sont en EST fixe toute l'année ; la conversion tient compte du décalage DST pour retrouver la vraie heure de New York, voir src/backtest/nySession.js pour le détail).

⚠⚠ **Mise en garde sur les tableaux "meilleure config"** : ce rapport teste 168 configurations par instrument. Choisir la meilleure après coup sur les mêmes données ("data snooping") gonfle artificiellement les résultats — une partie de ce qui a l'air bon n'est que du bruit statistique qui a eu de la chance sur CET échantillon précis. Le fichier train-test-validation.md (à régénérer avec scripts/runTrainTestValidation.js) vérifie si les configs qui semblent gagnantes ici tiennent sur des données jamais vues.

## EURUSD
Données: 196001 bougies M15, du 2018-01-01 au 2025-12-31 (0 lignes ignorées sur 196001).
Coût de transaction appliqué: spread de 0.0001 (indicatif, à vérifier contre le vrai spread FundingPips/cTrader), signaux dont le stop < 3x le spread exclus (non-viables : le spread dominerait le risque). "R net"/"Win rate net" = sur les signaux viables après coût ; "R brut" = tel quel, sans rien de tout ça.

### Référence : sans aucun filtre (ni HTF, ni structure, ni session)
| Stop | R visé | Signaux (brut) | Non-viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) | Résultat net (R) |
|---|---|---|---|---|---|---|---|---|---|
| fvg-edge | 1:1 | 29472 | 19439 | 48.7% | -0.19 | -0.21 | 0.65 | 2150.60 | -2144.22 |
| fvg-edge | 1:2 | 24626 | 15935 | 34.8% | 0.01 | -0.14 | 0.82 | 1233.61 | -1228.47 |
| fvg-edge | 1:3 | 20912 | 13296 | 27.4% | 0.17 | -0.09 | 0.90 | 693.14 | -663.03 |
| swing | 1:1 | 3989 | 25 | 49.7% | -0.01 | -0.07 | 0.88 | 288.56 | -262.48 |
| swing | 1:2 | 2079 | 8 | 33.3% | 0.02 | -0.04 | 0.95 | 126.42 | -72.85 |
| swing | 1:3 | 1488 | 8 | 23.9% | 0.04 | -0.02 | 0.98 | 111.08 | -23.87 |

### Impact des filtres structure ICT (BOS) et session NY AM (meilleure config par combinaison, toutes variantes HTF confondues)
| Structure | Session NY AM | Meilleure variante | Stop | R visé | Signaux viables | Win rate net | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|
| off | off | H1_EMA50 | swing | 1:3 | 1343 | 24.4% | 0.01 | 1.01 | 98.14 |
| off | ON | H1_EMA50 | swing | 1:3 | 1082 | 25.4% | 0.01 | 1.02 | 55.42 |
| ON | off | H4_EMA20 | swing | 1:3 | 1378 | 26.4% | 0.04 | 1.05 | 50.68 |
| ON | ON | H4_EMA20 | swing | 1:3 | 848 | 28.0% | 0.10 | 1.14 | 29.29 |

### Meilleure config par variante de biais HTF (classée par R net, structure/session inclus dans la recherche)
| Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|
| H1_EMA20 | ON | ON | swing | 1:2 | 1117 | 34.6% | 0.05 | 0.01 | 1.02 | 39.28 |
| H1_EMA50 | ON | ON | swing | 1:3 | 928 | 25.6% | 0.07 | 0.03 | 1.04 | 39.03 |
| H1_EMA200 | ON | ON | swing | 1:3 | 885 | 26.5% | 0.11 | 0.06 | 1.08 | 31.36 |
| H4_EMA20 | ON | ON | swing | 1:3 | 848 | 28.0% | 0.16 | 0.10 | 1.14 | 29.29 |
| H4_EMA50 | ON | ON | swing | 1:3 | 855 | 26.4% | 0.09 | 0.03 | 1.05 | 34.34 |
| H4_EMA200 | ON | ON | swing | 1:2 | 955 | 35.5% | 0.08 | 0.02 | 1.03 | 43.13 |

### Top 10 configurations toutes variantes confondues (classées par espérance R NETTE)
| # | Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA20 | ON | ON | swing | 1:3 | 848 | 28.0% | 0.16 | 0.10 | 1.14 | 29.29 |
| 2 | H4_EMA20 | ON | ON | swing | 1:2 | 980 | 37.3% | 0.12 | 0.07 | 1.11 | 30.02 |
| 3 | baseline | ON | ON | swing | 1:2 | 1529 | 36.9% | 0.12 | 0.07 | 1.10 | 40.65 |
| 4 | H1_EMA200 | ON | ON | swing | 1:3 | 885 | 26.5% | 0.11 | 0.06 | 1.08 | 31.36 |
| 5 | baseline | ON | ON | swing | 1:3 | 1241 | 26.6% | 0.10 | 0.05 | 1.07 | 64.40 |
| 6 | H4_EMA20 | ON | off | swing | 1:3 | 1378 | 26.4% | 0.10 | 0.04 | 1.05 | 50.68 |
| 7 | baseline | ON | off | swing | 1:3 | 1422 | 25.3% | 0.09 | 0.04 | 1.05 | 57.35 |
| 8 | H1_EMA200 | ON | ON | swing | 1:2 | 1030 | 35.8% | 0.09 | 0.04 | 1.06 | 38.42 |
| 9 | H4_EMA50 | ON | ON | swing | 1:3 | 855 | 26.4% | 0.09 | 0.03 | 1.05 | 34.34 |
| 10 | H1_EMA50 | ON | ON | swing | 1:3 | 928 | 25.6% | 0.07 | 0.03 | 1.04 | 39.03 |

## GBPUSD
Données: 171023 bougies M15, du 2019-01-01 au 2025-12-31 (0 lignes ignorées sur 171023).
Coût de transaction appliqué: spread de 0.00015 (indicatif, à vérifier contre le vrai spread FundingPips/cTrader), signaux dont le stop < 3x le spread exclus (non-viables : le spread dominerait le risque). "R net"/"Win rate net" = sur les signaux viables après coût ; "R brut" = tel quel, sans rien de tout ça.

### Référence : sans aucun filtre (ni HTF, ni structure, ni session)
| Stop | R visé | Signaux (brut) | Non-viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) | Résultat net (R) |
|---|---|---|---|---|---|---|---|---|---|
| fvg-edge | 1:1 | 25818 | 17590 | 48.8% | -0.19 | -0.22 | 0.64 | 1798.13 | -1796.34 |
| fvg-edge | 1:2 | 21800 | 14510 | 34.3% | -0.00 | -0.16 | 0.79 | 1203.79 | -1200.78 |
| fvg-edge | 1:3 | 18617 | 12112 | 26.2% | 0.14 | -0.14 | 0.84 | 945.11 | -923.11 |
| swing | 1:1 | 3679 | 24 | 50.0% | -0.00 | -0.06 | 0.88 | 249.11 | -227.06 |
| swing | 1:2 | 1941 | 13 | 32.7% | -0.00 | -0.06 | 0.91 | 169.53 | -122.19 |
| swing | 1:3 | 1464 | 2 | 22.8% | -0.02 | -0.08 | 0.90 | 167.01 | -113.55 |

### Impact des filtres structure ICT (BOS) et session NY AM (meilleure config par combinaison, toutes variantes HTF confondues)
| Structure | Session NY AM | Meilleure variante | Stop | R visé | Signaux viables | Win rate net | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|
| off | off | H4_EMA20 | swing | 1:3 | 1487 | 24.9% | -0.02 | 0.97 | 117.13 |
| off | ON | H4_EMA20 | swing | 1:3 | 931 | 26.8% | 0.05 | 1.06 | 45.65 |
| ON | off | baseline | swing | 1:2 | 1820 | 34.6% | -0.01 | 0.99 | 68.45 |
| ON | ON | H1_EMA20 | swing | 1:3 | 841 | 25.1% | 0.02 | 1.02 | 77.10 |

### Meilleure config par variante de biais HTF (classée par R net, structure/session inclus dans la recherche)
| Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|
| H1_EMA20 | off | ON | swing | 1:3 | 914 | 26.0% | 0.10 | 0.05 | 1.07 | 53.98 |
| H1_EMA50 | off | ON | swing | 1:3 | 958 | 25.3% | 0.07 | 0.01 | 1.02 | 65.35 |
| H1_EMA200 | ON | ON | swing | 1:2 | 886 | 34.9% | 0.06 | 0.01 | 1.01 | 32.49 |
| H4_EMA20 | off | ON | swing | 1:3 | 931 | 26.8% | 0.11 | 0.05 | 1.06 | 45.65 |
| H4_EMA50 | ON | ON | swing | 1:2 | 831 | 35.1% | 0.06 | 0.00 | 1.01 | 35.92 |
| H4_EMA200 | ON | ON | swing | 1:2 | 791 | 33.9% | 0.02 | -0.03 | 0.95 | 42.87 |

### Top 10 configurations toutes variantes confondues (classées par espérance R NETTE)
| # | Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA20 | off | ON | swing | 1:3 | 931 | 26.8% | 0.11 | 0.05 | 1.06 | 45.65 |
| 2 | H1_EMA20 | off | ON | swing | 1:3 | 914 | 26.0% | 0.10 | 0.05 | 1.07 | 53.98 |
| 3 | H1_EMA20 | ON | ON | swing | 1:3 | 841 | 25.1% | 0.07 | 0.02 | 1.02 | 77.10 |
| 4 | H4_EMA20 | ON | ON | swing | 1:3 | 735 | 25.7% | 0.07 | 0.02 | 1.02 | 50.76 |
| 5 | H1_EMA50 | off | ON | swing | 1:3 | 958 | 25.3% | 0.07 | 0.01 | 1.02 | 65.35 |
| 6 | baseline | ON | ON | swing | 1:2 | 1295 | 35.1% | 0.07 | 0.01 | 1.02 | 49.59 |
| 7 | H1_EMA200 | ON | ON | swing | 1:2 | 886 | 34.9% | 0.06 | 0.01 | 1.01 | 32.49 |
| 8 | H4_EMA50 | ON | ON | swing | 1:2 | 831 | 35.1% | 0.06 | 0.00 | 1.01 | 35.92 |
| 9 | baseline | ON | ON | swing | 1:3 | 1101 | 25.2% | 0.06 | 0.00 | 1.00 | 86.70 |
| 10 | H1_EMA200 | ON | ON | swing | 1:3 | 769 | 24.9% | 0.05 | -0.00 | 0.99 | 59.12 |

## US100
Données: 156715 bougies M15, du 2019-01-01 au 2025-12-31 (0 lignes ignorées sur 156715).
Coût de transaction appliqué: spread de 1 (indicatif, à vérifier contre le vrai spread FundingPips/cTrader), signaux dont le stop < 3x le spread exclus (non-viables : le spread dominerait le risque). "R net"/"Win rate net" = sur les signaux viables après coût ; "R brut" = tel quel, sans rien de tout ça.

### Référence : sans aucun filtre (ni HTF, ni structure, ni session)
| Stop | R visé | Signaux (brut) | Non-viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) | Résultat net (R) |
|---|---|---|---|---|---|---|---|---|---|
| fvg-edge | 1:1 | 23629 | 7121 | 45.4% | -0.19 | -0.21 | 0.66 | 3486.33 | -3484.33 |
| fvg-edge | 1:2 | 19350 | 5584 | 35.6% | 0.00 | -0.05 | 0.94 | 678.47 | -632.01 |
| fvg-edge | 1:3 | 16036 | 4471 | 29.1% | 0.14 | 0.05 | 1.07 | 91.39 | 612.12 |
| swing | 1:1 | 3240 | 2 | 50.1% | 0.00 | -0.02 | 0.96 | 78.42 | -64.12 |
| swing | 1:2 | 1633 | 0 | 35.0% | 0.07 | 0.05 | 1.08 | 23.88 | 78.98 |
| swing | 1:3 | 1394 | 2 | 25.2% | 0.07 | 0.05 | 1.07 | 34.04 | 67.40 |

### Impact des filtres structure ICT (BOS) et session NY AM (meilleure config par combinaison, toutes variantes HTF confondues)
| Structure | Session NY AM | Meilleure variante | Stop | R visé | Signaux viables | Win rate net | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|
| off | off | H4_EMA200 | swing | 1:3 | 1704 | 27.0% | 0.09 | 1.13 | 44.85 |
| off | ON | H1_EMA20 | fvg-edge | 1:3 | 2368 | 30.8% | 0.13 | 1.17 | 34.46 |
| ON | off | H4_EMA200 | swing | 1:3 | 1245 | 28.6% | 0.17 | 1.24 | 30.86 |
| ON | ON | H4_EMA50 | fvg-edge | 1:3 | 1435 | 33.1% | 0.22 | 1.29 | 26.93 |

### Meilleure config par variante de biais HTF (classée par R net, structure/session inclus dans la recherche)
| Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|
| H1_EMA20 | ON | ON | fvg-edge | 1:3 | 2006 | 31.9% | 0.23 | 0.18 | 1.24 | 30.44 |
| H1_EMA50 | ON | ON | fvg-edge | 1:3 | 1772 | 32.5% | 0.25 | 0.20 | 1.27 | 33.37 |
| H1_EMA200 | ON | ON | fvg-edge | 1:3 | 1584 | 32.4% | 0.25 | 0.20 | 1.26 | 35.18 |
| H4_EMA20 | ON | ON | fvg-edge | 1:3 | 1464 | 32.7% | 0.25 | 0.20 | 1.27 | 29.93 |
| H4_EMA50 | ON | ON | fvg-edge | 1:3 | 1435 | 33.1% | 0.26 | 0.22 | 1.29 | 26.93 |
| H4_EMA200 | ON | ON | fvg-edge | 1:3 | 1424 | 32.6% | 0.25 | 0.20 | 1.26 | 31.29 |

### Top 10 configurations toutes variantes confondues (classées par espérance R NETTE)
| # | Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H4_EMA50 | ON | ON | fvg-edge | 1:3 | 1435 | 33.1% | 0.26 | 0.22 | 1.29 | 26.93 |
| 2 | H1_EMA50 | ON | ON | fvg-edge | 1:3 | 1772 | 32.5% | 0.25 | 0.20 | 1.27 | 33.37 |
| 3 | H4_EMA20 | ON | ON | fvg-edge | 1:3 | 1464 | 32.7% | 0.25 | 0.20 | 1.27 | 29.93 |
| 4 | H4_EMA200 | ON | ON | fvg-edge | 1:3 | 1424 | 32.6% | 0.25 | 0.20 | 1.26 | 31.29 |
| 5 | H1_EMA200 | ON | ON | fvg-edge | 1:3 | 1584 | 32.4% | 0.25 | 0.20 | 1.26 | 35.18 |
| 6 | baseline | ON | ON | fvg-edge | 1:3 | 2610 | 32.2% | 0.23 | 0.18 | 1.25 | 35.80 |
| 7 | H1_EMA20 | ON | ON | fvg-edge | 1:3 | 2006 | 31.9% | 0.23 | 0.18 | 1.24 | 30.44 |
| 8 | H4_EMA200 | ON | off | swing | 1:3 | 1245 | 28.6% | 0.19 | 0.17 | 1.24 | 30.86 |
| 9 | H4_EMA200 | ON | ON | swing | 1:3 | 982 | 28.8% | 0.17 | 0.15 | 1.20 | 42.26 |
| 10 | H4_EMA200 | ON | off | fvg-edge | 1:3 | 5343 | 31.4% | 0.24 | 0.14 | 1.19 | 73.38 |

## US500
Données: 156795 bougies M15, du 2019-01-01 au 2025-12-31 (0 lignes ignorées sur 156795).
Coût de transaction appliqué: spread de 0.4 (indicatif, à vérifier contre le vrai spread FundingPips/cTrader), signaux dont le stop < 3x le spread exclus (non-viables : le spread dominerait le risque). "R net"/"Win rate net" = sur les signaux viables après coût ; "R brut" = tel quel, sans rien de tout ça.

### Référence : sans aucun filtre (ni HTF, ni structure, ni session)
| Stop | R visé | Signaux (brut) | Non-viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) | Résultat net (R) |
|---|---|---|---|---|---|---|---|---|---|
| fvg-edge | 1:1 | 23707 | 10137 | 46.6% | -0.17 | -0.22 | 0.65 | 2925.77 | -2921.49 |
| fvg-edge | 1:2 | 19141 | 7843 | 35.8% | 0.03 | -0.07 | 0.90 | 828.74 | -796.04 |
| fvg-edge | 1:3 | 15980 | 6326 | 28.5% | 0.15 | 0.00 | 1.00 | 223.09 | 9.94 |
| swing | 1:1 | 3280 | 5 | 49.8% | -0.00 | -0.04 | 0.93 | 132.21 | -124.57 |
| swing | 1:2 | 1764 | 1 | 32.6% | 0.01 | -0.03 | 0.96 | 69.82 | -46.17 |
| swing | 1:3 | 1399 | 1 | 24.2% | 0.06 | 0.02 | 1.03 | 37.82 | 30.38 |

### Impact des filtres structure ICT (BOS) et session NY AM (meilleure config par combinaison, toutes variantes HTF confondues)
| Structure | Session NY AM | Meilleure variante | Stop | R visé | Signaux viables | Win rate net | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|
| off | off | baseline | swing | 1:3 | 1398 | 24.2% | 0.02 | 1.03 | 37.82 |
| off | ON | H1_EMA200 | fvg-edge | 1:3 | 1713 | 31.6% | 0.13 | 1.16 | 49.61 |
| ON | off | H4_EMA200 | swing | 1:3 | 1198 | 25.7% | 0.08 | 1.11 | 42.58 |
| ON | ON | H1_EMA200 | fvg-edge | 1:3 | 1272 | 32.9% | 0.19 | 1.25 | 38.85 |

### Meilleure config par variante de biais HTF (classée par R net, structure/session inclus dans la recherche)
| Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|
| H1_EMA20 | ON | ON | fvg-edge | 1:3 | 1639 | 31.1% | 0.24 | 0.12 | 1.15 | 38.46 |
| H1_EMA50 | ON | ON | fvg-edge | 1:3 | 1471 | 31.2% | 0.24 | 0.12 | 1.16 | 41.46 |
| H1_EMA200 | ON | ON | fvg-edge | 1:3 | 1272 | 32.9% | 0.29 | 0.19 | 1.25 | 38.85 |
| H4_EMA20 | ON | ON | fvg-edge | 1:3 | 1152 | 31.8% | 0.25 | 0.14 | 1.18 | 42.24 |
| H4_EMA50 | ON | ON | fvg-edge | 1:3 | 1138 | 33.0% | 0.30 | 0.18 | 1.24 | 41.17 |
| H4_EMA200 | ON | ON | fvg-edge | 1:3 | 1138 | 31.5% | 0.27 | 0.12 | 1.16 | 39.32 |

### Top 10 configurations toutes variantes confondues (classées par espérance R NETTE)
| # | Variante HTF | Structure | Session | Stop | R visé | Signaux viables | Win rate net | R brut | R net | Profit factor (net) | Max DD net (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | H1_EMA200 | ON | ON | fvg-edge | 1:3 | 1272 | 32.9% | 0.29 | 0.19 | 1.25 | 38.85 |
| 2 | H4_EMA50 | ON | ON | fvg-edge | 1:3 | 1138 | 33.0% | 0.30 | 0.18 | 1.24 | 41.17 |
| 3 | baseline | ON | ON | fvg-edge | 1:3 | 2198 | 32.0% | 0.26 | 0.15 | 1.19 | 32.23 |
| 4 | H4_EMA20 | ON | ON | fvg-edge | 1:3 | 1152 | 31.8% | 0.25 | 0.14 | 1.18 | 42.24 |
| 5 | H1_EMA200 | off | ON | fvg-edge | 1:3 | 1713 | 31.6% | 0.23 | 0.13 | 1.16 | 49.61 |
| 6 | H4_EMA200 | ON | ON | fvg-edge | 1:3 | 1138 | 31.5% | 0.27 | 0.12 | 1.16 | 39.32 |
| 7 | H4_EMA200 | ON | ON | swing | 1:3 | 946 | 28.2% | 0.17 | 0.12 | 1.17 | 33.86 |
| 8 | H1_EMA50 | ON | ON | fvg-edge | 1:3 | 1471 | 31.2% | 0.24 | 0.12 | 1.16 | 41.46 |
| 9 | H1_EMA20 | ON | ON | fvg-edge | 1:3 | 1639 | 31.1% | 0.24 | 0.12 | 1.15 | 38.46 |
| 10 | H4_EMA50 | off | ON | fvg-edge | 1:3 | 1573 | 31.5% | 0.22 | 0.12 | 1.15 | 52.75 |

## Corrélation entre instruments (rendements M15)
Corrélation de Pearson calculée sur les rendements M15, uniquement sur les horodatages communs entre chaque paire (gère les différences de sessions de trading entre indices et forex). |r| > 0.7 = fortement corrélé (ne pas compter comme diversifiant) ; |r| < 0.3 = faiblement corrélé (bon candidat pour combiner 2 paires).

| | EURUSD | GBPUSD | US100 | US500 |
|---|---|---|---|---|
| **EURUSD** | 1.00 | 0.67 | 0.21 | 0.22 |
| **GBPUSD** | 0.67 | 1.00 | 0.27 | 0.29 |
| **US100** | 0.21 | 0.27 | 1.00 | 0.93 |
| **US500** | 0.22 | 0.29 | 0.93 | 1.00 |
