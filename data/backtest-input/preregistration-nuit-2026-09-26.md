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

---

## AMENDEMENT 1 (2026-09-26, après l'exploration FVG 2011-2018, AVANT toute lecture de 2019 et après)

**Constat d'exploration** (2011-2018 seulement, `night-explore-fvg.md`, sondes `runNightFvgPlacebo.js`) : un ordre limite posé à une
distance fixe du prix gagne beaucoup MÊME AU HASARD, et même exécuté au marché une à cinq minutes après le toucher : c'est un retour à
la moyenne intrajournalier, pas un effet du FVG. Une règle FVG « limite » peut donc être retenue sans que le FVG y soit pour rien : sur
US100, le placebo (même distance, moment tiré au hasard) fait mieux que le vrai FVG frais 20 fois sur 20.

**Changements de la SÉLECTION seulement** (découpage, critères de validation et du final inchangés) :
1. Familles A et B : une variante retenue doit aussi **battre son placebo** — chaque opportunité déplacée de 1 à 6 bougies M15 au
   hasard (même sens, même fenêtre), zone fictive à la même distance du prix, même gestion, mêmes filtres, 20 tirages : le placebo ne
   doit pas faire aussi bien (R moyen) plus de **2 fois sur 20**.
2. Les 2 places d'une famille vont à deux règles vraiment différentes : 1re place = t le plus élevé ; 2e place = t le plus élevé parmi
   les variantes éligibles qui diffèrent de la 1re par la **fenêtre (âge / heures) ou le marché** (un filtre ou une gestion voisine de la
   même règle ne compte pas comme une autre règle).
3. Le retour à la moyenne par ordre limite devient une **piste D à part entière** : « limite à d ATR H1 du prix de clôture M15, le
   matin, stop 1 ATR au-delà, objectif en R, sortie à heure fixe », petite grille déclarée dans son script, sélection comme les autres
   pistes D (2 places au plus, réglages voisins positifs).

