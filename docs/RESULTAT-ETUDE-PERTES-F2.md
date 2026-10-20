# Étude des pertes de F2 (2011–2022) — résultat descriptif

Calculé le 2026-10-06 après `PREREG-ETUDE-PERTES-F2.md` (définitions écrites avant le calcul). **Descriptif : aucune règle jugée, F2 inchangée.** Le test 2023–2025 et 2026 n'ont pas été lus.

## Contrôle
F2 sur la série continue, 2011–2022 : 1 222 trades, +0,106 R par trade, t 2,04, pire baisse 27,4 R (identique aux études précédentes). Sorties : **868 stops (71 %)**, 289 TP, 65 sorties au temps. Précision : les sorties au temps ont un R moyen de **+1,26** ; ce ne sont donc pas des pertes en général. Les pertes de F2 sont ses 868 stops, tous à −1 R.

## 1) Avancée favorable maximale avant le stop
| Avant d'être stoppé, le prix est allé dans le sens du trade de… | Stops | Part |
|---|---|---|
| moins de 0,25 R | 369 | 43 % [39 ; 46] |
| 0,25 à 1 R | 252 | 29 % [26 ; 32] |
| 1 R ou plus | 247 | 28 % [26 ; 32] |

Médiane : 0,41 R. **Plus d'un stop sur quatre (28 %) était d'abord parti d'au moins 1 R dans le bon sens.** Dans tes pertes réelles de 2025, c'était 31 % (mesure plus approximative). Les deux ordres de grandeur sont proches.

## 2) Les gagnants qui ont failli être stoppés
Sur 289 gagnants, 40 % [35 ; 46] sont passés à plus de 0,5 R contre eux avant d'atteindre le TP, et 18 % [14 ; 23] à plus de 0,75 R (médiane : 0,43 R). Les gagnants et les perdants de F2 ne sont donc pas séparés nettement : beaucoup de gagnants passent près du stop.

## 3) Taille du stop relative au bruit du marché
S = risque en points / amplitude moyenne des 96 bougies M15 précédentes (une journée de bougies). Quatre groupes de même taille :

| Groupe | Valeurs de S | Trades | Gagnants | R moyen [IC 95 %] | RR prévu moyen |
|---|---|---|---|---|---|
| Q1 (stops les plus courts) | 0,47–1,30 | 306 | 23 % | +0,025 [−0,19 ; +0,25] | 3,70 |
| Q2 | 1,30–1,76 | 305 | 25 % | +0,015 [−0,18 ; +0,22] | 3,21 |
| Q3 | 1,76–2,38 | 306 | 33 % | **+0,301 [+0,09 ; +0,53]** | 3,10 |
| Q4 (stops les plus larges) | 2,39–9,70 | 305 | 33 % | +0,083 [−0,10 ; +0,26] | 3,02 |

Les deux groupes aux stops les plus courts sont à peu près à zéro ; les deux autres sont positifs, mais **pas de façon régulière** : Q3 est le meilleur, Q4 retombe. Quatre groupes, un seul au-dessus de zéro : à lire comme une piste, pas comme un effet. C'est la même question que dans ton étude (où tes stops étaient passés de 23–25 à 10–15 points), mais ici sans preuve que ce soit le stop lui-même qui compte : un stop très court donne aussi un RR prévu plus élevé (3,70 contre 3,02).

## 4) Après le stop, avec point de comparaison (1 jour = 96 bougies M15)
| | Revient à l'entrée | Atteint le TP prévu |
|---|---|---|
| Après un stop de F2 (868) | 82 % [80 ; 85] | **39 % [36 ; 42]** |
| Base : 17 360 bougies tirées au hasard (06–16 NY, même R, même RR) | 78 % | **32 %** |

Le prix atteint le niveau du TP prévu dans 39 % des cas après un stop de F2 (cohérent avec les 40 % de l'analyse précédente), contre 32 % depuis un instant tiré au hasard. L'écart (+7 points) est petit mais sort de l'intervalle d'incertitude. Cela veut dire qu'une partie du « retour du prix » est générique (le prix atteint souvent un niveau à quelques R en une journée, à cause de la volatilité et de la hausse de l'indice), et qu'une petite partie seulement est propre à l'endroit où F2 se fait stopper. Ce petit excédent ne dit pas comment l'exploiter : il faudrait une règle de ré-entrée, qui serait une nouvelle hypothèse à écrire d'avance.

## Ce que ça veut dire
1. **Les pertes de F2 ressemblent à celles de tes trades réels** : environ un stop sur quatre à trois sur dix était d'abord parti d'au moins 1 R, et à peu près 40 % des stops n'ont presque rien donné (moins de 0,25 R).
2. **Aucun signe que les stops de F2 sont chassés** de façon particulière : le retour du prix après un stop dépasse peu ce que le hasard donne (39 % contre 32 %).
3. **La taille du stop relative au bruit est la seule piste qui sort**, mais de façon irrégulière : à ne pas transformer en filtre sans l'écrire d'avance (un filtre « pas de trade quand S est petit » serait une nouvelle hypothèse, à juger sur 2011–2022, puis 2023–2025 lu une seule fois, avec un seuil de t durci).
4. Aucun lien direct avec le plafond de 40 $ : le plafond concerne tes trades discrétionnaires (taille de position), F2 est un système à risque fixe de 1 R.

## Réserves
- Plusieurs tableaux et quatre groupes : aucune de ces comparaisons n'est un test.
- Les trades de F2 sont corrélés ; les intervalles sont un peu trop étroits.
- La base de comparaison ne tient pas compte de la volatilité du moment ni de la dérive haussière.
- Le TP prévu de F2 dépend de la cible : le RR varie (3,0 à 3,7 en moyenne selon le groupe).
- 2011–2022 uniquement ; 2023–2025 et 2026 non lus.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboS_pertes.mjs <data>` (≈ 10 s). Tests : `node --test scripts/comboFvgV6/comboS_pertes.test.mjs` (5 tests : AFM/MAE/S, après le stop, base de comparaison, quartiles, intervalle de Wilson et graine). Moteur : `lib/krysBacktestC.js`.
