# Pré-enregistrement — tes trades réels de 2025 contre les signaux de F2 (« l'aurais-je pris aussi ? »)

Écrit le 2026-10-06, AVANT tout calcul de cette comparaison. Étude **descriptive** : aucun critère de réussite, aucun test, aucune règle proposée ; ce n'est pas un test de F2 ni de ton trading. Question de Krystofia : « pour voir si tu les aurais pris aussi ». Les définitions ci-dessous sont figées.

## Données
- Tes 646 trades réels de mars à juillet 2025 (`data/real-trades-2025.csv` : heure d'ouverture NY, prix d'ouverture, sens, résultat en $). 392 achats, 254 ventes.
- Les signaux de F2 sur les mêmes bougies M15 : mêmes données que les autres études (M1 du broker en 2025), mêmes règles que F2C pour les achats ; pour les ventes, le miroir exact de F2 déjà codé (`runYearSellRaw`, jamais validé comme méthode : il sert seulement à dire si un signal de vente existait).
- Un signal = un **ordre limite posé** par le moteur de F2 (achat) ou de F2 miroir (vente) : il est rempli ou non. Quand F2 est déjà en position dans ce sens, le moteur ne pose pas de nouvel ordre ; ce cas compte comme « pas de signal ».

## Vie d'un ordre (reconstituée sur les bougies, comme le moteur)
Un ordre est « vivant » de la bougie de pose (incluse) jusqu'à la première bougie qui, dans l'ordre : le remplit (achat : bas + spread ≤ prix d'entrée ; vente : haut ≥ prix d'entrée), touche son stop, touche son TP, ou sort de la fenêtre 06–16 NY. Cette bougie est incluse.

## Niveaux de correspondance (pour chacun de tes trades, dans son sens)
Ton trade s'ouvre à l'heure `h` (heure NY) au prix `p`. La bougie M15 qui contient `h` est la bougie d'ouverture.
- **A — même jour** : F2 (ou F2 miroir) a posé au moins un ordre de ce sens le même jour NY.
- **B — ordre vivant** : au moins un ordre de ce sens est vivant à la bougie d'ouverture.
- **C — même zone** : un ordre vivant à la bougie d'ouverture dont le prix d'entrée est à au plus **0,1 %** de `p` (|p − entrée| ≤ 0,001 × p).
- **D — rempli** : un trade de F2 (ou F2 miroir) de ce sens est rempli à la bougie d'ouverture de ton trade ou à la suivante.
Un trade est de niveau A seulement, B, C ou D ; les niveaux sont emboîtés dans la présentation (D ⊂ C ⊂ B ⊂ A n'est pas garanti par la définition : ils sont comptés séparément). Un trade ouvert **hors 06–16 NY** est compté à part (F2 n'y pose aucun ordre).

## Mesures (descriptives)
1. Pour tes achats, tes ventes et le total : nombre de trades à chaque niveau (A, B, C, D), hors fenêtre, et part du total.
2. Ton résultat en $ et en R-approximatif (perte médiane du mois, comme `ANALYSE-MES-TRADES-2025.md`) pour les groupes « niveau C ou D » et « aucun niveau ». Sans test ; aucun groupe n'est lu comme une règle.
3. **Sens inverse** : pour les trades de F2 (achats remplis en mars–juillet 2025, R de F2) : combien correspondent à un trade à toi dans le même sens, ouvert dans les 60 minutes avant à 60 minutes après leur remplissage et à au plus 0,1 % du prix d'entrée ; R moyen de F2 pour ceux que tu as pris et pour ceux que tu n'as pas pris.
4. Trois exemples détaillés de chaque cas (tes achats de niveau D, tes achats sans signal, des trades de F2 que tu n'as pas pris) pour que tu puisses les regarder sur le graphique, avec date, heure, prix.

## Divulgations
- Tes durées de trade sont très courtes (beaucoup de trades se ferment en quelques minutes), tes pertes moyennes sont de 25 à 36 $ : ton trading de 2025 n'est probablement pas du F2 (stops plus serrés, entrées sur de plus petites unités de temps). Cette étude mesure le recouvrement, pas la qualité.
- Les tolérances (0,1 %, ±1 bougie, ±60 minutes) sont des choix de lecture écrits d'avance ; une autre tolérance changerait les parts. Je n'en essaie pas d'autre.
- 2025 est dans la période où F2 a été jugée (2023–2025 n'est pas vierge) ; ce travail ne juge pas F2.
- Les ventes en miroir de F2 ne sont pas une méthode validée.
- Ton heure est celle de ta plateforme, notée NY ; si elle était décalée, les parts de correspondance seraient sous-estimées. Un contrôle de cohérence sera affiché (nombre de tes trades dont l'heure tombe en week-end ou hors marché).

## Reproduction prévue
`node scripts/comboFvgV6/compareMesTradesF2.mjs <data> <real-trades-2025.csv>`. Moteur : `lib/krysBacktestC.js` (filtre enveloppé pour journaliser les ordres posés, sans changer les trades).
