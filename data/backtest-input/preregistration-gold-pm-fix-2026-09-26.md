# PRÉ-ENREGISTREMENT (BROUILLON, écrit AVANT tout calcul) — Or : retour à la moyenne après le fixing de Londres de 15 h

Date : 2026-09-26. Idée proposée par Gemini (critique externe), retenue par Esdras : c'est la seule des idées proposées ce jour qui n'a
jamais été testée dans ce projet (vérifié dans `data/research-memory.json` et `data/backtest-input/`). Aucune donnée n'a été regardée pour
cette règle. **Statut : BROUILLON** — un seul point reste ouvert (heure de sortie, section « Point ouvert »). Il sera fixé et ce texte
commité comme définitif AVANT tout calcul ; aucune règle ne changera ensuite.

## Raison économique et référence
Le prix de référence de l'or (LBMA, ex-« London PM Fix ») est établi chaque jour ouvré à 15 h 00 heure de Londres. Les flux qui visent ce
prix (banques, ETF, producteurs, banques centrales) poussent le cours dans les heures qui précèdent ; une fois le prix fixé, ce flux
s'arrête et le cours tend à revenir en arrière. Référence : Caminschi & Heaney (2014), « Fixing a leaky fixing: Short-term market
reactions to the London PM gold price fixing », *Journal of Futures Markets*. Le fixing est devenu une enchère électronique (LBMA Gold
Price, ICE) le **20 mars 2015** ; l'effet a pu disparaître avec la réforme, d'où le découpage imposé plus bas.

## Règles (XAUUSD)
Toutes les heures sont en **heure locale de Londres** (heure d'été britannique comprise, fuseau `Europe/London`).
1. **Jours** : chaque jour de semaine où les données existent à 08 h 00 et à 15 h 00 (jours fériés britanniques non retirés : limite
   déclarée, environ 8 jours par an).
2. **Mouvement avant le fixing** : r = clôture de la minute 14 h 59 / clôture de la minute 07 h 59 − 1 (prix bid).
3. **Entrée** : au marché à l'ouverture de la minute 15 h 00 (connu à cet instant, aucun regard vers l'avant). r > 0 → **vente** ;
   r < 0 → **achat** ; r = 0 → pas de trade. **Aucun seuil** (le 0,3 % proposé au départ n'a pas de source : retiré).
4. **Stop de protection** : 0,5 % du prix d'entrée. Vérifié minute par minute ; un trou à travers le stop sort à l'ouverture de la minute.
   Pas d'objectif de prix.
5. **Sortie** : au marché à l'heure fixée au « Point ouvert » ci-dessous, si le stop n'a pas été touché avant.
6. **R** = résultat net / (0,5 % du prix d'entrée).

## Données
XAUUSD en bougies de 1 minute. Entraînement **2010-2022** : HistData (à télécharger ; convention « EST fixe » convertie en heure de
Londres réelle). Test **2023-2025** et forward **2026** : M1 du courtier (`data/real-m1-full/XAUUSD.csv.gz`). Calcul fait **en ligne**,
pas sur le laptop d'Esdras.

## Coûts
Spread par défaut du projet pour XAUUSD (`DEFAULT_SPREADS`, mis à l'échelle du prix), payé une fois par trade. Pas de swap (position
fermée le jour même, avant le changement de jour du courtier à 17 h New York). Commission 0 (vérifiée sur un trade réel le 25/09). Pas de
glissement au-delà du spread (limite déclarée).

## Verdict (critère du projet)
L'entraînement est découpé à la réforme : **avant** (2010-01-01 → 2015-03-19) et **après** (2015-03-20 → 2022-12-31).
- **Entraînement 2010-2022** : au moins 60 trades, R moyen > 0, **t ≥ 2,6**, et R total positif **avant ET après** la réforme ; en plus,
  t > 0 après la réforme (sinon l'effet est mort avec la réforme : abandon). Moins de 60 trades : NON CONCLUANT. Sinon : ÉCHEC.
- **Test 2023-2025**, lu une seule fois : R moyen > 0 → CANDIDAT (démo seulement avant tout réel, décision d'Esdras). Sinon ÉCHEC.
- **2026** : descriptif.
- Aucune variante (seuil, heures, stop, durée) ne sera essayée après coup sans nouveau pré-enregistrement.

## Point ouvert (à fixer AVANT le calcul)
**Heure de sortie.** Proposée : 17 h 00 Londres (2 h après le fixing). Question posée à Gemini : cette durée vient-elle de Caminschi &
Heaney, et sinon, sur quelle durée l'article mesure-t-il le retour à la moyenne ? Si l'article ne donne pas de durée, on garde 17 h 00,
fixée ici avant tout calcul.

## Limites déclarées
- Spread constant, pas de glissement ; jours fériés britanniques non retirés.
- HistData et le courtier n'ont pas exactement les mêmes prix ; la conversion horaire HistData (EST fixe) → Londres doit être vérifiée
  sur quelques jours connus avant le calcul (sans regarder les résultats).
- Le test 2023-2025 n'a jamais servi pour cette règle, mais les mêmes années ont servi à d'autres stratégies sur l'or.
