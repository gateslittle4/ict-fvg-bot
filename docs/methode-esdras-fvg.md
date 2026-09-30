# La méthode FVG d'Esdras — règles apprises, 11 exemples, ce qui a été testé (30 septembre 2026)

Pour les prochaines sessions et pour la critique externe (Gemini). Tout ce qui suit vient d'Esdras (captures et explications des 29-30/09), sauf mention.

## Ses règles, dans ses mots (traduites)
- **Axe des graphiques : UTC** (l'horloge en haut à droite est en heure d'Haïti = heure de New York). Il lit l'heure d'**ouverture** des bougies.
- **Le FVG le plus récent** « dit où va le prix » : sa direction = la direction du trade. **Pour l'entrée, toujours le FVG le plus récent** (FVG M15 formé par
  trois bougies contiguës ; des FVG consécutifs de même sens = **un seul** FVG).
- **Validité** : il « attend 15 min après la dernière bougie qui forme le FVG ». Si la bougie suivante en mange une partie, **la partie mangée n'est plus un
  FVG : il considère la partie non mangée** ; entièrement mangé (ex. micro-FVG de 0,25 point du 11/09) = pas de FVG.
- Il marque les **4hr high et 4hr low des deux côtés**. Le **FVG « à gauche »** (cible) est un FVG M15 opposé situé **dans la bougie H4 qui porte ce 4hr high/low**.
  Le 4hr est « un repère, parfois final ».
- **Choix du 4hr** : jugement. Il écarte des hauts/bas plus proches quand un FVG les surplombe (« low resistance liquidity run », le prix ne s'y arrête pas) ou
  quand aucun FVG M15 « à gauche » n'y est disponible. Il retient la bougie qui **ouvre un FVG H4** : « quand il y a un 4hr FVG proche d'un 4hr high/low, le
  prix a tendance à continuer ».
- **Sortie** : à sa discrétion, selon la vitesse du prix et la formation d'un autre FVG dans le même sens en chemin (alors il vise plus loin). Il a parfois
  une 2ᵉ entrée après un stop sur le même FVG.

## Les 11 exemples (bougies M15 du bot déployé, heures UTC de l'axe ; US100 = 5, US500 = 6)
| # | Paire | Jour | Sens | Zone d'entrée dessinée | 4hr line | FVG « à gauche » dessiné |
|---|---|---|---|---|---|---|
| 1 | US100 | 14/09 | achat | 28 850-28 915 | 4hr high 29 125 | 29 000-29 050 |
| 2 | US100 | 18/09 | vente | 29 610-29 650 | 4hr low 29 390 | 29 420-29 455 |
| 3 | US100 | 23/09 | vente | 30 715-30 780 | 4hr low 30 495 | 30 535-30 625 |
| 4 | US100 | 22/09 | achat | 30 510-30 545 (partie non mangée ≈ 30 538-30 542) | 4hr high 30 665 | 30 605-30 635 |
| 5 | US100 | 24/09 | achat | 30 250-30 290 | 4hr high 30 570 | (FVG non encadré près du 4hr) |
| 6 | US500 | 29/09 | vente | 7 697-7 703 | 4hr low 7 666 | 7 677-7 684 |
| 7a/7b | US500 | 11/09 | achat ×2 | 7 628-7 635 et 7 620-7 626 | 4hr high 7 694 | 7 670-7 678 |
| 8 | US500 | 14/09 | achat | 7 600-7 610 | 4hr high 7 641 | 7 632-7 637 |
| 9 | US500 | 18/09 | vente | 7 660-7 670 | 4hr low 7 620,5 | 7 628-7 635 |
| 10 | US500 | 23/09 | vente | 7 738-7 748 | 4hr low 7 703,5 | 7 708-7 712 |
Tous des gagnants choisis par Esdras ; septembre 2026 est donc déjà vu pour cette famille.

## Ce qui a été testé et mesuré
- **FVG « à gauche » v1** (entrée limite, cible = FVG à gauche, fenêtre 8 h 30-11 h 30 de Gemini) : 2010-2022, 4 934 trades, −0,070 R/trade, t −1,15 → **ÉCHEC** (`preregistration-fvg-a-gauche-2026-09-29.md`).
  Cette v1 ne reproduisait pas la méthode : fenêtre trop étroite, cible mal choisie.
- **Détection sur les 11 exemples** (aucune performance regardée) : FVG d'entrée retrouvé **11/11** ; direction du FVG le plus récent **11/11** (avec la règle de la
  partie non mangée) ; **ligne 4hr : aucune règle simple ne la choisit** (pivot H4 le plus récent 6/11 mais 1/5 hors échantillon ; le plus proche 3/11 ; le plus
  extrême sur 24 h 4/11 ; fourchette de N bougies H4 6/11 au mieux ; zigzag 5/11 ; bougie qui ouvre un FVG H4 3-6/11) ; un groupe de 3 règles retrouve la ligne dans
  8/11 mais avec plusieurs lignes possibles (≈ 4,5 alertes/jour/paire) ; **chaîne complète 6/11**. Le FVG « à gauche » existe dans la bougie H4 de sa ligne dans 10/11.
  Il y a presque toujours 4 à 13 candidats valides : **le choix est du jugement**.
