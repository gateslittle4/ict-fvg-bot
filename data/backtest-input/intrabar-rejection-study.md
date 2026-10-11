# Réagir dans la bougie (M5 / M1) plutôt qu'à la clôture M15 — règle de Gemini, achats seulement

Règles : `preregistration-intrabar-rejection-2026-09-30.md` (commit `d04588a`). M1 du broker 2023-01 → 2026-09, US100 + US500, règlement à la minute, spread et swap réels. Témoin M15 = reproduit `geminiSignals` (test dans `test/geminiIntrabar.test.js`).

| Version | Achats | Gagnants | R moyen | R total | t |
|---|---|---|---|---|---|
| M15 | 3492 | 25 % | +0.074 | +260.0 | 1.68 |
| M5 | 4104 | 25 % | -0.000 | -1.5 | -0.01 |
| M1 | 4555 | 25 % | +0.027 | +124.4 | 0.73 |

## M5 contre M15 (appariés par FVG)

- FVG tradés dans les deux versions : **3310** ; écart moyen d = R(M5) − R(M15) : **+0.012 R** (t 0.37).
- 2023-01→2024-12 : 1665 FVG, d +0.040 R (t 0.96) ; 2025-01→2026-09 : 1645 FVG, d -0.016 R (t -0.30).
- FVG tradés seulement en M5 : 794 ; seulement en M15 : 182.
- Prix d'entrée : M5 entre en moyenne -13.4 % du risque du témoin plus haut (moins bon).

## M1 contre M15 (appariés par FVG)

- FVG tradés dans les deux versions : **3362** ; écart moyen d = R(M1) − R(M15) : **+0.049 R** (t 1.35).
- 2023-01→2024-12 : 1690 FVG, d +0.024 R (t 0.51) ; 2025-01→2026-09 : 1672 FVG, d +0.074 R (t 1.33).
- FVG tradés seulement en M1 : 1193 ; seulement en M15 : 130.
- Prix d'entrée : M1 entre en moyenne -16.3 % du risque du témoin plus haut (moins bon).

## Verdict (fixé à l'avance)

- M5 : **NE PROUVE RIEN**
- M1 : **NE PROUVE RIEN**
