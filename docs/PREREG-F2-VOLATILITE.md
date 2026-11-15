# Pré-enregistrement : F2 et régime de volatilité (VOL1)

Écrit le 2026-11-14, vers 20 h 30 heure de New York, AVANT tout calcul de cette étude. Règle, seuils et critères figés : aucun amendement après lecture. Origine : Krystofia demande une piste nouvelle ; observation du projet : son +64 R de 2025 vient presque entièrement d'avril 2025 (krach, forte volatilité), et elle dit que les nouvelles sont des « sources de displacement ». Hypothèse : F2 vaut davantage quand le marché bouge beaucoup.

## Question
Les ordres de F2 posés en régime de volatilité élevée ont-ils un R moyen plus élevé que ceux posés en régime calme ?

## Règle F2 (inchangée, rien n'est modifié)
F2C : achats ; 06 h–16 h New York ; FVG d'entrée ≤ 8 bougies ; balayage du plus bas des 6 dernières barres H4 dans les 32 bougies avant c3 ; entrée à 50 % ; stop = bas de c1 − 3 pts ; TP = max(½ FVG cible, 3 R) ; sortie au temps à 96 bougies ; spread 0,6 ; échelle prix / 8 200 ; une position à la fois. Moteur `lib/krysBacktestC.js`, constantes `RULES` de `comboF.mjs`, série continue (`loadAll`).

## Mesure de volatilité (VOL1), fixée ici
- Barres daily = jours calendaires de New York, clé `floor((t − 5 h) / 86 400)` en temps moteur, même convention que `dailyTrend` (comboAC_daily.mjs).
- Amplitude vraie relative d'un jour d : `TR(d) / close(d − 1)`, avec `TR = max(high − low, |high − close(d−1)|, |low − close(d−1)|)`.
- `ATRrel(d)` = moyenne des amplitudes relatives des 14 derniers jours complets (d − 13 à d).
- Régime à la bougie m = comparé à la clôture du **dernier jour complet avant le jour de m** : **élevé** si `ATRrel(d−1) > médiane des ATRrel des 120 jours complets précédents (d − 121 à d − 2)` ; sinon **calme**. Causal : aucune information du jour en cours.
- Pas de régime (moins de 134 jours complets d'historique) : la bougie est classée **calme** ; cela ne touche que le début de la série (fin 2010 – début 2011).
- Le régime est évalué à la bougie où l'ordre est **posé** (`placedIdx`). Un seul seuil (la médiane), une seule longueur (14 et 120). Aucun autre réglage ne sera essayé.

## Protocole (celui du projet : entraînement, puis une seule lecture du test)
Données : US100 série continue HistData 2011-2022 + broker 2023-2026 (`loadAll`), comme pour toutes les études F2.

### Contrôle
F2C 2011-2022 doit redonner 1 222 trades, R total 129,7, pire baisse 27,4. Sinon rien n'est lu.

### Entraînement : US100 2011-2022 (les R de 2023+ sont masqués ; seuls des nombres de trades sont affichés)
Les 1 222 trades de F2C sont partagés en « élevé » et « calme ». Quatre conditions, toutes requises :
1. R moyen élevé > R moyen calme, test de Welch t ≥ 1,96.
2. R moyen élevé ≥ 0,106 + 0,05 (soit ≥ 0,156), c'est-à-dire un gain d'au moins +0,05 R par trade sur F2C.
3. R moyen élevé > 0 dans chacune des deux moitiés 2011-2016 et 2017-2022.
4. Au moins 30 % des 1 222 trades sont en régime élevé (sinon la règle vide la stratégie et rien n'est jugé).
Si une condition manque : **VOL1 est rejetée**, le test 2023-2026 n'est pas lu (nombres de trades seulement), et c'est fini.

### Test : US100 2023-2025, lu une seule fois, seulement si l'entraînement passe
VOL1 **retenue comme prometteuse** si, sur 2023-2025 : R moyen élevé > R moyen calme ET R moyen élevé > 0 avec t ≥ 1,0. Sinon **rejetée**. 2026 : descriptif, non jugé.

### Descriptif (non jugé, lu seulement si l'entraînement passe)
- Par année 2011-2026 : n et R moyen des deux régimes.
- GER40, XAUUSD, US500, broker 2023-2026 (`real-m1-full`, régime calculé sur leur propre historique daily ; 2023 commence après 134 jours) : n et R moyen des deux régimes. Sens seulement.
- Part du temps en régime élevé (devrait être proche de 50 % par construction).

## Divulgations
- **Ce n'est pas une idée neuve dans les données** : US100 2023-2025 a été lu de nombreuses fois pour F2, et GER40/XAUUSD/US500 2023-2026 viennent d'être lus (`RESULTAT-F2-AUTRES-INSTRUMENTS.md`, verdict : non répliquée). Le découpage par volatilité, lui, n'a jamais été regardé. La seule période propre est 2011-2022 pour le découpage (mais F2 y a été choisie parmi des variantes : son +0,106 est gonflé).
- **Essai de plus** : c'est la N-ième variante testée sur F2 (voir `ls docs | grep PREREG-F2`). Même avec un seuil de 1,96 dans l'entraînement, il faut s'attendre à un faux positif de temps en temps.
- **Puissance faible** : écart-type ≈ 1,8 R par trade ; avec ~600 trades par régime, l'erreur type d'une différence de moyennes est ≈ 0,10 R. Une vraie différence de +0,05 R serait invisible la plupart du temps. Un rejet ne réfute pas l'idée.
- **Médiane glissante** : par construction, ≈ 50 % des jours sont « élevés » ; le filtre réduit donc le nombre de trades d'environ moitié, à l'inverse du souhait de Krystofia (plus de trades). S'il passe, il sert à **choisir quand F2 vaut davantage**, pas à ajouter des trades.
- Coûts : spread du projet, pas celui du broker. Pas de glissement.
- Les trades sautés ne libèrent pas la position dans la simulation (même limite que l'étude ML).

## Interdit après lecture
Aucun changement de longueur (14, 120), de seuil (médiane), de moment d'évaluation, de période ni d'instrument. Une autre mesure de volatilité (ATR H4, VIX, écart-type des clôtures…) demande un nouveau pré-enregistrement et compte comme un essai de plus. Simulation seulement ; aucune décision de trade n'est prise ici ; Krystofia décide.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAQ_volatilite.mjs data train` puis, seulement si l'entraînement passe, `... data test`. Le script refuse de tourner si ce fichier a été modifié (SHA-256 figé dans le script). Tests : `node --test scripts/comboFvgV6/comboAQ_volatilite.test.mjs`.
