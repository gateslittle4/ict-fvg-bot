# Règles v2 figées (pré-enregistrement) — méthode FVG de Krystofia

Écrit avant de tester sur de nouvelles données. Une fois ce fichier figé, aucun chiffre ne change pendant les tests hors échantillon ; tout changement = nouvelle version (v3) et nouveau jeu de données.

## Règles (issues de la séance quiz, voir `docs/BRIEF-SEANCE-QUIZ.md`)

1. **FVG d'entrée** : FVG M15 strict (3 bougies contiguës, mèches comprises) avec la règle c4 (la bougie qui touche devient c3, bord proche figé à la validation). Validé seulement après une bougie entièrement dehors. Taille indifférente.
2. **Récence** : le FVG d'entrée doit avoir 8 bougies M15 (2 h) ou moins depuis sa formation.
3. **Plage horaire** : ordres posés entre 06:00 et 16:00 heure de New York.
4. **FVG cible (« à gauche »)** : premier FVG M15 strict du sens opposé, dans le sens du TP, non entièrement rempli (mèches comprises), sans limite d'âge. Sans cible, pas de trade.
5. **Prix jamais tradé** : on ne trade pas un prix au-delà de tous les plus hauts / plus bas de l'historique.
6. **Sens H4** : le FVG se forme au plus 32 bougies M15 après un balayage H4 dans le sens du trade (creux H4 pris pour un achat, sommet H4 pris pour une vente ; référence = les 6 dernières bougies H4 complètes, alignées sur minuit NY).
7. **Entrée** : ordre limite à 50 % de la zone restante du FVG.
8. **Stop** : bord lointain du FVG + 3 points (achat : en dessous, vente : au-dessus). *À exprimer ensuite en fraction d'ATR pour les autres instruments : voir tests.*
9. **TP** : TP fixe à 4R (c'est la configuration réglée sur le simulateur). Erratum : la première rédaction disait « le plus éloigné entre la moitié du FVG cible et 4R » ; cette variante est testée à part.
10. **Gestion** : un ordre par FVG, une position à la fois, pas de nouvel ordre dans le même sens si déjà en position, ordre annulé à 16:00, si la zone meurt, ou si stop / TP est touché avant le remplissage. Sortie au temps après 96 bougies.
11. **Coûts** : spread de 0,6 pt (simulateur) ; à remplacer par le spread réel par heure pour les tests suivants.

## Protocole de validation (dans l'ordre)

| Étape | Test | Critère de réussite (fixé d'avance) |
|---|---|---|
| A | Données jamais vues, même instrument (US100 2026, bougies M15 du bot) | espérance par trade > 0 après spread ; au moins 100 trades |
| B | Autre instrument (US500) avec stop en fraction d'ATR | espérance > 0 ; mêmes signes qu'en A |
| C | Robustesse : marge de stop 2 et 4 pts (ou ±33 % d'ATR), TP 3R et 5R, âge 6 et 10 | au moins 2/3 des variantes restent > 0 |
| D | Mélange aléatoire de l'ordre des trades (1000 tirages) | drawdown du 95e centile acceptable pour elle |
| E | Coûts réalistes : spread par heure, glissement 0,3 pt | espérance reste > 0 |
| F | Jugement de Krystofia sur les trades du bot (à l'aveugle) | accord ≥ 80 % avec ses décisions |
| G | Démo en direct, 1 à 2 mois, sans argent réel | résultats cohérents avec A–E |

Si A ou B échoue : le résultat sur les 7 mois du simulateur était du surajustement ; on revient aux règles et au jeu quiz (étape F en premier).

## Résultats de référence (échantillon d'ajustement, donc optimistes)

Simulateur, 13 405 bougies M15 (~7 mois), filtre H4 N=6 / W=32, stop +3, minRR 4 : 97 trades, 26 % de gagnants, environ +28R, drawdown environ 10R, positif dans les deux moitiés (+14R / +14R).
Sans filtre H4 : 296 trades, +29R (0,10R par trade). Contrôle à sens inversé : +16R (0,13R par trade). Le filtre H4 ne prouve donc pas encore son utilité seul.

Ce document ne garantit rien : un backtest ne prédit pas les résultats futurs et ce n'est pas un conseil financier.

## Résultat du test A (données réelles 2026, jamais vues) — 2 octobre 2026

| Instrument | Trades | Gagnants | Total | Par trade |
|---|---|---|---|---|
| US100 | 90 | 13 % | −30R | −0,33R |
| US500 | 104 | 14 % | −29R | −0,28R |
| GER40 | 125 | 12 % | −50R | −0,40R |
| XAUUSD | 77 | 12 % | −32R | −0,42R |

Critère de réussite fixé d'avance (espérance > 0) : **non atteint**. Les règles v2 ne sont pas validées ; les étapes suivantes (B à G) ne s'appliquent pas à ces règles.
