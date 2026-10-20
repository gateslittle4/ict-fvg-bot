# Addendum au pré-enregistrement PS1 (premier setup de la journée)

Écrit le 2026-10-06, **avant tout résultat** de PS1 (seuls des tests de code sur 2014, 2016 et 2019 ont tourné, sans lecture de R moyen, de t ni de critère). Complète `PREREG-F2-PREMIER-SETUP-JOUR.md` (SHA-256 `d3c8295c5039b44e05f60a8d7294b1ee28876049591c3ef606bd589893131169`, 2026-10-06 20:49 heure de New York).

## Ce que les tests ont montré
Dans F2C, plusieurs ordres d'achat peuvent se remplir **à la même bougie** (par exemple trois ordres remplis puis stoppés dans la bougie 130853, le 18/05/2016). Le prérégistrement disait qu'un achat n'est pas retenu si un autre achat « s'est rempli plus tôt, ou à la même bougie ». Lue à la lettre, cette phrase retirerait **tous** les achats d'un groupe rempli à la même bougie. Or ces groupes sont presque toujours des pertes immédiates (plusieurs −1 R d'un coup) : les retirer tous améliorerait PS1 mécaniquement, sans rapport avec l'idée du « premier setup ».

## Règle précisée (figée maintenant)
- Plusieurs achats remplis à la même bougie : **seul le premier posé est retenu** (ordre : bougie de remplissage, puis bougie de pose, puis bougie de création de la zone) ; les autres sont retirés. Il y a donc au plus un achat retenu par journée.
- Égalité d'un achat avec une **vente** à la même bougie : l'achat n'est pas retenu (inchangé).
- Tout le reste du prérégistrement est inchangé : critères, seuils, test unique, une seule hypothèse.

## Pourquoi cette précision plutôt que la lettre
La lettre favoriserait PS1 par un artefact. La précision garde le trade que tu aurais pris (le premier) et ne retire que les doublons, ce qui reste un peu favorable à PS1 (un groupe de trois stops devient un seul stop) mais correspond à l'idée « un seul trade, le premier ».

## Reproduction
`node scripts/comboFvgV6/comboW_premier.mjs <data> train` ; tests : `node --test scripts/comboFvgV6/comboW_premier.test.mjs` (5 tests, dont une vérification en force brute du premier remplissage sur 2016).
