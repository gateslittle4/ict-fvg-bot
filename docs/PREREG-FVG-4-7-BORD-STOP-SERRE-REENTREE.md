# Pré-enregistrement — FVG formé 4 h–7 h, testé 7 h–10 h, entrée au bord, stop serré, 5 R, ré-entrées (FM3)

Écrit le 2026-10-08, AVANT tout calcul de cette règle (aucun résultat de FM3 n'a été calculé ; seuls ont été regardés tes deux exemples du 6 et du 7 octobre). Règle et critères figés : aucun amendement après lecture. C'est **ta méthode complète** telle que tu l'as décrite : entrée au bord du FVG, stop juste au-delà de l'ouverture de la grosse bougie, cible à 5 R, ré-entrée au marché si le stop saute, au plus deux ré-entrées. FM1 et FM2 empruntaient l'entrée à 50 %, le stop et la cible de F2, qui ne sont pas les tiens.

## La règle FM3 (une seule hypothèse, figée)
Heures de New York (c'est l'heure que ton graphique affiche pour une bougie ; voir l'erratum de `RESULTAT-FVG-FORME-4-7-TESTE-7-10.md`). Bougies M15, séries continues par année. Achats et ventes.
- **FVG** : strict, trois bougies contiguës, mèches comprises ; règle c4 du moteur.
- **Formé entre 4 h et 7 h** : la **première** bougie du FVG (c1) s'ouvre entre 4 h 00 incluses et 7 h 00 exclues. (FM1 prenait la troisième, c3, ce qui excluait tes deux exemples de 15 minutes : c3 ouvert à 7 h 15, c1 ouvert à 6 h 45.)
- **Testé entre 7 h et 10 h** : un ordre limite actif de 7 h 00 à 10 h 00 (posé à partir de la bougie de 6 h 45, remplissage possible dans les bougies ouvertes de 7 h 00 à 9 h 45 incluses) ; première visite seulement. Âge maximal 24 bougies (non contraignant).
- **Entrée** : au **bord proche** de la zone restante (vente : le bas ; achat : le haut), c'est-à-dire dès le premier contact.
- **Stop** : vente : l'ouverture de c2 (la bougie du milieu, la grosse bougie du FVG) + 0,5 point ; achat : l'ouverture de c2 − 0,5 point ; le point est mis à l'échelle du prix (× prix moyen de l'année / 8200, comme le spread de F2). Pas d'ordre si le stop n'est pas du bon côté de l'entrée.
- **Cible** : 5 R fixes, c'est-à-dire entrée ± 5 × (distance entrée-stop). Pas besoin de FVG cible.
- **Ré-entrée** : si un trade sort **sur son stop**, nouvelle entrée **au marché à l'ouverture de la bougie suivante**, dans le même sens, si cette bougie s'ouvre entre 7 h 00 et 9 h 45 ; nouveau stop : le plus haut (vente) ou le plus bas (achat) de la bougie qui a fait sauter le stop, ± 0,5 point mis à l'échelle ; nouvelle cible : 5 R du nouveau risque ; **au plus deux ré-entrées** par ordre d'origine (une ré-entrée qui saute peut en déclencher une autre, dans la limite de deux).
- **Coûts et sortie** : spread 0,6 × prix/8200 payé comme dans F2 (à l'entrée des achats, à la sortie des ventes), sortie au temps à 96 bougies, stop d'abord (le stop compte dans la bougie d'entrée), TP seulement à partir de la bougie suivant l'entrée, une position à la fois.
- Aucune autre valeur essayée (autre cible que 5 R, autre profondeur d'entrée, autre stop, autre nombre de ré-entrées, autre plage horaire) : si FM3 échoue, on s'arrête et l'idée « plage matinale » est close.

## Critères d'entraînement (tous requis, sur 2011–2022) — comme FM1 et FM2
Tous les trades comptent (entrées d'origine et ré-entrées).
1. R moyen > 0 et t du R moyen ≥ 1,96.
2. R moyen > 0 dans A (2011–2016) et dans B (2017–2022).
3. Pire baisse ≤ 34,3 R.
4. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

Palier : « validée » si les quatre passent ; « prometteuse » si seul le t manque, avec t ≥ 1,0 et un R moyen > 0 ; sinon « rejetée ».

## Lecture du test 2023–2025 (une seule fois, si validée ou prometteuse)
**OK** si le R moyen sur 2023–2025 est > 0 ; sinon **KO**. 2026 : descriptif. OK = candidate au suivi en direct, pas une adoption.

## Descriptif (non jugé)
Trades d'origine et ré-entrées séparés ; achats et ventes ; part des trades qui atteignent 5 R ; distance médiane du stop en points ; R moyen avec le spread doublé ; F2C en repère.

## Divulgations
- **Ce que je n'ai pas pu écrire** : « je réduis le nombre de trades les jours aux plus hauts » (aucune règle chiffrée donnée) ; « je gère à la main » (non codé : la cible est fixe à 5 R, tu m'as répondu 5 R fixe) ; ton choix du FVG à l'œil.
- **Stop déduit d'un seul exemple** (vente du 7 octobre : entrée 31 064, stop 31 091, ouverture de c2 à 31 090,5), puis confirmé par toi (« oui »). Rien ne dit qu'il vaut pour tous tes trades.
- **Stop très serré = coûts relatifs élevés** : le spread de 0,6 point (à 8 200) peut représenter une part sensible d'un risque de quelques points ; le R d'un stop minuscule est fragile. Le résultat avec spread doublé est donné à titre descriptif.
- **Trades corrélés** : une ré-entrée suit un stop au même endroit ; les t sont plus flatteurs que d'habitude.
- **Quatrième lecture de la même idée** sur les mêmes données (FM1, FM2 erronée, FM3) ; FM3 est ta méthode complète et non une variante voisine, mais le risque de faux positif augmente avec le nombre d'essais. 40 hypothèses déjà testées ; un succès serait un indice, pas une preuve.
- 2023–2025 n'est pas vierge pour F2 mais le R de FM3 sur ces années n'a pas été lu. Critère de test (R moyen > 0) peu exigeant, non durci après coup.
- Les captures n'ont servi à aucun réglage autre que le stop (confirmé) et la définition de c1.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAM_fvg_bord.mjs <data> train`, puis `... test` si validée ou prometteuse. Moteur : `lib/krysBacktestE.js` (copie de `krysBacktestC.js` avec deux options ajoutées, `stopFn` et `reentry2`, test d'identité avec C).
