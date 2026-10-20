# Étude de tes trades perdants réels (mars–juillet 2025) — résultat descriptif

Calculé le 2026-10-06 après `PREREG-ETUDE-PERTES-2025.md` (définitions écrites avant le calcul). **Descriptif : aucune règle jugée, aucune décision.** Trois lignes sont marquées « ajout après coup » : elles ne figuraient pas dans le pré-enregistrement et sont à lire avec plus de prudence.

## Contrôle
646 trades : 487 pertes (14 751 $ au total), 159 gains (16 062 $), résultat +1 311 $. Perte médiane : 26 $.

## 1) Les pertes sont très concentrées dans une minorité de grosses pertes
Taille mesurée en multiples de la perte médiane de ton mois.

| | Nombre | Part des pertes | $ | Part de la perte totale |
|---|---|---|---|---|
| ≥ 1,5 × la perte médiane | 108 | 22 % | 6 916 | **47 %** |
| ≥ 2 × la perte médiane | 40 | 8 % | 3 544 | **24 %** |

La plus grosse perte vaut 7 fois la perte médiane (187 $). Surtout, ces grosses pertes **ne sont pas réparties au hasard dans le temps** :

| Mois | Pertes | Dont ≥ 1,5 × | $ des grosses / perte du mois |
|---|---|---|---|
| mars | 52 | 7 | 336 / 1 331 |
| avril | 109 | **5** | 263 / 2 420 |
| mai | 120 | 31 | 1 491 / 3 178 |
| juin | 87 | 29 | 1 703 / 2 752 |
| juillet | 119 | 36 | 3 123 / 5 070 |

En avril, le mois de ton meilleur résultat, tu as eu 5 grosses pertes sur 109. De mai à juillet, 96 sur 326, et elles représentent plus de la moitié de la perte en dollars de ces trois mois (6 317 $ sur 11 000 $). Cela correspond au mois où ton résultat est clairement positif (avril) et à ceux où il ne l'est pas.

### Ajout après coup : volume plus gros ou stop plus large ?
| Mois | Volume médian | Pertes normales : volume, stop | Grosses pertes : volume, stop |
|---|---|---|---|
| mars | 0,10 | 0,10 ; 24,8 pts | 0,09 ; 52,2 pts |
| avril | 0,08 | 0,08 ; 23,2 pts | 0,15 ; 30,5 pts |
| mai | 0,15 | 0,12 ; 14,7 pts | 0,22 ; 22,2 pts |
| juin | 0,17 | 0,14 ; 12,3 pts | 0,22 ; 23,1 pts |
| juillet | 0,34 | 0,22 ; 10,2 pts | 0,42 ; 20,4 pts |

Deux évolutions se voient d'un mois à l'autre : ton **volume médian a plus que triplé** (0,08 en avril, 0,34 en juillet) et la **distance de tes pertes normales a diminué de moitié ou plus** (de 23–25 points en mars-avril à 10–15 points de mai à juillet). Parmi les 108 grosses pertes, 38 s'expliquent par un volume au moins 1,3 fois plus gros que le médian du mois, 49 par une distance de stop au moins 1,3 fois plus large, 16 par les deux, et 5 par aucun des deux.

### Ajout après coup : arithmétique pure
Si aucune perte n'avait dépassé 1,5 fois la perte médiane de son mois, la perte totale aurait été réduite de 2 128 $ (résultat : de +1 311 $ à +3 438 $) ; hors avril, de −885 $ à +1 164 $. Avec un plafond à 2 fois : 993 $ d'économie. **C'est une borne optimiste** : elle suppose que rien d'autre n'aurait changé (même moments d'entrée, mêmes gains, volume inchangé pour les gains). Ce n'est pas une prédiction et ça ne dit pas comment tenir un tel plafond.

