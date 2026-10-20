# Pré-enregistrement — Critères de contexte 1 et 2 et leurs combinaisons (06/10/2026)

Écrit le 2026-10-06 (≈08:20 UTC), AVANT tout calcul de résultat. Les tests unitaires (5 OK) ont été lancés ; aucun backtest.

## Bases et critères
Règles de base inchangées (achats, 06:00–16:00 NY, FVG d'entrée ≤ 8 bougies, entrée 50 %, stop c1 − 3 pts, TP max(½ FVG cible, 3R), spread 0,6, échelle prix/8200, rejeu pessimiste).
- **Base b0** = achats sans filtre. **Base b2** = F2 (balayage du low H4, fenêtre 32). Les contrôles sont b0_none et b2_none.
- **Critère 1 (c1)** : à la bougie c3 du FVG d'entrée, le DERNIER PD array H4 touché est de type « bas ». Événements « bas » : low sous le low des 6 dernières barres H4 complètes ; FVG H4 haussier non rempli touché par le dessus (low ≤ bord haut ; mort si low ≤ bord bas). Événements « haut » : high au-dessus du high de la plage ; FVG H4 baissier non rempli touché par le dessous. Une bougie qui produit les deux types est ignorée. Aucun événement connu → c1 faux.
- **Critère 2 (c2)** : au moment de l'ordre, le FVG M15 cible (celui que le moteur choisit pour le TP) n'a jamais été pénétré (aucune mèche au-dessus de son bord bas depuis sa formation).
- **Combos** : c1 ; c2 ; and (c1 ET c2) ; or (c1 OU c2) ; sw (interrupteur : si un événement H4 a eu lieu dans les 96 dernières bougies avant c3 → c1, sinon → c2). Défaut d'interrupteur confirmé par l'utilisateur.
- 12 variantes = 2 bases × 6 (none, c1, c2, and, or, sw) ; 10 sont des hypothèses, 2 sont des contrôles. Aucune autre variante, aucun seuil à régler.

## Critères de réussite (tous requis, par variante)
1. ≥ 1,5 trade par semaine sur 2023–2025 (155 semaines ; seul le NOMBRE de trades est lu à l'étape 1).
2. Entraînement 2011–2022 : t ≥ 2,6 ; moyenne > 0 dans 2011–2016 ET 2017–2022.
3. Moyenne 2011–2022 supérieure à celle du contrôle de sa base.
4. Étape 2, lecture unique, seulement pour les variantes qui passent 1–3 : test 2023–2025 moyenne > 0. 2026 : rapporté, pas un critère.
Si plusieurs variantes passent, on retient celle au t le plus élevé. Avertissement écrit d'avance : 10 hypothèses sur les mêmes données (plus les 4 déjà testées) → un t de 2,6 se rencontre facilement par hasard ; une variante qui passe n'est pas une preuve, seulement une candidate pour la démo. Si aucune ne passe : « non validées », pas d'autre essai sur ces données.

## Empreintes (SHA-256)
- c0826ebd01e6ddaddf013f58080047fc8700e0ffc3bc8cf22e42f15084246a7b  comboH.mjs
- 7b8218942df4415588822c7fbdd9941c52e9a834ad4ecfc2e271852161a5186e  comboH.test.mjs
