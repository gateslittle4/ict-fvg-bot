# Résultat — setup « OB M15 avec FVG M5 dedans » (OBM5), achats, contexte H4 de F2, entraînement 2011–2022

Règle et critères : `PREREG-OB-M15-FVG-M5.md` (SHA-256 `1be28d4a…5706`, 2026-10-07 08:06 heure de New York), écrit avant tout calcul ; aucun paramètre ajusté après lecture. Code : `scripts/comboFvgV6/comboAI_ob_m5.mjs` + moteur `lib/obEngine.js` + test (18 tests passent). Le contrôle F2C se reproduit exactement (1 222 trades, +0,106 R, 129,7 R, baisse 27,4). Les bougies M5 sont construites depuis les M1 (1 105 680 barres M5, 370 644 barres M15).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| F2C (référence de niveau) 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **OBM5** 2011–2016 (A) | 227 | 22 % | −8,3 | **−0,036** | −0,29 | 37,2 |
| **OBM5** 2017–2022 (B) | 218 | 28 % | 71,0 | **+0,326** | 2,07 | 20,0 |
| **OBM5** 2011–2022 | 445 | 25 % | 62,8 | +0,141 | **1,40** | **37,2** |

R moyen par an : 2011 −0,54 (35) · 2012 −0,07 (41) · 2013 +0,12 (32) · 2014 −0,50 (28) · 2015 +0,30 (41) · 2016 +0,23 (50) · 2017 +0,72 (34) · 2018 +0,38 (35) · 2019 +0,02 (37) · 2020 +0,42 (33) · 2021 −0,29 (40) · 2022 +0,77 (39).

Chaîne de filtrage 2011–2022 : FVG M15 passant le balayage H4 : 4 304 → OB trouvé : 2 768 → FVG M5 dedans : 1 632 → niveau d'entrée non touché : 1 068 → cible trouvée : 1 026 ordres → remplis : 445 (43 %). TP atteint : 24 % ; RR visé moyen 4,2.

## Critères (tous requis)
| Critère | OBM5 |
|---|---|
| R moyen > 0 et t ≥ 1,96 | +0,141 mais t **1,40** : échec |
| R moyen > 0 dans A et dans B | A **−0,036**, B +0,326 : **échec** |
| R moyen ≥ celui de F2C (+0,106) | +0,141 : ok |
| Pire baisse ≤ 1,25 × celle de F2C (34,3) | **37,2** : échec |
| Rythme ≥ 1,0 / semaine (2023–2025) | **0,73** : échec |

**OBM5 est rejetée** (quatre critères sur cinq échouent). Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante voisine.

## Descriptif (non jugé)
Avec le spread doublé : 433 trades, +0,068 R en moyenne, t 0,67, baisse 46,5. Le résultat est donc très sensible au coût, comme déjà vu sur le test du courtier en séance précédente.

## Lecture honnête
1. **Même schéma que les autres pistes de cette séance** : zéro ou négatif sur 2011–2016 (−0,036), fort sur 2017–2022 (+0,326, t 2,07). Un avantage qui n'existe que sur la seconde moitié n'est pas une base solide. 2017–2022 pris seul ne peut pas servir de preuve : il a été choisi après coup.
2. **L'entrée à 50 % du FVG M5 n'a pas de support dans ces données** : le niveau moyen est comparable à F2C (+0,141 contre +0,106) avec environ un tiers des trades (445 contre 1 222), donc plus de variance (t 1,40) et plus de baisse.
3. **Les trades sont rares** : 0,73 par semaine sur 2023–2025, sous le seuil de 1,0. Le setup est très sélectif une fois la chaîne OB + FVG M5 + niveau non touché + cible appliquée.
4. **Cohérent avec l'ancien test du courtier (2023–2026, sans H4)** : pas d'avantage robuste. Ajouter le balayage H4 de F2 et couvrir 2011–2022 ne change pas la conclusion globale ; ça ne dit rien sur ton exécution à la main, où la sélection (contexte, structure) n'est pas codée.

## Limites et divulgation
- Presque tous les choix de définition sont de moi (OB = c1 ou la bougie avant ; premier FVG M5 formé ; niveau non touché ; fenêtre de 12 bougies ; stop = bas de l'OB − 3 pts ; fills en M15). Une autre définition donnerait d'autres chiffres (non testée, interdit après un échec).
- Le cas « un ordre rempli pendant qu'une position est déjà ouverte est consommé sans trade » reprend le code du moteur de F2, mais n'est **pas couvert par un test unitaire** dans ce moteur.
- `comboF.mjs` a été modifié : `readM1` et `dstHours` sont maintenant exportées (deux mots `export`, rien d'autre).
- Seuil de 1,96 non corrigé pour les comparaisons multiples ; trades corrélés, t un peu flatteurs.

## Reproduction
`node --max-old-space-size=8192 scripts/comboFvgV6/comboAI_ob_m5.mjs <data> train` (≈ 20 s). Test : `node --test scripts/comboFvgV6/comboAI_ob_m5.test.mjs`.
