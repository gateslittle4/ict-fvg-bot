# Pré-enregistrement — Combo FVG (v6), US100 M15

Écrit le 2026-10-04 (23:38 UTC), AVANT le calcul de ce protocole. Règles et critères figés : aucun amendement après lecture des résultats.

## Ce qui est testé (règles figées, aucun réglage)
- FVG M15 strict, validation par c4 (la bougie qui touche devient le nouveau c3), bord figé à la validation.
- FVG d'entrée : âge ≤ 8 bougies M15 ; plage 06:00–16:00 heure de New York (heure d'été réelle) ; un ordre par FVG.
- ACHATS seulement. Tendance H4 haussière (dernière cassure agressive d'un high/low H4 = un high : pivot fractal k=2, clôture ≥ 0,25 ATR au-delà, barre ≥ 1 ATR).
- Balayage d'un low H4 (6 dernières barres H4) au plus 32 bougies M15 avant la formation du FVG.
- Pas d'achat si le prix d'entrée est dans un FVG H4 baissier non rempli.
- Entrée limite à 50 % de la zone restante ; stop = sous le low de c1 − 3 pts ; TP = max(moitié du FVG M15 cible à gauche, 3R). Cible = premier FVG M15 baissier non entièrement rempli au-dessus, sans limite d'âge.
- Prix jamais tradé (plus haut/plus bas de tout l'historique) exclu.
- Une position à la fois. Spread 0,6 pt. Conventions pessimistes : stop avant TP dans la même bougie M15 ; stop compté même sur la bougie de remplissage.
- Échelle : marge de stop et spread proportionnels au prix (réglage ×prix/8200), prix moyen de CHAQUE année.
- Code : `comboV6.mjs`, `lib/krysBacktest.js`, `lib/krysMethod.js` (SHA-256 ci-dessous).

## Données
- M1 HistData NSXUSD 2010-11 → 2022-12-30, puis M1 du broker 2023-01-11 → 2026-09-21, reconstruites en M15.
- Rejeu année par année (3 mois de préchauffage avant chaque 1er janvier).

## Découpage
| Bloc | Période | Rôle |
|---|---|---|
| Entraînement A | 2011–2016 | juge la règle, 1re moitié |
| Entraînement B | 2017–2022 | juge la règle, 2e moitié |
| Test | 2023–2025 | lu une seule fois |
| Forward | 2026 (jusqu'au 21/09) | descriptif ; le vrai forward = démo à partir du 05/10/2026 |

## Divulgation (ce qui a déjà été vu)
- Les règles v6 ont été choisies en regardant le broker 2023–2026 et le simulateur. Le bloc Test 2023–2025 et le Forward 2026 NE SONT DONC PAS vierges pour cette stratégie.
- 2019–2022 ont déjà été rejoués une fois avec ces règles (+19,9 R poolé, sans réglage). 2011–2018 n'ont jamais été regardés : c'est le seul bloc réellement hors échantillon.
- Le vrai forward sera la démo (règles figées) à partir du 05/10/2026.

## Critères de réussite (écrits avant le calcul)
1. Entraînement 2011–2022 : ≥ 60 trades, t ≥ 2, et rendement moyen par trade > 0 dans A ET dans B.
2. Test 2023–2025 : rendement moyen par trade > 0.
3. Contrôle : la v6 doit faire mieux que « achats sans filtre H4 » (raw_buys) sur 2011–2022, sinon les filtres H4 n'apportent rien.
4. Verdict : « validée » seulement si 1, 2 et 3 passent. Sinon « non validée », sans retouche des règles sur ces données.

## Empreintes (SHA-256)
- comboV6.mjs : 8578e10a9df4fc41f5813cb82f2e736e3f0bdfcbb6f3fc2369076322f31c7023
- lib/krysBacktest.js : 74deef9432232cc8e858f77740da6fa5ebda487a453c6389d2562619cae80fb0
- lib/krysMethod.js : a7c1eb5fe0e306e5c9f89f6ee2b861f1f160bbbc70f6b29a6d50d8065e79cbb6
