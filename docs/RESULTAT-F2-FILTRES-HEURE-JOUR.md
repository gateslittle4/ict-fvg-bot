# Résultat — F2 : filtres « heure » et « jour de semaine »

Calculé le 2026-10-06, après `PREREG-F2-FILTRES-HEURE-JOUR.md` (écrit et sauvegardé avant le calcul, aucune règle modifiée depuis).

## Verdict
**Aucune des 11 variantes ne passe l'entraînement. F2 reste telle quelle.** Le test 2023–2025 n'a donc **pas été lu** (il reste vierge pour ces filtres), et la variante « combinaison » n'a pas été calculée, faute d'une heure et d'un jour qui passent.

## Contrôle
Le calcul de base retrouve exactement les chiffres de référence : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04. Rythme 2023–2025 : 2,10 trades par semaine (nombre seul, R non lu).

## Heure (fenêtre de placement de l'ordre, heure de New York)
| Variante | Gardés : n, R moyen | Exclus : n, R moyen | t de Welch | Rythme (trades/sem.) | Raison du rejet |
|---|---|---|---|---|---|
| H-A 06–09 | 380, −0,061 | 842, +0,181 | −2,16 | 0,68 | mauvais sens, rythme, R |
| H-B 06–11 | 571, −0,073 | 651, +0,264 | −3,27 | 0,97 | mauvais sens, rythme, R |
| H-C 06–13 | 888, +0,069 | 334, +0,205 | −1,16 | 1,53 | mauvais sens, t, R |
| H-D 08–16 | 925, +0,142 | 297, −0,006 | +1,20 | 1,53 | t < 2,85, R < 0,15 |
| H-E 09–16 | 842, +0,181 | 380, −0,061 | +2,16 | 1,41 | t < 2,85 (R et moitiés OK) |

## Jour (exclusion d'un jour, fenêtre 06–16 inchangée)
| Variante | Gardés : n, R moyen | Exclus : n, R moyen | t de Welch | Raison du rejet |
|---|---|---|---|---|
| J-lun | 980, +0,078 | 242, +0,220 | −1,08 | mauvais sens |
| J-mar | 965, +0,099 | 257, +0,134 | −0,27 | mauvais sens |
| J-mer | 1 009, +0,116 | 213, +0,060 | +0,42 | t, R, moitiés |
| J-jeu | 942, +0,110 | 280, +0,094 | +0,13 | t, R |
| J-ven | 992, +0,128 | 230, +0,013 | +0,90 | t, R |

Seuil : t ≥ 2,85 (11 hypothèses). Le vendredi est du bon côté mais loin du seuil (t 0,90 sur 230 trades), alors que l'observation de v6 (−0,44 sur 19 trades) laissait penser à plus. Sur F2, 2011–2022, le vendredi n'est pas un jour à exclure.

## Ce que les chiffres suggèrent, sans qu'on puisse le retenir
Le sens est **l'inverse** de l'observation faite sur v6 : sur F2, les ordres placés tôt (06–09, 06–11) sont les moins bons (−0,06 et −0,07 R), et ceux placés après 9 h ou 11 h sont les meilleurs (+0,18 et +0,26 R). H-B est même à t −3,27, au-delà de 2,85 mais **du mauvais côté** : le critère écrit n'attendait que l'effet « les tôt sont meilleurs ». H-E (09–16) est le miroir de H-A, à t +2,16, sous le seuil.

Ça ne peut pas être traité comme une trouvaille :
- ce sens n'était pas dans la liste écrite avant le calcul ; le garder maintenant, c'est choisir après avoir vu (et je n'ai testé ni 11–16 ni 10–16 : je ne l'ai pas fait exprès, pour ne pas pêcher) ;
- il augmenterait le nombre d'hypothèses testées, donc le seuil ;
- les deux moitiés vont dans le même sens (pour H-B : gardés −0,167 contre exclus +0,257 en A ; +0,015 contre +0,270 en B), mais l'écart repose sur des sous-échantillons de quelques centaines de trades corrélés ;
- si on le voulait, il faudrait un nouveau pré-enregistrement (par exemple « ne pas placer d'ordre avant 09:00 ou 11:00 NY »), avec un seuil recalculé, un jugement sur 2011–2022 et le test 2023–2025 resté vierge pour lui. C'est possible, et c'est à Krystofia de dire si ça l'intéresse. Ça irait aussi contre ce qu'elle observe elle-même (le matin est sa meilleure tranche sur v6) : à discuter avec elle.

## Réserves
- Les t de Welch supposent des trades indépendants ; ils sont donc un peu flatteurs, ce qui rend les rejets plus solides, pas moins.
- Les trois observations de v6 (06–08 h, 10–12 h, vendredi) étaient peut-être issues de 2026, que cette étude n'a pas utilisé : si c'est vrai, elles sont non confirmées sur F2 sur 2011–2022, ce qui est lui-même un résultat. Je n'ai pas revérifié la période de ces observations.
- Le jugement a été fait sur les trades de F2 de base (sous-ensembles) ; le rejeu réel (critère 5) n'a pas été nécessaire, aucune variante n'ayant passé les critères 1 à 4.
- 2026 n'a pas été regardé pour ces variantes (non requis par le protocole en l'absence de passage).

## Ce que ça change
Rien pour la démo : F2 continue avec ses règles actuelles (06–16, tous les jours). Les filtres « heure et jour » ne la rendent pas meilleure de façon crédible sur 2011–2022. Les prochains filtres possibles (contexte H4, tendance, volatilité) ne sont pas touchés ici.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboI.mjs <dossier data> train` (≈ 75 s). Tests : `node --test scripts/comboFvgV6/comboI.test.mjs` (7 tests : heure/jour de New York en hiver et en été, fenêtres, séparation gardés/exclus, t de Welch, un filtre sans effet ne passe pas).
