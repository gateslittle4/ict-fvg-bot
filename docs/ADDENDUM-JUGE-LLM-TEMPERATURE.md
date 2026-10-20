# Addendum au pré-enregistrement du juge LLM : le paramètre de température

Écrit le 2026-10-20 vers 04 h 30 (heure de Port-au-Prince), **avant tout appel réussi au modèle**. Il complète `PREREG-F2-JUGE-LLM.md` (SHA-256 `ce159ae2e8c0bc2548632ecc5a33c2c3a1e3772bea5724e6a4e781ac302bbe36`), qui n'est pas modifié.

## Ce qui s'est passé
- Le plan fixait : « température 0, un appel par setup, aucun outil ».
- Au premier appel avec une clé valide, l'API a répondu par une erreur 400 : « `temperature` is deprecated for this model. » Aucun setup n'a été jugé, aucune dépense n'a été comptée.

## Décision (validée par Krystofia le 2026-10-20 à 04 h 29, message « oui »)
- Le paramètre `temperature` est retiré de la requête. Le modèle `claude-sonnet-5-5` utilise son réglage par défaut. Rien d'autre ne change : même modèle, même prompt (SHA-256 `bee60c72b7ae8354d10b064e557d7c0d722049d89dd76b9fa5cfc1606880ca0e`), même fenêtre, mêmes setups, mêmes critères, une seule exécution.

## Conséquence
- Les réponses ne sont plus garanties identiques d'une exécution à l'autre. Le plan annonçait déjà ce risque (« non déterministe ») et ne juge qu'une exécution.
- Un peu plus de bruit dans les réponses rend un petit avantage réel plus difficile à voir. Ce point s'ajoute aux limites du plan.

## Interdit après lecture
Inchangé : aucune nouvelle exécution pour « essayer mieux », aucun changement de prompt ni de critère.