- **Suivre le FVG le plus récent** (entrée au retest de la partie non mangée, sortie au retournement, sans ligne 4hr) : 2010-2022, **34 597 trades**, 17 %
  gagnants, **−0,009 R/trade, t −0,33** → **ÉCHEC** : avantage nul avant et après coûts (`preregistration-fvg-suivi-2026-09-30.md`). Elle retrouve pourtant la zone
  d'entrée de ses 11 trades (11/11) : **les entrées sont banales, ce qui distingue ses trades est la sélection** (4hr, FVG H4, résistance sur le chemin).
- Famille FVG : 9 échecs au total (limite, limite posée avant, ordre stop, « 30 min loin », v1/v2 du FVG d'Esdras, « à gauche » v1, suivi).

## La direction du FVG le plus récent est neutre (Direction du FVG valide le plus récent : le prix va-t-il dans son sens ? (hit = part des zones où le prix a bougé dans le sens du FVG ; « hasard » = ce que donnerait une direction tirée au hasard)
Paire / période / horizon | zones | hit | hasard | rendement signé (bps) | excès sur le hasard (bps) | t
US100 2010-2016 +15 min      | 16378 | 45.5 % | 49.9 % |   0.09 |   0.09 | 1.05
US100 2010-2016 +60 min      | 16226 | 47.0 % | 50.0 % |   0.08 |   0.06 | 0.34
US100 2010-2016 +240 min     | 15929 | 48.5 % | 50.2 % |   0.03 |  -0.05 | -0.15
US100 2010-2016 +1440 min    | 13129 | 50.5 % | 50.5 % |   0.18 |  -0.43 | -0.47
US100 2017-2022 +15 min      | 15758 | 48.3 % | 50.1 % |   0.00 |  -0.01 | -0.07
US100 2017-2022 +60 min      | 15241 | 49.4 % | 50.2 % |  -0.16 |  -0.19 | -0.76
US100 2017-2022 +240 min     | 15292 | 49.4 % | 50.3 % |  -0.25 |  -0.35 | -0.69
US100 2017-2022 +1440 min    | 12522 | 50.2 % | 50.5 % |   0.71 |   0.05 | 0.04
US500 2010-2016 +15 min      | 15949 | 41.8 % | 49.7 % |  -0.03 |  -0.04 | -0.55
US500 2010-2016 +60 min      | 15799 | 45.0 % | 49.9 % |   0.03 |   0.02 | 0.12
US500 2010-2016 +240 min     | 15601 | 47.7 % | 50.1 % |  -0.12 |  -0.18 | -0.56
US500 2010-2016 +1440 min    | 12825 | 50.0 % | 50.3 % |   0.39 |  -0.01 | -0.01
US500 2017-2022 +15 min      | 15333 | 46.4 % | 49.9 % |   0.02 |   0.01 | 0.13
US500 2017-2022 +60 min      | 14878 | 48.0 % | 50.1 % |   0.04 |   0.02 | 0.08
US500 2017-2022 +240 min     | 14876 | 49.1 % | 50.3 % |  -0.24 |  -0.31 | -0.75
US500 2017-2022 +1440 min    | 12192 | 49.8 % | 50.4 % |  -0.93 |  -1.28 | -1.22, 2010-2022, descriptif)
Sur les ~62 000 FVG valides de US100 et US500, le prix va **dans le sens du FVG** dans 42-48 % des cas à +15 min, 45-49 % à +1 h, 48-50 % à +4 h et 50 % à +1 jour (hasard :
≈ 50 %), et l'excès de rendement sur une direction tirée au hasard est **nul** (|t| < 1,3 partout, les deux paires, les deux moitiés). Un peu sous 50 % à court terme : après
sa formation, le prix revient souvent dans le FVG (c'est ce qui permet le remplissage de l'ordre limite). Donc la direction seule n'est **ni fausse ni prédictive** : c'est le contexte
(4hr, FVG H4, chemin) choisi par Esdras qui devrait lui donner de la valeur, s'il en a.

