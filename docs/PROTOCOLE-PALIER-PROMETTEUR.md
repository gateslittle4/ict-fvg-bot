# Protocole — palier « prometteuse » (en plus du palier « validée »)

Écrit le 2026-10-07, à la demande de Krystofia (« oui » au palier 4 critères sur 5). Ce protocole **complète** les critères d'entraînement existants ; il ne remplace aucune étude déjà rendue. Il s'applique aux **nouvelles** hypothèses, pré-enregistrées après la date de ce document.

## Pourquoi
Plus de 40 hypothèses ont été testées sur F2 avec les cinq critères ; aucune ne les a tous passés. Les critères sont volontairement exigeants (avec beaucoup d'essais sur les mêmes données, un seuil bas laisse passer du hasard), mais ils écartent aussi des idées qui valent peut-être le coup d'être surveillées. Le palier « prometteuse » les garde sous observation sans les adopter.

## Les deux paliers (écrits avant tout calcul de l'hypothèse concernée)
**Validée** : les cinq critères de l'étude passent (gain, significativité, moitiés A et B, pire baisse, rythme).

**Prometteuse** : le gain, les moitiés A et B, la pire baisse et le rythme passent **tous** ; seul le critère de significativité (t de Welch, t apparié ou t du R moyen) manque, avec une valeur **≥ 1,0** (plancher : en dessous, l'écart est indiscernable du bruit). Un échec sur un autre critère, ou un t < 1,0, reste un rejet.

## Conséquences
- Validée ou prometteuse : lecture **unique** de 2023–2025 avec la règle de test écrite dans le pré-enregistrement. Si le test est « OK », l'hypothèse devient **candidate au suivi en direct** ; si « KO », elle est rejetée.
- **Aucune** variante, prometteuse ou validée, ne remplace F2 sans suivi en direct. Le palier ne change pas F2 ; il décide seulement quoi surveiller.
- Chaque étude affiche son palier (validée / prometteuse / rejetée) et le nombre d'hypothèses déjà testées sur ces données.

## Ce que le suivi en direct peut et ne peut pas faire (calcul sur F2C, 2011–2022)
Écart-type d'un trade de F2C : environ 1,8 R (+0,106 R en moyenne, t 2,04 sur 1 222 trades).
- Après 100 trades, l'erreur sur le R moyen est d'environ **0,18 R** : un suivi de quelques mois ne peut pas distinguer +0,10 R de zéro.
- Confirmer un avantage de +0,10 R avec un t ≥ 2 demande environ **1 200 trades**, soit une dizaine d'années au rythme de F2 (≈ 2 trades par semaine).
- Le suivi sert donc à repérer une dérive ou un échec net (par exemple un R moyen très négatif sur 100 trades), pas à prouver un petit avantage.

## Application rétroactive (descriptive, post hoc, non jugée)
Ce palier est défini après avoir vu les résultats passés : appliqué à eux, il serait biaisé. Ce que les fichiers montrent :
- **FB1 (premier FVG après le balayage)** : seul le Welch manque (1,06 ≥ 1,0) ; gain, moitiés, baisse et rythme passent. Elle serait « prometteuse ». Son test 2023–2025 a ensuite été lu (2026-10-07, règle écrite d'avance dans `PREREG-F2-PREMIER-FVG-LECTURE-2023-25.md`) : **KO** (+0,153 R contre +0,171 pour F2C ; les trades retirés valent +0,178 R). Voir `RESULTAT-F2-PREMIER-FVG-LECTURE-2023-25.md`.
- **TD2 (tendance daily)** : manque le rythme (0,97), donc pas prometteuse ; sa lecture exploratoire de 2023–2025 a pourtant été faite : **KO** (+0,088 R contre +0,171 pour F2C).
- **H1 (stop court)** : rejetée de peu ; sa lecture exploratoire de 2023–2025 : **KO** (les trades retirés valaient +0,312 R).
- **RR 6** : manque seulement la pire baisse (44,4 contre 34,3) ; pas prometteuse selon ce palier (la baisse doit passer).
Les trois quasi-réussites qu'on a pu vérifier hors échantillon (TD2, H1, FB1) se sont inversées. Aucune des deux n'aurait été adoptée par ce protocole, mais elles montrent que « presque passée à l'entraînement » ne veut pas dire « tient ensuite ».

## Limites
- Le plancher de 1,0 et le palier de 4 critères sur 5 sont mon choix de rédaction, validé en principe par Krystofia, non optimisé sur des données.
- Le multiple testing reste : avec plus de 40 hypothèses, un t de 2 à 3 seul ne prouve rien.
