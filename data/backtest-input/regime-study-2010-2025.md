# Test de régime de marché : le bot marche-t-il différemment selon le contexte ?

14224 signaux indépendants (un par mécanisme à la fois), 2010-2025, stops d'origine, spread inclus. Seuils des régimes calés sur l'entraînement (≤ 2023) : volatilité 0.90 / 1.33, force de tendance 0.30 / 0.69.
Chaque trade est réglé deux fois (stop d'abord / objectif d'abord dans une même bougie M15) : la vérité est entre les deux. **Trouvaille = |t| ≥ 2,6 à l'entraînement, même signe sur 2024+, même signe avec les deux règles.**

| Régime | Trades (entr. / test) | R moyen entr. : stop d'abord | R moyen entr. : objectif d'abord | t (entr.) | R moyen test 2024+ (stop d'abord / objectif d'abord) | Trouvaille ? |
|---|---|---|---|---|---|---|
| **Tous les trades** | 11994 / 2230 | +0.013 | +0.191 | 0.7 | +0.064 / +0.440 | — |
| V basse | 3998 / 715 | -0.053 | +0.136 | -1.6 | +0.172 / +0.592 | non |
| V moyenne | 3998 / 707 | +0.017 | +0.205 | 0.5 | +0.009 / +0.408 | non |
| V haute | 3998 / 808 | +0.074 | +0.231 | 2.3 | +0.015 / +0.335 | non |
| T range | 3998 / 784 | +0.014 | +0.187 | 0.4 | +0.023 / +0.352 | non |
| T mixte | 3998 / 729 | +0.045 | +0.231 | 1.4 | +0.060 / +0.381 | non |
| T tendance | 3998 / 717 | -0.020 | +0.153 | -0.6 | +0.113 / +0.598 | non |
| A avec la tendance | 6034 / 1108 | -0.005 | +0.217 | -0.2 | +0.141 / +0.580 | non |
| A contre la tendance | 5960 / 1122 | +0.031 | +0.164 | 1.2 | -0.013 / +0.302 | non |

**Trouvailles retenues : aucune.**

## Alignement avec la tendance sur 5 jours, par mécanisme (R moyen, stop d'abord ; entraînement · test)

| Mécanisme | Avec la tendance | Contre la tendance |
|---|---|---|
| EURUSD judas | -0.14 (482) · -0.13 (49) | -0.04 (769) · +0.18 (103) |
| GER40 breaker | -0.14 (574) · +0.30 (133) | -0.07 (626) · -0.33 (166) |
| GER40 nwog | -0.03 (224) · -0.02 (40) | +0.13 (286) · +1.16 (48) |
| GER40 silver | -0.06 (684) · -0.08 (108) | -0.00 (477) · -0.09 (101) |
| GER40 weekly | -0.26 (61) · +0.53 (5) | +0.27 (502) · +0.00 (92) |
| US100 cbdr | +0.10 (244) · +0.17 (52) | -0.10 (450) · -0.31 (114) |
| US100 divergence | -0.17 (210) · -0.19 (44) | +0.04 (465) · +0.25 (73) |
| US100 fvg | +0.03 (765) · +0.40 (182) | -0.05 (204) · -0.17 (64) |
| US100 nwog | +0.07 (116) · +1.35 (20) | +0.30 (116) · +0.96 (18) |
| US100 silver | -0.05 (730) · +0.01 (130) | -0.03 (541) · -0.33 (110) |
| US500 divergence | +0.14 (527) · +0.22 (83) | +0.22 (267) · +0.38 (23) |
| US500 fvg | +0.45 (269) · +0.31 (68) | +0.43 (78) · -0.05 (17) |
| US500 silver | -0.03 (731) · -0.28 (127) | -0.12 (502) · -0.18 (90) |
| US500 weekly | -0.45 (9) · -0.07 (6) | +0.14 (603) · +0.23 (88) |
| XAUUSD fvg | +0.06 (408) · +0.41 (61) | -0.14 (74) · +0.63 (15) |

## Limites

- Entrées des modules de backtest, règlement M15 (borné par les deux règles) : les niveaux absolus sont incertains, les DIFFÉRENCES entre régimes le sont moins.
- Seulement 3 dimensions et 8 seaux, définis avant de regarder les résultats ; toute nouvelle dimension ajoutée après coup augmenterait le risque de trouver du hasard.
- Un régime « défavorable » ne justifie pas d'arrêter le bot avant une vérification en démo.