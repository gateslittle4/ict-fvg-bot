# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Repli dans la tendance, le matin (règle tirée des trades réels d'Esdras)

Date : 2026-09-26. Origine : l'historique réel du compte financé GoatFunded 83486 d'Esdras (664 trades, 7 mars → 30 juillet 2025,
+864 $, plus haut +22,4 %). Analyse exploratoire faite ce jour (plusieurs découpages essayés, donc risque de hasard élevé) : ses trades
NAS100 pris CONTRE le mouvement de la dernière heure gagnaient +2 885 $ (324 trades) contre −1 572 $ dans le sens de la dernière heure ;
ceux pris à l'extrême du jour dans le sens du trade perdaient −1 753 $ ; tout ce qui était ouvert entre 11 h et 18 h NY perdait
(−2 249 $). Le meilleur sous-groupe : contre 1 h, avec 4 h, hors 11 h - 18 h (98 trades, +2 394 $). **2025 a donc servi à trouver la
règle : 2025 n'est ni entraînement ni test (descriptif seulement).** Esdras : « non, teste » (règle proposée acceptée sans changement).

## Règle (US100, principale ; US500 donné en contrôle, descriptif)
Heures en heure de New York réelle (heure d'été comprise).
1. **Évaluation** à chaque clôture de bougie M15 dont l'heure de clôture τ est entre **03 h 00 et 10 h 45** inclus (rien à partir de 11 h).
2. **Achat** si : clôture(τ) > clôture 4 h avant (tendance 4 h haussière) **ET** clôture(τ) < clôture 1 h avant (repli sur la dernière
   heure) **ET** la clôture est dans les 75 % inférieurs du range de la journée en cours (plus haut / plus bas depuis 18 h NY la veille
   jusqu'à τ) — pas d'achat au plus haut du jour. **Vente** : l'exact inverse (4 h baissière, dernière heure en hausse, dans les 75 %
   supérieurs du range).
3. **Entrée** au marché à l'ouverture de la minute qui suit τ (achat à l'ask = bid + spread, vente au bid).
4. **Stop** : 1 × ATR horaire (moyenne des vrais écarts des 14 dernières bougies H1 terminées à τ), depuis le prix d'exécution.
   **Objectif** : 3 R. **Sortie au temps** : au marché 4 h après l'entrée si ni le stop ni l'objectif n'ont été touchés.
   Stop d'abord si les deux sont touchés dans la même minute ; un trou à travers le stop sort à l'ouverture de la minute.
5. **Un seul trade à la fois** (la recherche reprend à la première clôture M15 après la sortie) ; **au plus 3 entrées par journée**
   (journée = 18 h NY → 18 h NY).
6. **R** = résultat net / (1 × ATR horaire à l'entrée).

## Données et coûts
M1 : HistData 2010-2022 (`data/histdata-m1`), courtier 2023 → 21/09/2026 (`data/real-m1-full`). Spread par défaut du projet (0,6 point
sur US100, 0,25 sur US500, mis à l'échelle du prix). Pas de swap (sortie avant 15 h NY au plus tard). Commission 0 (vérifiée).
Pas de glissement au-delà du spread (limite déclarée : jusqu'à ~10 points mesurés sur des stops réels).

## Critère (fixé avant calcul)
Seuil relevé à t ≥ 2,6 parce que la règle vient d'une exploration à plusieurs découpages.
- **Entraînement 2011-2022** (US100) : au moins 60 trades, R moyen > 0, **t ≥ 2,6**, R total positif en 2011-2016 ET en 2017-2022.
  Moins de 60 trades : NON CONCLUANT. Sinon : ÉCHEC.
- **Test 2023-2024**, lu une seule fois : R moyen > 0 → **CANDIDAT** (démo seulement avant tout réel, décision d'Esdras). Sinon ÉCHEC.
- **2025** (année d'où vient l'idée) et **2026** (→ 21/09) : descriptifs.
- Aucune variante (heures, lookbacks, stop, objectif, durée, filtre de range) ne sera essayée après coup sans nouveau pré-enregistrement.

## Limites déclarées
- L'avantage d'Esdras venait aussi de ses sorties manuelles (gagnants gardés 1-4 h, perdants coupés en moins de 10 min) : une sortie
  mécanique (1 ATR, 3R, 4 h) n'en est qu'une traduction possible.
- HistData et le courtier n'ont pas exactement les mêmes prix.

Script : `scripts/runEsdrasPullbackStudy.js` (règle dans `scripts/lib/pullbackRule.js`, testée).
