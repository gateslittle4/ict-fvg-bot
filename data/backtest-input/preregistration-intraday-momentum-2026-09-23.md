# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Momentum intraday publié sur US100 / US500

Date : 2026-09-23. Demande d'Esdras : « trouve-moi une stratégie qui fonctionne ». Le combo live a un avantage sur 2010-2022 (+326 R, t 2,86) mais ≈ 0 depuis 2023 ; les retouches du combo sont épuisées (voir `data/research-memory.json`). On teste donc une source d'avantage **nouvelle et indépendante** : trois stratégies de momentum intraday **publiées**, avec les règles des auteurs, sans optimisation. Les détails que les articles ne fixent pas (ou que je ne peux pas vérifier) sont fixés ici, par moi, avant de voir un seul résultat. Aucun paramètre ne sera changé après lecture. Si rien ne passe, on n'ajoute pas de filtres pour « faire marcher ».

## Règles communes
- **Séance** : bourse de New York 9:30-16:00, heure de New York réelle (heure d'été comprise). Jour sans barre M1 à 9:30 → pas de trade. « Clôture du jour » = clôture de la dernière barre M1 avant 16:00 (15:59 ; plus tôt les demi-journées). « Clôture de la veille » = même définition, jour de séance précédent.
- **Prix** : barres M1 au bid. Achat à l'ask (= bid + spread), vente au bid ; un achat sort au bid, une vente à l'ask. Spread = spread par défaut du projet (`DEFAULT_SPREADS` : US100 0,6, US500 0,25) ramené au niveau de prix du moment (même % du prix, comme `runLiveReplay.js`). Pas de swap (tout est fermé avant 16:00). Pas d'autre glissement ; sensibilité à 2 × le spread affichée (descriptive).
- **Stop et objectif dans la même minute** : le stop d'abord (prudent).
- **Données** : entraînement 2010-2022 = HistData M1 (`data/histdata-m1`, US100 dès 2010-11) ; test 2023-2025 et 2026 (→ 2026-09-21) = M1 du broker (`data/real-m1-full`).

## A — Cassure du range d'ouverture 5 minutes (Zarattini & Aziz 2023, SSRN 4416622, testé sur QQQ) — jambe principale **US100**
1. Première bougie de 5 min = barres M1 9:30 à 9:34 (ouverture de 9:30, plus haut/plus bas des 5, clôture de 9:34).
2. Clôture > ouverture → **achat** ; clôture < ouverture → **vente** ; égalité → pas de trade.
3. Entrée à l'ouverture de la barre 9:35 (pas besoin de casser le plus haut/bas : c'est la règle de l'article).
4. Stop = extrême opposé de la première bougie (plus bas pour un achat, plus haut pour une vente). R = distance exécution → stop. Pas de trade si R ≤ 0 ou R < 3 × spread (règle de viabilité du bot, ajoutée par moi).
5. Objectif = 10 R. Sinon sortie à la clôture du jour.
6. Mesure principale : R par trade (P&L / R, sans plafond de levier). Compte (descriptif) : risque 0,25 / 0,5 / 1 % par trade, levier plafonné à 4 × le capital comme l'article.

## B — « Noise area » (Zarattini, Aziz & Barbon 2024, SSRN 4824172, testé sur SPY) — jambe principale **US500**
1. Pour chaque minute m de la séance : écart_j(m) = |clôture_j(m) / ouverture_j − 1| ; σ(m) = moyenne de écart(m) sur les **14 séances précédentes** (il faut les 14 ; sinon pas de trade ce jour).
2. Bornes à la minute m : **haute = max(ouverture du jour, clôture de la veille) × (1 + σ(m))** ; **basse = min(ouverture du jour, clôture de la veille) × (1 − σ(m))**.
3. Décisions **uniquement à HH:00 et HH:30, de 10:00 à 15:30** (12 contrôles), sur la clôture de la barre qui finit à cette heure ; exécution à l'ouverture de la barre suivante.
4. À plat : prix > borne haute → achat ; prix < borne basse → vente.
5. En position (même contrôles) : achat sorti si prix < max(borne haute, VWAP) ; vente sortie si prix > min(borne basse, VWAP). Après une sortie, nouvelle entrée possible à un contrôle suivant (sortie puis entrée au même contrôle = retournement).
6. **VWAP** : les données M1 n'ont pas de volume réel → remplacé par la moyenne des prix typiques (H+B+C)/3 des barres depuis 9:30 (écart à l'article, déclaré).
7. Tout est fermé à la clôture du jour. Aucun stop entre deux contrôles (règle de l'article telle que je la comprends).
8. Mesure principale : rendement net par trade en % du nominal (sans levier). Compte (descriptif) : nominal = capital × min(4, cible / σ14), σ14 = écart-type des rendements journaliers (clôture à clôture) des 14 séances précédentes ; cible de volatilité journalière 0,5 / 1 / 2 % (2 % = article).

## C — Momentum de la dernière demi-heure (Gao, Han, Li & Zhou 2018, *Journal of Financial Economics* 129) — jambe principale **US500**
1. r1 = clôture de la barre 9:59 / clôture de la veille − 1 (première demi-heure, nuit comprise).
2. À 15:30 (ouverture de la barre 15:30) : r1 > 0 → achat ; r1 < 0 → vente ; sortie à la clôture du jour. Pas de stop. Pas de barre 15:30 (demi-journée) → pas de trade.
3. Mesure principale et compte : comme B.

## Critère de succès (le même que les études précédentes, fixé avant calcul)
- Seules les **3 jambes principales** (A-US100, B-US500, C-US500) peuvent devenir candidates. Chacune est **candidate** si, sur l'entraînement 2010-2022 : ≥ 60 trades, moyenne nette > 0 avec **t ≥ 2**, positive en 2010-2016 ET en 2017-2022 ; PUIS au test 2023-2025 (lu une seule fois) : ≥ 30 trades et moyenne nette > 0. 2026 : descriptif.
- L'autre indice (A-US500, B-US100, C-US100) est affiché comme **contrôle de robustesse** (un vrai effet devrait avoir le même signe), jamais adoptable seul.
- Tests multiples déclarés : 3 jambes à t ≥ 2 → environ 7 % de chances qu'une passe par hasard. Une candidate va en **démo / alerte** avant tout argent réel ; aucune adoption directe.
- Limites déclarées : effets publiés souvent affaiblis après publication (McLean & Pontiff 2016) ; CFD ≠ ETF (séance et prix du CFD, pas de volume) ; une réplication indépendante de A (github.com/giovannibrusco/zarattini-2023-orb-qqq) le trouve sensible aux coûts.
