# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Entrée FVG par ordre STOP au lieu de l'ordre LIMIT

Date : 2026-09-26. Idée proposée par Gemini (critique externe du 25/09), reprise par Esdras. Stratégie concernée : le FVG
(`CONFIG.fvg.perSymbol`, US100 et US500, cible 1:5), retiré du live le 23/09 parce que l'ordre LIMIT posé à la clôture de la bougie
du contact ne se remplit que si le prix revient, et que les trades qui partent directement vers l'objectif ne sont jamais pris.

## Hypothèse
Un ordre stop placé au-delà du niveau capture les mouvements que l'ordre limite rate, et ce gain dépasse la perte due à une entrée
moins favorable.

## Règle
À la clôture de la bougie de signal, poser un ordre stop à l'extrême de la zone plus un tick. Le stop de protection reste au même
niveau de prix qu'aujourd'hui. L'objectif reste en multiple du risque réel. L'ordre est annulé en fin de séance s'il n'est pas
déclenché.

## Données
US100 et US500, train 2010-2022, test 2023-2025, forward 2026. Remplissage à l'ouverture de la bougie suivante, aucun lookahead.

## Coûts
Spread, commission et swap mesurés.

## Verdict fixé à l'avance
- Espérance test négative ou nulle : **rejeté**.
- Train positif et test supérieur ou égal à 30 % du train : **ça tient**.
- Moins de 10 trades en train ou en test : **pas assez**.

## Comparaison
Trois exécutions côte à côte : premier contact, limite, et stop. Et compter combien des 204 trades jamais repris l'ordre stop
récupère.

---

## Précisions d'application (écrites par Claude AVANT tout calcul, à valider ou corriger par Esdras avant de lancer)

1. **Signal** : l'événement FVG `validated` de `LiveStrategyEngine` (la bougie M15 du contact), réglages `CONFIG.fvg.perSymbol`
   (US100 : H4_EMA200, 8 h - 12 h NY ; US500 : H1_EMA50, 10 h - 11 h NY ; stop au bord du FVG ; 1:5), même enchaînement des signaux
   que l'étude `LIVE_FILL=1` de `scripts/runCleanStudy.js` (celle qui a trouvé les 204 trades).
2. **« Extrême de la zone »** : le bord du côté de l'objectif — haut de la zone pour un achat (ordre buy stop au haut + 1 tick),
   bas de la zone pour une vente (sell stop au bas − 1 tick). Tick = 0,01 (prix du courtier à deux décimales sur les deux indices).
3. **Remplissage** : l'ordre est actif à partir de l'ouverture de la bougie qui suit la bougie de signal. Si cette ouverture est
   déjà au-delà du niveau, remplissage à cette ouverture ; sinon au niveau, dès que l'ask (achat) ou le bid (vente) le franchit,
   minute par minute. Stop d'abord si le stop et l'objectif sont touchés dans la même minute.
4. **Fin de séance** : 16 h 00 heure de New York (heure d'été comprise) le jour du signal. Aucune autre annulation : la règle n'en
   prévoit pas, donc l'ordre reste actif même si le prix touche le stop de protection avant de déclencher l'entrée.
5. **Objectif** : prix d'exécution ± 5 × |prix d'exécution − stop| (le « risque réel »). R de chaque trade = gain ou perte net /
   risque réel. Durée maximale 480 bougies M15 (5 jours), puis sortie au marché, comme les autres exécutions.
6. **Coûts** : spread de `DEFAULT_SPREADS` en % du prix (0,6 point sur US100, 0,25 sur US500 au niveau d'aujourd'hui, les valeurs
   enregistrées sur les ordres réels du bot) ; commission 0 (vérifiée : le P&L réel du Silver Bullet US100 du 25/09, −34,12 $, vaut
   exactement mouvement × lots) ; swap du courtier par unité (`swapPerUnit`), compté pour la durée tenue.
7. **Verdict** : appliqué à l'exécution STOP, US100 et US500 réunis (chaque paire donnée aussi à part, descriptif). « Espérance » =
   R moyen par trade, net des coûts. « Test ≥ 30 % du train » = R moyen du test ≥ 0,3 × R moyen du train. Cas que le verdict ne
   couvre pas (train ≤ 0, ou test entre 0 et 30 % du train) : **ne tient pas**. Forward 2026 : descriptif.
8. **Premier contact** : entrée au bord de la zone à la première minute de la bougie de signal qui le touche (la référence des
   anciennes études, impossible à exécuter : le signal n'est connu qu'à la clôture de cette bougie). **Limite** : exécution du bot
   jusqu'au 23/09 (ordre au bord de la zone posé à la clôture, valable `maxAgeCandles` = 50 bougies, perdu si l'objectif est atteint
   avant). Mêmes coûts pour les trois.
