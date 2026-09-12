# FTMO 1-Step, US100 multi-contact seul, fenêtre 8h-12h — comparé à 10h-11h

Question directe d'Esdras (2026-09-12) : "et si on utilise 8h-12h ? dis-moi si c'est pas un meilleur compromis que 10h-11h, car beaucoup de trades que j'ai pris étaient dans cet intervalle." Identique à `ftmo-1step-us100-only-account-impact.md` (US100 multi-contact seul, `MultiTouchFvgEngine`, RR=5, aucune autre source) - seule la fenêtre de session change : 8h-12h au lieu de 10h-11h, tout le reste production-verbatim.

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 78 (78 FVG-idx + 0 FVG-or + 0 div.) | 26.9% | 3.6% | 5.8% | non | jour 213 | $11792 |
| 2020 (train) | 103 (103 FVG-idx + 0 FVG-or + 0 div.) | 31.1% | 1.2% | 9.3% | non | jour 133 | $14426 |
| 2021 (train) | 98 (98 FVG-idx + 0 FVG-or + 0 div.) | 36.7% | 1.9% | 5.4% | non | jour 156 | $16630 |
| 2022 (train) | 111 (111 FVG-idx + 0 FVG-or + 0 div.) | 30.6% | 1.7% | 6.5% | non | jour 117 | $14741 |
| 2023 (train) | 85 (85 FVG-idx + 0 FVG-or + 0 div.) | 34.1% | 1.6% | 4.0% | non | jour 198 | $14569 |
| 2024 (test) | 109 (109 FVG-idx + 0 FVG-or + 0 div.) | 34.9% | 0.5% | 4.5% | non | jour 116 | $16692 |
| 2025 (test) | 103 (103 FVG-idx + 0 FVG-or + 0 div.) | 38.8% | 0.6% | 6.3% | non | jour 65 | $18412 |