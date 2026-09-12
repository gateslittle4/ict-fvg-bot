# US100 multi-contact — avant déploiement : stop/target, streaks, pyramide, risque fixe vs dynamique

Question directe d'Esdras (2026-09-12) avant tout déploiement du multi-contact US100 (`MultiTouchFvgEngine`, validé plus tôt ce soir, toujours pas déployé) : "où va tu mettre le stop loss, le tp, combien de RR, est-ce que c'est fixe ou flexible ? Compare fixe et dynamique, compare le nombre de trades gagnants suivis vs perdants suivis, compare aussi pyramidal vs non pyramidal et compare aussi risque fixe vs dynamique selon qu'on perde ou gagne." Les 4 sections ci-dessous tournent sur EXACTEMENT la même séquence de trades (multi-contact US100, config production verbatim, net de coûts), pour rester comparables entre elles. Chaque chiffre est accompagné d'au moins un exemple RÉEL tiré des données (pas un cas inventé), pour que le mécanisme se comprenne sans avoir à relire le code.

## 1. Mécanique stop/target

- **Entrée** : bord de la zone FVG (ordre LIMIT posé au bord du gap, le prix de ré-entrée classique ICT), jamais le prix de marché au moment du signal.
- **Stop** : mode `fvg-edge` — le bord OPPOSÉ de la zone, avec une marge de 10% de la hauteur de la zone au-delà (`computeStop()`, backtestEngine.js) pour éviter d'être sorti par une simple mèche qui revient tester exactement le bord.
- **Target** : entrée + RR × distance(entrée, stop), avec RR = **5** (valeur production actuelle, lue directement depuis `CONFIG.fvg.perSymbol.US100` — ce n'était pas toujours 5 : voir "Cible étendue (1:4/1:5)" plus haut dans ce fichier, où ce paramètre a été monté depuis 1:3 après validation séparée).
- **Fixe ou flexible** : **FIXE**. Les trois niveaux (entrée, stop, target) sont posés une seule fois, au moment où le signal est validé, et ne bougent plus JAMAIS ensuite - pas de trailing stop, pas de mise à breakeven, pas de sortie anticipée sur un simple retournement de mèche. Le trade ne peut se terminer que de 3 façons : le stop est touché (perte), le target est touché (gain), ou il expire après 480 bougies sans avoir touché ni l'un ni l'autre (`maxHoldingCandles`, compté séparément comme "timeout", ni gagnant ni perdant dans les statistiques).

**Exemple réel** (un trade pris tel quel dans les données, pour rendre ça concret) :

Le 2019-03-29 09:45, un FVG haussier valide un signal achat à 7342.36. Le stop est posé à 7336.86 (distance = 5.50 points), le target à 7369.86 (soit 27.50 points plus loin que l'entrée, 5× la distance du stop). Résultat : target touché, +4.82R, sortie le 2019-03-29 10:30.

## 2. Streaks (trades gagnants/perdants d'affilée), période complète 2019-2025

n = 273 trades (train + test, multi-contact, SANS pyramide - la pyramide change les R mais pas le nombre de trades gagnants/perdants d'affilée, donc ces chiffres restent valables avec ou sans pyramide).

| | Max d'affilée | Moyenne par série | Nombre de séries |
|---|---|---|---|
| Gagnants | 7 | 1.8 | 60 |
| Perdants | 10 | 2.7 | 61 |

Distribution des séries de pertes : `{"1":20,"2":17,"3":7,"4":6,"5":6,"6":2,"7":1,"9":1,"10":1}` (longueur → nombre de fois observée). Lecture : 20 fois une perte isolée, 17 fois 2 pertes d'affilée, ... jusqu'à 10 fois d'affilée, observé une seule fois en 273 trades.

**La pire série concrètement** : 10 pertes d'affilée entre le 2022-06-17 09:30 et le 2022-07-28 10:00, pour un total de -10.86R perdus sur cette série (à 0.5% de risque fixe/trade, ça correspond à environ 5.4% du compte perdu d'affilée - voir section 4 pour comment le sizing dynamique aurait amorti cette série précise).

## 3. Pyramidal (l'idée d'Esdras : ajouter une 2e unité sur les trades qui bougent en notre faveur) vs non pyramidal

**Le principe, en clair** : dans le mode testé ici (`runBacktestPyramidIndependentStops`, backtestEngine.js), dès que le prix a bougé d'1× la distance du stop (1×D) EN NOTRE FAVEUR par rapport à l'entrée originale, une **2e unité, de même taille**, est ajoutée à ce nouveau prix. Cette 2e unité a SON PROPRE stop, posé exactement 1×D en dessous d'elle (au-dessus pour une vente) - ce qui, par pure géométrie, atterrit exactement sur le prix d'entrée ORIGINAL. Elle vise le MÊME target que l'unité originale. **Point clé, et c'est ce qui distingue cette version d'un pyramidage "classique"** : le stop de l'unité ORIGINALE n'est JAMAIS déplacé, jamais mis à breakeven, jamais touché par l'ajout de la 2e unité. Les deux unités vivent leur vie chacune de son côté jusqu'à ce que les DEUX soient closes (stop, target, ou timeout) ; le trade combiné n'est comptabilisé qu'une fois les deux résolues, et son R combiné est la somme des deux R individuels.

**Pourquoi ça vaut mieux qu'un pyramidage "stop partagé"** (l'autre version testée plus tôt dans ce projet, voir `runBacktestManaged` mode `'pyramid'`, rejetée) : dans cette version-là, le stop des DEUX unités saute au prix d'entrée original dès que la 2e unité est ajoutée - donc si le prix revient jusqu'à ce niveau, TOUT le trade ferme là, y compris l'unité originale, qui dans le scénario "sans pyramide" aurait gardé son stop large et serait restée ouverte, libre de repartir et d'atteindre son target plus tard. Avec des stops indépendants, seule la 2e unité (qui n'aurait de toute façon pas existé sans le mouvement favorable) est perdue dans ce cas - l'unité originale continue comme si de rien n'était.

**Les 3 façons dont un trade pyramidé peut finir**, sur les 2019-2025 combinés :

| Résultat | Nombre de fois | Explication |
|---|---|---|
| Les deux unités touchent le target | 27 | Meilleur cas : 5R (originale) + (5R - 1×D de retard) ≈ 9R combiné |
| L'unité ajoutée perd, l'originale touche quand même le target | 11 | Le prix redescend une fois jusqu'au point d'ajout (stop de la 2e unité) puis REPART et atteint le target original |
| Les deux unités perdent | 23 | Le prix redescend jusqu'au stop de l'unité originale (donc passe forcément par le stop de la 2e unité avant) |
| L'originale perd, l'unité ajoutée gagne | 0 | **N'arrive jamais** — voir explication ci-dessous |

**Pourquoi "l'originale perd mais l'ajout gagne" n'arrive jamais** : c'est une conséquence géométrique, pas un hasard de l'échantillon. Le stop de la 2e unité est exactement au prix d'entrée ORIGINAL - entre le prix d'entrée et le stop original (plus loin, dans le sens défavorable). Pour que l'unité originale perde, le prix doit descendre jusqu'à SON stop, ce qui veut dire qu'il doit obligatoirement traverser d'abord le prix d'entrée original - donc déclencher le stop de la 2e unité EN PREMIER. Autrement dit : dès que l'unité originale finit par perdre, l'unité ajoutée a déjà perdu avant elle, sur le chemin. "Perte-gain" est donc structurellement impossible avec ce design ; seuls gain-gain, gain-perte et perte-perte existent.

**Trois exemples réels, un par catégorie** :

**Gain-gain** (achat, 2019-03-29 09:45 → 2019-03-29 10:30) :
  - Unité originale : entrée 7342.36, stop 7336.86, target 7369.86 (distance D = 5.50).
  - Prix atteint +1×D en faveur → 2e unité ajoutée : entrée 7347.86, stop propre 7342.36 (= l'entrée originale, par géométrie), même target que l'unité originale.
  - Résultat : **+8.82R combiné** (unité originale : win).

**Gain (original) malgré la perte de l'unité ajoutée** (achat, 2019-04-03 09:30 → 2019-04-03 10:15) :
  - Unité originale : entrée 7529.97, stop 7525.34, target 7553.12 (distance D = 4.63).
  - Prix atteint +1×D en faveur → 2e unité ajoutée : entrée 7534.60, stop propre 7529.97 (= l'entrée originale, par géométrie), même target que l'unité originale.
  - Résultat : **+3.78R combiné** (unité originale : win).

**Perte-perte** (achat, 2019-02-26 10:45 → 2019-02-27 01:30) :
  - Unité originale : entrée 7102.36, stop 7092.90, target 7149.66 (distance D = 9.46).
  - Prix atteint +1×D en faveur → 2e unité ajoutée : entrée 7111.82, stop propre 7102.36 (= l'entrée originale, par géométrie), même target que l'unité originale.
  - Résultat : **-2.11R combiné** (unité originale : loss).

**Impact sur les statistiques globales** :

| Période | Mode | Trades | Espérance (R) | R total | Drawdown max (R) | Trades pyramidés |
|---|---|---|---|---|---|---|
| Train | sans pyramide | 180 | 1.10 | 198.45 | 10.86 | — |
| Train | **avec pyramide** | 180 | 1.33 | 239.45 | 11.33 | 44 |
| Test | sans pyramide | 93 | 1.40 | 130.65 | 6.82 | — |
| Test | **avec pyramide** | 93 | 1.76 | 163.65 | 7.82 | 17 |

Sur 180 trades en train, 44 ont reçu une 2e unité (soit 24% des trades) ; 17 sur 93 en test (18%). Gain en R total : **21%** en train, **25%** en test. Coût : drawdown max en R légèrement plus haut (6.82R → 7.82R en test) - logique, puisque le sizing total déployé grimpe temporairement pendant les trades pyramidés, même si l'unité originale ne risque jamais plus que ses 1× prévus.

## 4. Risque fixe vs risque dynamique (réduit après pertes consécutives)

**Règle testée** : 0.5% de risque par trade normalement, réduit à 0.25% (la moitié) dès que 2 pertes consécutives se sont produites, restauré à 0.5% dès le trade suivant s'il gagne. Appliqué à la MÊME séquence de trades multi-contact (sans pyramide, pour isoler l'effet du sizing seul) - seule la taille de position change, jamais la sélection des trades ni leur résultat individuel (win/loss/R restent identiques). Croissance composée : chaque trade risque un % du capital COURANT, pas du capital de départ, comme un vrai compte de trading.

| Période | Mode | Compte final | Drawdown max | Risque moyen réel |
|---|---|---|---|---|
| Train | fixe | 164.1% | 5.3% | 0.50% |
| Train | **dynamique** | 119.0% | 3.2% | 0.40% |
| Test | fixe | 89.8% | 3.4% | 0.50% |
| Test | **dynamique** | 70.5% | 2.4% | 0.42% |

**Ce n'est pas un gain gratuit** : réduire le risque après 2 pertes réduit bien le drawdown max (train 5.3% → 3.2%, test 3.4% → 2.4%), mais coûte de la croissance totale du compte (train 164.1% → 119.0%, test 89.8% → 70.5%), puisque le sizing réduit s'applique aussi aux trades qui, après coup, se révèlent gagnants juste après une série de pertes - le sizing dynamique ne peut pas savoir à l'avance qu'une série va s'arrêter, donc il réduit systématiquement, y compris juste avant un rebond.

**Sur la pire série de pertes trouvée en section 2** (10 pertes d'affilée, 2022-06-17 09:30 → 2022-07-28 10:00), en isolant juste cette série : le compte tombe à -5.3% en fixe contre seulement -3.2% en dynamique - c'est précisément le genre de série que la réduction de risque est censée amortir, et elle le fait.