9. **« 204 trades jamais repris »** : FVG US100, 2023-2025, signaux dont l'ordre LIMIT ne s'est jamais rempli (HANDOFF, 23/09). Le
   script les recompte avec ce code ; si le compte diffère de 204, les deux chiffres sont donnés.

## Déjà vu (déclaré)
- Étude `LIVE_FILL` du 23/09 (R brut, 2010-2022 / 2023-2025 / 2026) : FVG US100 premier contact +193 / +186 / +26 contre limite
  −449 / −139 / −51 ; FVG US500 +107 / +23 / −9 contre −146 / −38 / −30. Les 204 trades US100 jamais repris valaient +360 R au
  premier contact.
- Ordre LIMIT posé avant le contact (`LIVE_FILL=resting`) : US100 −229 / −13 / −25, US500 −63 / −11 / −20. Conclusion d'alors : le
  profit du FVG venait de l'information de la clôture de la bougie du contact. L'ordre STOP, posé APRÈS cette clôture, peut utiliser
  cette information sans regard vers le futur — c'est ce que ce test mesure.
- Aucun chiffre d'une entrée par ordre stop n'a été calculé ni regardé.

Script : `scripts/runStopOrderEntryStudy.js` (règles dans `scripts/lib/stopOrderEntry.js` et `src/execution/entryPolicy.js`).

---

## AMENDEMENT du verdict (2026-09-26, écrit et commité AVANT tout calcul, validé par Esdras : « toi »)

Déclaration : aucun résultat de ce test n'a été calculé ni regardé (`data/backtest-input/stop-order-entry-study.md` n'existe pas ; le
script n'a tourné qu'en `--dry` au plus, qui ne donne que le nombre de signaux). Seule la règle de verdict change ; les règles d'ordre,
les données, les coûts et les comparaisons (précisions 1 à 9) sont inchangés.

**Pourquoi** : le verdict d'origine (10 trades, test ≥ 30 % du train) ne demande aucune solidité statistique ; un résultat dû au hasard
(par exemple t = 0,5 à l'entraînement) pourrait « tenir ». C'est précisément le risque signalé par la critique externe (plus de 30
études, famille FVG déjà rejetée six fois). On applique donc le critère habituel du projet (celui du Market Maker Model et des
pré-enregistrements récents), avec le seuil relevé pour tenir compte des essais répétés.

**Verdict amendé** (exécution STOP, US100 + US500 réunis ; chaque paire donnée à part, descriptif) :
- **Entraînement 2010-2022** : au moins 60 trades, R moyen > 0, **t ≥ 2,6**, et R total positif en 2010-2016 ET en 2017-2022.
  Moins de 60 trades : **NON CONCLUANT**. Sinon : **ÉCHEC**.
- **Test 2023-2025**, lu une seule fois : R moyen > 0 → **CANDIDAT** (démo seulement avant tout réel, décision d'Esdras). Sinon **ÉCHEC**.
- **Forward 2026** : descriptif.
- Le verdict d'origine (10 trades / 30 % du train) est aussi affiché, pour mémoire, mais ne décide rien.
- Aucune remise en service du FVG dans le bot sans ce verdict ET une décision explicite d'Esdras.
