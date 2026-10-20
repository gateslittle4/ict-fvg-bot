# Analyse descriptive de tes 646 trades réels (mars–juillet 2025)

Calculé le 2026-10-06 à partir de `data/real-trades-2025.csv`. **Descriptif seulement : aucune règle n'est proposée ni jugée ici, aucun trade n'est validé ou rejeté.** Script : `scripts/analyseMesTrades.mjs` (5 tests dans `analyseMesTrades.test.mjs`).

## Contrôle
646 trades, résultat total **+1 311 $**, 24,6 % de gagnants, gain moyen 101 $, perte moyenne −30 $. Le calcul retrouve ces chiffres exactement.

## Comment lire les tableaux
- **R** = résultat du trade divisé par ta perte médiane du mois (25 $ en mars et avril, 27 $ en mai et juin, 36 $ en juillet). C'est une unité approximative : tes mises ont varié, et ta perte « normale » n'est pas un stop fixe.
- Les intervalles entre crochets sont des IC à 95 % par bootstrap. Quand l'intervalle contient 0, on ne peut pas distinguer l'effet du hasard.
- J'ai regardé environ **45 groupes** (mois, sens, heure, jour, etc.). Avec autant de groupes, deux ou trois « significatifs » apparaissent par hasard même sans aucun effet. Aucun groupe ne doit donc être lu comme une règle.
- **Durée, rang dans la journée et nombre de trades par jour sont des conséquences du résultat, pas des choix** : un trade perdant se ferme vite (stop touché), un gagnant dure plus longtemps ; un jour où tu gagnes tôt, tu t'arrêtes plus tôt. Ces lignes ne disent donc pas « garde tes trades plus longtemps » ; elles décrivent seulement ce qui s'est passé.

## Le résultat dépend d'avril et de quelques gros gains
| Ensemble | n | Gagnants | R moyen [IC 95 %] | R total | $ |
|---|---|---|---|---|---|
| Tous | 646 | 25 % | +0,10 [−0,13 ; +0,35] | +66,1 | +1 311 |
| Sans avril | 489 | 23 % | −0,05 [−0,30 ; +0,21] | −23,1 | −885 |
| Sans les 10 plus gros gains | 636 | 23 % | −0,16 [−0,34 ; +0,03] | −101,1 | −3 156 |

Sur le total, avril (+2 196 $, 157 trades) fait tout le résultat positif. Retire avril ou tes dix meilleurs trades, et le résultat devient négatif. L'intervalle du résultat global contient 0 : on ne peut pas affirmer, sur ces 646 trades, que tu étais gagnante ou perdante en moyenne.

## Par mois
| Mois | n | Gagnants | R moyen [IC] | R total | $ |
|---|---|---|---|---|---|
| 2025-03 | 65 | 20 % | −0,09 [−0,64 ; +0,66] | −5,7 | −141 |
| 2025-04 | 157 | 31 % | **+0,57 [+0,08 ; +1,09]** | +89,2 | +2 196 |
| 2025-05 | 149 | 19 % | +0,02 [−0,49 ; +0,57] | +3,0 | +81 |
| 2025-06 | 116 | 25 % | +0,08 [−0,46 ; +0,73] | +8,9 | +235 |
| 2025-07 | 159 | 25 % | −0,18 [−0,56 ; +0,25] | −29,3 | −1 059 |

Seul avril a un intervalle au-dessus de 0.

## Par sens
Achats : 392 trades, +0,09 R [−0,21 ; +0,41], +867 $. Ventes : 254 trades, +0,12 R [−0,22 ; +0,51], +444 $. Aucune différence mesurable.

## Par heure d'ouverture (heure de New York)
| Plage | n | Gagnants | R moyen [IC] | $ |
|---|---|---|---|---|
| 00–06 | 43 | 21 % | +0,12 [−0,60 ; +0,99] | +25 |
| 06–08 | 100 | 19 % | +0,33 [−0,35 ; +1,16] | +645 |
| 08–10 | 133 | 20 % | +0,09 [−0,45 ; +0,71] | +304 |
| 10–12 | 115 | 28 % | +0,14 [−0,42 ; +0,79] | +506 |
| **12–16** | 179 | 26 % | **−0,28 [−0,52 ; −0,03]** | −1 466 |
| 16+ | 76 | 33 % | +0,67 [−0,15 ; +1,54] | +1 296 |

12–16 h est la seule plage dont l'intervalle est entièrement sous 0 (−1 466 $ sur 179 trades). C'est 1 groupe sur une quarantaine : à prendre comme une piste à surveiller, pas comme une conclusion. Les autres plages ne se distinguent pas du hasard. Note : cet effet horaire n'a rien à voir avec ce qu'on a mesuré pour F2 (où la fenêtre 06–16 NY est une règle de base) ; les deux ne se comparent pas.

