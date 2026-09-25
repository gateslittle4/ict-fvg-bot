# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Taille réduite de moitié quand le marché est agité (volatilité)

Date : 2026-09-25. Esdras : « est-il possible de prédire le type de marché grâce au price action ? » ; réponse : la volatilité est
prévisible (les marchés agités restent agités), pas la direction ; proposition : réduire la taille quand le marché devient agité.
Esdras : « oui ».

**Déjà vu (déclaré)** :
- `ftmo-1step-vol-adaptive-risk-account-impact.md` (ancien combo FVG + Divergence, 2019-2025, même définition du régime) : régime
  « haut » moins rentable que « normal » (0,24 / 0,13 R contre 0,48 / 0,44 R), régime « bas » le plus faible. Jamais mesuré sur le
  combo actuel au rejeu fidèle.
- `regime-study-2010-2025.md` (signaux des modules, pas le combo) : volatilité haute légèrement meilleure, rien de significatif.
- Connaissance générale des périodes agitées (août 2011, août 2015, 2018, mars 2020, 2022, avril 2025). Aucun chiffre du combo actuel
  par régime de volatilité n'a été regardé.

## Règle (une seule, pas de variante)
Pour chaque trade du combo (rejeu fidèle 2010-2026, `data/live-replay/<tranche>.json`, mêmes fichiers que l'étude moyenne 200 jours) :
bougies journalières de sa paire 17:00 → 17:00 en temps moteur (HistData avant 2023, courtier ensuite), dernière bougie journalière
TERMINÉE avant l'entrée. Ratio = ATR(14) journalier (moyenne simple des vrais écarts) / moyenne des 100 dernières valeurs de cet ATR
— exactement la définition et le seuil de l'étude précédente (`checkVolatilityRegimeImpactFullCombo.js`), rien n'est réglé ici.
**Ratio > 1,5 (marché agité) → risque × 0,5** (le trade compte pour R / 2). Sinon risque normal. Pas d'historique suffisant → normal.

## Mesure
Courbe cumulée en R, trades classés par heure de sortie, remise à zéro au début de chaque période. Pire baisse (drawdown) en R.
Ratio de qualité = R total / pire baisse.

## Critère (fixé avant calcul)
Retenu seulement si le ratio de qualité AVEC la règle est supérieur à celui SANS la règle en 2011-2016 ET en 2017-2022, puis, au test
2023-2025 lu une seule fois, s'il est aussi supérieur. 2026 : descriptif. Sinon : NON RETENU.

## Limites déclarées
- Les stratégies A et B (ORB, Noise) ne sont pas dans les tranches du rejeu avant 2023 : elles ne sont pas évaluées ici.
- Réduire la taille ne change pas les trades pris (la place de la paire n'est pas modifiée) : le calcul sur les trades rejoués est exact
  pour les R, pas pour les règles FTMO (perte journalière), qui seraient vérifiées par une simulation de compte si retenu.
- Un ratio sur une période dépend beaucoup de sa pire baisse (un seul épisode) : c'est une mesure bruitée, d'où l'exigence de trois
  périodes sur trois.
