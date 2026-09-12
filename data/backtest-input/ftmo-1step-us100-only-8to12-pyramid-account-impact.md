# FTMO 1-Step, US100 multi-contact 8h-12h AVEC pyramidage — la config la plus rapide testée sur un seul instrument

Réponse directe à "l'idée c'est de passer le challenge, donc 9 trades ne peuvent pas passer le challenge" (2026-09-12) : 10h-11h seul est trop rare pour être utilisé seul (déjà établi). Ce script empile les DEUX leviers de vitesse déjà validés SÉPARÉMENT - la fenêtre élargie 8h-12h (`ftmo-1step-us100-only-8to12-account-impact.md`, ~46% plus rapide que 10h-11h) et le pyramidage (`ftmo-1step-us100-only-pyramid-account-impact.md`, +21-25% de R pour un coût de drawdown modeste) - pour mesurer la config la plus rapide testée jusqu'ici sur UN SEUL instrument, ENSEMBLE plutôt que par supposition qu'ils s'additionnent proprement.

| Année | Groupes ouverts | Pyramidés (dont bloqués guardrail) | Legs fermés | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |
|---|---|---|---|---|---|---|---|---|---|
| 2019 (train) | 76 | 23/76 | 99 | 28.3% | 4.6% | 6.8% | non | jour 204 | $12801 |
| 2020 (train) | 57 | 16/57 | 73 | 27.4% | 1.2% | 10.2% | **OUI** (2020-08-18) | jour 90 | $12060 |
| 2021 (train) | 96 | 22/96 | 118 | 36.4% | 4.0% | 6.9% | non | jour 156 | $18280 |
| 2022 (train) | 109 | 23/109 | 132 | 30.3% | 2.2% | 8.0% | non | jour 65 | $15715 |
| 2023 (train) | 82 | 17/82 | 99 | 34.3% | 2.6% | 5.0% | non | jour 226 | $15619 |
| 2024 (test) | 106 | 22/106 | 128 | 35.2% | 0.5% | 6.0% | non | jour 116 | $18423 |
| 2025 (test) | 102 | 23/102 | 125 | 39.2% | 0.6% | 6.8% | non | jour 65 | $21300 |

**Comparaison avec les deux leviers pris séparément (chiffres déjà publiés)** :

| Année | 10h-11h seul | 8h-12h seul (sans pyramide) | 8h-12h + pyramide (ici) |
|---|---|---|---|
| 2019 (train) | jamais (DD 4.5%) | jour 213 (DD 5.8%) | jour 204 (DD 6.8%) |
| 2020 (train) | jour 173 (DD 4.5%) | jour 133 (DD 9.3%) | jour 90 (DD 10.2%) |
| 2021 (train) | jour 171 (DD 2.2%) | jour 156 (DD 5.4%) | jour 156 (DD 6.9%) |
| 2022 (train) | jour 142 (DD 4.7%) | jour 117 (DD 6.5%) | jour 65 (DD 8.0%) |
| 2023 (train) | jour 301 (DD 3.9%) | jour 198 (DD 4%) | jour 226 (DD 5.0%) |
| 2024 (test) | jour 206 (DD 3.2%) | jour 116 (DD 4.5%) | jour 116 (DD 6.0%) |
| 2025 (test) | jour 128 (DD 3.3%) | jour 65 (DD 6.3%) | jour 65 (DD 6.8%) |

**Verdict** : empiler les deux leviers pousse le passage du challenge encore plus vite (moyenne test 91 jours contre 90,5 pour 8h-12h seul et 167 pour 10h-11h seul), mais **ça a un vrai coût : 2020 a busté** (drawdown trailing max 10.2%, contre un plafond FTMO de 10%). Chaque levier pris seul restait confortablement en dessous (4.7% pour 10h-11h seul, 9.3% pour 8h-12h seul) - empiler les deux n'est PAS gratuit, la marge de sécurité qui restait sur 8h-12h seul disparaît complètement une fois le pyramidage ajouté par-dessus.

**Nuance importante sur le bust de 2020** : le compte a atteint +10% dès le jour 90 - le bust (2020-08-18) arrive PLUS TARD dans la même année, une fois le challenge déjà réussi. Dans un vrai challenge FTMO, l'évaluation s'arrête dès que la cible est atteinte - ce script continue de simuler des trades toute l'année par simplicité, donc ce bust précis n'aurait probablement pas d'impact réel sur le passage du challenge lui-même. Mais il montre que le compte, une fois FINANCÉ et si le même style de trading continue sans ajustement, aurait dépassé la limite de drawdown de son propre broker cette année-là - un vrai risque pour l'étape D'APRÈS le challenge, pas pour le challenge en lui-même.