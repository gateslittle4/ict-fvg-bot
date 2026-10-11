# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Règle LX d'Esdras avec entrée AU MARCHÉ après rejet, au lieu de l'ordre limite

Date : 2026-09-30. Question d'Esdras : « pourquoi la version de Gemini est mieux que la mienne ? ». Hypothèse à isoler : la différence
vient de l'ENTRÉE (ordre limite posé au bord du FVG, qui ne se remplit que si le prix revient, contre entrée au marché après une
bougie de rejet), pas de l'idée. Cette étude ne change QUE l'entrée ; tout le reste de LX est identique.

## Ce qui reste identique à LX (`preregistration-esdras-lx-2026-09-28.md`)
`signalsLX` de `scripts/lib/esdrasMethod.js` sans modification : BMS M15, FVG d'entrée formé entre q+1 et q+4, objectif = FVG opposé à
gauche (≥ 0,1 % du prix, pas entièrement rempli), au moins 3R, fenêtres 7-11 h / 18-23 h NY, trois variantes de stop (LX-A, LX-E,
LX-M), sortie au plus tard 17 h NY, au plus 3 trades par jour, une position à la fois, règlement à la minute (stop d'abord, y compris
la minute d'entrée), spread et swap du projet. Niveau d'entrée de référence `E` = `plan[0].entry` du signal (bord, ou milieu pour LX-A
quand le bord ne donne pas 3R).

## Nouvelle entrée (LX-MKT)
À partir de l'instant de pose `tau` du signal, on regarde les bougies M15 fermées :
1. **Bougie de rejet** : achat : `low ≤ E` et `close > E` ; vente : `high ≥ E` et `close < E`. Ordre **au marché à l'ouverture de la
   bougie M15 suivante** (achat à l'ask, vente au bid).
2. **Annulation** (avant l'entrée) : une bougie clôture au-delà du stop (achat : `close ≤ stop`) ; l'objectif est touché ; 8 h après `tau` ;
   17 h NY. Une bougie qui touche `E` mais clôture du mauvais côté (dans la zone) n'annule pas : on attend la suivante.
3. **Contrôles à l'exécution** : le prix d'entrée réel doit rester du bon côté du stop, et le ratio réel (objectif − entrée) / (entrée −
   stop) doit rester ≥ 3 ; sinon pas de trade. Stop et objectif restent aux niveaux du signal.
Un signal donne au plus une entrée (pas de nouvelle tentative après un stop).

## Protocole (identique aux règles précédentes de la nuit du 26-28/09)
- **Exploration** US100 2011-2018 (`PHASES.explore`, moitiés 2011-2014 / 2015-2018). Chaque variante de stop est jugée séparément :
  au moins 60 trades, R moyen > 0, t ≥ 2,5 (trois candidates), les deux moitiés positives.
- **Placebo obligatoire** : chaque setup est décalé de 1 à 6 bougies M15 au hasard (même distance, même gestion, même entrée au
  marché), 20 tirages, graine fixe 20260930 ; la règle doit faire mieux que le placebo sur au moins 19 tirages sur 20, sinon rejet.
- Une variante retenue passe **une seule fois** en validation 2019-2022 (R > 0, t ≥ 2), puis en finale 2023-2024 + 2026 (R > 0, t ≥ 2)
  et sur US500 hors échantillon. Aucune lecture de ces périodes avant que l'exploration soit retenue.
- **Comparaison à l'ordre limite (descriptive, ne décide rien)** : sur l'exploration, R moyen de LX-MKT et de la référence limite
  (LX-A −0,085 R sur 1432 trades, LX-E −0,072 R sur 1656, LX-M −0,045 R sur 1382), et sur les signaux pris par les DEUX exécutions, R
  moyen de chacune.

## Ce que le résultat voudra dire (fixé à l'avance)
- LX-MKT retenue (exploration + placebo) : l'idée d'Esdras avait un avantage que l'ordre limite détruisait ; elle irait en validation.
- LX-MKT rejetée mais meilleure que la limite : l'entrée explique une partie de l'écart, pas assez pour rendre la règle exploitable.
- LX-MKT rejetée et pas meilleure : la différence avec la version de Gemini ne vient pas de l'entrée.
Aucun réglage ne sera modifié après lecture des résultats.

---

## AMENDEMENT (écrit AVANT tout calcul, même jour) — données d'exploration

Le M1 HistData 2010-2022 n'existe pas dans le dépôt (il est sur le poste d'Esdras) ; `loadPhase('US100', 'explore')` échoue ici. Le
règlement « à la minute » ne peut donc pas s'appliquer à l'exploration. Remplacement, décidé avant de voir le moindre résultat :
- L'exploration 2011-2018 utilise les bougies **M15** de `data/backtest-input/US100.csv`, une ligne par bougie, horodatée à sa dernière
  minute (début + 14 min). Ainsi la fermeture de la bougie tombe à l'heure exacte, l'entrée « à l'ouverture suivante » utilise le vrai prix
  d'ouverture de la bougie suivante, et le stop est vérifié avant l'objectif dans chaque bougie (y compris la bougie d'entrée) : **règlement
  plus pessimiste que la minute**, identique pour la référence limite, le marché et le placebo.
- La référence « ordre limite » est **recalculée sur ces mêmes bougies** (la référence M1 −0,085 / −0,072 / −0,045 R n'est plus
  comparable et n'est citée que pour mémoire).
- Tout le reste est inchangé : seuils (≥ 60 trades, R > 0, t ≥ 2,5, deux moitiés positives), placebo (20 tirages, ≥ 19 battus).
- Si une variante est retenue, la validation 2019-2022 et la finale (M1 du broker) restent à lire UNE fois, la validation avec le M1
  HistData sur le poste d'Esdras.
