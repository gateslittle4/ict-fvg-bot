# Pré-enregistrement — F2 avec un plancher de RR de 5 et de 6 (RR5, RR6)

Écrit le 2026-10-06, AVANT tout calcul de cette étude. Règles et critères figés : aucun amendement après lecture. Origine : Krystofia, après le rejet des ventes : « peut-être que là où tu vois 3 R, moi je vois 5, 6 R ; voilà pourquoi c'est petit pour toi ». Ce n'est pas une variante voisine d'une règle rejetée : les études de RR précédentes ont testé des cibles **plus proches** (bord proche, moitié, bord lointain du FVG cible, médiane 1,6 à 2,1 R) ; aucune n'a testé un plancher **plus élevé** que 3 R.

## Contrôle (inchangé)
F2C = F2 sur la série continue : TP = max(½ FVG cible, 3 R). À retrouver : 2011–2022 +0,106 R (1 222 trades), 129,7 R, pire baisse 27,4 R.

## Les deux hypothèses (figées)
Seul le plancher de RR change ; tout le reste de F2 est inchangé (achats, balayage H4, FVG d'âge ≤ 8, 06–16 NY, entrée à 50 %, stop c1 − 3 pts, spread 0,6, mises à l'échelle, sortie au temps à 96 bougies, convention pessimiste stop d'abord).
1. **RR5** : TP = max(½ FVG cible, **5 R**).
2. **RR6** : TP = max(½ FVG cible, **6 R**).
Un TP plus lointain est touché plus rarement et sort plus souvent au temps (96 bougies) ; moins d'ordres sont annulés avant leur remplissage (le TP n'est plus atteint avant l'entrée), donc le nombre de trades peut augmenter. Aucune autre valeur essayée (4 R, 7 R, TP au bord lointain du FVG, RR variable, partiels, break-even, trailing) : si une hypothèse échoue, on s'arrête pour celle-là.

## Seuil
Deux hypothèses : t apparié ≥ **1,96** (comme H1/H2).

## Critères d'entraînement (tous requis, par hypothèse, sur 2011–2022)
Trades appariés avec F2C par année + bougie de pose + bougie de création de la zone (t apparié sur les ordres communs : R de la variante − R de F2C).
1. R moyen de la variante ≥ R moyen de F2C + 0,03.
2. t apparié ≥ 1,96.
3. Variante > F2C et > 0 dans A (2011–2016) et dans B (2017–2022).
4. Pire baisse ≤ 1,25 × celle de F2C (≤ 34,3 R).
5. Rythme ≥ 1,5 trade par semaine sur 2023–2025 (nombre de trades seulement, R non lu ; même seuil que l'étude RR dynamique).

## Lecture du test 2023–2025 (une seule fois, uniquement pour les variantes qui passent)
R moyen de la variante > R moyen de F2C sur 2023–2025 et > 0, et différence appariée moyenne > 0. 2026 : descriptif.

## Descriptif (non jugé)
Pour chaque variante : part de trades qui touchent le TP, part de sorties au temps, R moyen des sorties au temps, RR visé médian et moyen, nombre de trades ajoutés et retirés par rapport à F2C.

## Divulgations
- **L'idée vient de l'observation de Krystofia sur son trading réel** (non mesurée) : elle suppose qu'elle gère ses trades autrement (sorties à la main, cibles plus lointaines, jugement du contexte). Un TP fixe à 5 ou 6 R sur les entrées de F2 n'est pas son trading.
- **Arithmétique à garder en tête** : avec un TP à 5 R, il faut plus de 17 % de TP pour être positif (14 % à 6 R) ; F2C en a environ 24 % à 3 R. Pour battre F2C (+0,106), il faudrait que la plupart des trades qui touchent 3 R continuent jusqu'à 5 ou 6 R. Cela se mesure ; je n'ai pas lu le résultat.
- Des TP « 3 R fixe » et « bord proche » avaient été essayés sur les premiers backtests du projet, et des sorties dynamiques (partiels, break-even, trailing) sur 116 trades de 2023–2026 (résultat défavorable, d'après le projet) ; ce sont d'autres règles et d'autres données.
- **2023–2025 n'est pas vierge pour F2** (son R global a été lu). Un succès à l'entraînement et au test serait un indice, pas une preuve ; la confirmation propre demanderait des données nouvelles (après le 21/09/2026).
- Les trades sont corrélés ; les t sont un peu flatteurs. Clé d'appariement corrigée (voir `CORRECTION-APPARIEMENT.md`).

## Reproduction prévue
`node --max-old-space-size=6144 scripts/comboFvgV6/comboAA_rr.mjs <data> train`, puis `... test <RR5,RR6>` pour les variantes qui passent. Moteur : `lib/krysBacktestC.js`.
