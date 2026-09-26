# Recherche de nuit — exploration 2011-2018, familles A et B (FVG M15)

Pré-enregistrement : `data/backtest-input/preregistration-nuit-2026-09-26.md` (`2708c32`). Script : `scripts/runNightFvgExplore.js`. Données coupées au 31/12/2018 avant tout calcul. 864 variantes (US100, US500, XAUUSD). R net du spread du projet et du swap. Retenue = au moins 60 trades, R moyen > 0, t ≥ 2, deux moitiés positives.

## Retenues (44)

| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R | Retenue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 3011 | 39 % | +0.131 | +394.0 | 4.70 | +207.4 / +186.7 | 1.23 | 36.2 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j + 4 h | limite au bord, stop 1 ATR, 3R | 2263 | 39 % | +0.136 | +307.0 | 4.24 | +160.1 / +146.9 | 1.24 | 29.4 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2863 | 34 % | +0.115 | +329.5 | 3.76 | +222.4 / +107.2 | 1.18 | 55.5 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 4105 | 36 % | +0.086 | +352.0 | 3.60 | +121.3 / +230.7 | 1.15 | 50.6 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | 4 h en faveur | limite au bord, stop 1 ATR, 3R | 3942 | 36 % | +0.084 | +333.1 | 3.48 | +125.4 / +207.7 | 1.14 | 44.9 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 3981 | 34 % | +0.086 | +340.6 | 3.36 | +178.3 / +162.3 | 1.14 | 62.2 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2957 | 35 % | +0.092 | +273.4 | 3.13 | +174.8 / +98.6 | 1.15 | 76.6 | **oui** |
| XAUUSD | B | âge 0-4 (frais), 3h-11h | aucun | limite au bord, stop 1 ATR, 3R | 4276 | 35 % | +0.069 | +296.7 | 2.97 | +129.3 / +167.5 | 1.12 | 45.6 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | limite au bord, stop 1 ATR, 3R | 1889 | 34 % | +0.112 | +211.1 | 2.93 | +132.2 / +78.9 | 1.17 | 39.7 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | aucun | limite au bord, stop 1 ATR, 3R | 4199 | 33 % | +0.070 | +294.6 | 2.85 | +112.6 / +182.1 | 1.11 | 62.4 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 2945 | 35 % | +0.084 | +247.4 | 2.82 | +94.8 / +152.6 | 1.13 | 46.1 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 2835 | 33 % | +0.085 | +242.2 | 2.77 | +125.1 / +117.2 | 1.13 | 40.5 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | marché, stop 1 ATR, 3R, 4 h max | 3558 | 37 % | +0.067 | +239.6 | 2.70 | +174.3 / +65.4 | 1.11 | 75.7 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop derrière la zone, 3R | 684 | 33 % | +0.163 | +111.4 | 2.49 | +72.6 / +38.8 | 1.25 | 41.3 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | limite au bord, stop 1 ATR, 3R | 1946 | 35 % | +0.092 | +178.6 | 2.48 | +116.6 / +62.1 | 1.14 | 78.5 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 3372 | 36 % | +0.064 | +216.4 | 2.47 | +86.8 / +129.6 | 1.11 | 38.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 2R | 1636 | 39 % | +0.083 | +136.4 | 2.41 | +54.7 / +81.8 | 1.14 | 40.8 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 3897 | 33 % | +0.060 | +233.7 | 2.33 | +95.5 / +138.2 | 1.09 | 58.2 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 2R | 1967 | 41 % | +0.069 | +136.7 | 2.33 | +60.2 / +76.5 | 1.12 | 42.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 3R | 1545 | 34 % | +0.096 | +147.8 | 2.30 | +60.8 / +87.1 | 1.15 | 53.8 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop derrière la zone, 3R | 842 | 32 % | +0.133 | +112.3 | 2.26 | +73.3 / +39.0 | 1.20 | 36.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1319 | 39 % | +0.087 | +115.4 | 2.26 | +55.5 / +59.9 | 1.14 | 28.8 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | 4 h en faveur | limite au bord, stop 1 ATR, 3R | 3914 | 33 % | +0.057 | +222.2 | 2.25 | +86.0 / +136.2 | 1.09 | 56.3 | **oui** |
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
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | limite au bord, stop 1 ATR, 3R | 1449 | 35 % | +0.091 | +131.4 | 2.12 | +31.2 / +100.2 | 1.14 | 76.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1640 | 41 % | +0.068 | +112.2 | 2.10 | +47.2 / +65.0 | 1.12 | 29.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1250 | 34 % | +0.098 | +122.3 | 2.10 | +51.1 / +71.1 | 1.15 | 33.4 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1645 | 41 % | +0.068 | +111.3 | 2.08 | +45.4 / +65.9 | 1.12 | 30.9 | **oui** |
| US100 | B | âge 5-24, 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2062 | 32 % | +0.076 | +156.3 | 2.07 | +108.6 / +47.6 | 1.11 | 76.3 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 3R | 815 | 38 % | +0.108 | +88.2 | 2.06 | +45.0 / +43.2 | 1.19 | 23.7 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1501 | 37 % | +0.082 | +123.3 | 2.05 | +51.3 / +72.0 | 1.14 | 32.9 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop 1 ATR, 3R | 665 | 39 % | +0.119 | +78.8 | 2.04 | +54.0 / +24.8 | 1.21 | 30.3 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | marché, stop 1 ATR, 3R, 4 h max | 2337 | 37 % | +0.063 | +147.3 | 2.03 | +103.8 / +43.5 | 1.11 | 54.9 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | tendance 20 j | marché, stop 0,5 ATR, 4R | 2610 | 26 % | +0.077 | +199.8 | 2.01 | +130.2 / +69.6 | 1.10 | 65.0 | **oui** |

