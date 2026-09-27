# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul sur US500) : « le sens vient d'une prise de liquidité H4 », testé sur un autre marché

Date : 2026-09-27. Esdras : « regarde les gagnants, ce qu'ils ont en commun ».

## Profil des gagnants (C1, US100 2011-2018)
Fichier : `esdras-winners-US100-explore.md`. Environ 50 tranches ont été comparées, et aucune n'a d'écart solide : le plus grand t vaut
2,7, sur 70 trades à 10 h, ce que le hasard donne facilement avec autant de comparaisons.

## Une seule piste retenue
Elle est choisie parce qu'elle rejoint ce qu'Esdras répète, « la prise de liquidité », et non parce que son t est le plus grand.
- **La piste** : le sens H4 est déclenché par une **prise de liquidité** (mèche au-delà d'un sommet ou creux H4 intact, fermeture en
  deçà).
- **US100 2011-2018** : 567 trades, +0,174 R, t 1,84. Quand le déclenchement vient d'une entrée dans un FVG H4 : 390 trades, −0,200 R.
- **Règle SW** : C1 exactement, mais seulement quand le passage de sens vient d'une prise de liquidité. Le reste est inchangé.

## Test hors échantillon : US500 (jamais utilisé pour cette méthode)
- **Données** : US500 sur les trois périodes, 2011-2018, 2019-2022 et 2023-2024 + 2026, chacune chargée par sa phase. Les résultats
  sont additionnés. 2025 est donnée à part.
- **SW passe si, sur l'ensemble US500, les trois conditions sont remplies** :
  - au moins 100 trades ;
  - R moyen > 0 et t ≥ 2 ;
  - R moyen de SW > R moyen de C1 sur US500.
- **En descriptif, qui ne décide rien** : SW sur US100 2019-2022 et 2023-2026. Ces années ont déjà été lues pour cette famille.

Aucun réglage. Si SW échoue sur US500, la piste est abandonnée.

## Résultat (27/09) : SW ÉCHOUE sur US500
| US500 | C1 | SW |
|---|---|---|
| 2011-2018 | 1 202 trades, −0,007 R | 495 trades, +0,082 R |
| 2019-2022 | 725 trades, −0,134 R | 265 trades, −0,200 R |
| 2023-2024 + 2026 | 469 trades, −0,084 R | 183 trades, +0,019 R |
| **Total** | **2 396 trades, −0,061 R (t −1,04)** | **943 trades, −0,009 R (t −0,10)** |

- **US500 en 2025**, en descriptif : SW 58 trades, −0,080 R.
- **US100 en descriptif** (années déjà lues) : SW +0,390 R en 2019-2022 (t 1,28) et +0,088 R en 2023-2026 (t 0,40).
- **Verdict** : SW perd moins que C1 sur US500, mais reste à zéro (R ≤ 0, t −0,10). La piste est abandonnée.
