# Pré-enregistrement : filtre ML des signaux existants (écrit AVANT tout calcul, 2026-10-15)

Demande d'Esdras : « fais du machine learning ». Question : un modèle simple, entraîné sur le passé, sait-il séparer les signaux du combo qui gagnent de ceux qui perdent, mieux que le hasard, hors échantillon ?

## Données et découpage (fixés maintenant)
- Signaux = tous les signaux `validated` non bloqués du vrai `LiveStrategyEngine` (combo en production : `CONFIG.symbols` = US100, US500, XAUUSD, EURUSD), un seul `warmUp()` sur `data/real-m1-full` (M1 broker sans trous, M15 reconstruits), règlement M1 exact (même `settleM1` que `runEngineM1Backtest.js`), coût = spread par défaut.
- ENTRAÎNEMENT : signaux avant 2025-01-01 (EURUSD/XAUUSD dès 2022-06, indices dès 2023-02). TEST : année 2025, lu UNE seule fois. FORWARD : 2026-01-01 → dernière bougie.
- Écart au protocole habituel (2010-2022 / 2023-2025 / 2026) : le M1 HistData 2010-2022 n'est pas dans le dépôt, et les CSV M15 anciens ont un décalage d'heure d'été connu. On reste donc sur le M1 broker, entraînement plus court (~2 ans). Déclaré ici.

## Variables (calculées avec les bougies M15 closes AVANT la bougie d'entrée uniquement)
mécanisme (one-hot), paire (one-hot), sens (+1/-1), heure NY d'entrée, jour de semaine, distance du stop en % du prix, distance du stop / ATR14, ATR14 / ATR100 (régime de volatilité), écart du prix à l'EMA200 H1 (EMA 800 bougies M15) / ATR14, rendement sur 5 jours / ATR14 (signé selon le sens du trade), amplitude de la dernière bougie / ATR14, RRR du signal. Rien d'autre, aucune variable ajoutée après coup.

## Modèles (fixés)
1. Régression logistique L2 (C = 1, variables standardisées). 2. Forêt aléatoire (300 arbres, profondeur max 3, min 30 trades par feuille). Cible : trade gagnant (R net > 0). Aucun réglage d'hyper-paramètres.

## Règle de décision (fixée)
Score = probabilité prédite. Filtre = ne prendre que les 50 % de signaux au meilleur score (seuil = médiane des scores d'ENTRAÎNEMENT, appliqué tel quel au test et au forward).
Un modèle est CANDIDAT si, sur le TEST 2025 (lu une fois) : (a) AUC > 0,55 ; (b) R/trade des signaux gardés ≥ R/trade de tous les signaux + 0,05 ; (c) R/trade des signaux gardés > 0 ; (d) p < 0,05 contre 1 000 permutations des étiquettes de l'entraînement (le placebo refait tout : entraîner sur étiquettes mélangées, mesurer l'AUC du test) ; (e) validation croisée temporelle sur l'entraînement (3 plis en expansion) AUC moyenne > 0,52.
Le forward 2026 est un contrôle de robustesse (même sens que le test = renforce, sinon = affaiblit). Aucun modèle n'est « adopté » sur ce seul résultat : au mieux « candidat, à confirmer en démo ». Si aucun modèle ne passe : le ML n'apporte rien sur ces signaux, et on le consigne comme rejeté.

## Ce qui est interdit
Changer les variables, les modèles, le seuil ou le découpage après avoir vu le test. Un second essai serait déclaré comme tel.
