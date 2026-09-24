# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Frein de risque contre risque fixe, pour les challenges FTMO 1-Step, combo live actuel

Date : 2026-09-24. Demande d'Esdras (objectif : challenges FTMO) : « refais le test [du frein] sur le combo actuel ». L'ancien test (`adaptive-risk-and-eurusd-drop-2026` dans la mémoire de recherche) portait sur l'ancien combo (avec FVG, simulation invalide) et 9 mois seulement.

## Données
Trades du **combo live actuel** au rejeu fidèle 2010-2026 (`data/live-replay/*.json`, R par trade, exécution du bot ; Silver Bullet US500 inclus, correctif Divergence inclus). Les trades sont fixes (déjà passés par le garde-fou au rejeu) ; seule la taille change.

## Configurations comparées (fixées ici)
- Risque fixe : **0,25 / 0,3 / 0,5 / 0,75 / 1 %** par trade.
- Frein : risque de base **0,5 %** ou **0,75 %**, **divisé par deux** dès que le solde est à **−4 %** ou **−5 %** de son plus haut du cycle en cours ; retour au risque de base à un nouveau plus haut. (4 variantes : 0,5/−4, 0,5/−5, 0,75/−4, 0,75/−5.)

## Simulation
Compte de 10 000 $, `GuardrailEngine` avec la configuration FTMO 1-Step du projet (`buildEffectiveConfig`, `propFirmProgramId: 'ftmo-1step'`) : objectif +10 %, perte max, perte du jour. Un cycle s'arrête à l'objectif (RÉUSSI) ou à la perte max (RATÉ) ; le suivant démarre aussitôt. Entrée à l'heure d'entrée, P&L à la sortie, taille = solde × risque au moment de l'entrée.

## Critère (le même que les études précédentes)
- Choix sur l'**entraînement 2010-2022 seul** : la configuration qui maximise **réussis − ratés** (à égalité : le moins de ratés). Le frein est retenu seulement s'il bat le meilleur risque fixe sur ce critère.
- Puis lecture unique du test 2023-2025 et de 2026 (réussis, ratés, durée médiane d'un cycle réussi), sans rien choisir dessus.
- Limites déclarées : coût d'un échec FTMO non chiffré (le critère compte 1 réussi = 1 raté) ; trades du rejeu recollés par tranches.
