# Pré-enregistrement — suivi d'un plafond de perte de 40 $ par trade (100 trades)

Écrit le 2026-10-06, AVANT le début du suivi. La règle et le montant sont ceux de Krystofia ; je ne valide aucun trade à sa place : je mesure ce qui s'est passé. Fait suite à `RESULTAT-ETUDE-PERTES-2025.md`.

## Pourquoi cette règle
Dans tes 646 trades de 2025, 22 % des pertes (celles de 1,5 fois la perte médiane ou plus) font 47 % de la perte totale, presque toutes de mai à juillet, quand le volume a plus que triplé et que les stops sont passés de 23–25 à 10–15 points. Les 646 trades ont servi à trouver cette piste : ils ne peuvent pas la valider. Seul un suivi sur de nouveaux trades le peut.

## La règle (une seule, figée)
**Aucun trade ne perd plus de 40 $.** Tu règles le volume et/ou le stop avant l'entrée pour que la perte au stop soit d'au plus 40 $. Une sortie manuelle qui dépasse 40 $ est aussi une violation. Rien d'autre ne change dans ta façon de trader (setups, heures, nombre de trades) : si tu changes autre chose, tu me le dis, et c'est noté.

## Fenêtre de suivi
Les 100 premiers trades fermés après le début de la règle (tu me donnes la date de départ). Données : l'export de l'historique de ta plateforme, même format que `real-trades-2025.csv`. Je ne regarde les chiffres qu'une fois les 100 trades atteints, sauf si tu m'envoies un export intermédiaire : dans ce cas je ne vérifie que le respect de la règle (violations), pas le résultat.

## Mesures
1. **Respect de la règle** : nombre et part des pertes de plus de 42 $ (40 $ + 5 % de tolérance pour le glissement). Règle considérée comme tenue si **au plus 5 % des pertes** dépassent 42 $.
2. **Forme des pertes** : perte médiane, perte moyenne, plus grosse perte, part de la perte totale due aux 20 % de pertes les plus grosses.
3. **Résultat** : $ total, $ par trade avec son intervalle de confiance à 95 % (bootstrap), part de gagnants, gain moyen, rapport gain moyen / perte moyenne.

## Références de 2025 (calculées avant le début du suivi)
- 26 % des pertes (125 sur 487) dépassaient 40 $ ; 113 d'entre elles en mai–juillet. Excédent au-dessus de 40 $ : 2 738 $. Les 20 % de pertes les plus grosses pesaient 45 % de la perte totale.
- Mars–avril (222 trades) : +9,25 $ par trade, 27 % de gagnants, gain moyen 95 $, perte moyenne −23 $. Mai–juillet (424 trades) : −1,75 $ par trade, 23 % de gagnants, gain moyen 105 $, perte moyenne −34 $.
- Rapport gain moyen / perte moyenne sur 2025 : environ 3,4.

## Lecture après 100 trades (aucun critère de profit)
- **Règle tenue ou non** (mesure 1) : c'est le seul verdict. Si elle n'est pas tenue, on cherche pourquoi (pas de jugement sur le résultat).
- **Résultat net** : avec 100 trades, l'intervalle de confiance sur le gain par trade est large (de l'ordre de ± 12 $) : il ne distinguera que de grosses différences. Je dirai « non concluant » si l'intervalle contient à la fois les références de mars–avril et de mai–juillet.
- **Attention au rapport gain/perte** : à 25 % de gagnants, il faut un rapport d'au moins 3 pour ne pas perdre d'argent. Si le plafond réduit ta perte moyenne mais aussi ton gain moyen dans la même proportion (par exemple parce que tu as réduit le volume pour tout), le rapport ne bougera pas ; si le rapport tombe nettement en dessous de 3, je te le signalerai.
- Aucune conclusion sur d'autres règles (volume fixe, stop minimal) : ce sont d'autres hypothèses, à écrire à part.

## Divulgations
- Le montant de 40 $ a été choisi par Krystofia après avoir vu les chiffres de 2025 (perte médiane de 26 $, 36 $ en juillet) ; il est proposé en lien avec les données de 2025, qui ne servent pas de test.
- 100 trades sont peu : le résultat net sera dominé par quelques gros gains, comme en 2025. Le suivi sert d'abord à voir si le plafond tient en pratique.
- Les conditions de marché peuvent changer entre 2025 et la période de suivi ; un meilleur ou un moins bon résultat ne sera pas attribuable à la seule règle.
- Je ne peux pas vérifier que tu as réellement réglé ton volume avant l'entrée ; je ne vois que les résultats.
