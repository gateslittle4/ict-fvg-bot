# Résultat — Combo FVG avec un seul filtre H4

Calculé le 2026-10-06 avec les critères de `PREREG-COMBO-FVG-UN-FILTRE.md`. Achats US100 M15, R par trade (nombre de trades).

| Variante | Trades / semaine (2023-25) | 2011–2016 | 2017–2022 | 2011–2022 (t) | Test 2023–25 | 2026 |
|---|---|---|---|---|---|---|
| F1 tendance seule | 2,85 | +0,041 (877) | −0,003 (917) | +0,019 (0,44) | +0,029 (444) | +0,103 (84) |
| **F2 balayage seul** | **2,08** | **+0,067 (617)** | **+0,146 (605)** | **+0,106 (2,04)** | **+0,183 (325)** | **−0,239 (87)** |
| F3 pas dans FVG H4 baissier | 5,21 | +0,006 (1 546) | +0,046 (1 661) | +0,027 (0,84) | +0,074 (812) | −0,178 (203) |
| Contrôle sans filtre | ~6 | | | +0,025 | +0,083 | −0,092 |

## Verdict
Aucune variante ne passe tous les critères écrits d'avance.
- F1 : t = 0,44 (il fallait 2,4) et 2017–2022 négatif. Échec.
- F3 : t = 0,84, quasi identique au contrôle. Échec.
- **F2 (balayage d'un low H4) est la plus proche** : 2,08 trades par semaine, les deux moitiés positives, meilleure que le contrôle, test positif. Mais t = 2,04 est sous le seuil de 2,4 fixé pour trois hypothèses, et **2026 est négatif (−0,239 R par trade sur 87 trades, −20,8 R)**.

Conclusion : pas de version « 2–3 trades par semaine » validée. F2 est une piste à suivre en démo, pas une stratégie prouvée. Pas d'autre essai sur ces données (règle écrite d'avance).

Code : `comboF.mjs` (empreinte dans le pré-enregistrement), `fenetre17.mjs` (variante 06–17 h sans filtre, exploratoire).
