# Stratégie exploratoire non-ICT #4 : divergence RSI(14) classique (Wilder)

⚠ Mécanisme SINGLE-instrument, à ne pas confondre avec la Divergence déjà validée (paire US100/US500, log-ratio) ni avec la RSI(2) Connors déjà validée (lecture extrême + filtre EMA200, sans comparaison à l'historique de l'indicateur). Ici : divergence classique entre le PRIX et le RSI(14) Wilder (lissage standard, différent du RSI(2) à moyenne simple de Connors) sur deux points de swing consécutifs CONFIRMÉS (détection réutilisée de marketStructure.js, même discipline no-lookahead). Divergence haussière = prix fait un plus bas plus bas alors que le RSI fait un plus bas plus haut ; divergence baissière = symétrique sur les plus hauts. Bougies journalières. Entrée à l'ouverture du jour SUIVANT la confirmation. Stop = 2xATR(14) (même convention que RSI-2/Turtle). Cible = 1:3 fixe (même convention que FVG/Order Block/OTE/Divergence). Timeout 10 jours (même convention que RSI-2/Bollinger/Turtle Soup). Un seul guet et une seule position suivis à la fois. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. Testé sur les 5 instruments disponibles (US100, US500, XAUUSD, EURUSD, GBPUSD) — EURUSD/GBPUSD avaient été retirés du plan pour le FVG (aucune config FVG testée n'y montrait d'edge), mais rien n'indique a priori qu'un mécanisme complètement différent comme celui-ci serait limité aux mêmes instruments.

| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| US100 | 59 | 45.8% | 1.30 | 0.13 | 10 | 30.0% | 0.53 | -0.22 | ❌ ne tient pas |
| US500 | 60 | 36.7% | 0.79 | -0.11 | 10 | 30.0% | 0.30 | -0.34 | ❌ ne tient pas |
| XAUUSD | 63 | 47.6% | 1.01 | 0.00 | 8 | 50.0% | 1.19 | 0.10 | ✅ tient |
| EURUSD | 29 | 37.9% | 0.68 | -0.16 | 8 | 50.0% | 0.93 | -0.03 | ❌ ne tient pas |
| GBPUSD | 27 | 40.7% | 0.61 | -0.20 | 9 | 33.3% | 0.13 | -0.50 | ❌ ne tient pas |
| USDJPY | 27 | 33.3% | 0.90 | -0.05 | 10 | 50.0% | 0.96 | -0.02 | ❌ ne tient pas |
| USDCAD | 60 | 43.3% | 0.95 | -0.02 | 13 | 30.8% | 0.36 | -0.43 | ❌ ne tient pas |
| GER40 | 50 | 34.0% | 0.62 | -0.18 | 6 | 66.7% | 3.79 | 0.68 | ⚠️ affaibli |
| UKX | 23 | 52.2% | 0.70 | -0.12 | 7 | 28.6% | 0.48 | -0.14 | ❌ ne tient pas |
| AUX | 24 | 54.2% | 1.36 | 0.14 | 5 | 60.0% | 0.79 | -0.08 | ❌ ne tient pas |