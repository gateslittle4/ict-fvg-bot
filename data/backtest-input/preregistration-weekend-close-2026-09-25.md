# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Fermer les positions intraday avant le week-end

Date : 2026-09-25. Esdras veut passer le challenge FTMO 1-Step ; la simulation des départs chaque lundi (combo actuel, 0,5 %) a montré
un Silver Bullet US100 gardé du vendredi 23/01/2026 au dimanche : −9,5 R à la réouverture. Esdras : « oui » pour tester la correction.

**Déjà vu (déclaré)** :
- Nombre de trades du rejeu fidèle qui traversent un week-end (sans leur résultat total) : 379 sur 5 058 — Divergence US500 101,
  Divergence US100 89, Silver Bullet US100 74, Silver Bullet US500 40, Weekly Sweep 14, CBDR 3, NWOG 1, RSI(2) 57 (56 %).
- Quelques pertes isolées : Silver Bullet US100 −9,5 R (23/01/2026) et −3,6 R (09/05/2025) ; pires jours : 2020-03-22 (RSI(2) −9,0 R),
  2019-05-05 (Divergence US500 −6,6 R). Je sais donc que des trous du dimanche ont déjà coûté cher ; je ne connais ni le total ni les
  trades du vendredi qui auraient gagné pendant le week-end.
- Taux de réussite FTMO sans la règle (départs chaque lundi, 0,5 %) : 49 % (2011-2016), 78 % (2017-2022), 41 % (2023-2025).

## Règle (une seule)
Le vendredi, à la bougie M15 de 16:45 heure de New York (heure d'été prise en compte), toutes les positions ouvertes du combo sont
fermées au marché (achat au bid, vente à l'ask, à l'ouverture de cette bougie), et aucune nouvelle entrée du combo n'est prise jusqu'à
la réouverture du dimanche. **Exception : RSI(2) journalier** (stratégie de plusieurs jours, conçue sur les bougies journalières).
Rien d'autre ne change (mêmes signaux, mêmes stops, mêmes cibles, même netting ; la place libérée sert au signal suivant).

Calcul : `scripts/runLiveReplay.js` avec `WEEKEND_CLOSE=1` et `NO_AB=1` (comme les tranches existantes, faites sans A/B), sur les
8 mêmes tranches ; comparaison avec les tranches existantes.

## Critère (fixé avant calcul)
Mesure principale : le taux de réussite du challenge FTMO 1-Step (départ chaque lundi ; 0,5 % par trade ; +10 % = 20 R ; perte max
10 % depuis le plus haut de fin de journée ; perte du jour 3 % ; meilleur jour ≤ 50 % du gain), avec la même fonction pour les deux
versions. **Retenu** si ce taux, AVEC la règle, est supérieur ou égal à celui SANS la règle en 2011-2016 ET en 2017-2022, puis au test
2023-2025 lu une seule fois. Sinon : NON RETENU. Donné aussi (descriptif) : R total, pire trade, pire jour, par période ; 2026.

## Limites déclarées
- Jours fériés : un marché fermé le vendredi (Vendredi saint) ou fermant plus tôt n'est pas traité (la règle ne vise que 16:45 le vendredi).
- A et B ne sont pas dans les tranches ; elles ferment déjà le soir même.
- Les tranches repartent chacune d'un préchauffage de 90 jours (comme les existantes).
