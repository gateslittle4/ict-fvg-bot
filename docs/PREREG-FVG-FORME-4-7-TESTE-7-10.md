# Pré-enregistrement — FVG formé entre 4 h et 7 h, testé entre 7 h et 10 h (FM1)

Écrit le 2026-10-08, AVANT tout calcul de cette règle (seul le nombre de bougies M15 entre 4 h et 7 h NY a été compté par année, pour vérifier que les données couvrent la plage : 12 bougies par jour, toutes les années). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, « je teste un FVG formé entre 4 h et 7 h, ensuite il est testé entre 7 h et 10 h ». Ce n'est pas F2 : pas de balayage H4.

## La règle FM1 (une seule hypothèse, figée)
Heures de New York (convention du moteur : décalage fixe de 5 h, `nyHour`). Bougies M15, séries continues par année comme les études F2.
- **FVG** : strict, trois bougies contiguës, mèches comprises, **achats et ventes** (tes deux captures montrent un achat et une vente). Règle c4 du moteur (la bougie suivante qui touche la zone devient le nouveau c3 ; la zone est validée si une bougie reste entièrement dehors).
- **Formé entre 4 h et 7 h** : la bougie c3 (celle qui crée le trou) s'ouvre entre 4 h 00 incluses et 7 h 00 exclues.
- **Testé entre 7 h et 10 h** : un ordre limite à 50 % de la zone restante, actif de 7 h 00 à 10 h 00 (le moteur le pose à partir de la bougie de 6 h 45, il peut se remplir dans les bougies ouvertes de 7 h 00 à 9 h 45 incluses, jamais à partir de 10 h 00 ; paramètres moteur `hourFrom` 6,75 et `hourTo` 9,75). Le premier contact avec la zone après sa validation la « consomme » : si le prix la touche avant 7 h sans que l'ordre soit encore actif, elle n'est plus tradable (c'est la première visite qui compte). L'âge maximal est 24 bougies (non contraignant : 4 h → 10 h = 24 bougies).
- **Entrée, stop, cible, coûts** : ceux de F2, inchangés : entrée à 50 %, stop au-delà de c1 de 3 points, cible = la plus lointaine entre la moitié du FVG opposé le plus proche et 3 R (pas d'ordre sans FVG cible), spread 0,6 × prix/8200, sortie au temps à 96 bougies, stop d'abord, une position à la fois.
- Aucune autre valeur essayée (4 h–6 h, 5 h–7 h, 7 h–9 h, 7 h–11 h, entrée au bord, achats seuls, ventes seules, autre cible) : si FM1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
1. R moyen > 0 et t du R moyen ≥ 1,96.
2. R moyen > 0 dans A (2011–2016) et dans B (2017–2022).
3. Pire baisse ≤ 34,3 R (le plafond utilisé pour F2 : 1,25 × 27,4).
4. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

Palier : « validée » si les quatre passent ; « prometteuse » si seul le critère 1 manque par son t, avec un t ≥ 1,0 et un R moyen > 0 (voir `PROTOCOLE-PALIER-PROMETTEUR.md`) ; sinon « rejetée ».

## Lecture du test 2023–2025 (une seule fois, si validée ou prometteuse)
**OK** si le R moyen de FM1 sur 2023–2025 est > 0. Sinon **KO**. 2026 : descriptif. OK = candidate au suivi en direct, pas une adoption. F2 sur les mêmes années est donné à titre de repère, non jugé.

## Descriptif (non jugé)
Achats et ventes séparés (trades, R moyen) ; nombre d'ordres posés et remplis ; trades par semaine ; F2C pour repère. Aucune décision ne sera prise sur ces découpages.

## Divulgations
- **Les captures n'ont servi à aucun réglage.** D'après leur axe, les deux FVG dessinés sont formés vers 10 h–11 h (un achat le 6 octobre, une vente le 7), hors de la plage 4 h–7 h : ce sont des illustrations d'autre chose, ou la plage est dans un autre fuseau ; je suis ta phrase, en heure de New York (= Haïti en ce moment).
- **Définitions choisies par moi, que tu n'as pas précisées** : « formé » = c3 ouverte entre 4 h et 7 h ; « testé » = ordre limite à 50 % actif de 7 h à 10 h, première visite uniquement ; entrée, stop, cible et coûts = ceux de F2. Si ton « testé » veut dire un contact à n'importe quelle profondeur (par exemple au bord de la zone), l'entrée à 50 % en rate une partie (environ un ordre sur cinq pour F2 ne touche jamais le 50 %).
- Ni balayage H4 ni filtre de tendance : plus de trades que F2, sans le filtre qui lui donne son avantage. À titre de repère, F2 limitée à 6 h–12 h faisait −0,050 R (2011–2022) : rien n'indique d'avance que cette plage matinale soit positive.
- Les ventes miroir de F2 étaient à +0,025 R (2011–2022, t 0,53) : le côté vente peut tirer le résultat vers le bas ; il est inclus parce que tes captures montrent les deux sens.
- Plus de 40 hypothèses ont été testées sur les mêmes données de 2011–2022 ; avec un seuil de t à 1,96, une réussite à l'entraînement peut être du hasard. Un succès au test serait un indice, pas une preuve. 2023–2025 n'est pas vierge pour F2, mais le R de FM1 sur ces années n'a pas été lu.
- Le critère de test (R moyen > 0) est peu exigeant. Je ne l'ai pas durci après coup, pour ne pas choisir la règle selon le résultat.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAK_fvg_matin.mjs <data> train`, puis `... test` si validée ou prometteuse. Moteur : `lib/krysBacktestC.js`.
