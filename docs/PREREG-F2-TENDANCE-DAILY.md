# Pré-enregistrement — F2 avec tendance daily (TD1)

Écrit le 2026-10-06, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia (« et si pour la tendance on regarde daily au lieu de H4 »), puis ses précisions : la daily **ne remplace pas** le balayage H4, qui reste le déclencheur de l'entrée ; la daily dit où va le prix de façon globale (« si on est en bearish, on ne cherche pas de low H4 pour acheter »). Définitions données par elle : tendance haussière = cassure d'un high daily avec plusieurs clôtures au-dessus (réponse : **2 clôtures**) ; « dernier sommet daily confirmé » validé par elle (« oui, 1 »).

## Contrôle (inchangé)
F2C = F2 sur la série continue, balayage H4 actuel. À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R, A +0,067 (617), B +0,146 (605).

## La règle TD1 (une seule hypothèse, figée)
- **Barres daily** : bougies M15 regroupées par jour calendaire de New York (minuit NY à minuit NY, même alignement que les barres H4 du moteur : clé = floor((t − 5 h) / 86 400 s) avec le temps moteur). Toute date qui a des données forme une barre (y compris les barres courtes du dimanche soir).
- **Sommet daily confirmé** : une barre p dont le high est strictement supérieur aux highs des 2 barres avant et des 2 barres après. Il est confirmé à la clôture de la barre p + 2. **Creux daily confirmé** : symétrique (low strictement inférieur aux lows des 2 barres avant et après).
- **Tendance (état)**, mise à jour à la clôture de chaque barre daily d, uniquement avec des barres complètes :
  - Hp = le high du dernier sommet daily confirmé à la clôture de la barre d − 1 ; Lp = le low du dernier creux daily confirmé à la clôture de d − 1.
  - **Haussière** si close[d] > Hp **et** close[d − 1] > Hp (2 clôtures daily consécutives au-dessus du même Hp).
  - **Baissière** si close[d] < Lp et close[d − 1] < Lp.
  - Si les deux conditions sont vraies ou aucune, l'état reste inchangé. État initial : neutre (aucun ordre) jusqu'au premier déclenchement.
  - Il n'y a pas de limite d'âge pour le sommet ou le creux : « très loin » est permis.
- **Filtre** : un ordre d'achat n'est posé (en plus de toutes les règles de F2, balayage H4 inclus) que si l'état de la tendance daily, calculé avec les barres daily complètes **avant le jour de la bougie de pose**, est haussier. Neutre ou baissier : pas d'ordre.
- Tout le reste de F2 est inchangé (achats, balayage du low des 6 dernières barres H4, fenêtre de 32 bougies M15 après le balayage, 06–16 NY, FVG d'âge ≤ 8, entrée à 50 %, stop c1 − 3 pts, TP = max(½ cible, 3 R), spread 0,6, mises à l'échelle, sortie au temps à 96 bougies, stop d'abord). Le moteur est le même ; les ordres refusés ne sont pas posés (effets sur les ordres suivants simulés).
- Aucune autre valeur essayée (2 ou 3 clôtures de plus, autre nombre de barres pour le pivot, daily alignée sur 17 h NY, barres du dimanche fusionnées, tendance au moment de c3, fenêtre d'achat de 1 jour, N barres daily) : si TD1 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Mêmes critères et mêmes seuils que H1, E1, PS1, D930/D06, PD1 et FB1 ; trades appariés avec F2C par année + bougie de pose + bougie de création de la zone :
1. R moyen de TD1 ≥ R moyen de F2C + 0,03.
2. t de Welch ≥ 1,96 entre les trades de TD1 et les trades de F2C absents de TD1.
3. TD1 > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C (≤ 34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, uniquement si l'entraînement passe)
R moyen de TD1 > R moyen de F2C sur 2023–2025 et > 0, et R moyen des trades de F2C absents de TD1 < R moyen des trades de TD1. 2026 : descriptif.

## Descriptif (non jugé)
Sur F2C 2011–2022 : nombre et R moyen des trades pris quand l'état daily est haussier, baissier, neutre ; part des jours en état haussier ; nombre de changements d'état par an.

## Divulgations
- **Ce test n'est pas ton idée complète.** Tu voulais pouvoir chercher des achats **plusieurs jours de suite** grâce à la daily. Ici la fenêtre d'achat après le balayage reste celle de F2 (32 bougies) : seul le filtre de tendance est testé. Ta remarque « après qu'un daily low est pris puis rejeté, le prix cherche le plus souvent un daily opposé » (cible lointaine) n'est **pas codée** : la cible reste le FVG M15 à gauche de F2.
- **Choix de moi, non donnés par toi** : pivot de 2 barres de chaque côté ; daily alignée sur minuit NY (comme les barres H4 du moteur, pas sur 17 h NY) ; les barres courtes du dimanche soir comptent comme une barre ; la tendance est évaluée avec les barres complètes avant le jour de la pose ; la règle de bascule baissière (symétrique). Tu as confirmé les 2 clôtures et le « dernier sommet confirmé ».
- **Proche d'un test déjà fait** : la tendance H4 « cassure agressive d'un high/low H4 » (tendance seule, puis avec balayage) avait donné des signes opposés selon la période (2023–25 négatif, 2026 positif). La version daily est une autre définition, mais l'idée est voisine.
- **2023–2025 n'est pas vierge pour F2** : son R global (+0,171) a été lu. Plus on teste de règles sur les mêmes années, plus un succès devient probable par hasard : un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026). Avec la série de variantes déjà testées sur F2, le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples.
- Les trades sont corrélés ; les t sont un peu flatteurs. Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).
- Rien dans ce test ne dit si ton « daily haussier » correspond à ta lecture à l'œil du graphique.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAC_daily.mjs <data> train`, puis `... test` si l'entraînement passe. Moteur : `lib/krysBacktestC.js`.
