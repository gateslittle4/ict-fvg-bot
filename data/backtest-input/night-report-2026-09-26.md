# Recherche de nuit du 26/09/2026 — rapport pour Esdras

Demande (avant de dormir) : « si tu n'as rien trouvé, explore des pistes secondaires, ensuite laisse des années pour des tests fast
forward pour ne pas voir toutes les années […] teste tout ce qui peut l'être ». Question de départ : « le robot ne peut pas copier ça ?
ces trades (les FVG du 23 et du 24/09) viennent d'apparaître cette semaine ».

## En une phrase
Environ 2 160 variantes explorées sur 2011-2018 ; 11 règles sont sorties de la sélection ; **aucune n'a tenu sur 2019-2022**, lu une
seule fois ; **2023-2026 n'a jamais été regardé** et reste intact pour la prochaine vraie hypothèse.

## Le protocole (commité avant tout calcul : `preregistration-nuit-2026-09-26.md`, `2708c32`)
| Bloc | Années | Usage |
|---|---|---|
| Exploration | 2011-2018 | libre ; le code coupe les données au 31/12/2018 avant tout calcul |
| Validation (cachée) | 2019-2022 | une seule lecture, règles figées et commitées avant (`18d04a9`, `fa2a5dd`) ; passe si R moyen > 0 et t ≥ 2 |
| Final (caché) | 2023-2024 + 2026 | une seule lecture, seulement pour ce qui passe la validation → **pas lu : rien n'a passé** |

Trois amendements, tous écrits avant la lecture cachée qu'ils concernent :
- le **placebo** devient obligatoire pour les règles FVG ;
- la piste « limite au creux » est ajoutée ;
- le second tour est réglé en M1.

Deux corrections de méthode ont aussi été faites pendant l'exploration :
- les ordres limite FVG sont mis en concurrence (le premier rempli gagne) ;
- la « 2e place » de l'écart d'ouverture doit être un autre marché.

## 1. Ton œil : ce qui distingue les FVG que tu prenais (2025, données personnelles hors du dépôt)
- **Le jeu de départ.**
  - Sur tes 646 trades NAS100, 149 étaient près d'un FVG M15 « vieilli » (5-24 bougies), pour +4 062 $.
  - Dans ta fenêtre active, entre 3 h et 11 h NY, il y a eu 180 FVG vieillis de ce type ; **tu en as pris 54 (30 %)**.
