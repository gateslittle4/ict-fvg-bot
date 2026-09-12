# Combien de temps pour passer un challenge FTMO 1-Step avec ce système (US100 en multi-contact)

Question directe d'Esdras. Même scope de compte que runFtmo1StepAccountImpact.js (FVG US100+US500+XAUUSD + Divergence US100/US500, netting même-instrument, un seul budget de garde-fous), CORRIGÉ pour utiliser les RR de production réels (5/5/4, lus directement depuis CONFIG.fvg.perSymbol - l'ancien script avait 3/3/3 codé en dur, périmé depuis la "cible étendue"). US100 utilise `MultiTouchFvgEngine` (vérifié ce soir, pas encore déployé) ; US500/XAUUSD/Divergence restent le moteur à contact unique déjà en production.

| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 157 (45 FVG-idx + 12 FVG-or + 100 div.) | 34.4% | 0.6% | 6.7% | non | jour 92 | $14342 |
| 2020 (train) | 132 (42 FVG-idx + 11 FVG-or + 79 div.) | 31.3% | 1.6% | 10.4% | **OUI** (2020-10-09) | jour 55 | $13429 |
| 2021 (train) | 162 (45 FVG-idx + 16 FVG-or + 101 div.) | 30.9% | 1.9% | 6.2% | non | jour 214 | $13703 |
| 2022 (train) | 165 (58 FVG-idx + 0 FVG-or + 107 div.) | 30.9% | 1.5% | 4.6% | non | jour 89 | $14426 |
| 2023 (train) | 146 (39 FVG-idx + 20 FVG-or + 87 div.) | 37.2% | 1.3% | 4.9% | non | jour 171 | $15688 |
| 2024 (test) | 158 (43 FVG-idx + 18 FVG-or + 97 div.) | 32.3% | 0.5% | 6.4% | non | jour 56 | $14825 |
| 2025 (test) | 174 (57 FVG-idx + 21 FVG-or + 96 div.) | 34.3% | 0.0% | 4.7% | non | jour 49 | $17214 |