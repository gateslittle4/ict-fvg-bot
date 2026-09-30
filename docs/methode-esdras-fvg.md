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

## Reste ouvert
Mesurer le **jugement** d'Esdras en direct (Simulateur : « Oui, je le prends / Non, je laisse », journal `GET /api/sim-journal/:session`), sur au moins 100 setups,
en comparant ceux qu'il prend à ceux qu'il laisse. Ou lui faire fournir 10-15 exemples de plus, **dont des setups refusés**, pour apprendre ce qui distingue.
