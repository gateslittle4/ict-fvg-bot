# PROJET de pré-enregistrement : un juge LLM trie-t-il les FVG M15 mieux que le hasard ?

Statut : **DÉFINITIF et figé.** Écrit le 2026-10-20, avant tout calcul et avant tout appel à un modèle. Validé par Krystofia le 2026-10-20 à 03 h 13 (heure de Port-au-Prince) avec le message « Go ». SHA-256 du prompt `PROMPT-JUGE-F2.txt` : `bee60c72b7ae8354d10b064e557d7c0d722049d89dd76b9fa5cfc1606880ca0e`. Le SHA-256 de ce fichier-ci ne peut pas figurer dedans : il est noté dans le message de commit et vérifié par le script avant le premier appel, avec celui du prompt. Origine : « un agent IA qui réplique avec intelligence ma stratégie F2 mieux que des règles fixes ».

## Ce que cette étude est, et n'est pas
- C'est un test de **simulation**. Un modèle de langage lit le contexte de chaque setup au moment de la pose et répond « prendre » ou « sauter ». On compare ce qu'il a pris à ce qu'il a sauté.
- Ce n'est pas un agent qui trade. Aucun ordre réel, aucun courtier, aucune gestion du risque en direct. Krystofia décide.
- Si ce test échoue, il n'y a pas de raison de construire un agent plus complexe sur la même idée.

## Question
Un modèle de langage, qui ne voit que le contexte connu à la pose, choisit-il parmi les FVG M15 valides des setups qui gagnent plus que les autres, sur une période qu'il n'a pas pu voir à l'entraînement ?

## Le modèle et pourquoi cette période
- Modèle : `claude-sonnet-5-5`, une seule version figée, température 0, un appel par setup, aucun outil, aucun accès au web. Le nom exact renvoyé par l'API est enregistré avec chaque réponse.
- Date de coupure des connaissances du modèle : fin juin 2026.
- **Fenêtre de jugement : du 2026-07-01 à la fin des données disponibles (US100 jusqu'au 2026-09-21, GER40 et XAUUSD jusqu'à leur dernière date).** Un setup n'entre dans l'étude que si sa bougie de pose tombe dans cette fenêtre. Les mois proches de la coupure sont peu représentés dans l'entraînement, donc le risque de mémoire est faible mais pas nul. Il est annoncé dans les limites.
- Aucun setup d'avant le 2026-07-01 n'est jugé, sauf pour le contrôle descriptif plus bas.

## Les setups
- Les mêmes que dans l'étude ML « tous les FVG » : candidats de `lib/krysBacktestML.js` (option `noFill`), achats et ventes, avec ou sans balayage, règles de F2 pour le reste (06 h à 16 h NY, âge au plus 8, entrée 50 %, stop = c1 plus marge de 3, TP = le plus loin entre la moitié du FVG cible et 3R, sortie au temps à 96 bougies, spread 0,6, coûts mis à l'échelle par le prix).
- Étiquette : le R que l'ordre donnerait pris seul, calculé par le simulateur indépendant déjà validé (99,8 % d'accord avec le moteur sur F2). Les ordres jamais remplis n'ont pas d'étiquette et sont écartés de l'évaluation, mais le modèle les juge quand même, car il ne sait pas à l'avance s'ils seront remplis.
- Marchés : US100, GER40, XAUUSD, tous trois dans la fenêtre. Pas d'autre marché.
- Effectif attendu : de l'ordre de plusieurs centaines de setups étiquetés au total. Si moins de 300 setups sont jugés au total ou moins de 100 sont pris et étiquetés, le verdict est « non concluant ».

## Ce que le modèle voit (le « paquet de contexte »)
Tout est connu à la bougie de pose, rien ne regarde vers l'avant. Pour limiter la mémoire du modèle, le paquet est **anonymisé** :
- Pas de nom de marché, pas de date, pas de jour de la semaine, pas de prix absolu. Les prix sont exprimés en multiples de l'ATR14, à partir de l'entrée prévue (= 0).
- Les 96 dernières bougies M15 (open, high, low, close) dans cette échelle.
- Le FVG : sens, âge, hauteur, bornes ; le FVG cible ; le stop, le TP, le RR prévu, la distance en ATR.
- Balayage H4 : oui ou non, et nombre de bougies depuis.
- Heure de pose, par tranche (06 h-09 h, 09 h-12 h, 12 h-16 h).
- Les 18 variables du modèle ML sont calculées par le même code et recopiées en texte, pour que le juge ne dispose pas de moins d'information que le modèle statistique.
- Le format exact est dans `PROMPT-JUGE-F2.txt` (SHA-256 inscrit au moment du « go »). Le prompt ne change plus après.

