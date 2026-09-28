# Recherche de nuit — exploration 2011-2018, famille D (pistes quantitatives)

Pré-enregistrement `preregistration-nuit-2026-09-26.md` (+ amendement 1). Script `scripts/runNightQuantExplore.js`, règles `scripts/lib/dipRule.js`. 1196 variantes. R net du spread du projet et du swap.

## Sélection (figée pour la validation)

**D1** : 
1. US100 — nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, achat, au marché après le toucher (2342 trades, +0.066 R/trade, t 4.18 ; voisins : d 0.25 / 1R : +0.052 ; d 0.25 / 3R : +0.068 ; d 0.5 / 2R : +0.032)
2. US100 — 3h-9h30, sortie 9h30, limite à 0.5 ATR, 1R, achat, au marché après le toucher (5374 trades, +0.047 R/trade, t 3.68 ; voisins : d 0.25 / 1R : +0.032 ; d 0.5 / 2R : +0.065 ; d 0.75 / 1R : +0.026)

**D2** : 
1. US100 — écart >= 0.5 ATR, sortie 11h, les deux (1586 trades, +0.141 R/trade, t 3.48 ; voisins : écart 0.5 / sortie 16h : +0.121 ; écart 1 / sortie 11h : +0.151)

**D3** : 
1. US100 — jour 1, achat (408 trades, +0.380 R/trade, t 2.94 ; voisins : —)
2. US100 — jour 2, achat (412 trades, +0.390 R/trade, t 2.60 ; voisins : —)

## D1 : 1152 variantes, retenues 31, t ≥ 2 : 33, t ≤ −2 : 532

