# Résultat — lecture exploratoire 2023–2025 de TD2

Critère et divulgations : `PREREG-F2-TENDANCE-DAILY-PD-LECTURE-2023-25.md` (SHA-256 `814d1841…d47a`, 2026-10-07 06:42 heure de New York), écrit avant la lecture. Une seule lecture, aucune variante. Indice seulement : TD2 est rejetée à l'entraînement et ne peut pas « passer ».

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C 2023–2025 | 331 | 29 % | 56,5 | +0,171 | 1,61 | 24,8 |
| **TD2** 2023–2025 | 150 | 27 % | 13,2 | **+0,088** | 0,57 | 20,0 |
| Retirés par TD2 (daily non haussière) | 181 | | | **+0,239** | | |
| F2C 2026 (descriptif) | 87 | 20 % | −20,8 | −0,239 | −1,42 | 23,2 |
| TD2 2026 (descriptif) | 49 | 16 % | −17,0 | −0,346 | −1,62 | 20,0 |
| Retirés 2026 | 38 | | | −0,100 | | |

## Verdict selon le critère écrit d'avance : « non compatible » (KO)
- TD2 fait moins bien que F2C sur 2023–2025 (+0,088 contre +0,171), et les trades qu'elle retire font **mieux** (+0,239) que ceux qu'elle garde. C'est l'inverse de l'entraînement (+0,261 gardés contre −0,033 retirés sur 2011–2022).
- En 2026 (descriptif), la même inversion partielle : gardés −0,346, retirés −0,100.

## Ce que ça dit
1. **L'avantage de la tendance daily par PD arrays vu sur 2011–2022 ne se retrouve pas sur 2023–2025 ni sur 2026.** Le résultat d'entraînement était très probablement en grande partie du hasard ou propre à cette période (conformément à la prudence écrite : seizième variante testée, seuil non corrigé).
2. **Un seul bloc de test, qui n'était pas vierge pour F2** : il faut éviter de sur-interpréter, mais le signe est clairement défavorable. Aucune règle n'est ajoutée à F2.
3. Réponse à la question « peut-on se fier à F2 en daily haussière ? » : **non, rien dans ces données ne le soutient hors de 2011–2022.**

## Suite
La confirmation propre reste le suivi prospectif (après le 21/09/2026). Aucune autre lecture de 2023–2025 pour TD2.