## Ce que le modèle répond
Un JSON strict : `{"decision": "take" | "skip", "confidence": 0 à 100}`. Une réponse invalide est relancée une fois à l'identique ; si elle reste invalide, le setup compte comme « skip » et est compté dans un rapport d'erreurs. Une seule exécution complète. Toutes les réponses brutes sont conservées dans `data/juge-llm/`.

## Jugement principal
Sur les setups étiquetés de la fenêtre, regroupés (les trois marchés) :
1. Au moins 300 setups jugés et au moins 100 « take » étiquetés (sinon : non concluant).
2. R moyen des « take » > 0 et t ≥ 1,96.
3. R moyen des « take » supérieur à celui des « skip », avec un écart d'au moins 0,10 R.
4. Test de permutation (10 000 tirages, graine 12345) : les « take » battent des sous-ensembles aléatoires de même taille tirés parmi les setups étiquetés de la fenêtre, avec p ≤ 0,05.
5. Contrôles du pipeline : paquets reconstruits à l'identique par un second calcul sur un échantillon de 50 setups ; taux de réponses invalides inférieur à 2 %.

Verdict : **Juge utile** si tout passe ; **Compatible, non prouvé** si les « take » ont un R moyen > 0, t ≥ 1,0 et p ≤ 0,10 sans que tout passe ; **Non concluant** si l'effectif est insuffisant ; **Aucun gain** sinon.
Rapporté aussi, sans être jugé : chaque marché séparément, achats et ventes séparément, et le même calcul avec seulement les setups qui respectent les règles de F2 (achat avec balayage).

## Contrôle de mémoire (descriptif, non jugé)
Le même juge, avec le même prompt, est appliqué à un échantillon aléatoire de 600 setups de 2023-2025 (graine 12345), période que le modèle a pu voir. Si le juge paraît bon avant sa coupure et nul après, c'est le signe d'un effet de mémoire, pas d'une compétence. Cet échantillon ne sert qu'à cela.

## Coût et arrêt
- Plafond de dépense fixé à 10 dollars. Le script compte les tokens et s'arrête proprement avant le plafond ; une étude interrompue est déclarée interrompue, pas réussie.
- Le prix par token est à confirmer sur la page des tarifs de Claude avant le « go ». Aucune estimation chiffrée n'est donnée ici.
- La clé est lue dans la variable d'environnement `ANTHROPIC_API_KEY`. Elle n'apparaît ni dans le code, ni dans les journaux, ni dans le chat.

## Limites annoncées
- **Mémoire résiduelle.** Je ne peux pas prouver que le modèle n'a rien vu après juin 2026. L'anonymisation et le contrôle de mémoire réduisent le risque, ne l'effacent pas.
- **Période déjà vue en agrégat.** Les résultats de 2026 ont été lus dans l'étude ML (par exemple US100 2026 : +0,243 R pour le modèle statistique). Aucun détail de setup n'a servi à écrire le prompt, mais je le déclare.
- **Puissance faible.** Écart-type d'environ 1,8 R par trade et quelques centaines de setups : un petit avantage réel (+0,1 R) reste difficile à confirmer.
- **Setups corrélés.** Des setups voisins dans la même journée ne sont pas indépendants ; le t est un peu flatteur.
- **Non déterministe.** Même à température 0, deux exécutions peuvent différer légèrement. Une seule exécution est jugée.
- **Coûts.** Le spread réel des courtiers sur GER40 et XAUUSD n'est pas connu.
- **Ce n'est pas F2 seule.** Le test porte sur tous les FVG valides. Il dit si un juge LLM sait trier, pas si F2 est rentable.
- **Essai de plus.** C'est un nouvel essai après deux études ML sans gain.

## Phase 2 (hors de cette étude)
Un journal en direct, où le juge note chaque nouveau signal avant son issue, serait pré-enregistré à part, avec une date de départ postérieure à ce fichier. Il ne démarre pas tant que cette étude n'a pas de verdict.

## Interdit après lecture
Aucun changement de prompt, de modèle, de format de paquet, de fenêtre, de marché, de critère ou de seuil. Pas de seconde exécution pour « essayer mieux » sur la même fenêtre. Tout autre juge ou tout autre prompt demande un nouveau pré-enregistrement avec de nouvelles données. Simulation seulement : aucun ordre réel, aucune décision de trade ; Krystofia décide.
