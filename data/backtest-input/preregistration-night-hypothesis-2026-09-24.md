# PRÉ-ENREGISTREMENT (écrit AVANT le calcul) — Hypothèse d'Esdras : « la nuit, le marché est calme et les stratégies marchent mieux »

Date : 2026-09-24. Hypothèse d'Esdras : « puisque tout le monde dort la nuit, les stratégies fonctionnent mieux car le marché est calme ». Elle est née d'un découpage par session des trades du combo live (rejeu 2010-2026 : Asie +0,133 R/trade contre New York +0,064 R/trade). **Ces trades-là ne servent PAS au test** (hypothèse formée en les regardant). On teste sur des jambes jamais découpées par heure.

**Correction déclarée** : dans la discussion j'ai rangé CBDR parmi les stratégies « de cassure » ; son code (`src/backtest/cbdr.js`) dit l'inverse : elle anticipe un **retournement** aux projections du range. La classification ci-dessous vient du code de chaque mécanisme, pas des résultats.

## Données testées (jambes jamais découpées par session)
`scripts/runCleanStudy.js` avec l'exécution réelle du bot (`LIVE_FILL=1`, cache `data/clean-study-cache-livefill`), au RRR de production de chaque mécanisme (NWOG 5, Weekly Sweep 5, Breaker Block 5, Judas Swing 3, Silver Bullet 3, CBDR 3), sur les paires **hors combo live** :
NWOG US500 / XAUUSD / EURUSD ; Judas Swing US100 / US500 / XAUUSD / EURUSD ; Weekly Sweep US100 / XAUUSD / EURUSD ; Breaker Block US100 / US500 / XAUUSD / EURUSD ; Silver Bullet XAUUSD / EURUSD ; CBDR US500 / XAUUSD / EURUSD (19 jambes). FVG exclu (exécution à part, retiré du live).

## Sessions (heure de New York réelle, heure d'entrée du trade)
**Nuit = Asie 18:00-02:00** ; **Séance = New York 9:30-16:00**. Londres (2:00-9:30) et 16:00-18:00 : affichés, hors test.

## Test principal (H1 : « un même mécanisme gagne plus la nuit qu'en séance »)
- Pour chaque jambe ayant **≥ 30 trades de nuit ET ≥ 30 trades de séance** sur l'entraînement 2010-2022 : écart d = moyenne R nuit − moyenne R séance, erreur type de Welch.
- Écart combiné = moyenne des d pondérée par l'inverse de la variance ; z = écart / erreur type combinée.
- **H1 soutenue** si, sur l'entraînement : **z ≥ 2** ET d > 0 pour au moins 60 % des jambes retenues ; PUIS au test 2023-2025 (mêmes jambes, ≥ 10 trades par session et par jambe) : écart combiné > 0. Moins de 3 jambes retenues → **non concluant** (pas assez de jambes qui tradent aux deux sessions).
- 2026 : descriptif.

## Test secondaire (H2, descriptif) : retour vs continuation
Classement par le code, fixé ici : **retour** = NWOG (comblement du gap), Judas Swing (fausse sortie puis retour), Weekly Sweep (balayage puis retour), Breaker Block (retournement après échec), CBDR (retournement aux projections) ; **continuation** = Silver Bullet (cassure de structure puis FVG). H2 prédit d > 0 pour les « retour » et d ≤ 0 pour la « continuation ». Affiché, pas un critère d'adoption.

## Limites déclarées
- Plusieurs mécanismes ne tradent que dans une fenêtre horaire (Judas 2:00-5:00, Silver Bullet en séance) : peu de jambes auront des trades aux deux sessions.
- Spread constant (le relevé réel du 20 au 24/09 ne montre pas de spread plus large la nuit, sur 4 jours seulement, compte démo).
- Même un résultat positif ne dit pas POURQUOI (calme, algorithmes, ou autre) ; il dira seulement si l'écart existe.
