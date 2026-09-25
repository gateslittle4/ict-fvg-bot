# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Filtre de sens par la tendance de fond (moyenne 200 jours) sur le combo

Date : 2026-09-25. Esdras : « si on se concentre sur un type de trade, genre achats seulement, ça retirerait beaucoup de trades perdants ? »
puis « oui » au filtre de tendance.
**Déjà vu (déclaré)** : la répartition achats / ventes du combo au rejeu fidèle — achats +1,6 / +219 / +57 / −2,3 R, ventes +28 / +77 /
−36 / −11 R (2011-16 / 2017-22 / 2023-25 / 2026). Jamais la répartition au-dessus / au-dessous de la moyenne 200 jours.

## Règle
Pour chaque trade du combo (rejeu fidèle 2010-2026, `data/live-replay/<tranche>.json`) : bougies journalières de sa paire 17:00 → 17:00
en temps moteur (comme RSI(2)), dernière clôture journalière TERMINÉE avant l'entrée, moyenne des 200 dernières clôtures à ce moment.
Un achat n'est gardé que si cette clôture > la moyenne ; une vente seulement si elle est < la moyenne. Aucune autre condition.

## Critère (fixé avant calcul)
Le filtre est retenu seulement si les trades qu'il RETIRE ont un R total négatif en 2011-2016 ET en 2017-2022 (il améliore les deux
moitiés de l'entraînement), puis, au test 2023-2025 lu une seule fois, si les trades retirés ont un R total ≤ 0. 2026 : descriptif.

## Limite déclarée
Filtrer les trades déjà rejoués ignore que retirer un trade libère la place de la paire pour un autre signal. Si le filtre est retenu,
il sera confirmé par un rejeu fidèle complet avant toute décision en réel (décision d'Esdras).
