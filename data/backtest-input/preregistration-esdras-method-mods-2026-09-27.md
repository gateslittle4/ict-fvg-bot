# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) : mes modifications de la méthode d'Esdras

Date : 2026-09-27. Esdras : « mets tes propres modifications, j'ai peut-être oublié des trucs ». La base est C1
(`preregistration-esdras-method-2026-09-27.md`), qui fait zéro en 2011-2018. Ses résultats ont un profil de loterie : 84 % de stops, et
quelques objectifs H4 lointains qui paient énormément.

## Les modifications (chacune seule, puis toutes ensemble)
- **M1 : objectif fixe 3R.** L'objectif H4 sert encore à vérifier qu'il y a au moins 3R de place, mais chaque ordre sort à 3 fois son
  risque. L'ordre non rempli est annulé si ces 3R sont touchés avant. But : enlever l'effet loterie.
- **M2 : discount / premium (règle ICT classique).**
  - La zone de travail va de l'extrême atteint depuis le passage de sens (le creux pris, pour un achat) jusqu'à l'objectif H4.
  - Un achat n'est pris que si son entrée est dans la moitié basse de cette zone. Pour une vente, c'est la moitié haute.
- **M3 : accord du Daily.** Le sens H4 doit être le même que celui du dernier BMS Daily : fermeture journalière au-delà du dernier
  sommet ou creux journalier (bougie plus haute ou plus basse que ses deux voisines). Esdras regardait le Daily pour la tendance.
- **M4 : breakeven à 2R.** Le stop revient au prix d'entrée dès que le gain latent atteint 2R.
- **M5 : M1 + M2 + M3 + M4 ensemble.**

Tout le reste est identique à C1 : sens H4, BMS M15, FVG avec D hors de la zone, fenêtres 7-11 h et 20-23 h, échelle 3R, annulations,
sortie à 17 h, au plus 3 trades par jour.

## Critères
Cinq candidates, donc des critères plus stricts contre le hasard des essais multiples.
1. **Exploration 2011-2018**, il faut à la fois :
   - au moins 60 trades, R moyen > 0, **t ≥ 2,5** ;
   - les deux moitiés positives ;
   - un R moyen supérieur à celui de C1 (+0,004 R).
2. **Validation 2019-2022**, pour les retenues : R moyen > 0 et t ≥ 2. Cette période a déjà servi pour C1 (soir S1, matin en
   descriptif) ; ces modifications ont en partie été pensées en voyant son profil de loterie. Elle n'est donc pas totalement neuve. Le
   juge propre reste l'étape 3.
3. **Final 2023-2024 + 2026**, lecture unique : R moyen > 0. L'année 2025 est donnée à part.

Aucun réglage entre les étapes.

## Résultat (27/09) : les 5 modifications sont REJETÉES en exploration 2011-2018
| | Trades | R moyen | t | Sans les 5 meilleurs |
|---|---|---|---|---|
| C1 (base) | 1 342 | +0,004 | 0,05 | −91,2 R |
| M1 (3R fixe) | 1 059 | **+0,086** | 1,56 | +70,1 R |
| M2 (discount) | 769 | +0,003 | 0,03 | −85,3 R |
| M3 (Daily) | 728 | −0,042 | −0,40 | −124,8 R |
| M4 (breakeven 2R) | 1 327 | −0,039 | −0,56 | −148,4 R |
| M5 (tout) | 289 | +0,035 | 0,36 | −6,4 R |

- **M1 est la seule modification encourageante** : les deux moitiés sont positives (+0,058 et +0,111 R), elle ne dépend pas des gros
  trades, et elle a 27 % de gagnants. Mais t = 1,56 reste loin du seuil de 2,5, et même de 2. Elle est donc rejetée, comme prévu.
- Validation et final ne sont pas lus. Détails : `esdras-mods-explore.md`.
