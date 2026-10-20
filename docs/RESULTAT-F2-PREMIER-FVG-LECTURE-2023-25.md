# Résultat — lecture unique de 2023–2025 pour FB1 (premier FVG après le balayage H4)

Règle écrite d'avance : `PREREG-F2-PREMIER-FVG-LECTURE-2023-25.md` (SHA-256 `d3ba77b8…5ed1`, 2026-10-07 08:31 heure de New York), avant la lecture. Lecture hors protocole d'origine (FB1 avait échoué à l'entraînement), permise par le palier « prometteuse ». Commande : `node --max-old-space-size=6144 scripts/comboFvgV6/comboAB_premier_fvg.mjs <data> test`.

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| **FB1** 2023–2025 | 171 | 29 % | 26,2 | +0,153 | 1,05 | 21,7 |
| F2C 2023–2025 | 331 | 29 % | 56,5 | +0,171 | 1,61 | 24,8 |
| Retirés (F2C absents de FB1) | 181 | — | — | **+0,178** | — | — |
| Ajoutés (FB1 absents de F2C) | 21 | — | — | +0,092 | — | — |
| FB1 2026 (descriptif) | 40 | 23 % | −4,6 | −0,114 | −0,43 | 15,0 |
| F2C 2026 (descriptif) | 87 | 20 % | −20,8 | −0,239 | −1,42 | 23,2 |

## Verdict écrit d'avance : **KO**
- FB1 > F2C ? +0,153 contre +0,171 : **non**.
- FB1 > 0 ? oui.
- Retirés < FB1 ? +0,178 contre +0,153 : **non**.

FB1 est rejetée. Pas de variante voisine, pas de relecture.

## Lecture honnête
1. À l'entraînement (2011–2022), FB1 gardait les trades qui valaient +0,192 R et retirait ceux qui valaient +0,083. Sur 2023–2025, c'est l'inverse : les trades retirés (+0,178) valent un peu plus que ceux gardés (+0,153). L'écart d'entraînement ne s'est pas reproduit.
2. Les écarts du test sont petits par rapport au bruit (t de FB1 : 1,05 sur 171 trades). Ce test ne démontre pas que FB1 est mauvaise ; il montre qu'elle n'améliore pas F2 sur ces années, ce qui est ce que la règle demandait.
3. FB1 prend 171 trades contre 331 : moins de rendement total (26,2 R contre 56,5 R) pour une baisse à peine plus faible (21,7 contre 24,8).
4. 2026 est descriptif (40 trades, t −0,43) : rien à en conclure.
5. **Série des quasi-réussites relues hors échantillon** : TD2, H1 et FB1 sont toutes passées proches à l'entraînement, et les trois ont été KO sur 2023–2025. Aucune n'est devenue candidate. C'est ce qu'on attend du hasard quand on teste beaucoup de règles sur les mêmes données, et ce que le palier « prometteuse » devait attraper.

## Conséquence
Aucune candidate au suivi en direct pour l'instant. F2 reste la référence inchangée. Le palier « prometteuse » n'a produit aucune hypothèse qui tienne hors échantillon sur les trois cas déjà lus.

## Limites
- Règle de verdict peu exigeante (sans seuil de significativité) : un KO ici est donc un échec franc, pas un cas limite.
- 2023–2025 n'est pas vierge pour F2 ; les trades sont corrélés.
