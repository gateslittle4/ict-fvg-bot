# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — « Sweep de la nuit + déplacement à 9:30 + FVG » (scénario du 2026-09-24)

Date : 2026-09-24. Esdras : « tu vois comment ça a fonctionné aujourd'hui ? cherche le pourquoi », puis « oui » au test. Le scénario vient de la journée US100 du 24/09 (déclaré : l'idée est née d'UNE journée qui a marché ; cette journée n'est pas dans les données du test, qui s'arrêtent au 2026-09-21). Règles fixées ici, avant tout résultat ; rien ne sera changé après lecture ; pas de filtres ajoutés si ça échoue.

## Définitions (heure de New York réelle, heure d'été comprise ; barres M1 au bid)
- Asie = 20:00–23:59 la veille ; Londres = 02:00–04:59 ; pré-ouverture = 05:00–09:29 ; séance NY de la veille = 09:30–15:59 la veille.
- Bougies M15 : A = 9:15–9:29, B = 9:30–9:44 (déplacement), C = 9:45–9:59.

## Règles — achat (vente = miroir exact)
1. **Sweep** : le plus bas de la pré-ouverture < le plus bas de Londres.
2. **Plancher tenu** : ce plus bas de pré-ouverture est fait avant 8:00 (aucun nouveau plus bas de 8:00 à 9:29).
3. **Déplacement à 9:30** : clôture de B > plus haut de la pré-ouverture (cassure de structure).
4. **FVG** : plus haut de A < plus bas de C ; zone = [haut de A, bas de C].
5. **Entrée** : ordre LIMIT au haut du FVG (bas de C), actif de 10:00 à 11:59 ; rempli quand l'ask touche (bid ≤ niveau − spread), vérifié à la minute.
6. **Stop** : plus bas de B. Stop ≥ 3 × spread, sinon pas de trade.
7. **Cible** : la plus proche, au-dessus de l'entrée et à **au moins 2R**, parmi le plus haut d'Asie, le plus haut de Londres et le plus haut de la séance NY de la veille ; aucune → pas de trade.
8. **Sortie** : stop (vérifié d'abord dans une même minute), cible, sinon à la clôture de 15:59.
- Un trade par jour et par paire au maximum. Spread par défaut du projet ramené au niveau de prix ; pas de swap (fermé le jour même).

## Paires, périodes, critère (celui du projet)
- **US100 = jambe principale** (le scénario vient d'US100) ; **US500 = contrôle** (un vrai effet devrait avoir le même signe), jamais adoptable seul.
- Entraînement 2010-2022 (HistData M1), test 2023-2025 et 2026 (M1 du broker, → 2026-09-21).
- **Candidate** si, à l'entraînement : ≥ 60 trades, moyenne > 0 avec t ≥ 2, positive en 2010-2016 et en 2017-2022 ; puis au test (lu une fois) : ≥ 30 trades et > 0. Moins de 60 trades à l'entraînement = **non concluant** (on ne relâche pas les règles pour en avoir plus). Une candidate passe en démo/alerte avant tout réel.
