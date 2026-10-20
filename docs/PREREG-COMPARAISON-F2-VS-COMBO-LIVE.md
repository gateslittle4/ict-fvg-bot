# Pré-enregistrement — F2 contre le combo complet du site (celui qui trade en ce moment)

Écrit le 2026-10-06 (≈ 11:20 UTC, horloge du conteneur), AVANT tout calcul de cette comparaison. Règles et critères figés : aucun amendement après lecture des résultats. Ce document remplace `PREREG-COMPARAISON-F2-VS-SITE.md`, qui ne portait que sur le FVG filtré du site (arrêté en live depuis le 23/09) : mauvaise cible.

## Question
Entre F2 (achats US100, méthode de Krystofia) et le combo complet du bot qui trade actuellement, lequel fait mieux sous le même protocole ?

## Ce qui est comparé
**F2** : règles de `CRITERE-DEMO-F2.md`. Chiffres déjà calculés, rien n'est recalculé : 2011–2016 +0,067 R (617), 2017–2022 +0,146 R (605), 2011–2022 +0,106 R (1 222), t 2,04, 2023–2025 +0,183 R (325), t 1,71, 2026 −0,239 R (87), 2,08 trades/semaine en 2023–2025.

**COMBO LIVE** = le bot complet tel que la config actuelle (`src/config.js`, dernière modification 24/09) le fait trader :
- Divergence US100/US500 (1:3), NWOG US100 (1:5, achats seuls), Weekly Sweep US500 (1:5), Silver Bullet US100 et US500 (1:3), CBDR US100 (1:3), RSI(2) US500 journalier ;
- A (ORB 5 min, US100) et B (noise area, US500), ajoutées le 24/09 sur le même compte ;
- FVG et Judas Swing sont retirés du live ; GER40 retiré ; pyramidage désactivé.

Méthode de mesure : le **rejeu fidèle du live** du projet (`scripts/runLiveReplay.js`) : vrai `LiveStrategyEngine`, entrée au marché à la première cotation de la bougie suivante, stop/objectif relatifs au prix d'exécution, sorties à la minute, vrai garde-fou (3 trades/jour, pause 30 min, perte du jour 2 %), exclusion mutuelle, spread et swap du broker, risque 0,5 % par trade (comme les tranches existantes). 1R = le risque du trade (pour B, qui n'a pas de stop, le stop de secours à 3 sigma, comme dans le code live).

## Données et tranches (figées)
- **2011–2022** : les tranches existantes `data/live-replay/hist-2010-2014.json`, `hist-2014-2017.json`, `hist-2017-2020.json`, `hist-2020-2023.json` (régénérées le 26/09, A et B comprises, config actuelle). Non relancées.
- **2023 → 21/09/2026** : rejeu à relancer avec la config actuelle, `node scripts/runLiveReplay.js broker 0.5 2023 2027`, car le fichier `broker-2023-2026.json` existant date d'avant A et B (23/09) et s'arrête fin 2025 : il n'est PAS utilisé.
- Un trade compte dans l'année de son heure d'entrée (heure du moteur, New York fixe). 2010 (partiel) est exclu, comme pour F2.

## Blocs (identiques à F2)
2011–2016 (A), 2017–2022 (B), 2011–2022, test 2023–2025, forward 2026 (au 21/09, descriptif).

## Mesures
Par bloc : nombre de trades, trades par semaine, % gagnants, R moyen par trade, R total, R par semaine, t, pire baisse (en R). Par an : R moyen et nombre de trades.

Vues (toutes calculées, une seule est « le verdict ») :
1. **Bot complet** (toutes les stratégies ci-dessus) : c'est la vue du verdict.
2. Combo sans A ni B (les 6 stratégies d'avant le 24/09).
3. A + B seuls.
4. US100 seulement (CBDR, Divergence US100, NWOG, Silver Bullet US100, A) : le même instrument que F2.
5. Par stratégie, descriptif.

## Critères (écrits avant le calcul)
Cinq contrôles, un point chacun, bot complet contre F2 :
1. R moyen par trade sur 2011–2022 plus élevé.
2. Deux moitiés (A et B) toutes deux > 0 (le point va à celui qui y arrive ; si les deux y arrivent, à celui dont la plus faible des deux moyennes est la plus haute).
3. t sur 2011–2022 plus élevé.
4. R moyen par trade sur 2023–2025 plus élevé.
5. R moyen par trade sur 2026 plus élevé.

**Verdict** : « fait mieux » = gagne au moins 4 points sur 5 ET a un R moyen > 0 sur 2011–2022. Sinon : « aucun ne fait mieux ». Les vues 2 à 5, les trades par semaine et le R par semaine sont rapportés, mais n'entrent pas dans le verdict.

**Validation absolue (indépendante)** : le combo est jugé comme F2 contre les critères d'origine : t ≥ 2,6 sur 2011–2022, deux moitiés > 0, test 2023–2025 > 0. Faire mieux que F2 ne le valide pas.

**Contrôle de cohérence** : le total R du bot complet sur 2011–2022 doit être cohérent avec le rapport existant du projet (`vol-regime-step0.md` : 852 + 2 398 trades sur 2011–2016, 963 + 2 091 sur 2017–2022). Si mon décompte de trades s'écarte, je le signale.

## Divulgation (à lire avant les résultats)
- **A et B ont été retenues sur 2010–2022** (candidates à l'entraînement, t 3,22 et 2,43). Sur 2011–2022, le combo complet est donc en partie « dans l'échantillon », comme F2, qui a été choisie parmi F1–F3 sur ces mêmes années. La comparaison la plus propre est 2026 ; la plus propre de toutes sera la démo en direct.
- Les filtres du combo ont été conçus sur 2019–2025 : le test 2023–2025 n'est pas vierge pour lui. Il ne l'est pas non plus pour F2.
- Le projet a déjà mesuré le « combo actuel » (clean-study-analysis.md : +0,050 R/trade sur l'entraînement, +0,143 sur le test, +0,112 en 2026, mais avec les jambes FVG/Judas d'avant, sans A ni B, et sans le même modèle d'exécution). Ce sont d'autres chiffres, je ne les réutilise pas.
- Aucune des deux stratégies n'est retouchée après cette comparaison.

## Limites à connaître
- Les coûts du combo sont ceux du site (spread + swap du broker, en % du prix) ; ceux de F2 sont : spread 0,6 × prix/8200, sans swap. Le swap pèse peu sur des positions intrajournalières, mais pas zéro.
- F2 : M15 pessimiste puis M1 ; combo : rejeu à la minute.
- Le « R » du combo mélange des définitions de risque différentes (A : stop de la bougie 9:30–9:35, B : stop de secours à 3 sigma, RSI(2) : 3 × ATR). La vue 4 (US100 seul) et le R par semaine aident à lire.
- F2 trade 2 à 3 fois par semaine sur un instrument ; le combo trade plusieurs fois par jour sur deux instruments : le R par trade ne mesure pas la même chose que le gain par semaine.
