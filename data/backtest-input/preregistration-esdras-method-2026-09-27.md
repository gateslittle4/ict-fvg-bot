# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : la méthode d'Esdras telle qu'il la décrit

Date : 2026-09-27. Source : ses réponses (`esdras-method-spec-draft.md`, 3 tours de questions). Rien n'a été calculé avec ces règles
avant ce texte. Marché : US100 seulement, bougies M1 (`simulate`/moteur de `scripts/lib/esdrasMethod.js`). Pour une vente, tout est
inversé.

## 1. Le sens (H4)
- **Sommet et creux H4** : une bougie H4 plus haute (ou plus basse) que sa voisine de chaque côté. Le point est connu à la fermeture de
  la bougie d'après. Il reste **intact** tant qu'aucune bougie H4 n'est allée au-delà.
- **FVG H4** : il reste **vierge** tant qu'aucune bougie H4 n'y est entrée.
- **Passage acheteur**, à la fermeture d'une bougie H4, si l'un des deux cas se produit (le cas vendeur est l'inverse) :
  - elle passe sous un creux H4 intact, mais ferme au-dessus (prise de liquidité) ;
  - elle entre dans un FVG H4 haussier vierge sans fermer sous son bas.
- **Cassure** : une fermeture H4 sous un creux intact fait passer vendeur ; une fermeture au-dessus d'un sommet intact fait passer
  acheteur. Si deux signaux contraires tombent sur la même bougie, rien ne change.
- **Durée** : le sens reste le même jusqu'au prochain signal. Il peut durer plusieurs jours.
- **Le Daily n'est pas utilisé** dans la version principale. D'après Esdras, il sert seulement à voir la tendance.

## 2. Le signal (M15)
- **BMS** : après le passage acheteur, une bougie M15 ferme au-dessus du dernier sommet M15 confirmé. Un sommet M15 est une bougie plus
  haute que ses deux voisines.
- **Le FVG** : ensuite, n'importe quel FVG M15 haussier compte, s'il remplit trois conditions :
  - la bougie D, juste après C, ne touche pas la zone ;
  - la fermeture de D a lieu après le BMS ;
  - la fermeture de D tombe entre 7 h et 11 h NY (matin), ou entre 20 h et 23 h NY (soir).

## 3. L'objectif
- C'est le niveau H4 le plus proche au-dessus du haut du FVG, parmi deux possibilités :
  - un sommet H4 intact ;
  - le bas d'un FVG H4 baissier vierge.
- **Deux niveaux « proches »** (définition prise par moi, Esdras n'avait pas de chiffre) : si le deuxième niveau est à moins de la moitié
  de la distance entrée → premier niveau, au-delà du premier, on vise le deuxième. S'il n'y a aucun niveau, pas de trade.

## 4. Entrée et stop (minimum 3R jusqu'à l'objectif)
E = haut du FVG, M = milieu du FVG, SA = sous la mèche de la bougie A.
- **Si E → SA donne au moins 3R** : un ordre limite en E, stop SA.
- **Sinon, si E → M donne au moins 3R** : un 1er ordre en E, stop M. S'il est stoppé, un 2e ordre en M, stop SA, même risque (1R), mais
  seulement si M → SA donne au moins 3R.
- **Sinon, si M → SA donne au moins 3R** : un seul ordre en M, stop SA.
- **Sinon** : pas de trade.

## 5. Gestion
- **Annulation d'un ordre non rempli** : il est annulé si l'objectif est touché avant, sinon à une heure fixe :
  - à 11 h NY pour un signal du matin ;
  - le lendemain à 7 h NY pour un signal du soir.
- **Sortie** : à l'objectif, au stop, ou au marché à 17 h NY. Pour un trade du soir, c'est 17 h le lendemain.
- **Pas de breakeven.**
- **Une chose à la fois** : un seul ordre ou une seule position. Un signal qui arrive pendant ce temps est ignoré. Le remplacement d'un
  ordre par un FVG plus récent n'est pas modélisé.
- **Au plus 3 trades remplis par jour de trading** : le 2e ordre de l'échelle compte comme un trade.
- **Risque** : 1R par trade. En pourcentage, 0,25 % du compte par trade.
- **Le trade inverse** (« retournement flagrant ») **n'est pas testé** : il n'y a pas de définition mesurable.

## 6. Les deux candidates (Esdras veut les deux)
- **C1** : sans stop suiveur.
- **C2** : stop suiveur. Chaque fois qu'un nouveau FVG M15 haussier se forme après l'entrée, le stop monte sous la mèche de sa bougie A,
  si c'est plus haut que le stop actuel.

## 7. Référence : l'apport de son sens H4
- **B0** = C1 sans le filtre de sens H4. Tout FVG M15 est pris dans son propre sens, après un BMS M15 dans ce sens, avec les mêmes
  heures, objectifs, entrées et gestion.

## 8. Vérification avant le test : l'historique d'Esdras en 2025 (données du courtier)
- Je mesure seulement la part de ses trades NAS100 qu'un ordre du programme (C1, même sens) accompagne à ±30 min de son entrée, et
  l'inverse.
- **Aucun résultat en R de 2025 n'est regardé avant l'exploration.** Cette vérification ne sert qu'à détecter un bug grossier du
  programme. Elle ne sert pas à régler quoi que ce soit.

## 9. Parcours et critères (comme la recherche de nuit)
1. **Exploration 2011-2018.** Une candidate est retenue si elle remplit toutes ces conditions :
   - au moins 60 trades, R moyen > 0, t ≥ 2 ;
   - les deux moitiés (2011-2014, 2015-2018) positives ;
   - R moyen > celui de B0.
2. **Validation 2019-2022** : lecture unique, R moyen > 0 et t ≥ 2.
3. **Final 2023-2024 + 2026** : lecture unique, R moyen > 0. L'année 2025 est donnée à part, en descriptif.

Aucun paramètre n'est ajusté entre les étapes. Si tout échoue, la conclusion est : « la méthode telle que décrite ne tient pas sur ces
données ».

## Vérification faite le 27/09, avant l'exploration (section 8, aucun R regardé)
Sur mars-juillet 2025 :
- **Programme C1** : 147 signaux, 75 trades remplis, soit environ 3 à 4 par semaine.
- **Ses trades NAS100** : 646, dont 300 dans les fenêtres 7-11 h et 20-23 h.
- **Ses trades accompagnés d'un trade C1 de même sens à ±30 min** : 22, soit 3 %. Il tradait beaucoup plus souvent.
- **Trades C1 accompagnés d'un de ses trades** : 17 sur 75, soit 23 %.
- **Sens H4 du programme identique au sens de son trade** : 57 %.

Aucun bug grossier : le programme trade à un rythme plausible, et un quart de ses trades tombent sur un trade d'Esdras. Rien n'est
modifié.
