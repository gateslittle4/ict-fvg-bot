# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — « Suivre le FVG le plus récent » : entrée au retest, sortie au retournement

Date : 2026-09-30 (UTC). Cousin mécanique de la méthode d'Esdras, construit à partir de ses propres règles données le 29-30/09 :
« c'est le FVG qui vient d'être créé qui me dit où va le prix », « pour l'entrée je cherche toujours le FVG le plus récent », « le FVG
n'est valable qu'après avoir attendu 15 min », « la partie mangée n'est plus un FVG, je considère la partie non mangée », « la cible
dépend de la vitesse et de la formation d'un autre FVG dans le même sens ». **Ce test n'utilise NI les lignes 4hr NI le FVG « à gauche »**
(aucune règle mécanique fiable n'a été trouvée pour les choisir sur les 11 exemples : voir HANDOFF). Il ne reproduit donc pas la méthode
complète d'Esdras : il teste seulement sa règle de direction, d'entrée et de sortie dynamique. Esdras a demandé ce test (« oui »).
Aucun chiffre n'a été calculé pour cette règle.

## Définitions
Bougies M15 construites depuis le M1 (bid), heure moteur. Toute la journée (aucune fenêtre horaire).
1. **FVG brut** en k (bougies k−2, k−1, k contiguës, écart de temps exact de 15 min : le trou de week-end n'est pas un FVG) :
   baissier `Low[k−2] > High[k]` (sup = Low[k−2], inf = High[k]) ; haussier `High[k−2] < Low[k]` (inf = High[k−2], sup = Low[k]).
2. **Zone** : des FVG bruts de même sens sur des bougies consécutives k0…k1 forment une seule zone [plus bas inf, plus haut sup].
3. **Bougie de confirmation** : la bougie k1+1 (contiguë). Elle peut « manger » une partie de la zone. **Partie non mangée** :
   baissier `[max(inf, High[k1+1]), sup]`, valide seulement si `High[k1+1] < sup` ; haussier `[inf, min(sup, Low[k1+1])]`, valide seulement
   si `Low[k1+1] > inf`. Zone entièrement mangée : pas de FVG. La zone devient **active** à T = clôture de la bougie k1+1.
4. **FVG le plus récent** à l'instant t : la zone valide dont T est le plus récent (≤ t). Sa direction = la direction du marché.

## Règles de trading
1. **Entrée** : à T, ordre **limite** au bord proche de la partie non mangée (vente : son bord bas ; achat : son bord haut).
2. **Stop** : au-delà du bord lointain, plus 10 % de la hauteur de la partie non mangée (convention `fvg-edge` du bot). Risque = |entrée − stop|.
   **Garde-fou** : pas d'ordre si le risque est inférieur à 3 × le spread (règle déjà utilisée dans les pré-enregistrements précédents).
3. **Un ordre remplace l'autre** : dès qu'une **nouvelle zone valide** devient active (n'importe quel sens), l'ordre en attente est annulé (le FVG
   le plus récent a changé) et un nouvel ordre est posé sur la nouvelle zone si le marché est à plat. L'ordre expire aussi après 16 bougies M15.
   Annulé si le stop est atteint avant le remplissage (ou si la minute s'ouvre déjà au-delà du stop).
4. **Remplissage** : minute par minute, vente quand le bid atteint le niveau ; achat quand l'ask l'atteint ; prix = le niveau, ou l'ouverture
   de la minute si elle est déjà au-delà.
5. **Sortie** : (a) stop (stop d'abord dans la minute, trou à l'ouverture) ; (b) **retournement** : à l'activation d'une zone valide de sens
   **opposé**, sortie au marché à l'ouverture de la minute suivant son activation ; une zone dans le **même** sens est ignorée (on garde) ;
   (c) sortie au marché après 5 jours. Pas d'objectif de prix, pas de break-even.
6. **Un seul trade à la fois par paire.** À un retournement, la zone qui provoque la sortie sert aussitôt d'entrée dans l'autre sens.
7. **R** = résultat net / risque.

## Données et coûts
US100 et US500, M1 bid. Entraînement **2010-2022** : HistData ; test **2023-2025** et 2026 : M1 du courtier. Spread par défaut du projet mis
à l'échelle du prix, swap du courtier pour la durée tenue, commission 0, pas de glissement au-delà du spread (limite déclarée).

## Verdict (critère du projet, deux temps)
Évalué sur **US100 + US500 réunis** ; chaque paire donnée à part (descriptif). Seuil t relevé à 2,6 : deux paires, et la famille FVG compte déjà
8 échecs.
- **Temps 1, entraînement 2010-2022** : au moins 60 trades, R moyen > 0, t ≥ 2,6, R total positif en 2010-2016 **et** en 2017-2022. Moins de 60
  trades : NON CONCLUANT. Sinon : ÉCHEC. Le test et 2026 ne sont pas lus tant que l'entraînement n'a pas réussi (le script refuse).
- **Temps 2, test 2023-2025**, lu une seule fois : R moyen > 0 → CANDIDAT (démo seulement, décision d'Esdras) ; sinon ÉCHEC. 2026 : descriptif.
- Aucune variante sans nouveau pré-enregistrement.

## Mesures descriptives (ne décident rien)
Nombre de zones, d'ordres, de trades, part des sorties par stop / retournement / durée ; durée moyenne des trades ; coût moyen en R du spread.
**Vérification sur tes exemples** (septembre 2026, bougies M15 du bot) : la stratégie pose-t-elle un ordre sur la zone de chacun de tes 11 trades,
dans ton sens ? (descriptif, septembre 2026 est déjà vu pour cette famille).

## Décisions prises par Claude pour rendre la règle calculable (déclarées)
Expiration à 16 bougies ; garde-fou 3 × spread ; stop à 10 % de la hauteur non mangée ; un ordre remplacé par la zone la plus récente ; sortie au
marché au retournement ; sortie à 5 jours ; netting par paire ; sans aucune ligne 4hr.

## Déjà vu et limites
- Famille FVG : 8 échecs (limite, limite posée avant, ordre stop, « 30 min loin », FVG d'Esdras v1/v2, « FVG à gauche » v1). Attente honnête :
  faible, le coût du spread pèse lourd sur de petites zones.
- Cette règle prend beaucoup plus de trades que la méthode d'Esdras (pas de filtre 4hr) ; l'avantage éventuel de sa sélection n'est pas testé ici.
- Spread constant, pas de glissement ; septembre 2026 déjà vu pour cette famille.
