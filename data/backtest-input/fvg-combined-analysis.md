# FVG : multi-contact + exclusion bougie immédiate, combinés

Combine les deux idées d'Esdras testées séparément (voir fvg-multi-touch-analysis.md et fvg-first-candle-analysis.md) : `MultiTouchFvgEngine` avec `minCandlesBeforeEligible: 2` (le contact sur la toute première bougie n'est même pas tenté, la zone attend simplement). Même config de production, zéro paramètre retouché. Référence = contact unique (production actuelle).

| Symbole | Mécanisme | Trades train | Espérance train (R) | R total train | Trades test | Espérance test (R) | R total test | Verdict |
|---|---|---|---|---|---|---|---|---|
| US100 | contact unique (production) | 68 | 1.38 | 93.9 | 38 | 1.44 | 54.7 | ✅ tient |
| US100 | **multi-contact + hors bougie immédiate** | 174 | 1.07 | 186.6 | 88 | 1.34 | 117.6 | ✅ tient |
| US500 | contact unique (production) | 70 | 1.02 | 71.7 | 30 | 1.13 | 34.0 | ✅ tient |
| US500 | **multi-contact + hors bougie immédiate** | 132 | 0.55 | 72.2 | 69 | 0.52 | 36.1 | ✅ tient |
| XAUUSD | contact unique (production) | 82 | 0.88 | 72.5 | 41 | 0.61 | 24.9 | ✅ tient |
| XAUUSD | **multi-contact + hors bougie immédiate** | 239 | 0.19 | 45.5 | 102 | 0.20 | 20.1 | ✅ tient |