## La direction dans son contexte H4 (Zones analysées : 64169. Excès de rendement signé sur le hasard, en points de base (t entre parenthèses) ; signal = |t| >= 3 dans les deux moitiés, même signe.

Contexte | valeur | zones (2010-16 / 2017-22) | +1 h : 2010-16 | 2017-22 || +4 h : 2010-16 | 2017-22 || +1 j : 2010-16 | 2017-22
FVG H4 dans le même sens | oui | 15149 / 15045 | -0.03 (-0.2) | -0.34 (-1.5) || -0.88 (-2.6) | -0.71 (-1.6) || -3.96 (-4.2) | -7.70 (-6.6)
FVG H4 dans le même sens | non | 17642 / 16333 | 0.10 (0.6) | 0.14 (0.6) || 0.56 (1.7) | 0.03 (0.1) || 2.97 (3.5) | 5.81 (4.9)
4hr non balayé proche | oui | 21959 / 21379 | 0.01 (0.0) | 0.32 (1.7) || -0.15 (-0.5) | -0.34 (-0.9) || 1.08 (1.4) | -0.74 (-0.7)
4hr non balayé proche | non | 10832 / 9999 | 0.11 (0.5) | -0.96 (-2.9) || -0.01 (-0.0) | -0.30 (-0.5) || -2.82 (-2.5) | -0.32 (-0.2)
le 4hr proche ouvre un FVG H4 | oui | 5317 / 5069 | -0.45 (-1.4) | -0.53 (-1.3) || -0.22 (-0.3) | 0.30 (0.4) || 2.92 (1.8) | 9.23 (4.6)
le 4hr proche ouvre un FVG H4 | non | 27474 / 26309 | 0.14 (1.1) | -0.00 (-0.0) || -0.08 (-0.3) | -0.45 (-1.3) || -0.84 (-1.2) | -2.54 (-2.8)

Signaux (|t| >= 3 dans les deux moitiés, même signe) : 2 sur 18 cases., 2010-2022, descriptif, 3 contextes fixés d'avance)
64 169 zones. À **+1 h et +4 h** : aucun contexte ne rend la direction prédictive (|t| < 3, signes qui changent). À **+1 jour**, un seul effet : quand la zone M15 va dans le **même sens que le dernier FVG H4**,
le prix fait ensuite **moins bien** que le hasard (−4,0 et −7,7 points de base, t −4,2 et −6,6) ; quand elle va dans le sens **opposé**, mieux (+3,0 et +5,8) : le sens du dernier FVG H4 prédit un
mouvement **contraire** le lendemain (retour à la moyenne), dans les deux moitiés. **Réserves** : ces t sont gonflés (≈ 20 zones par jour partagent le même futur ; l'échantillon réellement indépendant
est de l'ordre du nombre de jours, t corrigés ≈ 1,5-2,5) ; l'horizon (1 jour) est loin de ses trades ; l'effet est l'inverse de sa croyance (« le prix continue »). Son contexte « le 4hr proche ouvre un FVG H4 »
va dans son sens à +1 jour (+2,9 et +9,2 pts de base) mais reste sous le seuil de signal. Piste éventuelle, à pré-enregistrer et tester hors échantillon (2023-2025, jamais lu pour cette idée) :
« le sens du dernier FVG H4 prédit le mouvement contraire du lendemain ».

## Reste ouvert
Mesurer le **jugement** d'Esdras en direct (Simulateur : « Oui, je le prends / Non, je laisse », journal `GET /api/sim-journal/:session`), sur au moins 100 setups,
en comparant ceux qu'il prend à ceux qu'il laisse. Ou lui faire fournir 10-15 exemples de plus, **dont des setups refusés**, pour apprendre ce qui distingue.