## Par jour de semaine
| Jour | n | R moyen [IC] | $ |
|---|---|---|---|
| lundi | 110 | +0,29 [−0,30 ; +1,01] | +918 |
| mardi | 89 | −0,26 [−0,62 ; +0,14] | −630 |
| mercredi | 170 | +0,03 [−0,40 ; +0,54] | −176 |
| jeudi | 140 | +0,48 [−0,07 ; +1,15] | +1 869 |
| vendredi | 115 | −0,10 [−0,58 ; +0,44] | −540 |

Tous les intervalles contiennent 0.

## Ce qui est « circulaire » (conséquence du résultat, pas une cause)
| Durée du trade | n | Gagnants | R moyen | $ |
|---|---|---|---|---|
| ≤ 5 min | 210 | 9 % | −0,77 | −4 669 |
| 5–30 min | 199 | 12 % | −0,86 | −4 951 |
| 30–60 min | 80 | 21 % | +0,07 | +136 |
| 1–4 h | 129 | 58 % | +2,05 | +7 186 |
| > 4 h | 28 | 93 % | +4,56 | +3 610 |

Les trades de plus d'une heure (157 sur 646) rapportent +10 796 $, et les 409 trades de moins de 30 minutes perdent −9 620 $. Ce n'est pas surprenant : un trade qui part dans le bon sens dure plus longtemps, un trade qui touche le stop est fini en quelques minutes. Cela montre l'ampleur de ta distribution (beaucoup de petites pertes, quelques gros gains qui font le résultat), pas qu'« attendre plus longtemps » ferait gagner.

Même remarque pour le rang du trade dans la journée (1er : −0,01 R ; 2e : +0,51 ; 3e–4e : −0,09 ; 5e–8e : +0,09 ; 9e et plus : +0,15, tous intervalles contenant 0) et pour le nombre de trades par jour : les jours à 3 trades ou moins (69 trades) font +1,50 R [+0,47 ; +2,71] et +2 858 $, mais ce sont souvent des jours où un gros gain a été pris et où tu t'es arrêtée. Les jours à 7–10 trades (272 trades) font −0,13 R et −1 172 $. Médiane : 5 trades par jour, maximum 18 (106 jours).

## Contexte dans la journée (pas de lien net)
- **R déjà réalisé dans la journée avant le trade** : ≥ 0 : +0,13 ; 0 à −2 : +0,05 ; −2 à −4 : +0,41 ; moins de −4 : −0,14. Tous intervalles contenant 0. Pas de signe net de « trading de revanche » dans ces données, mais l'échantillon est trop petit pour l'exclure.
- **Écart avec l'ouverture du trade précédent** : 1er du jour −0,04 ; moins de 5 min +0,39 ; 5–30 min −0,04 ; 30–120 min +0,06 ; plus de 2 h +0,38. Tous intervalles contenant 0.

## Ce que ça veut dire
1. Sur ces 646 trades, ton résultat net positif ne tient pas sans avril et sans une dizaine de gros gains tenus au-delà d'une heure. Hors avril, le R moyen est légèrement négatif (mais l'intervalle contient 0).
2. Le seul signal « avant le trade » (qu'on peut connaître au moment d'entrer) qui sort est **12–16 h NY en négatif** (−0,28 R, IC < 0). Il est isolé parmi environ 45 groupes testés, donc fragile.
3. Rien ne distingue le sens, le jour de la semaine, ou le contexte de la journée (R déjà réalisé, rythme des trades) du hasard.
4. Ce que tu faisais « le mieux » n'est pas identifiable de façon robuste dans ces données hors avril. Avril est le mois où ton intervalle est clairement positif (+0,57 R) ; ce que tu faisais de différent ce mois-là (sélection des setups, taille, conditions de marché) n'est pas dans le fichier : il faudrait relire tes captures d'avril.

## Réserves
- 5 mois seulement, un seul régime de marché, un seul compte : aucune garantie que ça se reproduise.
- Le fichier ne contient pas ce qui dirige tes décisions (le setup, ton plan de TP, ton stop prévu). Le R est donc une approximation basée sur ta perte médiane.
- Les trades d'une même journée sont corrélés ; les IC sont probablement un peu trop étroits.
- Aucune comparaison avec F2 ici : F2 est un système mécanique rejoué sur 2011–2022, tes trades sont discrétionnaires. Leurs chiffres ne se comparent pas directement.

## Reproduction
`node scripts/analyseMesTrades.mjs data/real-trades-2025.csv` ; tests : `node --test scripts/analyseMesTrades.test.mjs` (5 tests : lecture du CSV et champs dérivés, R mensuel, bootstrap, résumé par groupe, contexte de la journée).