## Les 40 meilleures par t (toutes)

| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R | Retenue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 3011 | 39 % | +0.131 | +394.0 | 4.70 | +207.4 / +186.7 | 1.23 | 36.2 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j + 4 h | limite au bord, stop 1 ATR, 3R | 2263 | 39 % | +0.136 | +307.0 | 4.24 | +160.1 / +146.9 | 1.24 | 29.4 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2863 | 34 % | +0.115 | +329.5 | 3.76 | +222.4 / +107.2 | 1.18 | 55.5 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 4105 | 36 % | +0.086 | +352.0 | 3.60 | +121.3 / +230.7 | 1.15 | 50.6 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | 4 h en faveur | limite au bord, stop 1 ATR, 3R | 3942 | 36 % | +0.084 | +333.1 | 3.48 | +125.4 / +207.7 | 1.14 | 44.9 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 3981 | 34 % | +0.086 | +340.6 | 3.36 | +178.3 / +162.3 | 1.14 | 62.2 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2957 | 35 % | +0.092 | +273.4 | 3.13 | +174.8 / +98.6 | 1.15 | 76.6 | **oui** |
| XAUUSD | B | âge 0-4 (frais), 3h-11h | aucun | limite au bord, stop 1 ATR, 3R | 4276 | 35 % | +0.069 | +296.7 | 2.97 | +129.3 / +167.5 | 1.12 | 45.6 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | limite au bord, stop 1 ATR, 3R | 1889 | 34 % | +0.112 | +211.1 | 2.93 | +132.2 / +78.9 | 1.17 | 39.7 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | aucun | limite au bord, stop 1 ATR, 3R | 4199 | 33 % | +0.070 | +294.6 | 2.85 | +112.6 / +182.1 | 1.11 | 62.4 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 2945 | 35 % | +0.084 | +247.4 | 2.82 | +94.8 / +152.6 | 1.13 | 46.1 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | tendance 20 j | limite au bord, stop 1 ATR, 3R | 2835 | 33 % | +0.085 | +242.2 | 2.77 | +125.1 / +117.2 | 1.13 | 40.5 | **oui** |
| US100 | B | âge 0-4 (frais), 3h-11h | achats seulement | marché, stop 1 ATR, 3R, 4 h max | 3558 | 37 % | +0.067 | +239.6 | 2.70 | +174.3 / +65.4 | 1.11 | 75.7 | **oui** |
| US100 | A | âge 5-12, 9h30-11h | 4 h en faveur | marché, stop derrière la zone, 3R | 684 | 33 % | +0.163 | +111.4 | 2.49 | +72.6 / +38.8 | 1.25 | 41.3 | **oui** |
| US500 | B | âge 0-4 (frais), 3h-11h | achats + tendance 20 j | limite au bord, stop 1 ATR, 3R | 1946 | 35 % | +0.092 | +178.6 | 2.48 | +116.6 / +62.1 | 1.14 | 78.5 | **oui** |
| XAUUSD | A | âge 0-4 (frais), 3h-11h | tendance 20 j | marché, stop 1 ATR, 3R | 3372 | 36 % | +0.064 | +216.4 | 2.47 | +86.8 / +129.6 | 1.11 | 38.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 2R | 1636 | 39 % | +0.083 | +136.4 | 2.41 | +54.7 / +81.8 | 1.14 | 40.8 | **oui** |
| US100 | A | âge 0-4 (frais), 3h-11h | modèle de ses choix (tiers haut) | limite au bord, stop 1 ATR, 3R | 3897 | 33 % | +0.060 | +233.7 | 2.33 | +95.5 / +138.2 | 1.09 | 58.2 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | tendance 20 j | marché, stop 1 ATR, 2R | 1967 | 41 % | +0.069 | +136.7 | 2.33 | +60.2 / +76.5 | 1.12 | 42.1 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | marché, stop 1 ATR, 3R | 1545 | 34 % | +0.096 | +147.8 | 2.30 | +60.8 / +87.1 | 1.15 | 53.8 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop derrière la zone, 3R | 842 | 32 % | +0.133 | +112.3 | 2.26 | +73.3 / +39.0 | 1.20 | 36.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 2R | 1319 | 39 % | +0.087 | +115.4 | 2.26 | +55.5 / +59.9 | 1.14 | 28.8 | **oui** |
| US500 | A | âge 0-4 (frais), 3h-11h | 4 h en faveur | limite au bord, stop 1 ATR, 3R | 3914 | 33 % | +0.057 | +222.2 | 2.25 | +86.0 / +136.2 | 1.09 | 56.3 | **oui** |
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
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j | limite au bord, stop 1 ATR, 3R | 1449 | 35 % | +0.091 | +131.4 | 2.12 | +31.2 / +100.2 | 1.14 | 76.3 | **oui** |
| XAUUSD | A | âge 5-12, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1640 | 41 % | +0.068 | +112.2 | 2.10 | +47.2 / +65.0 | 1.12 | 29.9 | **oui** |
| XAUUSD | A | âge 5-12, 3h-9h30 | tendance 20 j + 4 h | marché, stop 1 ATR, 3R | 1250 | 34 % | +0.098 | +122.3 | 2.10 | +51.1 / +71.1 | 1.15 | 33.4 | **oui** |
| XAUUSD | A | âge 5-24, 3h-11h | modèle de ses choix (tiers haut) | marché, stop 1 ATR, 2R | 1645 | 41 % | +0.068 | +111.3 | 2.08 | +45.4 / +65.9 | 1.12 | 30.9 | **oui** |
| US100 | B | âge 5-24, 3h-11h | achats seulement | limite au bord, stop 1 ATR, 3R | 2062 | 32 % | +0.076 | +156.3 | 2.07 | +108.6 / +47.6 | 1.11 | 76.3 | **oui** |
| US100 | B | âge 5-12, 9h30-11h | aucun | marché, stop 1 ATR, 3R | 815 | 38 % | +0.108 | +88.2 | 2.06 | +45.0 / +43.2 | 1.19 | 23.7 | **oui** |

## Répartition des t (toutes les variantes)

- US100 : 288 variantes, t ≥ 2 : 15, t ≤ −2 : 3, R moyen > 0 : 175, médiane des t 0.32
- US500 : 288 variantes, t ≥ 2 : 6, t ≤ −2 : 23, R moyen > 0 : 121, médiane des t -0.23
- XAUUSD : 288 variantes, t ≥ 2 : 23, t ≤ −2 : 13, R moyen > 0 : 162, médiane des t 0.28

