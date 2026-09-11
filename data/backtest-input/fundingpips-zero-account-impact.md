# Impact au niveau du COMPTE — même setup validé (FVG US100+US500+OR + Divergence, netting), sous les règles FundingPips Zero

⚠ **Règles NON vérifiées à la source primaire** (fundingpips.com/help.fundingpips.com bloqués par la politique réseau de cette session, confirmé après plusieurs tentatives) — synthétisées depuis deux recherches web indépendantes qui convergent, pas une lecture directe de la page officielle. À reconfirmer avant de faire confiance à ce chiffre pour du capital réel. Modélisé : PAS de cible de profit (financement instantané), perte max TRAILING 5% depuis le plus haut solde atteint MAIS plafonnée au solde de départ une fois ce seuil dépassé (interprétation de "locks at the starting size", elle-même non vérifiée), perte quotidienne max 3% (notre propre garde-fou à 2% reste plus strict, donc ce test sous-estime la marge réelle). **Nouveauté testée ici** : la limite de risque ouvert total de FundingPips Zero (1% du solde, tous symboles confondus à tout instant) — jamais vérifiée avant, potentiellement incompatible avec ce bot qui peut avoir jusqu'à 4 positions ouvertes simultanément (FVG x3 + Divergence, une par instrument) à 0.5% chacune. Score de consistance (15%), 7 jours profitables/30, coussin de sécurité 3% : règles de retrait, pas de survie du compte — PAS modélisées ici (question différente).

| Année | Trades (détail) | Win rate | Drawdown trailing max | Busté (-5% trailing, plafonné au solde de départ)? | Risque ouvert max (limite 1%) | Trades traversant un week-end (interdit sur Zero) | Solde final |
|---|---|---|---|---|---|---|---|
| 2019 (train) | 137 (21 FVG-idx + 12 FVG-or + 104 div.) | 38.0% | 7.8% | non | **1.00%** (13x) | **25** | $13507 |
| 2020 (train) | 146 (27 FVG-idx + 16 FVG-or + 103 div.) | 36.1% | 9.4% | non | **1.00%** (41x) | **26** | $13457 |
| 2021 (train) | 65 (10 FVG-idx + 8 FVG-or + 47 div.) | 26.2% | 5.5% | **OUI** (2021-07-06) | **1.00%** (3x) | **7** | $9951 |
| 2022 (train) | 24 (2 FVG-idx + 0 FVG-or + 22 div.) | 20.8% | 5.1% | **OUI** (2022-03-21) | 0.50% | **5** | $9765 |
| 2023 (train) | 126 (16 FVG-idx + 22 FVG-or + 88 div.) | 38.4% | 4.9% | non | **1.01%** (42x) | **16** | $13577 |
| 2024 (test) | 135 (17 FVG-idx + 19 FVG-or + 99 div.) | 31.6% | 5.7% | non | 1.00% | **23** | $11785 |
| 2025 (test) | 148 (31 FVG-idx + 21 FVG-or + 96 div.) | 34.7% | 3.3% | non | 1.00% | **22** | $12947 |