# Pré-enregistrement — F2 avec réentrée sur confirmation après un stop (CONF)

Écrit le 2026-10-07, AVANT tout calcul de cette étude (aucun résultat de cette règle n'a été regardé). Règle et critères figés : aucun amendement après lecture. Origine : Krystofia, après le rejet de REE (réentrée immédiate, `RESULTAT-F2-REENTREE-APRES-STOP.md`) : « essaie l'autre façon d'entrer ». C'est l'alternative que j'avais citée : attendre une confirmation au lieu d'entrer tout de suite. Elle reprend aussi son idée d'une fenêtre qui reste valide après un stop hunt tant qu'une grande bougie baissière n'apparaît pas.

## Contrôle
F2C, inchangé. Valeurs attendues 2011–2022 : 1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 ; A +0,067 (617), B +0,146 (605). Le contrôle doit se reproduire exactement, sinon on s'arrête.

## La règle CONF (une seule hypothèse, figée)
1. Déclencheur : un trade de F2C (ordre d'origine) sort par son **stop** (y compris dans la bougie de remplissage). Les autres sorties, et les stops d'un trade de réentrée, ne déclenchent rien (**une seule réentrée par trade d'origine**).
2. Fenêtre de surveillance : les **8 bougies M15 à partir de la bougie S qui prend le stop, S comprise** (8 = l'âge maximal d'un FVG de F2, valeur déjà dans les règles, non choisie pour ce test).
3. À la clôture de chaque bougie de la fenêtre, dans l'ordre :
   a. si la bougie est une **grande bougie baissière** (clôture < ouverture ET corps ≥ 2 × l'amplitude moyenne (high − low) des 96 bougies précédentes ; même définition et même seuil que REE, choix de moi, voir REE) : la fenêtre est annulée, pas de réentrée ;
   b. sinon, si la bougie **clôture au-dessus du niveau du stop d'origine** (le stop hunt est rejeté) : confirmation ;
   c. sinon on continue ; si la fenêtre se termine sans confirmation, pas de réentrée.
4. Après confirmation sur la bougie m : achat au marché à l'ouverture de m + 1 (prix = ouverture + spread), seulement si m + 1 est dans la plage 06–16 NY et qu'aucune position n'est ouverte.
5. Nouveau stop = plus bas (low) de toutes les bougies de S à m comprises − marge de stop (3 pts mis à l'échelle). **Même TP absolu** que l'ordre d'origine. Pas de réentrée si le TP est déjà ≤ prix d'entrée ou si le risque ≤ 0. Aucun filtre sur le RR obtenu.
6. La réentrée est un trade normal (stop d'abord dans la même bougie, sortie au temps à 96 bougies après son remplissage, une position à la fois).
7. Aucune autre valeur essayée (fenêtre de 4 ou 12, confirmation par clôture au-dessus d'autre chose, deux réentrées, stop autre). Si CONF échoue, on s'arrête.

## Critères d'entraînement (tous requis, sur 2011–2022)
Identiques à REE (mêmes seuils), avec les trades de réentrée repérés par leur drapeau :
1. R moyen des réentrées > 0 et t ≥ 1,96.
2. R moyen des réentrées > 0 dans A (2011–2016) et dans B (2017–2022).
3. CONF entier : R total > R total de F2C, et R moyen par trade ≥ R moyen de F2C.
4. Pire baisse de CONF ≤ 1,25 × celle de F2C (34,3 R).
5. Rythme ≥ 1,0 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu).

## Lecture du test 2023–2025 (une seule fois, seulement si l'entraînement passe)
R moyen des réentrées > 0 et R total de CONF > R total de F2C. 2026 : descriptif.

## Descriptif (non jugé)
Stops de F2C ; fenêtres annulées par une grande baissière ; fenêtres expirées sans confirmation ; confirmations ; réentrées prises ; issue (TP / stop / temps) ; RR visé moyen ; délai moyen entre le stop et l'entrée ; comparaison des réentrées de CONF avec celles de REE (déjà lues, +0,124 R, 398 trades) ; trades de F2C absents de CONF.

## Divulgations
- **REE a été rejetée juste avant** (t 0,78 ; baisse 37,1). CONF est une deuxième hypothèse sur le même sujet : le seuil de 1,96 n'est pas corrigé pour les comparaisons multiples.
- Le seuil de 2 × (grande bougie baissière), le choix « clôture au-dessus du stop d'origine » comme confirmation, et la fenêtre de 8 bougies sont de moi : Krystofia n'a pas défini ce qu'est une confirmation ni une durée.
- Le descriptif compare avec REE (déjà vue) ; ce n'est pas un critère.
- Le stop de réentrée peut être large si le prix a beaucoup descendu pendant la fenêtre : le TP d'origine donne alors un RR plus petit. Voulu (pas de filtre).
- 2023–2025 n'est pas vierge pour F2 mais n'a jamais été lu pour cette règle.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAG_reentree_confirmation.mjs <data> train`, puis `... test` si l'entraînement passe.
