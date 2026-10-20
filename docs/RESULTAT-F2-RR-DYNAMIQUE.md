# Résultat — F2 : RR dynamique (cible = FVG à gauche, sans plancher de 3 R)

Calculé le 2026-10-06, après `PREREG-F2-RR-DYNAMIQUE.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis).

## Verdict
**Aucune des 3 variantes ne passe l'entraînement. F2 garde son TP « max(½ cible, 3 R) ».** Deux variantes (bord proche, moitié) font **significativement moins bien** que F2 sur les mêmes ordres. Le test 2023–2025 n'a pas été lu.

## Contrôle
Le calcul de base retrouve exactement : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R. Rythme 2023–2025 : 2,10 trades/semaine (nombre seul).

## Entraînement 2011–2022 (R moyen par trade ; n)
| | Contrôle F2 (½ cible ou 3 R) | R-near (bord proche) | R-half (moitié) | R-far (bord lointain) |
|---|---|---|---|---|
| 2011–2016 | +0,067 (617) | +0,013 (436) | +0,051 (500) | +0,078 (550) |
| 2017–2022 | +0,146 (605) | +0,080 (451) | +0,081 (520) | +0,102 (555) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,047 (887), t 0,97 | +0,066 (1 020), t 1,38 | +0,090 (1 105), t 1,82 |
| % gagnants | 29 % | 40 % | 37 % | 35 % |
| RR visé médian (moyen) | 3,00 (3,29) | 1,64 (2,02) | 1,90 (2,28) | 2,14 (2,59) |
| Part des trades à RR visé < 1 | 0 % | 19 % | 13 % | 7 % |
| Pire baisse (R) | 27,4 | 27,5 | 25,0 | 27,0 |
| Rythme 2023–25 (trades/sem.) | 2,10 | 1,48 | 1,73 | 1,87 |
| t apparié (mêmes ordres) | — | **−2,64** | **−2,67** | −0,78 |

Critères : gain ≥ +0,03 R (**non** pour les trois) ; t apparié ≥ 2,13 (**non**) ; mieux que le contrôle dans A et B (**non** : R-far bat le contrôle en A, +0,078 contre +0,067, mais pas en B) ; pire baisse ≤ 34,3 R (oui) ; rythme ≥ 1,5 (oui sauf R-near, 1,48). Il fallait les cinq.

## Ce que ça montre
- Plus la cible est proche, plus le prix l'atteint souvent (29 % → 35 % → 37 % → 40 % de gagnants), mais chaque gain est plus petit (RR visé médian de 3,00 à 1,64–2,14) : les deux effets ne se compensent pas, le R moyen baisse (+0,106 → +0,047 à +0,090).
- Pour le bord proche et la moitié, la baisse est nette sur les mêmes ordres (t apparié −2,6) : sur un même trade, viser la vraie cible plus près rapporte en moyenne moins que viser 3 R. Pour le bord lointain, la différence n'est pas significative (t −0,78) : viser le FVG cible en entier revient à peu près au même que 3 R, sans mieux.
- Le plancher de 3 R n'est donc pas un frein : dans les données, il est ce qui fait la différence. Il est cohérent avec ce que Krystofia a dit elle-même (« 3 R minimum ») ; la variante « sans plancher » n'améliore pas F2.
- Le rythme baisse : un TP plus proche est touché avant le remplissage de plus d'ordres (373, 242 et 163 ordres du contrôle ne sont pas remplis dans les variantes), donc moins de trades.

## Réserves
- Un seul type de « RR dynamique » est testé (cible = FVG à gauche). Deux autres idées proposées restent non testées : gestion du trade en cours (partiels, break-even, trailing ; déjà essayée sur 116 trades de 2023–2026 avec un résultat défavorable, d'après le projet) et RR selon le contexte (volatilité, taille du FVG).
- Pas de variante voisine (plancher à 1,5 R ou 2 R, bord à 75 %…) : la règle écrite d'avance l'interdit.
- Les trades sont corrélés ; le t apparié est plus fiable que les t non appariés.
- Vu l'échec, aucune lecture de 2023–2025 ni de 2026.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboN.mjs <data> train` (≈ 4 min). Moteur : `scripts/comboFvgV6/lib/krysBacktestW.js` (copie de `krysBacktest.js` ; ajoute `stopMult` et le mode TP `far`). Tests : `node --test scripts/comboFvgV6/comboN.test.mjs` (3 tests : identité des modes d'origine, ordre bord proche ≤ moitié ≤ bord lointain, une variante identique au contrôle ne passe pas).
