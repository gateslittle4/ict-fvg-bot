# Pré-enregistrement : la règle F2 transposée au swing court terme (SW1 : FVG H1, balayage daily)

Écrit le 2026-11-14, vers 21 h 05 heure de New York, AVANT tout calcul de cette étude. Règle, coûts et critères figés : aucun amendement après lecture. Origine : Krystofia demande si un trading « court terme » (un trade tenu 2 à 3 jours) pourrait marcher, après deux échecs de F2 (`RESULTAT-F2-AUTRES-INSTRUMENTS.md`, `RESULTAT-F2-VOLATILITE.md`). Cet horizon n'a jamais été testé dans le projet.

## Question
La règle F2, appliquée telle quelle à des bougies d'une heure (au lieu de 15 minutes) avec un balayage de plus bas daily (au lieu de H4), donne-t-elle un R moyen positif après spread et swap ?

## Règle SW1 (F2 multipliée par 4 dans le temps ; aucun chiffre de la règle ne change en nombre de bougies)
- Bougies d'entrée : **H1**, construites depuis le M15 du projet, alignées sur les heures de New York (clé `floor((t − 5 h) / 3 600)`, temps moteur).
- Achats seulement. FVG strict et validation c4, comme F2 (même moteur).
- **Balayage** : une mèche passe sous le plus bas des **4 derniers jours complets** (jours calendaires de New York, clé `floor((t − 5 h) / 86 400)`). F2 regarde 6 barres H4 = 96 bougies d'entrée ; ici 4 jours = 96 bougies H1. Le FVG d'achat se forme au plus **32 bougies H1** après (comme F2 : 32 bougies).
- Âge du FVG d'entrée : 8 bougies au plus. Entrée à 50 % de la zone. Stop = bas de c1 moins 3 points (× échelle). TP = le plus éloigné entre la moitié du FVG H1 cible et 3 R. Si le stop et le TP sont touchés dans la même bougie, le stop gagne. Une position à la fois.
- **Pas de fenêtre horaire** (la fenêtre 06 h–16 h de F2 n'a pas d'équivalent en H1) : ordres posés à toute heure.
- **Durée de vie d'un ordre non rempli : 40 bougies** (dans F2, un ordre posé à 06 h est annulé à 16 h : 40 bougies). C'est le seul ajout au moteur (option `orderMaxBars`).
- **Sortie au temps : 96 bougies** (comme F2), soit 4 jours de cotation.
- Échelle des coûts : spread 0,6 et marge de stop 3, multipliés par (prix moyen de l'année civile / 8 200), comme dans tout le projet.
- **Swap (nouveau coût)** : 7 % par an du notionnel, compté par nuit calendaire passée en position (passage de 17 h New York ; les week-ends comptent, comme le triple swap). Coût en R = prix d'entrée × 0,07 / 365 × nuits / risque. Le swap réel du broker de Krystofia n'est pas connu : 7 % est une hypothèse prudente (taux directeur + marge du broker), supérieure au coût réel de 2011 à 2021.
- **Tous les R jugés sont nets du spread et du swap.**

Moteur : `lib/krysBacktestS.js` = copie de `krysBacktestC.js` avec la seule option `orderMaxBars`. Sans l'option, il doit donner les mêmes trades que `krysBacktestC.js` (test d'identité).

## Données
US100, série continue HistData 2010-11 → 2022 puis broker 2023 → 21/09/2026 (M1 → M15 → H1), comme toutes les études F2.

## Contrôles (si l'un échoue, rien d'autre n'est lu)
1. F2C en M15 avec le nouveau moteur, sans l'option : 1 222 trades sur 2011-2022, R total 129,7, pire baisse 27,4.
2. Le nombre de bougies H1 par an est entre 5 000 et 6 500.

## Entraînement : US100 2011-2022 (les R de 2023+ sont masqués ; seuls des nombres de trades sont affichés)
Quatre conditions, toutes requises :
1. Au moins 150 trades. En dessous : **non jugeable**, et on s'arrête.
2. R moyen net > 0 avec t ≥ 1,96.
3. R moyen net > 0 dans chacune des deux moitiés, 2011-2016 et 2017-2022.
4. R total net / pire baisse ≥ 2.
Si une condition manque : **SW1 est rejetée**, le test n'est pas lu, c'est fini.

