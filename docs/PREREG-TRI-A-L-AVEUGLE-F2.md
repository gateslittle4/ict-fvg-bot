# Protocole — tri à l'aveugle des signaux de F2 par Krystofia (lot 1 : 10 signaux)

Écrit le 2026-10-06, AVANT le tirage. Question : **quand Krystofia regarde un signal de F2 sans connaître son résultat, ses « je prends / je saute » retirent-ils des stops sans retirer des gagnants ?** Elle décide de chaque signal ; je ne valide rien à sa place. Ce lot de 10 est un essai de format : il ne prouve rien (voir plus bas).

## Tirage (figé)
- Population : les trades remplis de F2C (série continue, `comboT.mjs`, règles de `CRITERE-DEMO-F2.md`) sur **2011–2022** (1 222 trades), avec au moins 400 bougies d'historique avant la pose.
- 10 trades tirés au hasard avec la graine **20261006**, au plus un trade par jour calendaire. Aucun choix à la main, aucun remplacement après avoir vu les résultats.
- Les signaux dont l'ordre n'a jamais été rempli ne sont pas dans la population (pas de résultat à comparer) : Krystofia juge donc des signaux qui se sont ensuite remplis, ce qui est une petite différence avec le temps réel.

## Ce qui est montré (tout ce qui existe à l'instant de la pose de l'ordre, rien d'après)
- Graphique M15 : les 160 dernières bougies jusqu'à la bougie de pose incluse, la zone FVG d'entrée, l'entrée à 50 %, le stop (bas de c1 − 3 pts), le TP prévu (max(½ cible, 3 R)), le FVG cible.
- Graphique H4 : les 40 dernières bougies H4 complètes avec le bas des 6 dernières barres (le niveau balayé).
- Prix en points **relatifs à l'entrée** et heure de New York ; **ni date, ni année, ni niveau de prix absolu** pour que ces signaux ne se reconnaissent pas.
## Ce qui est caché
Le résultat (R, stop ou TP, durée), la date, le prix absolu. La clé est dans un fichier à part que je n'ouvrirai pas devant Krystofia avant ses réponses.

## Ce que Krystofia donne
Pour chaque signal : **prendre ou sauter**, plus une raison en une ligne (par exemple « contexte H4 contre », « zone proche d'un bas », « pas de logique »). Elle peut dire « je ne sais pas » ; ce sera noté comme tel, pas forcé. Pas de retour en arrière après la révélation.

## Comparaison prévue (descriptive)
Nombre de signaux pris et sautés ; R moyen des pris et des sautés ; combien de stops (−1 R) elle aurait évités ; combien de gagnants elle aurait perdus ; raisons données.

## Limites (écrites d'avance)
- **10 signaux ne prouvent rien** : avec 29 % de gagnants, on s'attend à environ 3 gagnants dans le lot ; un seul trade change tout. Ce lot sert à voir le format, le temps que ça prend, et à repérer les raisons récurrentes.
- Un vrai test demande environ **100 signaux** (10 lots tirés avec des graines différentes, écrites d'avance) ou, mieux, des signaux en temps réel jugés avant le résultat.
- Les graphiques sont des images en prix relatifs : certaines informations que Krystofia utilise d'habitude (niveaux ronds, actualités, séances précédentes plus loin que 160 bougies) peuvent manquer ; ça joue contre son tri.
- Si Krystofia reconnaît un jour ou un mouvement, elle le dit : le signal est alors noté « reconnu » et exclu du calcul.