Déjà vu au moment de cet amendement : la grille FVG (864 variantes), le placebo de 3 règles × 4 filtres sur US100 et les sondes de
remplissage (au toucher, en traversant d'un tick, au marché 1 et 5 minutes après), tout sur 2011-2018.

---

## RÈGLES FIGÉES (2026-09-26, avant toute lecture de 2019 et après)

Sélection appliquée (pré-enregistrement + amendement 1) : `night-select-fvg.md` (A, B), `night-explore-manage.md` (C),
`night-explore-quant.md` (D). Règles exactes : `data/backtest-input/night-frozen-rules.json` (généré par
`scripts/buildNightFrozenRules.js`) ; contrôle de fidélité : `scripts/runNightHidden.js explore` redonne exactement les chiffres de
l'exploration pour les 10 règles. Corrections faites pendant l'exploration (avant ce gel) : ordres limite FVG en concurrence (le premier
rempli gagne) ; « autre règle » de la piste D2 = autre marché seulement (le seuil d'écart et l'heure de sortie sont des réglages).

| Id | Marché | Règle | Exploration 2011-2018 |
|---|---|---|---|
| A1 | US100 | FVG M15 vieilli (5-12 bougies) qualifié entre 9 h 30 et 11 h, 4 h en faveur, entrée au marché, stop derrière la zone, 3R, sortie 11 h | 684 trades, +0,163 R, t 2,49 |
| A2 | XAUUSD | FVG M15 vieilli (5-12) qualifié entre 3 h et 9 h 30, avec la tendance 20 jours, marché, stop 1 ATR H1, 2R, sortie 11 h | 1 636 trades, +0,083 R, t 2,41 |
| B1 | US100 | A1 sans le filtre 4 h | 842 trades, +0,133 R, t 2,26 |
| C1 | US100 | B1 + réentrée sur le même FVG après un stop (une fois) | 974 trades, +0,162 R, t 2,94 |
| C2 | US100 | A1 + réentrée sur le même FVG après un stop | 776 trades, +0,172 R, t 2,79 |
| D1a | US100 | Nuit 18 h - 3 h : achat au marché après un recul de 0,25 ATR H1 sous la dernière clôture M15 (ordre renouvelé chaque quart d'heure), stop 1 ATR, 2R, sortie 3 h | 2 342 trades, +0,066 R, t 4,18 |
| D1b | US100 | 3 h - 9 h 30 : même règle à 0,5 ATR, 1R, sortie 9 h 30 | 5 374 trades, +0,047 R, t 3,68 |
| D2a | US100 | Écart d'ouverture 9 h 30 ≥ 0,5 ATR H1 par rapport à la clôture de 16 h : pari qu'il se referme, marché 9 h 31, stop 1 ATR, objectif la clôture de la veille, sortie 11 h | 1 586 trades, +0,141 R, t 3,48 |
| D3a | US100 | Lundi : achat 9 h 31, stop 1 ATR, sortie 16 h | 408 trades, +0,380 R, t 2,94 |
| D3b | US100 | Mardi : achat 9 h 31, stop 1 ATR, sortie 16 h | 412 trades, +0,390 R, t 2,60 |

Essais multiples (déclaré) : 864 variantes FVG (+ 44 placebos × 20 tirages), 15 variantes de gestion, 1 196 variantes quantitatives, soit
plus de 2 000 variantes explorées sur 2011-2018. 10 règles lues sur la validation : si aucune ne valait rien, il y aurait environ 20 %
de chances qu'au moins une passe t ≥ 2 par hasard ; le final (R moyen > 0) divise ce risque environ par deux.

---

## SECOND TOUR (2026-09-26, écrit AVANT tout calcul du second tour) — les 22 stratégies du Labo

Après la validation (aucune des 10 règles ne passe, `night-validation.md`), Esdras demandait de « tester tout ce qui peut l'être » :
second tour sur les 22 stratégies déjà codées du Labo (`src/backtest/labRegistry.js` : Anchored VWAP, Asian Range Fade / Breakout,
Bollinger Squeeze, Breaker Block, CBDR, DMI Trend, Equal Highs/Lows, Gap Continuation, Support HTF + renversement, Judas Swing, MACD
Trend, Midnight Open, Mitigation Block, NDOG, NWOG, OTE, Power of Three, RSI Divergence, Star Patterns, Unicorn Model, Weekly Sweep).
- Réglages par défaut du registre, AUCUNE optimisation ; US100, US500, XAUUSD, EURUSD ; bougies M15 tirées du M1 de la phase ; résultat
  du moteur lui-même (règlement M15 du Labo), puis coûts de la nuit : spread du projet en % du prix / distance au stop, et swap.
- Même découpage : exploration 2011-2018 → validation 2019-2022 (une lecture) → final 2023-2024 + 2026 (une lecture) ; mêmes critères.
- Sélection : retenue = >= 60 trades, R moyen > 0, t >= 2, deux moitiés positives ; au plus 1 marché par stratégie (t le plus élevé) et
  au plus 10 stratégies (t les plus élevés), figées et commitées avant la validation.
- Déjà vu (déclaré) : ces stratégies ont été passées au crible il y a des mois sur d'autres découpages (commentaire du registre) ; les
  années 2019-2022 ont été lues cette nuit pour les 10 règles du premier tour (sans lien avec ces moteurs).
Script : `scripts/runNightLabSweep.js`.

**AMENDEMENT 3 (second tour, écrit après l'exploration au règlement M15 et AVANT toute lecture cachée et avant de voir le règlement M1)** :
l'exploration au règlement M15 du Labo donne des chiffres invraisemblables (Anchored VWAP : +1,6 R par trade sur 3 800 trades avec 30 %
de gagnants ; Midnight Open : +0,9 à +1,1 R), signe des biais connus du règlement M15 (stop pas vérifié dans la bougie d'entrée par
certains moteurs, ordre stop/objectif dans une même bougie). Le second tour est donc réglé en **M1**, la méthode de référence du projet :
chaque trade du moteur est rejoué minute par minute avec `simulate` (entrée au marché à la première minute de la bougie d'entrée — le
moteur entre à son ouverture — ou, pour un prix d'entrée différent de l'ouverture (OTE), ordre limite valable pendant cette bougie ;
stop et objectif du moteur ; sortie forcée à la fin de la bougie de sortie du moteur ; spread du projet et swap). Le règlement M15 reste
affiché pour mémoire ; il ne décide rien. Tout le reste du second tour est inchangé.