## Test : US100 2023-01-01 → 21/09/2026, lu une seule fois, seulement si l'entraînement passe
**Prometteuse** si R moyen net > 0 et t ≥ 1,0. Sinon **rejetée**. « Prometteuse » ne veut pas dire prouvée : la suite serait un suivi en démo, pas de l'argent réel.

## Descriptif (non jugé ; la partie 2011-2022 est lue avec l'entraînement, la partie 2023+ seulement si l'entraînement passe)
- Par année : nombre de trades et R moyen net.
- Durée des trades : médiane en heures, part des trades tenus au moins une nuit, part sortie au temps.
- Coûts : R moyen sans swap, avec swap à 10 %, avec spread doublé.
- Achats H1 sans filtre de balayage (le balayage ajoute-t-il quelque chose à cet horizon ?).
- **Variante H4 (SW4)**, pour information seulement : mêmes règles sur bougies H4 (alignées sur minuit New York), balayage du plus bas des 16 derniers jours complets (96 bougies H4), le reste identique en nombre de bougies (âge 8, fenêtre 32, ordre 40, sortie 96). Attendu : moins de 100 trades en 12 ans, donc non jugeable ; elle ne peut ni valider ni remplacer SW1.
- US500 (HistData + broker), règle SW1 : sens seulement, très corrélé à US100.

## Divulgations
- **Changement par rapport à ce qui a été annoncé à Krystofia** : je lui avais proposé « FVG en H4, balayage daily ». À raison d'environ un trade toutes les 230 bougies (rythme de F2), le H4 donnerait environ 80 trades en 12 ans : erreur type ≈ 0,20 R, rien à juger. Le H1 donne environ 300 trades et des durées de 1 à 4 jours, proches de ce qu'elle décrit (« un trade fait 2-3 jours »). Le H4 reste en descriptif. Ce choix est fait avant tout calcul, sur le seul nombre de bougies.
- **Essais multiples** : c'est une hypothèse de plus dans une longue série (voir `ls docs | grep PREREG`). F2 a été choisie parmi des variantes sur US100 ; sa logique (achat après balayage d'un plus bas) est donc déjà « passée par » ces données en M15. Le H1 n'a jamais été regardé.
- **Puissance faible** : écart-type attendu ≈ 1,8 R par trade ; avec 300 trades, l'erreur type est ≈ 0,10 R. Il faut un R moyen d'environ +0,20 pour passer t ≥ 1,96. Un rejet ne prouve pas que l'horizon ne vaut rien.
- **2023-2026 n'est pas vierge** pour US100 en M15 (lu de nombreuses fois). Les trades H1 sont d'autres trades, mais le marché est le même : un test réussi resterait un indice.
- **Marché haussier** : achats seulement sur un indice qui a été multiplié par plus de 10 depuis 2011. Tenir plusieurs jours expose davantage à la dérive haussière que le M15 : un R positif peut venir de la hausse du NAS et non du setup. Le descriptif « achats sans filtre » sert à le voir.
- **Écarts de week-end et de clôture** : un trou de cotation peut créer un FVG (c1 vendredi, c3 lundi) et faire sauter un stop ; le moteur sort au prix du stop, pas au prix d'ouverture (optimiste sur les trous). Jours calendaires de New York, pas séances (18 h → 17 h).
- **Swap** : hypothèse, pas une mesure. Les dividendes de l'indice ne sont pas modélisés.
- Les trades d'une même série sont corrélés ; le t est un peu flatteur.

## Interdit après lecture
Aucun changement d'unité de temps, de fenêtre, de durée, de coût, de seuil ou d'instrument. Aucune variante voisine (H2, autre nombre de jours, fenêtre horaire…), quel que soit le résultat : une autre unité de temps demande un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement ; aucun ordre réel ; aucune décision de trade n'est prise ici ; Krystofia décide.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAR_swing.mjs data train`, puis, seulement si l'entraînement passe, `... data test`. Le script refuse de tourner si ce fichier a été modifié (SHA-256 figé dans le script). Tests : `node --test scripts/comboFvgV6/comboAR_swing.test.mjs`.
