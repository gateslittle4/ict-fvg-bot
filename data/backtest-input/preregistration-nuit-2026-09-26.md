# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Recherche de nuit : copier les FVG d'Esdras, puis pistes secondaires, avec années cachées

Date : 2026-09-26, 04 h 45 UTC. Demande d'Esdras (avant de dormir) : « si tu n'as rien trouvé, explore des pistes secondaires, ensuite
laisse des années pour des tests fast forward pour ne pas voir toutes les années […] teste tout ce qui peut l'être ». Point de départ :
l'analyse exploratoire de ses 664 trades réels (commit `a8afe78`) : les FVG M15 « vieillis » qu'il choisissait gagnaient, la même règle
appliquée à toutes les occurrences faisait ≈ 0. Question : ce qui distinguait ses choix peut-il s'écrire en règles ? Et sinon, y a-t-il
autre chose ?

## Découpage des années (le cœur de la demande)

| Bloc | Années | Données | Usage |
|---|---|---|---|
| Préchauffage | 2010 | HistData M1 | indicateurs seulement, aucun trade compté |
| **Exploration** | 2011 → 2018 (moitiés 2011-2014 / 2015-2018) | HistData M1 | libre : autant de variantes que nécessaire, toutes comptées et déclarées |
| **Validation** (cachée) | 2019 → 2022 | HistData M1 | lue **une seule fois**, règles figées et commitées avant |
| **Final** (caché) | 2023 → 2024 et 2026 (→ 21/09) | M1 du courtier | lu **une seule fois**, après la validation |
| 2025 | 2025 | M1 du courtier | descriptif seulement : c'est l'année des trades d'Esdras, d'où viennent les idées de la famille A |

**Garde-fou technique** : pendant l'exploration, les scripts coupent les données au 1er janvier 2019 AVANT tout calcul (le code refuse
de compter un trade au-delà). Exception déclarée : la famille A lit les trades d'Esdras et le marché de mars-juillet 2025 (source des
idées, jamais un test).

## Marchés et coûts
- US100 (principal), US500 ; XAUUSD et EURUSD pour les pistes quantitatives (les seuls avec HistData 2010-2022 ET le courtier ensuite).
  GER40, US30, XAGUSD, XTIUSD : courtier seulement (2023+), pas d'exploration possible, donc exclus.
- Spread du projet (`DEFAULT_SPREADS`, en % du prix), swap du courtier (`swapPerUnit`) pour les positions gardées la nuit, commission 0.
  Au rapport final : même calcul avec le spread × 2 (descriptif, critique externe point 2).
- R = résultat net / risque initial (distance au stop). Règle sans stop : R = résultat net / ATR (précisé règle par règle).
- t calculé sur les trades d'un seul marché, un trade à la fois ; règle multi-marchés : t sur le P&L journalier du portefeuille.

## Familles explorées (2011-2018 seulement)
- **A. « L'œil d'Esdras »** : profil des FVG M15 qu'il a tradés en 2025 comparés à ceux qu'il a laissés passer aux mêmes heures
  (taille, âge, impulsion, distance parcourue, heure, position dans le range, tendance, prise de liquidité avant…), puis une règle
  « FVG à la Esdras » testée sur 2011-2018.
- **B. FVG M15 mécaniques** : âge de la zone, type d'entrée (limite au bord, clôture M15 dans la zone, rejet M1), stop, objectif,
  sortie à l'heure, tendance, achats seulement, contexte de prise de liquidité, heures.
- **C. Gestion** (sur les entrées B) : réentrée après un stop (ses réentrées gagnaient), sorties au temps, seuil de rentabilité.
- **D. Pistes quantitatives** : IBS journalier, momentum intrajournalier (première demi-heure → dernière), tournant du mois, biais
  acheteur du matin, écart d'ouverture de 9 h 30, cassure de Donchian H4/journalier, jour de la semaine.

## Sélection à la fin de l'exploration (règle fixée maintenant)
- Une variante est **retenue** si, sur 2011-2018 : au moins 60 trades, R moyen > 0, **t ≥ 2,0**, R total positif en 2011-2014 ET en
  2015-2018.
- Au plus **2 variantes par famille** (pour D : par piste), les plus solides (t le plus élevé), et seulement si des réglages voisins
  sont aussi positifs (pas un pic isolé). Le nombre total de variantes essayées est déclaré.
- Les règles retenues sont écrites en entier et **commitées avant toute lecture de 2019 et après**.

## Verdicts (fixés maintenant)
- **Validation 2019-2022** (une lecture) : R moyen > 0 et **t ≥ 2,0** → passe. Sinon **rejetée**.
- **Final 2023-2024 + 2026** (une lecture, variantes qui ont passé la validation seulement) : R moyen > 0 → **CANDIDAT**, sinon
  **rejetée**. 2025 et le spread × 2 : descriptifs.
- CANDIDAT = démo seulement. Rien ne va dans le bot sans une décision explicite d'Esdras.
- Aucune retouche après une lecture cachée sans nouveau pré-enregistrement déclaré. Bug trouvé après une lecture : corrigé et relancé
  avec un amendement qui le dit.

## Déjà vu (déclaré)
Résultats déjà connus sur 2019-2026 de règles voisines : FVG d'Esdras v1/v2/cible 3R, FVG « parti loin », FVG ordre stop et `LIVE_FILL`,
sweep + FVG de 9 h 30 et ses 5 variantes, repli dans la tendance le matin, stratégies live (Silver Bullet, NWOG, RSI(2), ORB, bruit,
CBDR, Divergence, Weekly Sweep). Les variantes explorées cette nuit sont nouvelles, mais cette connaissance peut orienter mes choix ;
c'est précisément pourquoi 2019-2026 restent cachés pour elles.

Scripts : `scripts/lib/nightLab.js` (outils testés) et `scripts/runNight*.js` ; données personnelles d'Esdras hors du dépôt.
