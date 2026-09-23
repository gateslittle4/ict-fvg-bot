# PRÉ-ENREGISTREMENT v2 (écrit AVANT tout calcul) — le FVG d'Esdras avec contexte 4h

Date : 2026-09-23. La v1 (`preregistration-esdras-fvg-2026-09-23.md`) a échoué à l'entraînement (485 trades, −25 R, t = −0,58). Esdras précise ensuite que sa stratégie marche surtout **après un retournement 4h** (prise d'un plus haut/bas 4h ou contact d'un FVG 4h), **en visant la liquidité 4h en face**, et **sur US100**. Réponses d'Esdras : fenêtre « 4h avant ou plus, le 4h peut se faire 3-5 jours avant aussi », pas de changement de structure 1h, « cible la plus proche, 3R ok ». Les détails non précisés sont fixés ici par moi, avant de voir un seul résultat. **C'est la dernière retouche avant le verdict** : si la v2 échoue, on n'ajoute plus de filtres.

## Règles (achat ; vente = miroir exact)
1. **Paire : US100 seulement.** Biais déclaré : US100 était la paire positive de la v1 (+23 R, t = 0,62, non significatif) ; le choix est donc en partie fait d'après un résultat. La preuve viendra du test 2023-2025 et de 2026.
2. **Bougies 4h** *(fixé par moi)* : construites depuis le M1, alignées sur l'heure serveur des brokers FTMO (New York + 7 h), soit des bougies qui commencent à 17h, 21h, 1h, 5h, 9h, 13h heure de New York (heure d'été comprise).
3. **Sommets/creux de swing 4h** *(fixé par moi)* : pivot 2/2 (plus haut que les 2 bougies 4h de chaque côté ; creux = miroir), connu seulement à la clôture de la 2e bougie qui suit.
4. **FVG 4h** : c1.high < c3.low (haussier, zone [c1.high, c3.low]) ; baissier miroir. Connu à la clôture de c3.
5. **Contexte de retournement (obligatoire)** : entre **5 jours (120 h) avant** le début de la bougie d'impulsion M15 (c2) et ce début, au moins un de ces événements, observé sur les bougies M15 :
   - **prise d'un creux 4h** : un plus bas M15 passe sous un creux de swing 4h confirmé et encore jamais pris (la première fois seulement) ;
   - **contact d'un FVG 4h haussier** : premier plus bas M15 ≤ bord haut d'un FVG 4h haussier encore jamais touché depuis sa formation.
   (Vente : prise d'un sommet 4h ou contact d'un FVG 4h baissier.) Pas de limite d'âge pour les niveaux 4h.
   **Le retournement part de la zone de liquidité** (précision d'Esdras : « ce renversement se fait dans la zone où la liquidité a été prise ») *(traduction fixée par moi)* : sur les 16 bougies M15 (4 h) qui finissent avec c1, le plus bas doit être **≤ le niveau de l'événement** : sous le creux 4h pris, ou dans/sous le FVG 4h touché (≤ son bord haut). Autrement dit l'impulsion démarre depuis la liquidité prise, pas d'un endroit où le prix est déjà remonté.
6. **Impulsion M15 + BMS** (inchangé v1) : FVG M15 c1.high < c3.low, corps de c2 ≥ 2 × ATR(14) des 14 bougies M15 précédentes, clôture de c2 au-dessus du dernier sommet M15 confirmé (pivot 5/5). **Aucun filtre 1h.**
7. **Le prix part loin** (inchangé) : haut ≥ bord haut + 2 × hauteur de zone avant tout retour dans la zone (c3 compte pour la distance, pas pour le contact) ; sinon zone abandonnée.
8. **Heures** (inchangé) : c2 commence entre 8:00 et 12:00 New York ; ordre annulé à 12:00 NY le jour même.
9. **Entrée / stop** (inchangé) : LIMIT au bord haut, actif dès la bougie M15 qui suit l'atteinte de la distance, rempli quand l'ask touche (bid ≤ bord − spread), vérifié à la minute ; stop au bas de la zone ; stop ≥ 3 × spread.
10. **Cible = la liquidité 4h la plus proche au-dessus de l'entrée**, figée au moment où l'ordre est armé : le plus bas des niveaux (a) sommet de swing 4h confirmé et pas encore pris (aucun plus haut M15 au-dessus depuis sa confirmation), (b) bas d'un FVG 4h baissier pas encore touché (aucun plus haut M15 ≥ ce bas depuis sa formation). **Trade pris seulement si cette cible est à ≥ 3R** de l'entrée (distance ≥ 3 × hauteur de zone) ; aucune cible ou cible < 3R = pas de trade. Vente : miroir (le plus haut des creux 4h non pris / hauts de FVG 4h haussiers non touchés sous l'entrée).
11. Sortie : stop (vérifié d'abord dans une même minute), cible (bid pour l'achat, ask pour la vente), ou au marché après 5 jours. Spread par défaut du projet, swap ignoré, une position à la fois.
12. Compte : garde-fou du bot (3 trades/jour, pause 30 min après perte, −2 %/jour), FTMO 1-Step réel enchaîné, risques 0,25 / 0,5 / 0,75 / 1 %.

## Périodes (protocole du projet)
Entraînement 2010-2022 (HistData M1, US100 dès 2010-11), test 2023-2025 et forward 2026 (M1 du broker, qui commence le 2023-01-11 : les niveaux 4h antérieurs à cette date sont inconnus au début du test, limite déclarée).

## Critère de succès (identique à la v1, fixé avant calcul)
- **Candidate** si, sur l'entraînement : ≥ 60 trades, R net > 0 avec t ≥ 2, positive en 2010-2016 ET 2017-2022 ; PUIS au test 2023-2025 : ≥ 30 trades, R net > 0 (lu une seule fois).
- Même candidate : suivi en démo/alerte avant tout réel.
- Si l'entraînement a moins de 60 trades : **non concluant** (pas assez de données), pas de réglage pour en obtenir plus.
