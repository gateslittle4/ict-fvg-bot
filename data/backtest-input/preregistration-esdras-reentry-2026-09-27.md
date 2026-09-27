# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : les réentrées rapides après une perte, dans le sens du marché

Date : 2026-09-27. Esdras : « si tu as déjà le sens du marché, teste les réentrées après les pertes comme moi ». Dans ses trades de 2025,
les réentrées de moins de 30 minutes après une perte étaient son meilleur atout (+2 054 $).

## Règle RE (ajoutée à C1, tout le reste identique)
- **Déclencheur** : un trade C1 (ou une réentrée) vient de toucher son stop. Le sens H4 du trade est gardé : pas de nouvelle prise de
  PD array à attendre, pas de nouveau BMS.
- **Réentrée** : pendant les **90 minutes** qui suivent le stop, le premier nouveau FVG M15 dans le même sens compte, s'il a été formé
  après le stop. Il n'a pas besoin que D reste hors de la zone, car on veut entrer vite.
  - L'ordre limite est posé au bord du FVG dès la fermeture de C.
  - Stop sous la mèche de A.
  - Objectif : le même objectif H4 que le trade perdu, seulement s'il reste au moins 3R. Sinon, pas de réentrée.
- **Annulation et sortie** :
  - l'ordre non rempli est annulé 90 minutes après le stop, ou si l'objectif est touché avant ;
  - sortie à l'objectif, au stop, ou à 17 h NY comme le trade d'origine.
- **Limite** : au plus 3 trades remplis par jour, réentrées comprises.
- **Même risque (1R)**. Le « plus gros lot pour le même risque » d'Esdras revient au même en R.

## Critères
1. **Exploration US100 2011-2018** : les réentrées seules doivent avoir au moins 60 trades, un R moyen > 0, t ≥ 2 et les deux
   moitiés positives. C1 + RE doit aussi faire mieux que C1 seul.
2. **Si c'est retenu : test hors échantillon sur US500** pour les trois périodes additionnées (2011-2018, 2019-2022, 2023-2024 +
   2026). Les réentrées seules doivent avoir un R moyen > 0 et t ≥ 2.

   US500 a déjà servi à comparer C1 et SW, mais jamais pour les réentrées.
3. En descriptif : US100 2019-2022 et 2023-2026, qui ont déjà été lues.

Aucun réglage. La durée de 90 minutes est fixée ici et ne sera pas changée.