| Piste | Marché | Règle | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, achat, au marché après le toucher | 2342 | 54 % | +0.066 | +154.9 | 4.18 | +67.7 / +87.2 | 1.25 | 14.3 |
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 3R, achat, au marché après le toucher | 2291 | 54 % | +0.068 | +154.9 | 4.12 | +67.5 / +87.4 | 1.25 | 15.4 |
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 1R, achat, au marché après le toucher | 2690 | 55 % | +0.052 | +140.9 | 4.02 | +62.2 / +78.7 | 1.20 | 14.5 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 1R, achat, au marché après le toucher | 5374 | 53 % | +0.047 | +250.7 | 3.68 | +197.2 / +53.6 | 1.11 | 28.6 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 2R, achat, au marché après le toucher | 4076 | 44 % | +0.065 | +265.7 | 3.43 | +188.7 / +77.0 | 1.13 | 34.2 |
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, achat, rempli au niveau | 2361 | 53 % | +0.051 | +121.5 | 3.26 | +56.1 / +65.4 | 1.19 | 13.1 |
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 3R, achat, rempli au niveau | 2308 | 53 % | +0.053 | +123.4 | 3.25 | +56.1 / +67.3 | 1.19 | 14.5 |
| D1 | XAUUSD | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 3R, les deux, au marché après le toucher | 3301 | 47 % | +0.061 | +201.2 | 3.17 | +81.8 / +119.4 | 1.15 | 24.8 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.25 ATR, 1R, achat, au marché après le toucher | 7508 | 52 % | +0.032 | +241.8 | 3.02 | +178.2 / +63.6 | 1.08 | 37.9 |
| D1 | XAUUSD | 3h-9h30, sortie 9h30, limite à 0.25 ATR, 3R, vente, au marché après le toucher | 5385 | 38 % | +0.059 | +318.7 | 3.00 | +276.5 / +42.1 | 1.10 | 86.9 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.25 ATR, 3R, achat, au marché après le toucher | 4314 | 42 % | +0.061 | +262.5 | 3.00 | +206.4 / +56.1 | 1.12 | 53.9 |
| D1 | XAUUSD | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, les deux, au marché après le toucher | 3648 | 47 % | +0.050 | +182.4 | 2.93 | +77.3 / +105.1 | 1.12 | 30.3 |
| D1 | US100 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 1R, achat, rempli au niveau | 2705 | 54 % | +0.038 | +101.6 | 2.86 | +50.1 / +51.5 | 1.14 | 14.5 |
| D1 | XAUUSD | 3h-11h, sortie 11h, limite à 0.25 ATR, 3R, vente, au marché après le toucher | 6783 | 35 % | +0.052 | +354.4 | 2.84 | +256.2 / +98.1 | 1.09 | 93.2 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.25 ATR, 2R, achat, au marché après le toucher | 5005 | 44 % | +0.048 | +240.1 | 2.83 | +183.7 / +56.4 | 1.10 | 46.1 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 3R, achat, au marché après le toucher | 3607 | 42 % | +0.063 | +226.4 | 2.83 | +178.0 / +48.5 | 1.12 | 41.5 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.5 ATR, 1R, achat, au marché après le toucher | 9993 | 51 % | +0.026 | +255.6 | 2.64 | +213.3 / +42.3 | 1.06 | 49.5 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.25 ATR, 1R, achat, au marché après le toucher | 13093 | 51 % | +0.022 | +283.4 | 2.55 | +246.6 / +36.8 | 1.05 | 59.6 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.5 ATR, 2R, achat, au marché après le toucher | 7478 | 38 % | +0.038 | +286.6 | 2.49 | +292.8 / -6.3 | 1.07 | 65.3 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.75 ATR, 3R, achat, au marché après le toucher | 2452 | 42 % | +0.066 | +163.0 | 2.41 | +146.3 / +16.7 | 1.13 | 50.4 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 1R, les deux, au marché après le toucher | 7239 | 52 % | +0.025 | +183.9 | 2.31 | +122.8 / +61.1 | 1.06 | 50.3 |
| D1 | US500 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, achat, au marché après le toucher | 2541 | 50 % | +0.037 | +94.9 | 2.29 | +47.0 / +47.9 | 1.12 | 23.2 |
| D1 | XAUUSD | nuit 18h-3h, sortie 3h, limite à 0.5 ATR, 3R, les deux, au marché après le toucher | 2821 | 47 % | +0.046 | +128.4 | 2.29 | +87.4 / +41.0 | 1.11 | 30.2 |
| D1 | XAUUSD | 3h-9h30, sortie 9h30, limite à 0.25 ATR, 2R, vente, au marché après le toucher | 6321 | 41 % | +0.035 | +218.4 | 2.19 | +208.5 / +9.9 | 1.06 | 99.7 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.5 ATR, 3R, achat, au marché après le toucher | 6280 | 34 % | +0.043 | +268.3 | 2.17 | +243.5 / +24.9 | 1.07 | 65.0 |
| D1 | US500 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 3R, achat, au marché après le toucher | 3750 | 42 % | +0.047 | +177.3 | 2.15 | +119.6 / +57.7 | 1.09 | 54.6 |
| D1 | US500 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 3R, achat, au marché après le toucher | 2462 | 50 % | +0.036 | +89.3 | 2.14 | +45.6 / +43.7 | 1.12 | 21.2 |
| D1 | US500 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 2R, achat, rempli au niveau | 2587 | 51 % | +0.035 | +91.1 | 2.14 | +49.5 / +41.6 | 1.11 | 22.5 |
| D1 | XAUUSD | nuit 18h-3h, sortie 3h, limite à 0.5 ATR, 1R, les deux, au marché après le toucher | 3785 | 52 % | +0.028 | +104.9 | 2.07 | +88.6 / +16.3 | 1.08 | 42.1 |
| D1 | US500 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 1R, achat, au marché après le toucher | 2980 | 52 % | +0.027 | +80.8 | 2.05 | +38.2 / +42.6 | 1.09 | 23.2 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.75 ATR, 2R, achat, au marché après le toucher | 2624 | 44 % | +0.049 | +128.1 | 2.04 | +120.6 / +7.5 | 1.10 | 43.0 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 2R, achat, rempli au niveau | 4162 | 43 % | +0.038 | +156.2 | 2.02 | +136.6 / +19.6 | 1.07 | 43.5 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.25 ATR, 3R, achat, au marché après le toucher | 7143 | 33 % | +0.037 | +261.4 | 2.00 | +271.9 / -10.4 | 1.06 | 76.8 |
| D1 | US100 | 9h30-15h30, sortie 16h, limite à 0.25 ATR, 1R, achat, au marché après le toucher | 13156 | 51 % | +0.017 | +221.1 | 1.98 | +169.3 / +51.8 | 1.04 | 61.7 |
| D1 | US500 | nuit 18h-3h, sortie 3h, limite à 0.25 ATR, 3R, achat, rempli au niveau | 2504 | 50 % | +0.034 | +85.2 | 1.98 | +44.3 / +40.9 | 1.10 | 20.5 |
| D1 | US500 | 3h-9h30, sortie 9h30, limite à 0.5 ATR, 2R, achat, au marché après le toucher | 4194 | 43 % | +0.037 | +156.2 | 1.98 | +101.0 / +55.2 | 1.07 | 61.1 |
| D1 | XAUUSD | 3h-11h, sortie 11h, limite à 0.5 ATR, 3R, vente, au marché après le toucher | 5682 | 36 % | +0.039 | +221.4 | 1.97 | +135.3 / +86.1 | 1.07 | 64.1 |
| D1 | US100 | 3h-11h, sortie 11h, limite à 0.25 ATR, 2R, achat, au marché après le toucher | 8793 | 38 % | +0.027 | +240.3 | 1.94 | +254.2 / -13.9 | 1.05 | 73.4 |
| D1 | US100 | 3h-9h30, sortie 9h30, limite à 0.75 ATR, 3R, les deux, au marché après le toucher | 3400 | 41 % | +0.044 | +150.7 | 1.92 | +83.4 / +67.3 | 1.08 | 35.0 |
| D1 | XAUUSD | nuit 18h-3h, sortie 3h, limite à 0.5 ATR, 2R, les deux, au marché après le toucher | 3024 | 47 % | +0.034 | +103.9 | 1.90 | +96.0 / +7.9 | 1.09 | 34.9 |

## D2 : 24 variantes, retenues 11, t ≥ 2 : 11, t ≤ −2 : 0

