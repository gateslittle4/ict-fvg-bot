# Combien de temps pour passer un challenge FTMO 1-Step avec SEULEMENT US100 multi-contact (rien d'autre)

Suite directe de la question précédente : "et si je prenais seulement le FVG multi-contact, et on laisse XAUUSD et divergence?" - donc ici, UN SEUL instrument, UNE SEULE source : FVG US100 en multi-contact, `MultiTouchFvgEngine` (vérifié, pas encore déployé), RR=5 (production réelle, lu depuis CONFIG.fvg.perSymbol.US100). Ni US500, ni XAUUSD, ni Divergence - le combo le plus simple possible, isolant exactement ce qui a été validé ce soir, rien de plus.

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 37 (37 FVG-idx + 0 FVG-or + 0 div.) | 27.0% | 2.9% | 4.5% | non | jamais | $10824 |
| 2020 (train) | 48 (48 FVG-idx + 0 FVG-or + 0 div.) | 29.2% | 0.0% | 4.5% | non | jour 173 | $11509 |
| 2021 (train) | 46 (46 FVG-idx + 0 FVG-or + 0 div.) | 45.7% | 0.6% | 2.2% | non | jour 171 | $14300 |
| 2022 (train) | 54 (54 FVG-idx + 0 FVG-or + 0 div.) | 29.6% | 0.0% | 4.7% | non | jour 142 | $11920 |
| 2023 (train) | 37 (37 FVG-idx + 0 FVG-or + 0 div.) | 32.4% | 1.7% | 3.9% | non | jour 301 | $11540 |
| 2024 (test) | 45 (45 FVG-idx + 0 FVG-or + 0 div.) | 33.3% | 0.9% | 3.2% | non | jour 206 | $12124 |
| 2025 (test) | 50 (50 FVG-idx + 0 FVG-or + 0 div.) | 46.0% | 0.0% | 3.3% | non | jour 128 | $14990 |