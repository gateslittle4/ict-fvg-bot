# Pré-enregistrement — F2 contre le « FVG filtré » du site, US100 M15

Écrit le 2026-10-06 (11:10 UTC), AVANT tout calcul de cette comparaison. Règles et critères figés : aucun amendement après lecture des résultats.

## Question
Entre F2 (achats, méthode de Krystofia) et le « FVG filtré » du site (config de production US100), lequel fait mieux sous le même protocole ?

## Ce qui est comparé
**F2** : règles de `CRITERE-DEMO-F2.md`. Les chiffres existent déjà (rien n'est recalculé) : 2011–2016 +0,067 R (617), 2017–2022 +0,146 R (605), 2011–2022 +0,106 R (1 222), t 2,04, 2023–2025 +0,183 R (325), t 1,71, 2026 −0,239 R (87), 2,08 trades/semaine en 2023–2025.

**SITE** = configuration de production `CONFIG.fvg.perSymbol.US100`, sans aucune modification : biais EMA200 sur H4, structure (BOS), fenêtre 08:00–12:00 NY, balayage de liquidité, multi-contact, stop au bord lointain du FVG (`fvg-edge`), objectif 1:5, achats ET ventes, entrée au bord proche du FVG au premier contact. Pas de pyramidage. Garde-fous du bot neutralisés (une seule position par paire, comme le netting du bot). Moteur : le vrai `LiveStrategyEngine` via `scripts/runCleanStudy.js`.

Point à retenir : le site n'applique PAS la règle c4 ni la redéfinition de c3 (son `FvgEngine` valide au premier contact). C'est une méthode différente, pas une variante de F2.

## Exécution du SITE (figée)
- Mode `LIVE_FILL=resting` : ordre limite posé avant le contact, filtres lus à la dernière clôture connue, rempli au premier contact (ask pour un achat), réglé à la minute. C'est le mode le plus proche de F2 (limite posée avant, pas de lecture de la bougie du contact).
- Commande : `LIVE_FILL=resting RRS=5 node --max-old-space-size=6144 scripts/runCleanStudy.js legs fvg-US100`.
- Données : mêmes que F2 : M1 HistData NSXUSD jusqu'au 2022-12-30, M1 du broker ensuite ; M15 reconstruites par le script (heure moteur du script).
- Années 2011 à 2026 (au 21/09), comme F2. L'année 2010 (partielle) est exclue. Un trade compte dans l'année de son heure d'entrée (heure NY).

## Coûts (figés)
- **Principal** : mêmes coûts que F2 : spread 0,6 pt × (prix d'entrée / 8200), converti en R avec la distance du stop ; pas de swap. R = brut − spread/distance.
- **Secondaire (descriptif)** : coûts propres au site (spread 0,6 × prix/dernier prix du broker + swap du broker en % du prix), tels que `runCleanStudy.js` les calcule.

## Blocs (identiques à F2)
2011–2016 (A), 2017–2022 (B), 2011–2022, test 2023–2025, forward 2026 (descriptif).

## Mesures
Pour chaque bloc : nombre de trades, trades par semaine, % gagnants, R moyen par trade, R total, t, pire baisse (en R). Par an : R moyen et nombre de trades. Sous-ensembles descriptifs du SITE : achats seuls, ventes seules.

## Contrôle de réplication (écrit avant)
La config de production a déjà été mesurée par le projet en mode resting : −229 R (2010–2022), −13 R (2023–2025), −25 R (2026), R brut, selon le commentaire de `src/config.js`. Si mon rejeu brut s'écarte de plus de 25 % (en R total) de ces trois valeurs, je le signale comme **non répliqué** et je ne conclus pas.

## Critères (écrits avant le calcul)
Chaque test compare SITE à F2 sur les coûts principaux. Cinq contrôles, un point chacun :
1. R moyen par trade sur 2011–2022 plus élevé.
2. Deux moitiés (A et B) toutes deux > 0 (le point va à celui qui y arrive ; si les deux y arrivent, à celui dont la plus faible des deux moyennes est la plus haute).
3. t sur 2011–2022 plus élevé.
4. R moyen par trade sur 2023–2025 plus élevé.
5. R moyen par trade sur 2026 plus élevé (descriptif, mais compte pour le point).

**Verdict** : « fait mieux » = gagne au moins 4 points sur 5 ET a un R moyen > 0 sur 2011–2022. Sinon : « aucun ne fait mieux ». Les trades par semaine et le R par semaine sont rapportés mais n'entrent pas dans le verdict (fréquences différentes).

**Validation absolue (indépendante de la comparaison)** : le SITE est jugé comme F2 contre les critères d'origine : t ≥ 2,6 sur 2011–2022, deux moitiés > 0, test 2023–2025 > 0, meilleur que le contrôle. Faire mieux que F2 ne valide pas le SITE.

## Divulgation (ce qui a déjà été vu)
- Les filtres du SITE ont été conçus sur 2019–2025 (le commentaire de la config le dit) ; 2019–2022 et le test 2023–2025 ne sont pas vierges pour lui. Ceux de F2 ne sont pas vierges non plus pour 2023–2026.
- Les chiffres du SITE en mode resting (−229 / −13 / −25 R) sont déjà connus du projet ; la comparaison ne les « découvre » pas.
- Aucune des deux stratégies n'est retouchée après cette comparaison, sur ces données.

## Limites à connaître
- F2 : M15 pessimiste puis M1 (résultats presque identiques). SITE : M1 direct.
- La convention de remplissage du SITE retire 0,6 pt (non mis à l'échelle) pour les achats ; telle qu'écrite dans `runCleanStudy.js`, non modifiée.
- Le SITE trade les deux sens ; F2 seulement les achats : d'où le sous-ensemble « achats seuls ».
- Les autres mécanismes du site (Silver Bullet, NWOG, CBDR, Divergence…) ne sont PAS dans cette comparaison : seulement le FVG filtré.
