# Résultat — F2 : « pas de cible dans les 15–30 derniers jours = pas un jour d'achat »

Calculé le 2026-10-06, après `PREREG-F2-CIBLE-RECENTE.md` (écrit avant le calcul, aucune règle modifiée depuis ; empreinte SHA-256 du fichier au moment du calcul : `7b8a7d87456b2af86588ef0b636a5581a59d75e95cdb7a0c2e31023612872577`, fichier horodaté 16:56 heure de New York).

## Verdict
**Aucune des deux variantes ne passe l'entraînement. F2 garde sa cible sans limite d'âge.** La règle de Krystofia n'a presque aucun effet sur F2 : elle ne supprime que 3 à 5 % des trades. Le test 2023–2025 n'a pas été lu.

## Contrôle
Le calcul de base retrouve exactement : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R. Rythme 2023–2025 : 2,10 trades/semaine (nombre seul).

## Âge de la cible dans F2 (2011–2022)
Âge médian de la cible au moment de la pose de l'ordre : **0,5 jour**. Part des trades dont la cible a plus de 15 jours : **5 %** ; plus de 30 jours : **3 %**. Dans F2, la cible est donc presque toujours un FVG tout récent.

## Entraînement 2011–2022 (R moyen par trade ; n)
| | Contrôle F2 | C-15 (cible ≤ 15 jours) | C-30 (cible ≤ 30 jours) |
|---|---|---|---|
| 2011–2016 | +0,067 (617) | +0,062 (592) | +0,062 (600) |
| 2017–2022 | +0,146 (605) | +0,155 (583) | +0,147 (592) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,108 (1 175), t 2,04 | +0,104 (1 192), t 1,99 |
| Pire baisse (R) | 27,4 | 27,8 | 27,4 |
| Rythme 2023–25 (trades/sem.) | 2,10 | 1,99 | 2,02 |
| Trades supprimés | — | 51 (R moyen −0,036) | 32 (R moyen +0,097) |
| t de Welch (gardés contre supprimés) | — | 0,57 | 0,02 |

Critères : gain ≥ +0,03 R (**non** : +0,002 et −0,002) ; t ≥ 1,96 (**non**) ; mieux que le contrôle dans A et B (**non** : A est plus bas dans les deux) ; pire baisse (oui) ; rythme ≥ 1,0 (oui). Il fallait les cinq.

## Ce que ça veut dire
La règle ne change presque rien : sur 12 ans, elle écarte 51 trades (C-15) ou 32 (C-30) sur 1 222, et ceux-ci ne sont pas meilleurs ni pires que les autres de façon mesurable (−0,036 R et +0,097 R, dans le bruit). Ce n'est pas un échec de la règle : c'est que, dans F2 (achats après balayage du low H4, FVG d'entrée récent), il y a presque toujours un FVG de vente récent à viser, donc la condition « il existe une cible dans les 15–30 jours » est presque toujours vraie.

## Réserves
- Le test porte sur les trades de F2 (déjà filtrés par le balayage H4), pas sur les jours : la règle de Krystofia parle d'un « jour d'achat ». Dans F2, le balayage H4 et l'âge récent du FVG d'entrée écartent déjà beaucoup de jours.
- Le rejeu ne voit qu'environ 3 mois de passé : une cible vieille de plus de 3 mois n'existe pas dans ces calculs. Dans le trading réel de Krystofia, la cible peut remonter plus loin, et la règle « 15–30 jours » aurait plus de poids.
- Le cas du 05–06/10/2026 (aucun FVG M15 à gauche dans la fenêtre) est une anecdote ; il n'a pas été testé ici, les données du projet s'arrêtent au 21/09.
- Pas de variante voisine (10 jours, 60 jours, cible jamais touchée…) : la règle écrite d'avance l'interdit.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboO.mjs <data> train` (≈ 3 min). Moteur : `scripts/comboFvgV6/lib/krysBacktestW.js` (copie de `krysBacktest.js` ; ajoute `stopMult`, le mode TP `far` et `maxTargetAgeDays`). Tests : `node --test scripts/comboFvgV6/comboO.test.mjs` (3 tests : identité sans l'option ou avec une limite énorme, aucune cible plus vieille que la limite, une variante identique au contrôle ne passe pas).
