# Pré-enregistrement, LOT 3 : deux stratégies d'un AUTRE TYPE, sur bougies journalières (écrit le 2026-09-21 AVANT tout calcul de ce lot)

**Pourquoi.** Les lots 1 et 2 (mécanismes ICT intraday sur de nouveaux instruments) n'ont donné aucune candidate solide (23 hypothèses ; seule FVG XAGUSD survit, t = 0,81). Le lot 3 teste deux familles structurellement différentes, sur un historique long, avec des règles décidées à l'avance.

**Données.** `data/backtest-input/{US100,US500,XAUUSD,EURUSD}.csv` (M15 en temps moteur, US100/US500 dès 2010-11, XAUUSD dès 2009-03, EURUSD dès 2010-01, jusqu'au 2025-12-31). **Journée = de 17:00 à 17:00 en temps moteur** (convention de clôture de New York), barre journalière reconstruite des M15 ; les week-ends n'ont pas de barre. **Entraînement : 2011-01-01 → 2019-12-31** (moitiés : 2011-2015 et 2016-2019). **Test : 2020-01-01 → 2025-12-31, lu UNE fois.** Chauffe : 250 barres journalières ignorées. Complément « forward » (rapporté, sans effet sur la décision) : 2026-01 → 2026-09 reconstruit du M1 réel (`data/real-m1-full`).

## Univers (fixé, aucun ajout après coup)
US100, US500, XAUUSD, EURUSD (les quatre paires du combo en production).

## Hypothèses (8, comptées)
- **T1-T4 : suivi de tendance (Donchian), une hypothèse par instrument.** Signal à la CLÔTURE journalière : achat si la clôture dépasse la plus haute clôture des **55** jours précédents, vente à découvert si elle passe sous la plus basse clôture des 55 jours ; sortie si la clôture repasse sous la plus basse clôture des **20** jours (achat) ou au-dessus de la plus haute des 20 jours (vente) ; stop protecteur initial à **2 × ATR(20)** journalier de l'entrée. Entrée et sortie à l'OUVERTURE de la barre journalière suivante (le stop est testé sur les M15, « stop d'abord »). Une position par instrument, R = résultat / distance du stop initial.
- **M1-M4 : retour à la moyenne (RSI à 2 jours), une hypothèse par instrument, ACHAT SEUL.** Signal à la clôture : RSI(2) < **10** ET clôture > moyenne mobile **200** jours ; entrée à l'ouverture suivante ; sortie à l'ouverture suivant une clôture > moyenne mobile **5** jours, ou après **10** jours (sortie de temps) ; stop protecteur à **3 × ATR(14)** sous l'entrée. R = résultat / distance du stop.
- **Aucun paramètre n'est réglé** : 55/20/2, 2/10/200/5/10/3 sont les valeurs classiques de ces systèmes, fixées ici une fois pour toutes.

## Coûts (décision)
Spread = **2 × le spread par défaut** de l'instrument (`DEFAULT_SPREADS`, l'historique 2011-2019 avait des spreads plus larges) payé une fois par aller-retour ; **swap = 0,01 % du notionnel par jour de détention** (≈ 3,7 %/an, les deux sens ; valeur supposée, non mesurée : à mesurer sur la démo). Sensibilité (sans effet sur la décision) : swap 0,02 %/jour.

## Critères, écrits à l'avance
1. **Retenue pour lecture du test** si, à l'entraînement : **T1-T4 ≥ 30 trades, M1-M4 ≥ 60 trades** ; **R net/trade ≥ +0,10** ; **facteur de profit ≥ 1,15** ; R net positif sur **les deux moitiés** (2011-2015 et 2016-2019). Sinon rejetée, test non lu.
2. **Réussie au test** si : **T ≥ 25 trades, M ≥ 40 trades** ; **R net/trade ≥ +0,10** ; R total positif ; **t = moyenne / (écart-type / √n) ≥ 2,0** ; corrélation mensuelle du R avec le combo intraday actuel **< 0,3** sur les mois communs (2023-01 → 2025-12, 36 mois ; le combo est rejoué par le vrai moteur au M1) ; et **pire baisse à 0,3 % de risque par trade inférieure à 6 %** (compatible avec la limite de 10 % de FTMO).
3. **Comparaisons multiples :** lots 1 + 2 + 3 = **31 hypothèses**. À t ≥ 2, on attend ~0,7 faux positif sur l'ensemble. Une réussite reste une **candidate** (suivi en mode alerte sur la démo, jamais d'adoption directe).
4. Tout résultat, rejets compris, va dans `data/research-memory.json`.

## Interdit
Changer un paramètre, un seuil, le coût, l'univers ou le découpage après avoir vu un résultat ; ajouter une hypothèse ou en retirer une ; lire le test avant d'avoir commité l'entraînement ; utiliser des indicateurs ou des instruments autres que ceux listés.

## Limites connues
Le règlement au M15 « stop d'abord » ne pénalise ici presque pas (stops larges de 2 à 3 ATR journaliers) ; les CFD indices paient des frais de financement (swap) dont je ne connais pas la valeur réelle ; les données 2010-2019 ont des spreads historiques plus larges (le facteur 2 est une approximation) ; le suivi de tendance a de longues périodes de baisse (risque FTMO) ; les paires sont corrélées entre elles, les 4 hypothèses ne sont pas indépendantes.
