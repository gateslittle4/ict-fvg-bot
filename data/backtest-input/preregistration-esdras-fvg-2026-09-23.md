# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — le FVG d'Esdras (« deuxième vague » ICT)

Date : 2026-09-23. Règles données par Esdras (captures US100 M15 et M1, schéma « Complex Correction ») ; les détails qu'elle n'a pas précisés sont fixés ici, par moi, avant de voir un seul résultat. Aucun paramètre ne sera changé après lecture.

Idée (ICT, selon Esdras) : les banques n'entrent pas d'un coup ; une première vague crée une impulsion et un FVG, le prix s'éloigne, puis revient là où elles ont pris la première partie pour la seconde (« l'éléphant qui met un pied, attend que la piscine se stabilise, puis met l'autre »).

## Règles (achat ; vente = miroir)
1. **Unité de temps : M15.** Paires : **US100 et XAUUSD.**
2. **FVG** : 3 bougies c1, c2, c3 avec `c1.high < c3.low` ; zone = [c1.high, c3.low].
3. **Impulsion grande** : corps de c2 (|close − open|) ≥ **2 × ATR(14)** calculé sur les 14 bougies M15 précédant c2.
4. **Cassure de structure (BOS)** *(fixé par moi)* : la clôture de c2 dépasse le dernier sommet de swing confirmé avant c2 (pivot avec 5 bougies de chaque côté, convention du projet `SWEEP_LOOKBACK`).
5. **Le prix part loin** : après la formation, le prix atteint `haut ≥ bord haut + 2 × hauteur de la zone` AVANT de retoucher la zone (plus bas ≤ bord haut). Retouchée avant = zone abandonnée. La bougie c3 compte pour la distance, pas pour le contact.
6. **Entrée** : ordre LIMIT au **bord haut** de la zone, actif dès la bougie M15 qui suit celle où la distance est atteinte ; rempli quand l'ask touche le niveau (bid ≤ bord haut − spread), vérifié minute par minute sur M1.
7. **Stop** : bas de la zone. **Cible : 4R.** Stop ≥ 3 × spread (filtre de viabilité du bot), sinon pas de trade.
8. **Heures : 8h-12h heure de New York réelle (avec heure d'été)** *(fuseau fixé par moi)* : c2 doit commencer entre 8:00 et 12:00 NY, et l'ordre est annulé à 12:00 NY le jour même s'il n'est pas rempli.
9. Sortie : stop, cible, ou au marché après 5 jours (480 bougies M15), comme les autres stratégies du bot. Spread par défaut du projet (`DEFAULT_SPREADS`), swap ignoré (trades surtout intraday), aucun autre filtre du bot (biais HTF, structure, balayage) : la règle d'Esdras seule.
10. Compte : une position par paire, garde-fou du bot (3 trades/jour, pause 30 min après perte, -2 %/jour), FTMO 1-Step réel enchaîné.

## Périodes (protocole du projet)
Entraînement 2010-2022 (HistData M1, US100 dès 2010-11), test 2023-2025 et forward 2026 (M1 du broker).

## Critère de succès (fixé avant calcul)
- **Candidate** si, sur l'entraînement : ≥ 60 trades, R net > 0 avec t ≥ 2, positive en 2010-2016 ET 2017-2022 ; PUIS au test 2023-2025 : ≥ 30 trades, R net > 0 (lu une seule fois).
- Même candidate : suivi en démo/alerte avant tout passage en réel ; aucune adoption directe.
- Risque FTMO affiché à 0,25 / 0,5 / 0,75 / 1 % ; le risque « recommandé » = max(réussis − ratés) sur l'entraînement.
