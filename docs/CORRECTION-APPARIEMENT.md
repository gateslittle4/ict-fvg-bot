# Correction — clé d'appariement des trades (2026-10-06)

## Le défaut
Les comparaisons « variante contre F2C » associaient les trades par année + bougie de pose (`Y:placedIdx`). En préparant le lot 2 du tri à l'aveugle, j'ai trouvé que cette clé n'est **pas unique** : 14 trades sur 1 222 (F2C, 2011–2022) partagent leur bougie de pose avec un autre (deux zones FVG différentes posées sur la même bougie). Les doublons écrasaient une entrée et faussaient l'appariement.

## La correction
Clé = année + bougie de pose + bougie de création de la zone (`Y:placedIdx:zCreated`). Appliquée à `comboL`, `comboN`, `comboO`, `comboQ`, `comboR`, `comboT`. Les tests passent (comboR compare les deux premières parties de la clé). Les trades eux-mêmes, et donc tous les R, moyennes, moitiés, pires baisses et rythmes, ne changent pas : seuls l'appariement et les statistiques qui en dépendent (Welch, t apparié, comptes « supprimés / ajoutés ») bougent.

## Effet sur les résultats déjà publiés (entraînement 2011–2022)
| Étude | Avant | Après | Verdict |
|---|---|---|---|
| H1 stop court (Welch gardés vs supprimés) | 1,62 | 1,85 | rejetée (seuil 1,96), inchangé |
| H2 breakeven 1 R (t apparié) | −0,92 | −0,73 | rejetée, inchangé |
| Cible récente / âge (Welch) | 0,57 | 0,66 | rejetée, inchangé |
| Stop large (t apparié) | 0,00 | 0,12 | rejetée, inchangé |
| RR dynamique, règle du lundi | comptes d'appariés ±5–10 | — | verdicts identiques |

Tous les critères pass/fail rejouent à l'identique. Aucune variante rejetée ne devient acceptée, aucune conclusion ne change. Le rejet exploratoire de H1 sur 2023–2025 (lu avant la correction) repose sur le R moyen, que la clé ne touche pas.

## Ce qui n'est pas refait
Les anciens fichiers de sortie (`RESULTAT-*.md` antérieurs) gardent leurs anciens chiffres de Welch / t apparié ; cette note fait foi pour les valeurs corrigées.
