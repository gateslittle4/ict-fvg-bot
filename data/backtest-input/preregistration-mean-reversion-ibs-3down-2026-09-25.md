# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Retour à la moyenne journalier : IBS et « 3 baisses de suite »

Date : 2026-09-25. Esdras : « lequel de ces stratégies qui gagnent qu'on peut faire ? » puis « oui ». Deux règles connues de la famille du
retour à la moyenne sur indices, choisies AVANT de regarder la moindre donnée pour elles. Déjà connu (déclaré) : RSI(2) sur US500
(même famille) fait −3,2 R sur 101 trades au rejeu fidèle 2011-2026.

## Données, bougies, coûts (mêmes conventions que RSI(2) en live)
US100 et US500. M1 bid : HistData 2011-2022, courtier 2023 → 2026-09-21. Bougies journalières 17:00 → 17:00 en temps moteur (heure de
New York fixe), construites à partir des M1. Décision à la clôture d'un jour, exécution à l'OUVERTURE du jour suivant. Achat au prix
ask (bid + spread par défaut du projet, mis à l'échelle du prix), sorties au bid ; swap du courtier (`swapPerUnit`) pour chaque nuit tenue.
Stop de protection à 3 × ATR(14) journalier sous le prix d'entrée, vérifié minute par minute (stop d'abord ; ouverture au-delà du stop =
sortie à l'ouverture). R = distance entre l'entrée et ce stop. Achats seulement.

## Règle 1 — IBS (force de clôture)
IBS = (clôture − plus bas) / (plus haut − plus bas) du jour. Entrée si IBS < 0,2 ET clôture > moyenne des 200 dernières clôtures.
Sortie à l'ouverture suivante dès qu'une clôture a un IBS > 0,8, ou après 10 jours tenus, ou au stop.

## Règle 2 — 3 baisses de suite
Entrée si les 3 dernières clôtures sont chacune inférieures à la précédente ET clôture > moyenne 200 jours.
Sortie à l'ouverture suivante après la première clôture supérieure à la précédente, ou après 10 jours tenus, ou au stop.

Une seule position par règle et par paire à la fois (pas de nouvelle entrée tant que la précédente est ouverte).

## Critère (deux hypothèses testées : seuil relevé à t ≥ 2,2)
Chaque règle est jugée sur US100 + US500 réunis (chaque paire donnée à part, descriptif).
- Entraînement 2011-2022 : au moins 60 trades, R moyen > 0, t ≥ 2,2, R total positif en 2011-2016 ET en 2017-2022. Sinon ÉCHEC.
- Test 2023-2025, lu une seule fois : R moyen > 0 → CANDIDATE (mode alerte avant tout réel, décision d'Esdras). Sinon ÉCHEC.
- 2026 et taux de gains : descriptifs.
Aucune variante (seuils d'IBS, nombre de jours, moyenne, stop) ne sera essayée après le calcul sans nouveau pré-enregistrement.
