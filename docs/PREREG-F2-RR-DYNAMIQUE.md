# Pré-enregistrement — F2 : RR dynamique (cible = FVG à gauche, sans plancher de 3 R)

Écrit le 2026-10-06 (≈ 13:20 UTC, horloge du conteneur), AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Choix de Krystofia parmi 3 sens possibles de « RR dynamique » : la cible suit le FVG M15 à gauche, sans plancher de 3 R. Les deux autres sens (gestion du trade en cours, RR selon le contexte) ne sont pas testés ici.

## Question
Si le TP suit la vraie cible (le FVG M15 à gauche) au lieu de « max(moitié de la cible, 3 R) », F2 fait-elle mieux ?

## F2 de base (contrôle, inchangée)
Règles de `CRITERE-DEMO-F2.md`, dont TP = max(½ FVG cible, 3 R) : dans 82 % des trades la moitié de la cible est plus proche que 3 R, donc le TP tombe sur le plancher de 3 R (RR visé médian 3,00, moyen 3,29). Référence : 2011–2016 +0,067 (617), 2017–2022 +0,146 (605), 2011–2022 +0,106 (1 222), t 2,04, pire baisse 27,4 R. Le contrôle doit retrouver ces chiffres, sinon l'étude s'arrête.

## Les 3 hypothèses (figées, aucune autre)
Seul le TP change ; entrée (50 % de la zone), stop (bas de c1 − 3 pts), filtre de balayage H4, fenêtre 06–16 NY, âge du FVG d'entrée ≤ 8 bougies, spread, échelle de prix : inchangés. La condition « il existe un FVG cible à gauche » reste obligatoire. Le TP est :
- **R-near** : le bord proche du FVG cible (aucun plancher de RR) ;
- **R-half** : la moitié du FVG cible (aucun plancher de RR) ;
- **R-far** : le bord lointain du FVG cible, c'est-à-dire le FVG rempli en entier (aucun plancher).

Le risque de chaque trade est inchangé (même stop) : le R est directement comparable au contrôle. Le RR visé varie à chaque trade et peut être inférieur à 1.

## Données et blocs
Mêmes que les études précédentes. Entraînement : 2011–2016 (A) et 2017–2022 (B). Test : 2023–2025, lu une seule fois. 2026 (au 21/09) : descriptif.

## Mesures
R moyen par trade, t, % de gagnants, pire baisse (R), rythme (trades remplis par semaine), RR visé moyen et médian, part de trades à RR visé < 1. Comparaison **appariée** avec le contrôle : un même ordre (même année, même bougie de placement) rempli dans les deux versions donne `R_variante − R_contrôle` ; t apparié sur ces ordres communs.

## Critères d'entraînement (tous requis, par hypothèse, sur 2011–2022)
1. R moyen de la variante **≥ contrôle + 0,03 R** (soit ≥ +0,136).
2. **t apparié ≥ 2,13** (3 hypothèses, unilatéral : 0,05 / 3 = 0,0167).
3. Variante > contrôle **et** > 0 dans A **et** dans B.
4. Pire baisse ≤ 1,25 × celle du contrôle (≤ 34,3 R).
5. Rythme ≥ 1,5 trade par semaine sur 2023–2025 (nombre de trades seulement, sans lire R).

## Lecture du test 2023–2025 (une seule fois)
Seulement pour les variantes qui passent l'entraînement. Critère : R moyen de la variante **> R moyen du contrôle sur 2023–2025** (+0,183) **et > 0**. Pas de critère de t. 2026 : descriptif.

## Verdict possible
- **Aucune ne passe** : F2 garde son TP « max(½ cible, 3 R) ». Pas de variante voisine (plancher de 1,5 R, de 2 R, bord à 75 %…).
- **Passe l'entraînement et le test** : candidate pour remplacer le TP de F2 ; la règle ne change pas d'elle-même, Krystofia décide.
- **Passe l'entraînement, échoue au test** : rejetée.

## Divulgations
- **Krystofia a elle-même confirmé le plancher de 3 R** (« ou 3 RR min » : on prend le plus éloigné des deux) ; une correction plus tardive dit qu'elle vise toujours le FVG à gauche, sans RR fixe, même loin. Les deux phrases coexistent dans le projet ; cette étude teste la seconde.
- Des TP « bord proche » et « 3 R fixe » ont déjà été essayés sur les premiers backtests du projet (7 mois de données de simulateur, résultat négatif pour tous), et des sorties dynamiques (partiels, break-even, trailing) sur 116 trades de 2023–2026, avec le TP statique actuel jugé meilleur. Ce sont d'autres règles, d'autres données et de petits échantillons ; ils ne remplacent pas ce test mais le test 2023–2025 n'est pas totalement vierge pour des idées de sortie.
- Un TP très proche paie le spread plus souvent par rapport au gain : le spread est compris dans le calcul (0,6 point à l'échelle).
- Le plancher de 3 R protège de TP minuscules. Sans plancher, un taux de gagnants plus élevé peut venir avec des gains très petits : seul le R moyen compte.
- Les trades de F2 sont corrélés ; le t apparié est plus fiable que les t non appariés.

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboN.mjs <data> train`, puis `... test R-near,R-half,R-far` pour celles qui passent. Moteur : `lib/krysBacktestW.js` (copie de `krysBacktest.js`, avec en plus `stopMult` et le mode TP `far`).
