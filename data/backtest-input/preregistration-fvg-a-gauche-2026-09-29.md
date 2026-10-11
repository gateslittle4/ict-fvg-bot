# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — FVG « 15 min » vers FVG « à gauche » (stratégie d'Esdras)

Date : 2026-09-29 (UTC). Lecture de la capture d'écran confirmée par Esdras : **vente** depuis le retest du « 15 min fvg », cible sur le FVG
« à gauche » ; l'achat est le miroir exact. Fenêtre horaire, durée de l'ordre et sortie : valeurs proposées par Gemini, acceptées par
Esdras (les autres paramètres proposés par Gemini — invalidation à 50 %, break-even à 50 %, marge fixe de 2 points — sont écartés : ils
n'étaient pas dans la capture). Aucune donnée n'a été regardée pour cette règle. Le script `scripts/runEsdrasMitigationStudy.js`
(non commité, mal défini : cible parfois du mauvais côté, clôture de la bougie utilisée pour entrer, aucun coût, périodes protégées lues
en une fois) **ne doit pas être lancé**. Aucune règle ne changera après le calcul.

## Définitions (formules de Gemini, identiques au moteur du bot)
Bougies M15 construites depuis le M1 (bid), heure de New York réelle (heure d'été comprise). Un FVG n'existe qu'à la **clôture** de la
bougie k (bougies k−2, k−1, k) :
- FVG **baissier** : `Low[k−2] > High[k]` ; sup = `Low[k−2]`, inf = `High[k]`.
- FVG **haussier** : `High[k−2] < Low[k]` ; inf = `High[k−2]`, sup = `Low[k]`. Hauteur h = sup − inf.
- **Jamais touché** à la clôture de k₀ (FVG formé en k′ < k₀) : pour toutes les bougies j de k′+1 à k₀, baissier : `High[j] < inf` ;
  haussier : `Low[j] > sup`.

## Règles — vente (l'achat est le miroir : haussier ↔ baissier, haut ↔ bas)
1. **Déclencheur** : chaque FVG baissier Z formé en k. À la clôture de k (instant T = fin de la bougie k) et **seulement si T est entre
   08 h 30 et 11 h 30 heure de New York**, on cherche une cible (règle 2). Pas de filtre d'impulsion ni de biais (déclaré : plus large
   que la stratégie visuelle).
2. **FVG « à gauche » (cible)** : parmi les FVG **haussiers** L formés en k′ avec k−480 ≤ k′ ≤ k−3 (strictement plus anciens que Z ; 480
   bougies = 5 jours, la durée maximale du projet), jamais touchés à la clôture de k, et dont le **bord haut** `L.sup` est **sous** le
   prix d'entrée : on retient celui dont `L.sup` est le plus haut (le plus proche de l'entrée) ; à égalité, la plus grande hauteur.
   Cible = `L.sup` (le bord proche). Aucun candidat : pas de trade.
3. **Entrée** : ordre **limite de vente** à `Z.inf`, posé à T (avant tout contact, aucune information de la bougie de contact).
4. **Stop** : `Z.sup + 0,1 × h(Z)` (la convention `fvg-edge` du bot). Risque = stop − entrée.
5. **Cible minimale** : pas de trade si (entrée − cible) < 2 × risque.
6. **Durée de l'ordre** : 16 bougies M15 (4 h) à partir de T. Annulé sans trade si, avant le remplissage, le prix atteint la cible
   (le mouvement a eu lieu sans nous) ou atteint le niveau du stop. Vérifié minute par minute sur le M1.
7. **Remplissage** : minute par minute, quand le bid atteint `Z.inf` (achat : quand l'ask atteint le niveau). Prix = le niveau, ou
   l'ouverture de la minute si elle est déjà au-delà.
8. **Sortie** : stop ou cible, sinon au marché après 5 jours (7 200 minutes, la durée maximale du projet). Stop d'abord si les deux
   sont touchés dans la même minute ; un trou à travers le stop sort à l'ouverture (perte > 1 R). **Pas de break-even.**
9. **Un seul trade à la fois par paire** (netting du bot) : un nouveau déclencheur est ignoré tant qu'un ordre ou une position est en
   cours sur la même paire. Pas de plafond de trades par jour (étude au niveau du signal, R par trade).
10. **R** = résultat net / risque.

## Données et coûts
US100 et US500, M1 bid. Entraînement **2010-2022** : HistData (`data/histdata-m1`) ; test **2023-2025** et 2026 : M1 du courtier
(`data/real-m1-full`). Spread par défaut du projet mis à l'échelle du prix (`DEFAULT_SPREADS`), swap du courtier pour la durée tenue,
commission 0 (vérifiée sur un trade réel le 25/09), pas de glissement au-delà du spread (limite déclarée).

## Verdict (critère du projet, deux temps)
Évalué sur **US100 + US500 réunis** (chaque paire donnée à part, descriptif). Seuil t relevé à 2,6 : deux paires, et la famille FVG a déjà
échoué 7 fois.
- **Temps 1, entraînement 2010-2022** : au moins 60 trades, R moyen > 0, **t ≥ 2,6**, R total positif en 2010-2016 **et** en 2017-2022.
  Moins de 60 trades : NON CONCLUANT. Sinon : ÉCHEC. **Le test et 2026 ne sont pas lus tant que l'entraînement n'a pas réussi**
  (le script refuse de les calculer).
- **Temps 2, test 2023-2025**, lu une seule fois : R moyen > 0 → CANDIDAT (démo seulement, décision d'Esdras) ; sinon ÉCHEC.
- **2026** : descriptif.
- Aucune variante (fenêtre, durée, stop, cible, filtre d'impulsion) sans nouveau pré-enregistrement.

## Mesures descriptives (ne décident rien)
- Nombre de déclencheurs, d'ordres posés, remplis, annulés (par raison), et distance moyenne de la cible en R.
- **Contrôle** : mêmes ordres, mêmes entrées et mêmes stops, mais cible fixe à 3 R au lieu du FVG « à gauche » — pour voir si la cible
  « à gauche » apporte quelque chose.

## Décisions prises par Claude pour rendre la règle calculable (déclarées)
Fenêtre appliquée à l'**instant de pose** de l'ordre (et non au remplissage) ; historique de 480 bougies pour le FVG « à gauche » ;
bord proche du FVG cible ; stop à 10 % de la hauteur ; sortie à 5 jours ; netting ; pas de filtre d'impulsion. Esdras peut les changer
**avant** le calcul du temps 1.

## Déjà vu et limites
- Aucun chiffre de cette règle n'a été calculé. Familles proches déjà rejetées : FVG limite / limite posée avant / ordre stop / « 30 min
  loin » / FVG d'Esdras v1, v2 et v2 à 3 R (cible sur liquidité 4 h) : à l'origine, les FVG gagnaient grâce à l'information de la clôture
  de la bougie de contact, absente ici.
- Les années 2023-2025 ont déjà servi à d'autres variantes FVG : elles ne sont pas vierges pour cette famille.
- Spread constant, pas de glissement ; règle plus large que la stratégie visuelle (pas d'impulsion, pas de biais).
