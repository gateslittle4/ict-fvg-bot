# Pré-enregistrement — F2 : filtres « heure » et « jour de semaine »

Écrit le 2026-10-06 (≈ 11:45 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture des résultats. Un seul type de filtre est testé (choix de Krystofia : « Heure et jour »). Aucun autre filtre (contexte H4, tendance, volatilité…) n'est touché ici.

## Question
Réduire la fenêtre d'heures de F2, ou exclure certains jours de semaine, améliore-t-il F2 de façon crédible, c'est-à-dire plus que ce que le hasard donnerait en essayant 11 variantes ?

## Ce qui est testé : F2 de base (contrôle, inchangée)
Règles de `CRITERE-DEMO-F2.md` : US100 M15, achats seuls ; filtre « creux des 6 dernières bougies H4 balayé dans les 32 bougies M15 avant c3 » ; FVG d'âge ≤ 8 bougies ; entrée à 50 % de la zone restante ; stop = bas de c1 − 3 pts ; TP = max(½ FVG cible, 3R) ; spread 0,6 ; prix mis à l'échelle (prix moyen de l'année / 8200) ; rejeu M15 pessimiste ; fenêtre actuelle 06:00–16:00 NY. Référence : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04. Le contrôle sera recalculé par le même code et doit retrouver ces chiffres, sinon l'étude s'arrête.

## Liste des 11 hypothèses (figée)
L'heure et le jour sont ceux de la **bougie de placement de l'ordre** (heure de New York, DST réel), pas ceux du remplissage.

Heure (fenêtre de placement [début ; fin[ en heures NY) :
1. H-A : [06 ; 09[
2. H-B : [06 ; 11[
3. H-C : [06 ; 13[
4. H-D : [08 ; 16[
5. H-E : [09 ; 16[

Jour (exclusion d'un seul jour, fenêtre 06–16 inchangée) :
6. J-lun : sans le lundi
7. J-mar : sans le mardi
8. J-mer : sans le mercredi
9. J-jeu : sans le jeudi
10. J-ven : sans le vendredi

Combinaison (une seule) :
11. COMBO : la meilleure fenêtre d'heure ET la meilleure exclusion de jour, **uniquement si** au moins une hypothèse d'heure et une hypothèse de jour passent chacune les critères d'entraînement ci-dessous ; « meilleure » = plus grand t de Welch (critère 1). Sinon la 11ᵉ n'est pas calculée (mais elle compte quand même dans le seuil).

## Données et blocs (identiques aux études précédentes)
Entraînement : 2011–2016 (A) et 2017–2022 (B). Test : 2023–2025, lu une seule fois (voir plus bas). 2026 (au 21/09) : descriptif. Vrai test : la démo depuis le 05/10/2026.

## Seuil statistique
11 hypothèses, donc seuil de Bonferroni : p = 0,05 / 11 ≈ 0,0045 bilatéral, soit **t ≥ 2,85** (le seuil habituel de 2,0 ne s'applique pas). Les hypothèses se chevauchent, donc ce seuil est conservateur ; je le garde tel quel.

## Mesure pour juger (sur 2011–2022 seulement)
On part des trades de F2 de base (un seul calcul, chaque trade marqué de son heure et de son jour de placement). Une variante « garde » les trades dans sa fenêtre et « exclut » les autres. On juge le filtre par sa capacité à **séparer** les bons trades des mauvais, pas par son t seul : un sous-ensemble choisi après coup a toujours l'air meilleur que le tout.

Critères d'entraînement (tous requis) :
1. **t de Welch (gardés contre exclus) ≥ 2,85** sur 2011–2022, dans le bon sens (gardés meilleurs).
2. R moyen des gardés sur 2011–2022 **≥ +0,150** (la base est à +0,106).
3. Gardés > 0 dans A **et** dans B, et gardés > exclus dans A **et** dans B (même sens dans les deux moitiés).
4. Rythme : **≥ 1,0 trade par semaine** sur 2023–2025 (calculé sur le nombre de trades seulement, sans lire leur R), pour que la démo reste faisable.
5. Contrôle par rejeu réel : on relance F2 avec la nouvelle fenêtre ou l'exclusion de jour comme règle du moteur (les ordres sont alors annulés à l'heure de fin, et une position fermée par un autre trade peut changer). Il faut R moyen 2011–2022 > +0,106 et A, B > 0. Ce contrôle n'a pas de seuil de t.

Toute variante qui ne passe pas les cinq est rejetée, sans second essai ni variante voisine.

## Lecture du test 2023–2025 (une seule fois)
Seules les variantes qui passent l'entraînement sont lues, au plus **deux** : celle qui a le plus grand t de Welch parmi les hypothèses 1 à 10, et la 11ᵉ si elle existe. Critère de test : R moyen des gardés > 0 **et** gardés > exclus sur 2023–2025. Le t n'est pas un critère (échantillon trop petit, ~325 trades pour toute F2). Le résultat de 2026 est rapporté sans critère.

## Verdict possible
- **Aucune variante ne passe l'entraînement** : F2 reste telle quelle. C'est un résultat valable.
- **Une variante passe l'entraînement et le test** : candidate au remplacement de la règle de F2, **mais** la règle ne change pas d'elle-même. Krystofia décide ; la démo en cours (depuis le 05/10) continue sur la F2 d'origine, et la variante serait suivie en parallèle sur le papier.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations (à lire avant les résultats)
- Des observations descriptives ont déjà été vues sur v6, pas sur F2 : 06–08 h NY ≈ +0,59 R (38 trades), 10–12 h ≈ −0,23 R, vendredi ≈ −0,44 R (19 trades). Je pense qu'elles viennent du descriptif 2026, mais je ne l'ai pas revérifié. Si c'est le cas, 2011–2022 reste vierge pour ces idées ; sinon, H-A, H-B et J-ven ne sont pas indépendantes de ce que j'ai vu. Ce sont trois des onze hypothèses.
- Krystofia trade elle-même 06:00 → 15:00/16:00 NY (borne de fin non tranchée) : H-A, H-B, H-C sont des sous-fenêtres de ce qu'elle fait ; H-D et H-E retirent la tranche 6–8 h, que ses propres observations donnent comme la plus riche : elles sont là surtout comme contrôles négatifs.
- F2 a été choisie parmi F1–F3 sur 2011–2022 : le contrôle de base est lui-même en partie « dans l'échantillon ». Le test 2023–2025 n'est pas vierge non plus (il a servi à lire F2 et le combo).
- Les trades de F2 sont corrélés entre eux (même jour, même balayage) : les t de Welch supposent l'indépendance et sont donc un peu flatteurs.
- Un filtre qui retire des trades baisse le rythme de la démo : à 1 trade/semaine, les seuils de CRITERE-DEMO-F2 (60 ou 150 trades) demandent deux fois plus de temps qu'à 2 par semaine.
- Les seuils de la démo (a : 60 trades / stop à −15 R ; b : 150 trades) sont toujours en attente de ta réponse ; rien ici ne les modifie.

## Reproduction prévue
Script `scripts/comboFvgV6/comboI.mjs` (import de `comboF.mjs`) : `node scripts/comboFvgV6/comboI.mjs <data> train` pour l'entraînement (R de 2023+ masqué, seul le nombre de trades est affiché), puis `... test <variante>` pour la lecture unique. Test unitaire pour les fonctions pures (jour/heure NY, découpage gardés/exclus, t de Welch).
