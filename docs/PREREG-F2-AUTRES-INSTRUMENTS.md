# Pré-enregistrement : F2 gelée sur d'autres instruments (GER40, XAUUSD, puis US500)

Écrit le 2026-10-10, vers 20 h 55 heure de New York, AVANT tout calcul de cette étude. Règle et critères figés : aucun amendement après lecture des résultats. Origine : la question « comment la tester dans d'autres données pour voir sa performance ? ». Ce n'est pas une variante de F2 : la règle ne change pas d'un chiffre. On change seulement les données.

## Question
La règle F2C, appliquée telle quelle à des instruments autres que US100, donne-t-elle un R moyen positif ?

## Règle testée (identique à F2C, achats seulement, rien n'est modifié)
- Balayage : une mèche passe sous le plus bas des 6 dernières barres H4 complètes (barres alignées sur minuit New York). Le FVG d'achat se forme au plus 32 bougies M15 après.
- Fenêtre 06 h à 16 h heure de New York, pour tous les instruments (on ne l'adapte pas aux heures de séance de chaque marché). Âge du FVG d'entrée de 8 bougies au plus. Entrée à 50 % de la zone. Stop = bas de c1 moins 3 points.
- TP = le plus éloigné de la moitié du FVG cible et de 3 R. Sortie au temps à 96 bougies. Si le stop et le TP sont touchés sur la même bougie, le stop gagne. Une position à la fois.
- Moteur : `lib/krysBacktestC.js` avec les constantes `RULES` de `comboF.mjs`, comme pour F2C.
- Échelle des coûts, comme dans tout le projet : spread 0,6 et marge de stop 3, multipliés par (prix moyen de l'année civile / 8 200).

## Données
- Principal : GER40 et XAUUSD, M1 du broker (`real-m1-full`), fenêtre du 2023-01-01 jusqu'à la dernière bougie disponible (21/09/2026). Le M1 de XAUUSD commence en 2022-05, mais 2022 n'est pas utilisé, pour aligner les deux instruments.
- Secondaire (descriptif corrélé) : US500, HistData 2010-2022 puis broker 2023-2026.
- Contrôle : US100, qui doit redonner exactement F2C : 1 222 trades sur 2011-2022, R total 129,7, pire baisse 27,4. Si ce contrôle échoue, rien d'autre n'est lu.
- Choix des instruments : GER40 et XAUUSD sont les moins liés à US100 parmi les données disponibles. Je les ai choisis avant tout calcul de F2 sur eux. EURUSD, US30, XAGUSD et XTIUSD existent aussi dans le dossier et ne sont pas testés ici ; les tester plus tard compterait comme des essais de plus.

## Jugement principal (une seule hypothèse)
Série poolée GER40 + XAUUSD, 2023-01-01 à 2026-09-21. Quatre conditions :
1. R moyen poolé > 0 et t ≥ 1,96.
2. Les deux périodes sont positives : 2023-2024 et 2025-2026.
3. Chaque instrument pris seul a un R moyen ≥ 0.
4. Le contrôle US100 est réussi.

Verdict, du haut vers le bas, le premier qui s'applique :
- **Répliquée** : les quatre conditions passent.
- **Compatible, non prouvée** : R moyen poolé > 0 et t ≥ 1,0, sans que les quatre conditions passent toutes (le plancher de 1,0 est celui du protocole « prometteuse »).
- **Indiscernable du zéro** : R moyen poolé > 0 et t < 1,0.
- **Non répliquée** : R moyen poolé ≤ 0.

## Descriptif prévu (non jugé)
- Chaque instrument séparément : nombre de trades, gagnants, R total, R moyen, t, pire baisse, trades par semaine, R par an.
- US500 : 2011-2016, 2017-2022 et 2023-2026, avec la part de ses ordres posés à la même bougie qu'un ordre de US100 (mesure du recouvrement).
- US100 2023-2026, pour comparer.
- Sensibilité aux coûts : spread nul et spread doublé (deux autres colonnes, non jugées).
- Les achats sans filtre de balayage H4, sur les mêmes instruments (2023-2026), pour voir si le balayage ajoute quelque chose hors US100. Aucun jugement, aucune conclusion de variante.

## Divulgations
- **Puissance faible.** L'écart-type d'un trade de F2C est d'environ 1,8 R. Avec environ 2 trades par semaine sur 3,7 ans, GER40 et XAUUSD donnent au mieux 700 à 800 trades poolés, soit une erreur type d'environ 0,065 R. Si le vrai R moyen était +0,106 (la valeur de US100), la probabilité de passer t ≥ 1,96 serait d'environ 40 %. Un résultat « non prouvé » ne réfute donc pas F2 ; un résultat positif ne la prouve pas non plus.
- **Biais de sélection.** F2 a été retenue parmi plusieurs variantes sur US100 (v6, F1 à F3, G1, combos), et 2023-2025 est lu pour US100. Son +0,106 R est probablement gonflé. Un R plus bas ailleurs est attendu même si l'avantage existe.
- **Coûts.** Le spread réel du broker sur GER40 et XAUUSD n'est pas connu. La mise à l'échelle par le prix est la règle du projet, pas une mesure. La marge de stop proportionnelle au prix est arbitraire pour l'or.
- **Fenêtre horaire.** 06 h à 16 h New York n'est pas la séance active de GER40 (qui ouvre vers 3 h New York) ni celle de l'or.
- **Période.** L'ancienne règle v2 (différente de F2) a déjà été testée sur ces instruments en 2026 et avait échoué. Cela ne dit rien sur F2, mais la période 2026 n'est pas neuve pour moi sur ces marchés.
- **Données.** Bougies M15 reconstruites depuis le M1, trous de week-end et de jours fériés non comblés, ordre des mouvements dans une bougie inconnu : conventions pessimistes du moteur (stop d'abord).
- Les trades d'un même instrument sont corrélés ; le t est un peu flatteur.

## Ce qui est interdit après lecture
Aucun changement de règle, d'heure, de coût, d'instrument ou de période. Aucune variante voisine, quel que soit le résultat. Un autre instrument ne sera testé qu'avec un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement : aucun ordre réel, et aucune décision de trade n'est prise ici ; Krystofia décide.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAN_autres_instruments.mjs data docs/SORTIE-F2-AUTRES-INSTRUMENTS.txt` (le script refuse de tourner si ce fichier a été modifié). Tests : `node --test scripts/comboFvgV6/comboAN_autres_instruments.test.mjs`.