- **Ce qui les distingue** (modèle de tes choix, AUC 0,72 dans l'échantillon) :
  - tu prenais les plus jeunes (≈ 7 bougies contre 10) ;
  - dans le sens de la tendance 20 jours ;
  - avec les 4 dernières heures en ta faveur ;
  - quand le prix n'était pas parti trop loin ;
  - plutôt juste au-dessus de la zone qu'à l'intérieur ;
  - souvent après la prise du plus bas (ou du plus haut) de la veille.
- **Avec une sortie mécanique identique pour tous** (stop 1 ATR H1, 3R, 4 h) :
  - tes FVG choisis font +0,144 R par trade ;
  - ceux que tu as laissés font −0,018 R ;
  - l'écart est de +0,16 R, mais l'intervalle à 90 % va de −0,19 à +0,62 : **encourageant, pas prouvé** (seulement 54 cas).
- **Ton œil modélisé, appliqué mécaniquement sur US100 en 2011-2018** (des années que tu n'as jamais tradées) : +0,04 à +0,05 R par
  trade, t ≈ 1,0-1,4. C'est positif, mais pas assez pour être retenu.

## 2. Le FVG ou le hasard ? (placebo, 2011-2018, `night-explore-fvg-placebo.md`)
Le placebo déplace chaque opportunité de 1 à 6 bougies au hasard, en gardant la même distance au prix et la même gestion.
- **FVG « frais » avec ordre limite au bord** :
  - la vraie règle fait ≈ 0 (−0,03 à +0,05 R) sur US100, US500 et l'or ;
  - le placebo fait mieux 20 fois sur 20 (+0,05 à +0,18 R).
  - Le niveau du FVG n'apporte rien. Un seul ordre par jour posé à heure fixe ne gagne pas non plus : ce qui paie dans le placebo,
    c'est d'être juste après une impulsion (momentum), pas le FVG.
- **FVG vieilli (5-12 bougies) à l'ouverture de New York (9 h 30-11 h)** :
  - il bat toujours son placebo (0 fois sur 20) : le moment choisi par le FVG vaut mieux que le hasard ;
  - mais il n'est positif que sur US100 en 2011-2018 (+0,13 à +0,16 R), et cela disparaît sur 2019-2022 (voir 3) ;
  - sur US500 et l'or, il fait ≈ 0.

## 3. Les 11 règles figées
Explorées sur 2011-2018 (t ≥ 2, deux moitiés positives, placebo battu), puis lues une fois sur 2019-2022 :

| Id | Marché | Règle | 2011-2018 | 2019-2022 (une lecture) | Verdict |
|---|---|---|---|---|---|
| A1 | US100 | FVG vieilli 9 h 30-11 h, 4 h en faveur, stop derrière la zone, 3R | +0,163 R, t 2,49 | −0,079 R, t −1,00 | rejetée |
| A2 | XAUUSD | FVG vieilli 3 h-9 h 30, tendance 20 j, stop 1 ATR, 2R | +0,083 R, t 2,41 | +0,026 R, t 0,53 | rejetée |
| B1 | US100 | A1 sans le filtre 4 h | +0,133 R, t 2,26 | −0,095 R, t −1,31 | rejetée |
| C1 | US100 | B1 + réentrée après un stop (tes réentrées gagnaient) | +0,162 R, t 2,94 | −0,078 R, t −1,15 | rejetée |
| C2 | US100 | A1 + réentrée | +0,172 R, t 2,79 | −0,095 R, t −1,29 | rejetée |
| D1a | US100 | Achat après un recul de 0,25 ATR, la nuit (18 h-3 h) | +0,066 R, t 4,18 | +0,017 R, t 0,75 | rejetée |
| D1b | US100 | Achat après un recul de 0,5 ATR, 3 h-9 h 30 | +0,047 R, t 3,68 | −0,016 R, t −0,82 | rejetée |
| D2a | US100 | Écart d'ouverture 9 h 30 ≥ 0,5 ATR : pari qu'il se referme | +0,141 R, t 3,48 | +0,078 R, t 1,50 | rejetée (la plus proche) |
| D3a | US100 | Lundi : achat 9 h 31 → 16 h | +0,380 R, t 2,94 | +0,307 R, t 1,80 | rejetée (positive) |
| D3b | US100 | Mardi : achat 9 h 31 → 16 h | +0,390 R, t 2,60 | −0,093 R, t −0,65 | rejetée |
| Labo | US100 | Weekly Liquidity Sweep (seule des 22 stratégies du Labo à tenir) | +0,209 R, t 2,31 | −0,007 R, t −0,06 | rejetée |

Si aucune de ces règles ne valait rien, il y avait environ 20 % de chances qu'une passe par hasard. Aucune n'a passé.

## 4. Ce qu'on apprend
1. **Le robot peut copier une règle, pas encore ton choix.**
   - Chaque FVG que tu m'as montré (23/09, 24/09) a été écrit en règles et testé.
   - Le robot prend alors TOUS les FVG qui leur ressemblent, sur 13 ans ; ça ne tient pas.
   - Même le modèle de tes choix, appliqué mécaniquement, ne donne qu'un petit avantage non prouvé.
   - Des exemples gagnants d'une semaine ne prouvent pas une règle : il faut aussi voir ceux que tu aurais laissés passer.
2. **2011-2018 et 2019-2022 ne se ressemblent pas** pour ces règles intrajournalières : tout ce qui marchait au matin de New York
   entre 2011 et 2018 s'est éteint ensuite.
3. **Deux pièges de backtest trouvés cette nuit** :
   - Un ordre limite posé loin du prix paraît très rentable si le test garde « le premier ordre posé qui finit par se remplir ». Il
     ne l'est plus quand les ordres sont en concurrence ou renouvelés chaque quart d'heure, ce que ferait un vrai bot.
   - **Le Labo du site est faux pour certaines stratégies** : ses moteurs ne vérifient pas le stop dans la bougie d'entrée.
     Anchored VWAP y paraît très gagnante (+1,64 R par trade au règlement M15) ; elle perd −0,31 R au règlement M1.

## 5. Suite proposée (décisions d'Esdras)
1. **Mesurer ton œil pour de vrai (exercice à l'aveugle)** :
   - Environ 150 à 200 FVG vieillis tirés au hasard dans des années que tu n'as pas tradées, le graphique coupé au moment de décider.
   - Tu réponds « je prends » ou « je ne prends pas ».
   - Si tes « oui » battent tes « non », on écrit ce qui les distingue, on le pré-enregistre, et on le teste une fois sur 2023-2026,
     gardé intact exprès.
2. **Mode discipline, faisable tout de suite** : ton compte n'a pas été perdu à cause des FVG, mais de la gestion (taille passée de
   0,08 à 0,34 lot, trades entre 11 h et 18 h, perte journalière). Le robot peut imposer :
   - un risque fixe ;
   - rien après 11 h ;
   - un arrêt pour la journée ;
   - un nombre maximal de trades.
   Toi, tu choisis les FVG.
3. **Corriger le Labo du site** : vérifier le stop dans la bougie d'entrée, ou rejouer ses trades en M1.
4. À surveiller sans argent (rejetées, mais positives sur les deux périodes) : l'écart d'ouverture de 9 h 30 et l'achat du lundi, sur
   US100.

Fichiers :
- exploration et sélection : `night-explore-fvg.md`, `night-explore-fvg-placebo.md`, `night-select-fvg.md`,
  `night-explore-manage.md`, `night-explore-quant.md`, `night-lab-explore.md` (et `-m15.md`) ;
- règles figées et lectures cachées : `night-frozen-rules.json`, `night-lab-frozen.json`, `night-validation.md`,
  `night-lab-validation.md`.

## Suite décidée (26/09, matin)
Esdras : « 1 okay ; 2 possible mais je n'ai plus de temps pour trader ». Le mode discipline tombe. L'exercice à l'aveugle devient le
moyen de savoir si son œil peut être écrit en règles pour un robot 100 % autonome.
- **Le jeu de cas** : `scripts/buildBlindSetups.js` tire 200 FVG M15 US100 de 2011-2018 (tous âges de 0 à 24 bougies, 3 h-11 h NY, un
  par jour), dates cachées. Les pages lisent `data/blind/setups.json`.
- **Les résultats mécaniques** sont calculés à part (`blind-outcomes.json`) et ne sont jamais montrés. Moyenne de tous les cas :
  +0,099 R (stop 1 ATR, 3R, sortie 11 h).
- **La page** : artifact https://claude.ai/artifact/778pZta9Q3BGw3LcxggAGE. Les réponses vont dans sa base, collection `answers`
  (id du cas → `take`, `reasons`).
- **Critère d'analyse** (à pré-enregistrer avant de lire ses réponses) : ses « je prends » comparés à ses « je laisse » sur le même
  résultat mécanique.

**Version 2 de l'exercice (26/09, remarques d'Esdras)** :
- FVG âgé d'au moins 30 minutes (« pour qu'il soit viable »). Dans la v1, 3 cas sur 4 étaient des FVG tout juste formés, dont ses 7
  premières réponses : elles sont écartées.
