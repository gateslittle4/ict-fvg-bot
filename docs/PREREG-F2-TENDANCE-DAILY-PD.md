# Pré-enregistrement — F2 avec tendance daily par PD arrays (TD2)

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, après le rejet de TD1 : « On est bullish dès l'instant où le prix a [fait] un daily bullish PD array, comme un low, un FVG, jusqu'au prochain PD array au sens opposé. » Elle a précisé : les **deux** déclencheurs (low et FVG) comptent, et le FVG doit aussi être **rejeté**. Elle a validé la lecture ci-dessous (« Oui »).

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R, A +0,067 (617), B +0,146 (605).

## La règle TD2 (une seule hypothèse, figée)
- **Barres daily** : comme TD1 (jours calendaires de New York, clé = floor((t − 5 h) / 86 400 s) avec le temps moteur ; toute date avec des données forme une barre).
- **Creux / sommet daily confirmé** : comme TD1 (strictement plus bas / plus haut que les 2 barres avant et les 2 barres après, confirmé à la clôture de p + 2). Lp = le dernier creux confirmé, Hp = le dernier sommet confirmé, à la clôture de la barre d − 1. Pas de limite d'âge.
- **FVG daily** : trois barres daily consécutives b1, b2, b3. Haussier si high[b1] < low[b3] : zone [high[b1], low[b3]]. Baissier si low[b1] > high[b3] : zone [high[b3], low[b1]]. Créé à la clôture de b3. Il reste actif tant qu'aucune mèche ne l'a rempli **entièrement** (haussier : low ≤ bas de la zone ; baissier : high ≥ haut de la zone) ; il est alors mort. Pas de limite d'âge.
- **Événements**, évalués à la clôture de chaque barre daily d, avec les niveaux et FVG actifs à la clôture de d − 1 :
  - **Low daily pris et rejeté (haussier)** : low[d] < Lp et close[d] > Lp.
  - **FVG daily haussier touché et rejeté (haussier)** : pour au moins un FVG haussier actif, low[d] ≤ haut de la zone, low[d] > bas de la zone (pas rempli entièrement) et close[d] > haut de la zone.
  - **High daily pris et rejeté (baissier)** : high[d] > Hp et close[d] < Hp.
  - **FVG daily baissier touché et rejeté (baissier)** : pour au moins un FVG baissier actif, high[d] ≥ bas de la zone, high[d] < haut de la zone et close[d] < bas de la zone.
- **Tendance (état)** : haussière dès qu'un événement haussier se produit et le reste jusqu'au premier événement baissier (et inversement). Si les deux types d'événements arrivent à la même barre, l'état reste inchangé. État initial : neutre (aucun ordre) jusqu'au premier événement.
- **Filtre** : un ordre d'achat n'est posé (en plus de toutes les règles de F2, balayage H4 inclus) que si l'état, calculé avec les barres daily complètes avant le jour de la bougie de pose, est haussier.
- Tout le reste de F2 est inchangé (achats, balayage du low des 6 dernières barres H4, fenêtre de 32 bougies, 06–16 NY, FVG d'âge ≤ 8, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, mises à l'échelle, sortie au temps à 96 bougies, stop d'abord). Le moteur est le même ; les ordres refusés ne sont pas posés (effets sur les ordres suivants simulés).
- Aucune autre valeur essayée (FVG daily sans rejet, rejet par mèche seule, plusieurs creux au lieu du dernier, pivot de 3 barres, daily à 17 h NY, limite d'âge des FVG daily, seulement le low, seulement le FVG) : si TD2 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que H1, E1, PS1, D930/D06, PD1, FB1 et TD1 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de TD2 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de TD2 et les trades de F2C absents de TD2.
3. TD2 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C (≤ 34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, uniquement si l'entraînement passe)
R moyen de TD2 > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de TD2 < R moyen des trades de TD2. 2026 : descriptif.

## Descriptif (non jugé)
Sur F2C 2011–2022 : nombre et R moyen des trades pris quand l'état daily est haussier, baissier, neutre ; part du temps en état haussier par an ; nombre de changements d'état par an ; nombre d'événements de chaque type sur 2011–2022.

## Divulgations
- **Choix de moi, non donnés par toi** : le « low » est le dernier creux confirmé (pivot de 2 barres, validé par toi pour TD1) ; le FVG daily est strict à 3 barres ; il meurt quand une mèche le remplit entièrement ; le rejet d'un low = clôture au-dessus du low, le rejet d'un FVG = clôture au-delà du bord éloigné de la zone, côté de la direction (validé par toi) ; n'importe quel FVG daily actif peut déclencher ; l'état reste inchangé si les deux sens arrivent à la même barre ; daily alignée sur minuit NY ; barres courtes du dimanche soir comptées.
- **Ce test n'est pas ton idée complète** : la fenêtre d'achat après le balayage reste celle de F2 (32 bougies) ; la cible lointaine « jusqu'au prochain PD array opposé » n'est pas codée comme cible (la cible reste le FVG M15 à gauche) : le PD array opposé sert ici seulement à mettre fin à la tendance.
- **Même famille que TD1 (rejetée)** : une tendance daily qui n'avait pas séparé les bons achats des mauvais. TD2 change la définition de la tendance, pas la nature du test ; on ne peut pas exclure que le résultat soit le même.
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171) a été lu. Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard : un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026). Le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples (une quinzaine de variantes déjà testées sur F2).
- Les trades sont corrélés ; les t sont un peu flatteurs. Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).
- Rien dans ce test ne dit si ton « daily haussier » correspond à ta lecture à l'œil du graphique.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAD_dailyPD.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
