# Pré-enregistrement — F2 : stop plus large

Écrit le 2026-10-06 (≈ 13:10 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Fait suite à `ANALYSE-STOPS-F2.md`.

## Question
Un stop plus éloigné que celui de F2 (bas de c1 − 3 pts) améliore-t-il F2, une fois qu'on paie le prix d'un risque plus grand par trade ?

## F2 de base (contrôle, inchangée)
Règles de `CRITERE-DEMO-F2.md` : US100 M15, achats ; balayage du low H4 ; FVG d'entrée ≤ 8 bougies ; entrée à 50 % de la zone restante ; stop = bas de c1 − 3 pts ; TP = max(½ FVG cible, 3R) ; fenêtre 06–16 NY ; spread 0,6 ; prix à l'échelle prix/8200 ; rejeu M15 pessimiste. Référence à retrouver : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R. Si le contrôle ne retrouve pas ces chiffres, l'étude s'arrête.

## Les 2 hypothèses (figées, aucune autre)
Soit `risque0` la distance entrée → stop de F2. Le stop devient `entrée − m × risque0` (sous l'entrée, achats).
- **S-1,25** : m = 1,25.
- **S-1,5** : m = 1,5.

Tout le reste est inchangé, y compris le **niveau de prix du TP**, qui reste celui de F2 (max(½ FVG cible, 3R de l'ancien risque)). On isole ainsi l'effet du stop seul : les gains rapportent moins en R (un TP de 3R0 vaut 3/m R), les stops sautent plus rarement. Le R de chaque trade est mesuré avec **son** risque (distance au nouveau stop) : c'est ce que vit un trader qui risque le même montant par trade (lot réduit quand le stop s'éloigne). Un ordre limite peut maintenant être rempli là où l'ancien stop l'aurait annulé avant remplissage : les trades remplis ne sont donc pas exactement les mêmes ; c'est voulu, c'est la vraie conséquence d'un stop plus large. Le moteur est une copie de `krysBacktest.js` avec une seule option ajoutée (`stopMult`) ; sans l'option, il reproduit exactement F2.

## Données et blocs
Mêmes que les études précédentes. Entraînement : 2011–2016 (A) et 2017–2022 (B). Test : 2023–2025, lu une seule fois. 2026 (au 21/09) : descriptif.

## Mesures
R moyen par trade, t, % de gagnants, pire baisse (en R), rythme (trades remplis par semaine). **Comparaison appariée** : un même ordre (même année, même bougie de placement) rempli dans le contrôle et dans la variante donne une différence `R_variante − R_contrôle` ; on calcule le t apparié sur ces ordres communs. On rapporte aussi les ordres remplis seulement dans l'une des deux versions (nombre et R moyen).

## Critères d'entraînement (tous requis, par hypothèse, sur 2011–2022)
1. R moyen de la variante **≥ contrôle + 0,03 R** (soit ≥ +0,136).
2. **t apparié ≥ 1,96** (2 hypothèses, unilatéral : 0,05 / 2 = 0,025).
3. Variante > contrôle **et** > 0 dans A **et** dans B.
4. Pire baisse (R) ≤ 1,25 × celle du contrôle (≤ 34,3 R).
5. Rythme ≥ 1,5 trade par semaine sur 2023–2025 (nombre de trades seulement, sans lire R).

## Lecture du test 2023–2025 (une seule fois)
Seulement pour les variantes qui passent l'entraînement. Critère : R moyen de la variante **> R moyen du contrôle sur 2023–2025** (+0,183) **et > 0**. Pas de critère de t (échantillon trop petit). 2026 : descriptif.

## Verdict possible
- **Aucune ne passe** : F2 garde son stop. Résultat valable, pas de variante voisine (m = 1,1 ; 2 ; stop fixe en points…).
- **Passe l'entraînement et le test** : candidate pour remplacer le stop de F2, mais la règle ne change pas d'elle-même : Krystofia décide (elle dit que son stop est son point faible, et place le sien à sa façon).
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- `ANALYSE-STOPS-F2.md` a décrit la structure des stops sur 2011–2026, y compris 2023–2025 (combien de stops voient ensuite le TP). Ce n'est pas le R moyen de variantes de stop, mais le test 2023–2025 n'est pas totalement vierge pour cette idée : il a servi à compter, pas à juger un R. Les chiffres : 9 à 16 % des stops voient le TP sans descendre de 0,5 R sous le stop (jusqu'à 26 % pour 1 R).
- Les trades de F2 sont corrélés entre eux : les t sont un peu flatteurs, sauf le t apparié, plus fiable parce qu'il compare les mêmes ordres.
- Un stop plus large baisse le R des gains. À stop et TP de F2, le seuil d'équilibre du taux de gagnants passe d'environ 25 % à environ 33 % pour m = 1,5 : les stops sauvés doivent compenser.
- Ça ne dit rien sur le stop que Krystofia place à la main.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboL.mjs <data> train`, puis `... test S-1.25,S-1.5` pour les variantes qui passent. Moteur : `scripts/comboFvgV6/lib/krysBacktestW.js`. Tests dans `comboL.test.mjs`.
