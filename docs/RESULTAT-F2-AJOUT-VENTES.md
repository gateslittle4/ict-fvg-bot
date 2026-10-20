# Résultat — F2S : F2 + ventes en miroir (entraînement 2011–2022)

Règle et critères : `PREREG-F2-AJOUT-VENTES.md` (SHA-256 `563e030f…5601` après un erratum de rédaction sur le TP fait avant tout calcul, 2026-10-06 21:07 heure de New York), commité avant tout calcul ; aucun paramètre ajusté après lecture. Le contrôle F2C retrouve exactement les valeurs attendues (1 222 trades, +0,106 R, 129,7 R, pire baisse 27,4 R, rapport R/baisse 4,73).

## Résultat
| | Trades | Gagnants | R total | R moyen | t | Pire baisse |
|---|---|---|---|---|---|---|
| Achats F2C 2011–2022 | 1 222 | 29 % | 129,7 | +0,106 | 2,04 | 27,4 |
| **Ventes 2011–2016** | 799 | 27 % | 43,3 | +0,054 | 0,83 | 53,8 |
| **Ventes 2017–2022** | 780 | 24 % | −3,9 | −0,005 | −0,07 | 64,4 |
| **Ventes 2011–2022** | 1 579 | 25 % | 39,4 | **+0,025** | **0,53** | 84,4 |
| **F2S (achats + ventes)** | 2 801 | 27 % | 169,0 | +0,060 | 1,73 | 68,1 |

## Critères (tous requis)
| Critère | Résultat | |
|---|---|---|
| Ventes : R moyen > 0 et t ≥ 1,96 | +0,025 ; t 0,53 | échec |
| Ventes : R moyen > 0 dans A et dans B | A +0,054 ; B −0,005 | échec (B) |
| Ventes : rythme ≥ 1,0 / semaine (2023–2025) | 2,55 | ok |
| F2S : R total / pire baisse ≥ 4,73 | 2,48 | échec |

**F2S est rejetée.** Le test 2023–2025 n'a pas été lu. Comme écrit d'avance, on s'arrête : aucune variante des ventes.

## Ce que ça dit
1. Les ventes en miroir n'ont pas d'avantage mesurable : +0,025 R par trade, indiscernable de zéro. Ajouter 1 579 ventes porte le R total de 129,7 à 169,0, mais la pire baisse passe de 27,4 à 68,1 R : le rapport R/baisse tombe de 4,73 à 2,48. On gagne un peu plus et on risque beaucoup plus.
2. Les ventes sont très irrégulières d'une année à l'autre : −46,7 R en 2017 et −28,8 R en 2021 (années haussières), +33,2 R en 2020 et +31,4 R en 2022. C'est le profil d'une stratégie à contre-courant d'un marché qui monte sur le long terme, pas d'un avantage stable. Ce commentaire est descriptif : je ne teste pas de filtre de régime (pas de variante voisine).
3. **Correction de ma part** : j'avais cité, après l'étude du premier setup, un R moyen de +0,118 pour les ventes qui étaient le premier remplissage de leur journée (1 061 trades), en disant que la série n'était « pas nulle ». Sur l'ensemble des ventes (1 579 trades), le chiffre est +0,025. Le sous-ensemble paraissait meilleur que le tout : une illustration de ce que valent les chiffres lus sur un sous-ensemble.
4. Cela ne dit rien de tes ventes manuelles, qui combinent l'order flow, le sens du jour et ton stop. L'essai ne mesure que le miroir mécanique de F2.

## Descriptif (non jugé)
Résultat par année, achats | ventes (R total) : 2011 3,9 | 22,8 ; 2012 20,1 | −2,1 ; 2013 13,5 | 7,5 ; 2014 9,7 | −5,7 ; 2015 −17,7 | −1,7 ; 2016 11,8 | 22,5 ; 2017 50,4 | −46,7 ; 2018 −14,3 | 5,0 ; 2019 12,7 | 2,0 ; 2020 23,7 | 33,2 ; 2021 −2,3 | −28,8 ; 2022 18,2 | 31,4. 15 % des ventes sont ouvertes en même temps qu'un achat.

## Limites
- Le modèle suppose de pouvoir porter achats et ventes à la fois ; un compte à une seule position donnerait d'autres trades.
- L'entraînement des ventes n'était pas totalement vierge (un sous-ensemble avait été lu pour PS1) : cela ne change pas le rejet.
- Les trades sont corrélés ; les t sont un peu flatteurs.

## Reproduction
`node --max-old-space-size=6144 scripts/comboFvgV6/comboZ_ventes.mjs <data> train` (≈ 20 s). Tests : `node --test scripts/comboFvgV6/comboZ_ventes.test.mjs` (3 tests : chevauchement, drawdown, données réelles avec vérification des achats contre F2C et des ventes).
