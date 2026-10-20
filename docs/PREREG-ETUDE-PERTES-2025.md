# Définitions — étude de tes trades perdants réels (mars–juillet 2025)

Écrit le 2026-10-06, AVANT tout calcul de cette étude. **Descriptif seulement** : aucun critère de réussite, aucune règle jugée, aucune décision. Les définitions ci-dessous sont figées ; ce que je constate d'autre en cours de route sera signalé comme ajouté après coup.

## Question de Krystofia
« La seule chose que je peux faire, c'est étudier les pertes. » Que se passe-t-il dans tes pertes : sont-elles trop grosses, le prix part-il dans ton sens puis revient-il, ou le stop est-il touché puis le prix finit-il par aller où tu l'avais prévu ?

## Données
- `data/real-trades-2025.csv` : 646 trades, ouverture/clôture en heure de New York, prix d'ouverture et de clôture, sens, volume, profit en dollars.
- Chandeliers M1 US100 (`data/real-m1-full/US100.csv.gz`) pour reconstituer le chemin du prix. Ce n'est pas le flux de ton courtier (NAS100.x) : un contrôle d'alignement fait avant le calcul donne un écart médian de 2,3 points entre ton prix d'entrée et la barre M1 de la minute d'entrée, et un écart de 15 points ou moins pour 90 % des trades. Les mesures en points sont donc approximatives (quelques points), ce qui compte pour de petits mouvements.

## Définitions
- **Perte** : profit en dollars < 0.
- **R du trade** = distance réelle entre ton prix d'entrée et ton prix de sortie, en points. On ne sait pas si la sortie est un stop ou une sortie manuelle : « stop » veut dire ici « la sortie qui a produit la perte ».
- **Taille de la perte** : perte en dollars divisée par la perte médiane du mois (comme dans l'analyse précédente). On compte les pertes ≥ 1,5 fois et ≥ 2 fois cette perte médiane, et la part de la perte totale en dollars qu'elles représentent.
- **Référence d'entrée E** : ouverture de la barre M1 de la minute d'ouverture du trade (on mesure les mouvements à partir de E pour absorber l'écart avec le flux du courtier).
- **Avancée favorable maximale (AFM)** : de la minute d'ouverture à la minute de clôture, plus grand mouvement dans ton sens à partir de E, en multiples du R du trade. Catégories : moins de 0,25 R (« jamais parti dans ton sens »), de 0,25 à 1 R, 1 R ou plus (« parti d'au moins 1 R puis revenu au stop »).
- **Après la perte** : dans les 4 heures qui suivent la minute de clôture, à partir du niveau de sortie S = E − sens × R : le prix atteint-il **E** (retour au niveau d'entrée) ? le prix atteint-il **E + sens × 3 R** (ce que ton trade visait avec un TP à 3 R) ? Si le prix touche les deux niveaux dans la même barre, on compte les deux.
- **Perte « propre »** : après la perte, le prix s'éloigne d'au moins 2 R de plus dans le mauvais sens (E − sens × 3 R) avant de revenir à E, ou ne revient jamais à E en 4 h.
- **Base de comparaison** : le prix revient souvent à un niveau proche par hasard. Pour chaque perte, je prends 20 instants tirés au hasard (même graine pour tout le calcul), entre 06:00 et 16:00 NY, un jour de bourse, de mars à juillet 2025, avec le même sens et le même R, et je mesure la même chose : partant de l'instant tiré, le prix atteint-il + sens × R (équivalent de « retour à E ») et + sens × 4 R (équivalent de « atteint la cible de 3 R depuis E ») dans les 4 heures ? On compare la part observée dans tes pertes à celle de la base.
- Intervalles : IC à 95 % de Wilson pour les parts observées.

## Ce que je ne ferai pas
Pas de règle (« déplacer le stop à l'entrée », « stop plus large », « ne plus trader à telle heure ») : si une piste sort, elle sera notée comme piste, à écrire et à juger séparément sur d'autres données. Pas de lien avec F2.

## Réserves prévues
- Les données M1 ne sont pas celles de ton courtier : les mouvements de quelques points sont incertains.
- On ne sait pas pourquoi chaque trade a été fermé (stop, TP manuel, fermeture de peur) : des pertes peuvent être des sorties manuelles.
- Beaucoup de sorties sont rapides (moins de 5 minutes) : les barres M1 sont grossières à cette échelle (l'ordre des extrêmes dans une barre est inconnu).
- Cinq mois, un seul régime de marché.