| Piste | Marché | Règle | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R |
|---|---|---|---|---|---|---|---|---|---|---|
| D2 | US100 | écart >= 0.5 ATR, sortie 11h, les deux | 1586 | 40 % | +0.141 | +224.0 | 3.48 | +143.2 / +80.8 | 1.24 | 36.8 |
| D2 | US100 | écart >= 1 ATR, sortie 11h, les deux | 1412 | 38 % | +0.151 | +213.0 | 3.38 | +143.5 / +69.5 | 1.25 | 35.6 |
| D2 | US100 | écart >= 0.5 ATR, sortie 16h, les deux | 1586 | 36 % | +0.121 | +191.5 | 2.80 | +121.8 / +69.7 | 1.19 | 47.1 |
| D2 | US100 | écart >= 0.5 ATR, sortie 11h, achat (écarts baissiers) | 658 | 41 % | +0.174 | +114.6 | 2.79 | +94.1 / +20.4 | 1.30 | 19.5 |
| D2 | US100 | écart >= 2 ATR, sortie 11h, les deux | 964 | 33 % | +0.166 | +159.6 | 2.77 | +105.6 / +53.9 | 1.25 | 39.5 |
| D2 | US100 | écart >= 1 ATR, sortie 16h, les deux | 1412 | 34 % | +0.128 | +180.8 | 2.69 | +122.1 / +58.8 | 1.19 | 45.9 |
| D2 | US100 | écart >= 1 ATR, sortie 11h, achat (écarts baissiers) | 577 | 38 % | +0.185 | +106.6 | 2.66 | +89.3 / +17.3 | 1.30 | 17.5 |
| D2 | US100 | écart >= 0.5 ATR, sortie 16h, achat (écarts baissiers) | 658 | 38 % | +0.169 | +111.0 | 2.52 | +88.8 / +22.2 | 1.27 | 26.4 |
| D2 | US100 | écart >= 1 ATR, sortie 16h, achat (écarts baissiers) | 577 | 35 % | +0.178 | +103.0 | 2.38 | +83.9 / +19.0 | 1.28 | 25.8 |
| D2 | US100 | écart >= 2 ATR, sortie 11h, achat (écarts baissiers) | 378 | 34 % | +0.211 | +79.9 | 2.21 | +61.7 / +18.2 | 1.33 | 26.6 |
| D2 | US100 | écart >= 2 ATR, sortie 16h, les deux | 964 | 28 % | +0.135 | +130.0 | 2.10 | +87.3 / +42.7 | 1.19 | 52.1 |
| D2 | US100 | écart >= 2 ATR, sortie 16h, achat (écarts baissiers) | 378 | 29 % | +0.205 | +77.6 | 1.97 | +57.1 / +20.6 | 1.29 | 34.6 |

## D3 : 20 variantes, retenues 2, t ≥ 2 : 2, t ≤ −2 : 1

| Piste | Marché | Règle | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R |
|---|---|---|---|---|---|---|---|---|---|---|
| D3 | US100 | jour 1, achat | 408 | 28 % | +0.380 | +154.9 | 2.94 | +75.8 / +79.1 | 1.54 | 19.0 |
| D3 | US100 | jour 2, achat | 412 | 23 % | +0.390 | +160.8 | 2.60 | +137.7 / +23.1 | 1.51 | 28.8 |
| D3 | US100 | jour 5, vente | 389 | 21 % | +0.347 | +135.1 | 1.88 | +88.5 / +46.6 | 1.44 | 28.4 |
| D3 | US500 | jour 3, vente | 414 | 20 % | +0.207 | +85.5 | 1.35 | +56.5 / +29.0 | 1.26 | 36.0 |
| D3 | US500 | jour 1, achat | 409 | 27 % | +0.123 | +50.2 | 1.13 | +11.0 / +39.2 | 1.17 | 20.3 |
| D3 | US100 | jour 3, vente | 414 | 18 % | +0.150 | +62.0 | 0.98 | +41.3 / +20.7 | 1.18 | 37.1 |
| D3 | US500 | jour 2, achat | 412 | 22 % | +0.093 | +38.3 | 0.80 | +62.0 / -23.8 | 1.12 | 47.0 |
| D3 | US500 | jour 5, vente | 389 | 21 % | +0.075 | +29.3 | 0.54 | +3.6 / +25.6 | 1.10 | 43.0 |
| D3 | US100 | jour 3, achat | 414 | 19 % | +0.063 | +25.9 | 0.49 | +0.8 / +25.1 | 1.08 | 37.4 |
| D3 | US500 | jour 4, vente | 414 | 22 % | +0.057 | +23.6 | 0.46 | +38.0 / -14.4 | 1.07 | 27.1 |
| D3 | US100 | jour 4, vente | 414 | 18 % | +0.020 | +8.4 | 0.16 | +5.9 / +2.5 | 1.02 | 40.4 |
| D3 | US100 | jour 4, achat | 414 | 19 % | -0.044 | -18.2 | -0.40 | -8.2 / -10.1 | 0.95 | 57.8 |