- Le FVG doit être formé dans la fenêtre horaire. Avant, ceux de la nuit s'entassaient à 3 h.
- 200 cas le matin (3 h-11 h NY, `m001`…) et 100 le soir (19 h-23 h NY, ses heures du soir d'après ses trades, `e001`…).
- Graphiques dézoomés : 40 h en M15, 7 jours en H4, avec de l'espace à droite.
- Moyenne mécanique des 300 cas : +0,05 R.

**Version 3 de l'exercice (26/09, règle confirmée par Esdras sur le schéma `data/blind/regle-fvg.html`)** :
- **La règle** : la bougie C forme le FVG, la bougie D se ferme sans toucher la zone, et le prix n'y entre qu'à partir de E.
- **Le cas montré** : graphique arrêté à la fermeture de D ; question « poses-tu ton ordre ? ».
- **Le résultat mécanique**, calculé à part :
  - limite au bord proche de la zone ;
  - stop sous la zone, ou sous la mèche de la bougie A ;
  - objectif 2, 3 ou 4R, ordre annulé si l'objectif est touché avant ;
  - sortie à 11 h NY le matin, 3 h NY le soir.
- **Les 300 cas** : 200 le matin (`a001`…) et 100 le soir (`b001`…).
- **Moyenne sur tous les cas, à 3R** : −0,134 R avec le stop sous la zone (88 ordres remplis) ; +0,007 R avec le stop sous la mèche
  (188 remplis). C'est la référence que ses choix devront battre.

## Sa lecture H4, mesurée (26/09, exploration 2011-2018, descriptif)
Idée d'Esdras : « quand le prix touche un FVG H4, il le remplit à moitié ou en entier, puis il repart ».
- **Remplissage** (`scripts/runH4FvgFillCheck.js`), en comparant à des zones fictives de même taille posées au hasard :
  - US100 : moitié 65 % (hasard 64 %), fond 48 % (hasard 49 %) ;
  - US500 : 62 % contre 66 %, et 46 % contre 50 % ;
  - or : 66 % contre 65 %, et 50 % contre 49 %.
- **Rebond après remplissage** (`scripts/runH4FvgBounceCheck.js`), course +1 zone contre −1 zone :
  - US100 : 47 % contre 46-47 % au hasard ;
  - US500 : 49-51 % contre 49-50 % ;
  - or : 48 % contre 46-47 %.
  À 2 zones contre 1 : 32-35 % contre 31-34 %.
- **Conclusion** : c'est de la géométrie, pas un effet du FVG H4. Le prix fait la même chose avec une zone quelconque.

## Ses « jamais » et ses cibles, mesurés (26/09, exploration 2011-2018, descriptif)
Tous ces tests suivent sa règle v3, stop sous la mèche de A. Les résultats sont en R moyen par trade.
- **Heure de formation du FVG** (`scripts/runFvgHourWindowsCheck.js`) :
  - 4 h-6 h NY : −0,10 R sur US100, −0,08 R sur US500. Ce sont les pires, et il les laissait passer : bon filtre.
  - 6 h-11 h : −0,01 R et +0,03 R.
  - soir : 0,00 R et −0,05 R.
  - ouverture de NY (1 h) : +0,03 R et +0,04 R.
  - aucune tranche horaire n'est gagnante à elle seule.
- **FVG M15 non comblé comme cible** (`scripts/runM15FvgMagnetCheck.js`) :
  - avec une cible devant, à 3R : ≈ 0, comme sans cible ;
  - objectif posé sur ce FVG : atteint 21 % des fois contre 16 % pour le même objectif en R sans FVG sur US100 (18 % contre 16 % sur
    US500). Il y a un léger effet d'aimant, mais ≈ +0,04 R par trade sur US100 et −0,04 R sur US500 : pas d'argent à la clé.
- **« Si le FVG d'avant a marché, le suivant dans le même sens aussi »** (`scripts/runFvgPreviousWinnerCheck.js`). Le précédent est le
  dernier FVG du même sens, décidé dans les 5 h d'avant et déjà terminé. Résultats du FVG suivant :
  - US100 : après un gagnant −0,050 R, après un perdant −0,051 R ;
  - US500 : après un gagnant −0,122 R, après un perdant −0,052 R.
  Aucun effet : un FVG gagnant n'annonce pas le suivant.
- **« Le premier ou le deuxième FVG de la séance »** (`scripts/runFvgRankCheck.js`, séances matin 3 h-11 h et soir 18 h-23 h NY,
  rang compté dans la séance ou dans le même sens) :
  - aucun rang n'est gagnant ;
  - le 1er FVG du matin sur US100 fait −0,09 R, le 2e −0,03 R ;
  - dans le même sens, le 2e fait −0,09 R ;
  - le seul rang un peu positif (4e et + le soir sur US100, +0,06 à +0,09 R, t ≤ 1) est du bruit.
