# Résultat agrégé — tri à l'aveugle de Krystofia sur les signaux de F2 (lots 1 à 8)

Lu le 2026-10-06, **une seule fois**, quand Krystofia a décidé d'arrêter (« on termine ici »), comme le prévoyait `PREREG-TRI-AVEUGLE-LOTS-2-A-10.md`. Aucun bilan agrégé n'avait été calculé avant. Pas de critère de réussite chiffré (protocole) : le résultat est descriptif, avec des intervalles d'incertitude ; c'est Krystofia qui décide ce qu'il signifie.

## Périmètre
- **8 lots révélés, 80 signaux de F2** (achats, 2011–2022), tirés au hasard avec des graines écrites d'avance (20261006 à 20261013). Chaque lot a été jugé à l'aveugle (prix relatifs, sans date), ses réponses enregistrées dans `docs/REPONSES-TRI-AVEUGLE-LOT*.md` **avant** l'ouverture de la clé.
- **Lot 9 : non jugé, exclu.** Les images ont été envoyées, mais aucune réponse n'a été donnée ; sa clé n'a jamais été ouverte. Aucun résultat du lot 9 n'est utilisé ici.
- **79 signaux comptés** : le signal 9 du lot 7 (« je ne sais pas ») est exclu des deux groupes, comme prévu.
- Classement « pris / sauté » : celui que j'ai enregistré avant chaque révélation (voir les points d'interprétation de chaque lot). Les cas où elle aurait pris le même sens **à une autre heure** que la pose de F2 sont classés « pris » dans la lecture principale ; deux lectures alternatives sont données plus bas.
- Reproduction : `node scripts/comboFvgV6/aggTriAveugle.mjs "data/etude-jugement/lot{n}/lot{n}-cle.json"`.

## Résultat principal (lecture enregistrée avant chaque révélation)
| | Signaux | TP | Sorties au temps | Stops | R total | R moyen | Part de gagnants (R > 0) |
|---|---|---|---|---|---|---|---|
| Tu prends | 28 | 4 | 2 | 22 (79 %) | −7,81 | **−0,28** | 21 % |
| Tu sautes | 51 | 11 | 9 | 31 (61 %) | +17,68 | **+0,35** | 39 % |
| Tous | 79 | 15 | 11 | 53 (67 %) | +9,87 | +0,12 | 33 % |

- Différence de R moyen (pris − sautés) : **−0,63 R**. Intervalle à 95 % (rééchantillonnage des signaux) : **[−1,39 ; +0,16]**. Test de permutation des étiquettes pris/sautés : probabilité d'obtenir un R moyen aussi bas par hasard ≈ **0,07** ; pour la part de stops chez les pris (79 %), ≈ **0,09**.
- **Stops évités : 31 sur 53 (58 %). Mais gagnants (R > 0) sautés : 20 sur 26 (77 %), dont 11 TP sur 15 (73 %).** Tu sautes 65 % des signaux au total : tu en sautes donc un peu moins que la moyenne parmi les stops (58 %) et nettement plus parmi les gagnants (77 %).
- Par lot (R moyen pris contre sautés) : tu fais mieux que les sautés dans 2 lots sur 7 où tu as pris quelque chose (lots 1 et 6), moins bien dans 5 (2, 3, 5, 7, 8) ; le lot 4 n'a aucun pris.

## Lectures alternatives (sensibilité au classement)
| Lecture | Pris | R moyen pris | Sautés | R moyen sautés | Différence [IC 95 %] | Permutation |
|---|---|---|---|---|---|---|
| Principale | 28 | −0,28 | 51 | +0,35 | −0,63 [−1,39 ; +0,16] | 0,07 |
| Sans les 7 signaux « même sens, autre heure » | 21 | −0,04 | 51 | +0,35 | −0,39 [−1,26 ; +0,53] | 0,23 |
| Ces 7 signaux classés « saute » | 21 | −0,04 | 58 | +0,18 | −0,22 [−1,06 ; +0,65] | 0,34 |
| Principale sans le trade à +8,59 R (lot 8, signal 7, sauté) | 28 | −0,28 | 50 | +0,18 | −0,46 [−1,14 ; +0,27] | 0,11 |

## Ce que cela dit
1. **Dans ces 79 signaux, ton tri n'enlève pas les stops sans enlever les gagnants.** Il enlève un peu plus de gagnants que de stops. Je ne vois aucune lecture où il fait mieux que le hasard ; la plus favorable (celle qui retire tes entrées « à une autre heure ») donne une différence proche de zéro.
2. **Rien n'est prouvé non plus dans l'autre sens.** L'intervalle de confiance va de −1,4 à +0,2 R dans la lecture principale, et l'écart n'atteint le seuil habituel dans aucune lecture. Avec 28 signaux pris, on distingue mal un effet modeste d'un effet nul. Le plus juste : *aucune trace d'un avantage de ton tri sur les achats de F2 dans cet essai, et un indice faible qu'il serait plutôt défavorable*.
3. **Ce que l'essai ne mesure pas, et qui compte pour toi** : ton trading réel. Tes réponses décrivent très souvent un **autre trade que celui montré** : un sell (quand ta lecture du jour est baissière), une entrée plus tôt (premier FVG de la matinée), un stop plus court, un ordre posé après retour dans l'entrée. Le résultat mesuré est toujours celui de l'achat de F2, posé à son heure, avec son stop. Un « sauté » parce que « j'aurais vendu » est compté comme sauté, mais le sell que tu aurais pris n'est pas dans le calcul. L'essai teste donc ta capacité à filtrer les achats de F2 sans en changer la forme, pas la qualité de ta méthode.
4. **Le même motif revient sur tout l'essai** : tu refuses surtout selon l'order flow ou le sens du jour, le balayage d'un high ou low H4, un FVG H4 contre le trade, l'heure, le stop trop loin. Aucun de ces critères n'a été testé comme règle écrite ; ils sont notés dans les réponses de chaque lot.

## Limites (honnêtes)
- 79 signaux, 28 pris : petits effectifs ; les R d'un même lot et d'un même mois ne sont pas indépendants.
- Les signaux jugés sont des signaux qui se sont remplis ; en temps réel tu jugerais aussi ceux qui ne se remplissent pas.
- Prix relatifs, 160 bougies M15 et 40 H4 : tu me l'as dit toi-même (« je ne peux pas dire ce qu'il y a avant le low »). Le contexte manquant joue contre ton tri.
- Tu as arrêté après avoir vu les résultats de huit lots (le protocole le permettait et je n'avais calculé aucun agrégat avant) ; un arrêt après des lots défavorables ou favorables peut biaiser un essai, mais les deux sens étaient possibles ici (lots 6 et 8 plutôt à ton avantage en nombre de stops évités).
- Un signal du 29/01/2013 et un du 29/01/2014 reviennent dans deux lots chacun (autres signaux, autres heures) : la règle « un signal par jour » ne valait que dans un lot.
- Certains classements « pris / sauté » sont des interprétations de phrases libres ; la sensibilité ci-dessus les couvre en partie, pas toutes.

## Conséquence pour F2
**F2 reste telle quelle** : ce tri ne donne aucune règle chiffrée à ajouter, et les critères que tu cites (premier setup de la journée, stop relatif à la volatilité, FVG H4 contre le trade, sens du jour) n'ont pas été testés. S'ils deviennent des règles, chacun demandera sa définition précise et son pré-enregistrement avant tout calcul ; l'heure, elle, a déjà été testée et rejetée. Ces critères mesurables restent à ta décision.
