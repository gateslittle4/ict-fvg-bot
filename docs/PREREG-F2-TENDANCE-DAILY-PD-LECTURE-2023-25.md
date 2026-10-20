# Addendum — lecture exploratoire 2023–2025 de TD2

Écrit le 2026-10-07, AVANT la lecture. TD2 (`PREREG-F2-TENDANCE-DAILY-PD.md`) a été rejetée à l'entraînement sur un seul critère (rythme 0,97 pour 1,0). Krystofia demande de lire 2023–2025 « pour voir ». Cette lecture est **exploratoire** : elle ne peut jamais compter comme « passe » (la règle est rejetée) ; elle ne donne qu'un indice. Une seule lecture, aucune variante, aucune relecture.

## Ce qui est lu
`node comboAD_dailyPD.mjs <data> test` : TD2 contre F2C sur 2023–2025 (R moyen, nombre, gagnants, pire baisse, t), R moyen des trades de F2C retirés par TD2, et 2026 en descriptif.

## Critère écrit d'avance (celui des lectures de test habituelles)
« Compatible avec l'entraînement » si : R moyen de TD2 > R moyen de F2C sur 2023–2025 **et** > 0 **et** R moyen des trades retirés < R moyen de TD2. Sinon « non compatible ». Dans les deux cas : indice seulement, aucune règle ajoutée, aucune démo.

## Divulgations
- 2023–2025 n'est pas vierge pour F2 (son R global +0,171 a été lu) : la lecture de TD2 ne compare que TD2 à F2C sur des années déjà vues en partie. Elle ne redevient donc jamais une vraie confirmation hors échantillon, et elle consomme ce qu'il restait de vierge pour TD2.
- Le rythme (0,97 par semaine) sur ces années était déjà connu (nombre de trades) : il reste en dessous du seuil.
- La confirmation propre demanderait des données nouvelles (après le 21/09/2026).
