# PRÉ-ENREGISTREMENT (écrit AVANT le calcul de la stratégie) — Achat de nuit (clôture → ouverture) sur US100 / US500

Date : 2026-09-24. Demande d'Esdras : « teste la stratégie de nuit ». Idée publiée : l'essentiel du rendement des actions américaines se fait hors séance (Cliff, Cooper & Gulen 2008 ; Lou, Polk & Skouras 2019, *JFE* 134).

**Ce que j'ai déjà vu, déclaré honnêtement :** juste avant ce texte, j'ai affiché la décomposition annuelle BRUTE (sans coûts ni swap) séance / nuit de US100 et US500 pour 2019-2026 : la nuit a été positive chaque année sauf 2022 et a porté l'essentiel de la hausse depuis 2024. Je n'ai rien vu des années 2010-2018, ni aucun chiffre net de coûts, ni de t, ni de résultat par trade. Ce qui suit est fixé avant ces chiffres.

## Règles (identiques pour les deux indices)
1. **Achat à la clôture de la séance** : prix de clôture de la dernière barre M1 avant 16:00 heure de New York réelle (15:59 ; plus tôt les demi-journées), exécuté à l'ask (= bid + spread).
2. **Vente à l'ouverture de la séance suivante** : ouverture de la barre M1 de 9:30 NY, au bid. Séance suivante = prochain jour ayant une barre à 9:30 ; si elle est à plus de 4 jours calendaires (données manquantes), pas de trade.
3. **Tous les jours** de séance, week-ends compris (vendredi → lundi). Pas de stop, pas de filtre, pas de vente à découvert.
4. **Coûts** : spread par défaut du projet (`DEFAULT_SPREADS` : US100 0,6, US500 0,25) et **swap réel du broker** (`scripts/lib/m1Data.js` `SWAP`/`swapPerUnit` : achat US100 −43,7 et US500 −11 points par lot et par nuit, triple le vendredi, relevé 2026-09), les deux ramenés au niveau de prix du moment en % du prix, comme `runLiveReplay.js`. Sensibilité à 2 × le spread affichée (descriptive).
5. **Mesure principale** : rendement net par trade, en % du nominal (sans levier).
6. **Compte (descriptif)** : nominal = capital × min(4, cible / σ14), σ14 = écart-type des rendements journaliers clôture à clôture des 14 séances précédentes ; cible 0,5 / 1 % ; garde-fou du bot ; FTMO 1-Step enchaîné.

## Contrôles (descriptifs, jamais adoptables)
- **Dérive du marché** : même indice acheté et gardé 24 h (clôture → clôture) ; et séance seule (ouverture → clôture). Question : la nuit rapporte-t-elle plus que sa part du temps de détention ? Si l'achat de nuit ne fait que suivre la hausse générale, ce n'est pas un avantage propre (voir les pièges « dérive » de `HANDOFF.md`).
- **Sans les week-ends** (vendredi → lundi exclu) : certaines règles de prop firm limitent la détention le week-end.

## Périodes (protocole du projet)
Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 (→ 2026-09-21) = M1 du broker.

## Critère de succès (le même que les études précédentes)
- Deux jambes principales : **US100** et **US500**, jugées séparément. **Candidate** si, sur l'entraînement : ≥ 60 trades, moyenne nette > 0 avec **t ≥ 2**, positive en 2010-2016 ET en 2017-2022 ; PUIS au test 2023-2025 (lu une fois) : ≥ 30 trades, moyenne nette > 0. 2026 : descriptif.
- Tests multiples : 2 jambes à t ≥ 2 → environ 5 % de chances qu'une passe par hasard ; les deux indices sont très corrélés, un succès sur un seul est fragile.
- Candidate → démo/alerte d'abord, jamais d'adoption directe. Si rien ne passe : on n'ajoute pas de filtres.
- Limites déclarées : swap relevé en 2026 appliqué à tout le passé (les taux étaient proches de 0 en 2010-2015 et 2020-2021 : le coût réel était plus faible) ; spread à l'ouverture de 9:30 souvent plus large que le spread par défaut (d'où la sensibilité 2 ×) ; CFD ≠ actions.
