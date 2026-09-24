# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — RRR du Silver Bullet, au rejeu fidèle au live

Date : 2026-09-24. Question d'Esdras : « le stop du Silver Bullet est très petit, et si on augmentait le RRR ? », puis « fais le test avec la façon dont le bot trade ». Déjà connu (déclaré) : l'étude propre du 2026-09-23 (`clean-study-analysis.md`, ancien modèle d'exécution, entrée 15 min plus tard) choisissait 1:7 (US100) et 1:6 (US500) sur 2010-2022, mais ces RRR perdaient au test 2023-2025 (−33 R et −31 R). Ce test-ci refait la comparaison avec le simulateur validé contre les vrais trades (`scripts/runLiveReplay.js`, détection identique au live sur 2 134 signaux).

## Ce qui est testé
- **RRR du Silver Bullet ∈ {2, 3, 4, 5, 6, 7}** (production : 3), le même pour US100 et US500 dans un même rejeu (un seul paramètre `silverBullet.rrMultiple` en live). Rien d'autre ne change : config live actuelle (Divergence corrigée, NWOG, Weekly Sweep, Silver Bullet, CBDR, RSI(2)), risque 0,3 %, garde-fou du bot, spread par défaut, swap du broker.
- Option ajoutée au rejeu : `SB_RR=<n>` (remplace `silverBullet.rrMultiple`), fichiers séparés par RRR.
- **Découpage** (comme le rejeu 2010-2026 de la session cloud) : tranches HistData 2010-2014, 2014-2017, 2017-2020, 2020-2023 et broker 2023, 2024, 2025, 2026 (→ 2026-09-21) ; chaque tranche repart de 90 jours de préchauffage.
- A et B (momentum intraday) ne sont pas dans ce rejeu (déclaré) : en live ils partagent la place par paire avec le combo.

## Règle de décision (fixée avant calcul), jambe par jambe (Silver Bullet US100, Silver Bullet US500)
1. **Entraînement 2010-2022** : RRR* = le RRR au meilleur R net de la jambe. On ne propose un changement que si RRR* ≠ 3 **et** qu'à RRR* la jambe a t ≥ 2 et un R net positif en 2010-2016 et en 2017-2022.
2. **Test 2023-2025, lu une seule fois** : le changement n'est recommandé que si la jambe fait **au moins autant** au test à RRR* qu'à 1:3. Sinon on garde 1:3.
3. 2026 et le total du combo (R net, cycles FTMO 1-Step à 0,3 %) : descriptifs, jamais un critère.
4. Si les deux jambes sont recommandées avec des RRR* différents, le live aura besoin d'un RRR par paire (petit changement de code, testé avant déploiement). Toute recommandation passe par Esdras avant déploiement.

## Limites déclarées
6 RRR testés sur la même période : le meilleur à l'entraînement est en partie de la chance, d'où la lecture du test. Un rejeu par RRR avec le même RRR sur les deux paires : les interactions entre paires (garde-fou journalier) sont approximées quand les RRR* diffèrent. HistData ≠ prix du broker.

## AMENDEMENT (2026-09-24, 14:50 UTC, écrit AVANT d'avoir lu le moindre résultat)
Esdras : « peux-tu réduire le nombre d'années sans biaiser le résultat ? » (le rejeu complet demandait ~3 h sur 4 cœurs). Décidé sur le seul critère du temps de calcul, avant d'ouvrir un seul fichier `*-sbrr*.json` ni un seul journal de rejeu (les tranches déjà finies ou en cours : 2010-2014 et 2014-2017, tous RRR) :
- **Entraînement ramené à 2010-2016** (tranches HistData 2010-2014 et 2014-2017 seulement ; 2017-2020 et 2020-2023 ne sont pas calculées). Les deux moitiés de la règle 1 deviennent **2010-2013** et **2014-2016**.
- **Test 2023-2025 et 2026 inchangés** (tranches broker complètes). Les règles 1 à 4 sont inchangées par ailleurs.
- Coût déclaré : moins de trades pour choisir RRR* (plus de bruit, pas de biais), et l'entraînement ne contient plus les années 2017-2022, les plus proches du test.