## 2) Ce que le prix fait pendant la perte
Mesure faite avec les chandeliers M1 US100 à partir de E (ouverture de la barre d'entrée), en multiples de la distance réelle de ta perte (R en points : médiane 18 points).

| Avancée favorable maximale avant la perte | Pertes | Part | $ | Part des pertes mesurées | Durée médiane |
|---|---|---|---|---|---|
| moins de 0,25 R (jamais parti dans ton sens) | 181 | 37 % | 5 998 | 41 % | 4 min |
| 0,25 à 1 R | 157 | 32 % | 5 150 | 35 % | 7 min |
| 1 R ou plus (parti puis revenu au stop) | 149 | 31 % | 3 603 | 24 % | 36 min |

Près d'une perte sur trois est un trade qui était d'abord parti d'au moins 1 R dans ton sens avant de revenir au stop (3 603 $ de pertes). **Réserve importante** : avec un R médian de 18 points (10 points en juillet), une erreur d'alignement de 2 à 15 points entre ton courtier et le flux M1 change l'avancée de façon notable. Ces trois catégories sont approximatives, surtout pour les trades courts de mai à juillet.

## 3) Après la perte : le prix « revient »… autant que n'importe où
Sur les 4 heures suivant la clôture :

| Pertes | Retour au niveau d'entrée E | Atteint E + 3 R (ton TP à 3 R) | Perte « propre » |
|---|---|---|---|
| Toutes (487) | 85 % [82 ; 88] | 51 % [46 ; 55] | 38 % [33 ; 42] |
| Jamais parti dans ton sens (181) | 79 % [73 ; 84] | 43 % [36 ; 50] | 44 % [37 ; 51] |
| 0,25 à 1 R (157) | 85 % [78 ; 90] | 48 % [40 ; 56] | 38 % [31 ; 46] |
| Parti de 1 R ou plus (149) | 93 % [87 ; 96] | 64 % [56 ; 71] | 29 % [22 ; 37] |

**Base de comparaison** (9 740 instants tirés au hasard entre 06:00 et 16:00 NY, avec le même sens et le même R que chaque perte) : le prix atteint +1 R en 4 h dans **84 %** des cas et +4 R dans **51 %**. Après tes pertes : 85 % et 51 %. **C'est identique.** Une sensibilité ajoutée après coup (mesures faites depuis le prix M1 de la minute de clôture, comme la base) donne 85 % et 52 %.

Cela répond à la question que tu avais posée au début : « le stop est touché, puis le prix part dans le sens prévu et ne revient jamais ». Dans tes données, le prix atteint le niveau de ton TP à 3 R dans la moitié des cas après la perte, mais **exactement comme il le fait n'importe quand dans la séance** : rien ne montre que tes stops soient chassés ou placés à un endroit particulièrement mauvais. La raison est mécanique : avec un R de 10 à 20 points, le prix bouge de plus de 4 R en 4 heures une fois sur deux. Un stop aussi court est dans le bruit normal du marché.

Le groupe « parti de 1 R ou plus » est plus haut (64 % contre 51 % pour la base). Ce n'est pas lisible comme un signal : un trade qui part vite de 1 R se produit surtout quand la volatilité est forte, et dans ces moments le prix aurait de toute façon bougé plus loin, et la base ne tient pas compte de la volatilité. C'est un seul groupe sur quatre.

## Ce que ça veut dire
1. **La plus grosse piste dans les pertes est la taille, pas l'endroit du stop.** 22 % de tes pertes font 47 % de la perte totale, presque toutes de mai à juillet, après que le volume a été multiplié par 2 à 4 et que les distances de stop ont diminué. Avril, ton meilleur mois, est aussi le mois le plus calme sur ces deux points. C'est une observation sur 5 mois, pas une preuve de cause : en mai–juillet, les conditions de marché ont aussi pu changer.
2. **Rien ne montre que tes stops sont chassés.** Après une perte, le prix fait ce qu'il fait n'importe quand.
3. **Environ un tiers des pertes est parti d'au moins 1 R dans ton sens** (mesure approximative) : ce sont des trades gagnants un moment, puis rendus. Ce n'est pas une règle ; c'est un point à examiner à la main (que s'est-il passé à ce moment-là : TP trop loin, trade laissé ouvert ?).
4. Ce que cette étude ne peut pas dire : pourquoi tu as pris les décisions de taille et de stop de mai à juillet, ni ce qui aurait été gagnant avec des règles différentes.

## Pistes (à écrire et juger à part, sur d'autres données)
Elles ne sont pas des règles : un plafond de perte par trade (en dollars ou en multiple de la perte du mois), un volume fixe, une distance de stop minimale. Pour être jugées honnêtement, il faudrait les écrire avant, puis les suivre sur de nouveaux trades (tableau du matin) : les 646 trades de 2025 ont servi à les trouver, ils ne peuvent plus les valider.

## Réserves
- Chandeliers M1 d'un autre flux que ton courtier : écart médian de 2,3 points sur l'entrée, 90 % des trades sous 15 points. Les mesures en points sont approximatives, surtout pour les trades courts.
- Je ne sais pas si chaque sortie est un stop ou une sortie manuelle.
- Cinq mois, un seul régime de marché, un seul compte.
- La base de comparaison ne tient pas compte de la volatilité du moment.

## Reproduction
`node scripts/analysePertes.mjs data` (≈ 2 s ; lit `real-trades-2025.csv` et `real-m1-full/US100.csv.gz`). Tests : `node --test scripts/analysePertes.test.mjs` (5 tests : conversion de l'heure de New York avec heure d'été, avancée favorable, mesures après la perte, base de comparaison, intervalle de Wilson et graine). Dépend de `scripts/analyseMesTrades.mjs`.
