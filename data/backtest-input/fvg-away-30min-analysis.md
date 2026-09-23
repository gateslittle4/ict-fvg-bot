# FVG « le prix part au moins 30 min puis revient » (définition d'Esdras) — ordre LIMIT posé à l'avance

Question d'Esdras (2026-09-23) : le FVG qu'elle trade n'est pas celui qui a été testé. Sa définition : la zone se forme, le prix s'en va pendant plus de 30 minutes, puis revient clairement dedans ; un ordre LIMIT posé au bord de la zone est donc exécutable en réel (capture : zone US100 M15, entrée au bord haut, stop sous la zone).

**Méthode** (`LIVE_FILL=resting FVG_AWAY=2 node scripts/runCleanStudy.js legs|port ...`) : moteur multi-contacts, nouvelle option `minAwayCandles: 2` (`src/backtest/fvgMultiTouch.js`) = la zone est abandonnée si le prix la touche pendant les 2 bougies M15 qui suivent sa formation ; ensuite, ordre LIMIT au bord de la zone, filtres de production (biais HTF, structure, session, balayage de liquidité) lus à la dernière clôture avant le contact, rempli au premier contact (ask pour un achat), stop et objectif de production, réglé à la minute. Même protocole que l'étude propre : entraînement 2010-2022 (HistData M1), test 2023-2025 et 2026 (M1 du broker). Comparé au LIMIT posé à l'avance sans la règle des 30 minutes (`LIVE_FILL=resting`).

**R net (garde-fou du bot, risque 0,5 %) et FTMO réussis/ratés, entraînement / test / 2026 :**

| Jambe (RRR) | Règle 30 min | LIMIT à l'avance sans la règle |
|---|---|---|
| FVG US100 1:5 (prod) | -170,6 R (0/9) / -40,0 R (0/2) / -21,6 R | -273,8 R (3/20) / -65,9 R (0/4) / -36,7 R |
| FVG US100 meilleur RRR à l'entraînement (1:6) | -160,4 R / -35,1 R / -19,7 R | (1:7) -213,5 R / -33,9 R / -39,1 R |
| FVG US500 1:5 (prod) | -86,6 R / -32,7 R / +4,1 R | -66,0 R / -18,2 R / -19,6 R |
| FVG XAUUSD 1:4 (prod) | -105,9 R / -20,6 R / +8,9 R | -40,0 R / +51,3 R / +21,4 R |
| FVG XAUUSD meilleur RRR à l'entraînement | (1:3) -98,0 R / -22,5 R / +4,0 R | (1:5) -15,1 R / +32,1 R / +24,3 R |

**Conclusion :** la règle « au moins 30 minutes hors de la zone » fait moins de pertes sur US100 que le LIMIT à l'avance sans règle, mais reste nettement perdante sur toutes les paires et toutes les périodes d'entraînement (aucun RRR positif sur 2010-2022). Sur l'or elle fait moins bien que sans règle. Rejetée telle quelle. Limites : filtres de production conçus pour l'ancienne entrée (au contact, avec la clôture) ; « loin » traduit seulement par « pas de contact pendant 30 min », sans distance minimale ni taille d'impulsion ; heures de session de production (US100 8-12 h New York).
