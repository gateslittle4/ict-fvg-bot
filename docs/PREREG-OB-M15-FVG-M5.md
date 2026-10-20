# Pré-enregistrement — setup « OB M15 avec FVG M5 dedans » (OBM5), achats, contexte H4 de F2

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle sur 2011–2022 n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia (« ton vrai style », piste 1, puis « on essaie » pour l'entrée à 50 % du FVG M5). Définition de l'OB et du FVG M5 dedans : celle qu'elle a précisée (BRIEF-SEANCE-QUIZ, points 36–37), complétée par mes choix ci-dessous.

## Ce qui est déjà connu (pas vierge)
Ce setup a été testé mécaniquement en séance précédente sur l'historique du courtier **2023-02 → 2026-09** (limite au bord proche de l'OB, stop de l'autre côté + 1 pt, valable 3 h, coût 1 pt, avec cible FVG M15 à gauche) : 5 697 trades, +0,013 R par trade, 2023 −199 R, 2024 +78 R, 2025 −34 R, 2026 +230 R : pas d'avantage robuste. Ce test-ci est différent : il couvre **2011–2022** (jamais utilisé pour ce setup), ajoute le **contexte H4 de F2** (balayage) et une **entrée à 50 % du FVG M5**. 2023+ n'est donc pas vierge pour ce setup.

## Contrôle (référence)
F2C, inchangé. 2011–2022 : 1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 ; A +0,067, B +0,146. Il doit se reproduire exactement, sinon on s'arrête. OBM5 est un modèle d'entrée différent : F2C sert de référence de niveau, pas de contrôle apparié.

## La règle OBM5 (une seule hypothèse, figée) — achats seulement
1. **FVG M15 de la jambe** : FVG M15 haussier strict (c1, c2, c3 ; c1.high < c3.low) qui se forme à la clôture de la bougie M15 m (= c3). Il doit passer le **balayage H4 de F2** (le même filtre : FVG formé au plus 32 bougies M15 après la prise du plus bas des 6 dernières barres H4 complètes).
2. **OB M15** : X = c1 si c1 est baissière (clôture < ouverture), sinon la bougie juste avant c1 si elle est baissière ; sinon pas de setup. Zone de l'OB = mèche à mèche [X.low, X.high].
3. **FVG M5 dedans** : FVG M5 haussier strict (c1.high < c3.low en M5) **entièrement dans** la zone de l'OB (bas ≥ X.low, haut ≤ X.high), dont la dernière bougie (c3 M5) se clôture entre le début de X et la clôture de m. S'il y en a plusieurs : le **premier formé**. Un seul ordre par OB.
4. **Entrée** : ordre limite d'achat à **50 %** du FVG M5. L'ordre n'est posé que si, entre la clôture du FVG M5 et la clôture de m, le prix (low M5) n'a **pas déjà touché** ce niveau.
5. **Stop** = X.low − 3 pts (mis à l'échelle comme dans F2). **Cible obligatoire** : FVG M15 baissier non rempli, formé avant la pose, dont le bas est au-dessus de l'entrée, le plus proche ; **TP = max(½ cible, entrée + 3 R)**. Pas de cible : pas d'ordre.
6. **Vie de l'ordre** : posé à la clôture de m (si m est dans 06–16 NY), actif sur les 12 bougies M15 suivantes (3 h) ; annulé à 16 h NY, si le TP ou le stop est touché avant le remplissage (le stop compte même dans la bougie de remplissage). Remplissage si low + spread ≤ entrée.
7. **Sorties et coûts comme F2** : une position à la fois (un ordre rempli pendant une position est consommé sans trade), stop d'abord, sortie au temps à 96 bougies M15, spread 0,6 mis à l'échelle (prix/8200). Résolution des fills en M15 (les zones sont en M5).
8. Aucune autre valeur essayée (entrée au bord de l'OB, stop plus serré, fenêtre autre que 12 bougies, FVG M5 le plus bas, ventes, sans balayage H4). Si OBM5 échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
1. R moyen > 0 et t ≥ 1,96.
2. R moyen > 0 dans A (2011–2016) et dans B (2017–2022).
3. R moyen ≥ celui de F2C (+0,106).
4. Pire baisse ≤ 1,25 × celle de F2C (34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, seulement si l'entraînement passe)
R moyen > 0 et R positif dans au moins 2 des 3 années. 2026 : descriptif.

## Descriptif (non jugé)
Chaîne de filtrage : FVG M15 passant le balayage → OB trouvé → FVG M5 dedans → niveau non touché → cible trouvée → ordre posé → rempli. Résultat 2011–2022 avec le spread doublé (stress de coût). Part de TP, RR visé moyen.

## Divulgations
- **Mes choix** (non donnés par Krystofia) : OB = c1 ou la bougie avant ; fenêtre du FVG M5 (de X à la clôture de m) ; premier FVG M5 formé ; niveau non touché ; fenêtre d'ordre 12 bougies ; stop = bas de l'OB − 3 pts ; contexte H4 de F2 ajouté ; achats seulement ; fills en M15.
- **Le 50 % du FVG M5 n'est pas validé par des données** (repris de la règle M15) ; l'entrée au bord de l'OB, essayée avant en séance sans H4, n'est pas reprise ici.
- Krystofia a elle-même signalé que ce que compte dans son setup est la **sélection** (contexte H4, direction) ; ici la sélection est celle de F2, pas la sienne à la main.
- L'ancien test du courtier est un autre calcul (autre stop, autre entrée) ; on ne l'utilise pas comme contrôle.
- Les trades sont corrélés ; t un peu flatteurs ; seuil de 1,96 non corrigé pour les nombreuses variantes testées sur ces données.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAI_ob_m5.mjs <data> train`, puis `... test` si l'entraînement passe.
