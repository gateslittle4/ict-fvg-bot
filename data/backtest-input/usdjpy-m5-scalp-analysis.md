# USDJPY M5 scalp (Judas Swing @ M5, 1:2, timeout 480 bougies M5) — recherche "version réaliste du HFT"

⚠ Pas un nouveau mécanisme - réutilise runJudasSwingBacktest() (src/backtest/judasSwing.js) TEL QUEL, sur des bougies M5 au lieu de M15, sur USDJPY (seul instrument avec des données M1 sources réelles dans ce projet, et sans stratégie déjà validée dessus). Deux paramètres décidés depuis la recherche AVANT de voir un résultat : RR 1:2 (au lieu de 1:3+ ailleurs — les sources ICT scalping convergent sur des cibles plus modestes, ~30-50 pips) et timeout 480 bougies (même constante que partout ailleurs dans ce projet, juste appliquée à des bougies M5 cette fois — 40h au lieu de 5 jours en M15).

Trades bruts avant filtre de viabilité (distance du stop < 3× spread) : train 752 (365 rejetés), test 212 (62 rejetés).

| Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |
|---|---|---|---|---|---|---|---|---|
| 387 | 34.2% | 0.78 | -0.17 | 150 | 33.3% | 0.79 | -0.16 | ❌ ne tient pas |