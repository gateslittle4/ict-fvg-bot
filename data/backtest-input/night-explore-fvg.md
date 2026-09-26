# Recherche de nuit — exploration 2011-2018, familles A et B (FVG M15)

Pré-enregistrement : `data/backtest-input/preregistration-nuit-2026-09-26.md` (`2708c32`). Script : `scripts/runNightFvgExplore.js`. Données coupées au 31/12/2018 avant tout calcul. 864 variantes (US100, US500, XAUUSD). R net du spread du projet et du swap. Retenue = au moins 60 trades, R moyen > 0, t ≥ 2, deux moitiés positives.

## Retenues (27)

| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R | Retenue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | marché, stop 1 ATR, 3R, 4 h max | 3558 | 37 % | +0.067 | +239.6 | 2.70 | +174.3 / +65.4 | 1.11 | 75.7 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop derrière la zone, 3R | 684 | 33 % | +0.163 | +111.4 | 2.49 | +72.6 / +38.8 | 1.25 | 41.3 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 3372 | 36 % | +0.064 | +216.4 | 2.47 | +86.8 / +129.6 | 1.11 | 38.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 2R | 1636 | 39 % | +0.083 | +136.4 | 2.41 | +54.7 / +81.8 | 1.14 | 40.8 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 2R | 1967 | 41 % | +0.069 | +136.7 | 2.33 | +60.2 / +76.5 | 1.12 | 42.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 3R | 1545 | 34 % | +0.096 | +147.8 | 2.30 | +60.8 / +87.1 | 1.15 | 53.8 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop derrière la zone, 3R | 842 | 32 % | +0.133 | +112.3 | 2.26 | +73.3 / +39.0 | 1.20 | 36.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1319 | 39 % | +0.087 | +115.4 | 2.26 | +55.5 / +59.9 | 1.14 | 28.8 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 3R, 4 h max | 665 | 32 % | +0.149 | +99.1 | 2.24 | +48.8 / +50.3 | 1.22 | 27.1 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 2R | 665 | 42 % | +0.114 | +75.5 | 2.22 | +60.1 / +15.4 | 1.21 | 27.3 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j + 4 h | marché, stop 0,5 ATR, 4R | 1908 | 26 % | +0.100 | +190.3 | 2.22 | +182.6 / +7.7 | 1.14 | 72.5 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1600 | 41 % | +0.074 | +117.9 | 2.22 | +62.2 / +55.7 | 1.13 | 31.4 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 3638 | 39 % | +0.052 | +187.4 | 2.20 | +102.2 / +85.2 | 1.09 | 43.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1368 | 39 % | +0.083 | +112.9 | 2.19 | +40.6 / +72.3 | 1.14 | 36.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 0,5 ATR, 4R | 1723 | 26 % | +0.102 | +175.7 | 2.17 | +141.1 / +34.6 | 1.14 | 55.8 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1742 | 41 % | +0.069 | +120.3 | 2.16 | +71.3 / +48.9 | 1.12 | 38.0 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 1840 | 37 % | +0.077 | +141.7 | 2.15 | +60.0 / +81.7 | 1.13 | 56.5 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | tendance 20 j + 4 h + veille prise | marché, stop 0,5 ATR, 4R | 83 | 33 % | +0.526 | +43.7 | 2.14 | +26.0 / +17.7 | 1.81 | 8.7 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 3465 | 36 % | +0.054 | +187.0 | 2.13 | +114.1 / +72.9 | 1.09 | 55.5 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1640 | 41 % | +0.068 | +112.2 | 2.10 | +47.2 / +65.0 | 1.12 | 29.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1250 | 34 % | +0.098 | +122.3 | 2.10 | +51.1 / +71.1 | 1.15 | 33.4 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1645 | 41 % | +0.068 | +111.3 | 2.08 | +45.4 / +65.9 | 1.12 | 30.9 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 3R | 815 | 38 % | +0.108 | +88.2 | 2.06 | +45.0 / +43.2 | 1.19 | 23.7 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1501 | 37 % | +0.082 | +123.3 | 2.05 | +51.3 / +72.0 | 1.14 | 32.9 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 3R | 665 | 39 % | +0.119 | +78.8 | 2.04 | +54.0 / +24.8 | 1.21 | 30.3 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 2337 | 37 % | +0.063 | +147.3 | 2.03 | +103.8 / +43.5 | 1.11 | 54.9 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j | marché, stop 0,5 ATR, 4R | 2610 | 26 % | +0.077 | +199.8 | 2.01 | +130.2 / +69.6 | 1.10 | 65.0 | **oui** |

## Les 40 meilleures par t (toutes)

| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R | Retenue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | marché, stop 1 ATR, 3R, 4 h max | 3558 | 37 % | +0.067 | +239.6 | 2.70 | +174.3 / +65.4 | 1.11 | 75.7 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop derrière la zone, 3R | 684 | 33 % | +0.163 | +111.4 | 2.49 | +72.6 / +38.8 | 1.25 | 41.3 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 3372 | 36 % | +0.064 | +216.4 | 2.47 | +86.8 / +129.6 | 1.11 | 38.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 2R | 1636 | 39 % | +0.083 | +136.4 | 2.41 | +54.7 / +81.8 | 1.14 | 40.8 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 2R | 1967 | 41 % | +0.069 | +136.7 | 2.33 | +60.2 / +76.5 | 1.12 | 42.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 3R | 1545 | 34 % | +0.096 | +147.8 | 2.30 | +60.8 / +87.1 | 1.15 | 53.8 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop derrière la zone, 3R | 842 | 32 % | +0.133 | +112.3 | 2.26 | +73.3 / +39.0 | 1.20 | 36.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1319 | 39 % | +0.087 | +115.4 | 2.26 | +55.5 / +59.9 | 1.14 | 28.8 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 3R, 4 h max | 665 | 32 % | +0.149 | +99.1 | 2.24 | +48.8 / +50.3 | 1.22 | 27.1 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 2R | 665 | 42 % | +0.114 | +75.5 | 2.22 | +60.1 / +15.4 | 1.21 | 27.3 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j + 4 h | marché, stop 0,5 ATR, 4R | 1908 | 26 % | +0.100 | +190.3 | 2.22 | +182.6 / +7.7 | 1.14 | 72.5 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1600 | 41 % | +0.074 | +117.9 | 2.22 | +62.2 / +55.7 | 1.13 | 31.4 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 3638 | 39 % | +0.052 | +187.4 | 2.20 | +102.2 / +85.2 | 1.09 | 43.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1368 | 39 % | +0.083 | +112.9 | 2.19 | +40.6 / +72.3 | 1.14 | 36.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 0,5 ATR, 4R | 1723 | 26 % | +0.102 | +175.7 | 2.17 | +141.1 / +34.6 | 1.14 | 55.8 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1742 | 41 % | +0.069 | +120.3 | 2.16 | +71.3 / +48.9 | 1.12 | 38.0 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 1840 | 37 % | +0.077 | +141.7 | 2.15 | +60.0 / +81.7 | 1.13 | 56.5 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | tendance 20 j + 4 h + veille prise | marché, stop 0,5 ATR, 4R | 83 | 33 % | +0.526 | +43.7 | 2.14 | +26.0 / +17.7 | 1.81 | 8.7 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 3465 | 36 % | +0.054 | +187.0 | 2.13 | +114.1 / +72.9 | 1.09 | 55.5 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1640 | 41 % | +0.068 | +112.2 | 2.10 | +47.2 / +65.0 | 1.12 | 29.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1250 | 34 % | +0.098 | +122.3 | 2.10 | +51.1 / +71.1 | 1.15 | 33.4 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1645 | 41 % | +0.068 | +111.3 | 2.08 | +45.4 / +65.9 | 1.12 | 30.9 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 3R | 815 | 38 % | +0.108 | +88.2 | 2.06 | +45.0 / +43.2 | 1.19 | 23.7 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1501 | 37 % | +0.082 | +123.3 | 2.05 | +51.3 / +72.0 | 1.14 | 32.9 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 3R | 665 | 39 % | +0.119 | +78.8 | 2.04 | +54.0 / +24.8 | 1.21 | 30.3 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 2337 | 37 % | +0.063 | +147.3 | 2.03 | +103.8 / +43.5 | 1.11 | 54.9 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j | marché, stop 0,5 ATR, 4R | 2610 | 26 % | +0.077 | +199.8 | 2.01 | +130.2 / +69.6 | 1.10 | 65.0 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 2537 | 36 % | +0.060 | +151.8 | 1.99 | +59.4 / +92.3 | 1.10 | 42.7 |  |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 0,5 ATR, 4R | 1428 | 24 % | +0.107 | +152.3 | 1.97 | +124.3 / +28.0 | 1.14 | 57.8 |  |
| US100 | A | âge 5-24, 3h-11h | tendance 20 j + 4 h + veille prise | marché, stop 0,5 ATR, 4R | 301 | 26 % | +0.244 | +73.4 | 1.97 | +16.9 / +56.5 | 1.33 | 23.8 |  |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 0,5 ATR, 4R | 2135 | 26 % | +0.082 | +174.7 | 1.95 | +108.3 / +66.4 | 1.11 | 53.4 |  |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 3R, 4 h max | 815 | 32 % | +0.115 | +93.8 | 1.94 | +40.2 / +53.6 | 1.17 | 26.5 |  |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1636 | 36 % | +0.073 | +119.6 | 1.90 | +65.2 / +54.5 | 1.12 | 39.8 |  |
| US100 | A | âge 5-12, 3h-11h | tendance 20 j + 4 h + veille prise | marché, stop 0,5 ATR, 4R | 279 | 25 % | +0.234 | +65.4 | 1.83 | +20.9 / +44.5 | 1.32 | 22.8 |  |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R, 4 h max | 2713 | 38 % | +0.050 | +135.9 | 1.83 | +55.0 / +80.9 | 1.09 | 42.4 |  |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 0,5 ATR, 4R | 1783 | 23 % | +0.087 | +155.1 | 1.82 | +93.9 / +61.2 | 1.11 | 56.8 |  |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 2R | 816 | 41 % | +0.083 | +67.4 | 1.81 | +46.7 / +20.6 | 1.15 | 24.7 |  |
| US500 | A | âge 5-12, 9h30-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R, 4 h max | 389 | 34 % | +0.153 | +59.4 | 1.79 | +43.6 / +15.8 | 1.23 | 13.6 |  |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 2R | 3689 | 39 % | +0.038 | +139.0 | 1.78 | +57.2 / +81.8 | 1.07 | 35.4 |  |
| XAUUSD | A | âge 5-12, 3h-9h30 | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 3R | 1313 | 35 % | +0.079 | +103.4 | 1.77 | +32.5 / +70.9 | 1.12 | 66.3 |  |

## Répartition des t (toutes les variantes)

- US100 : 288 variantes, t ≥ 2 : 10, t ≤ −2 : 3, R moyen > 0 : 168, médiane des t 0.24
- US500 : 288 variantes, t ≥ 2 : 0, t ≤ −2 : 23, R moyen > 0 : 108, médiane des t -0.33
- XAUUSD : 288 variantes, t ≥ 2 : 17, t ≤ −2 : 15, R moyen > 0 : 157, médiane des t 0.12

