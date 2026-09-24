# PRÉ-ENREGISTREMENT (écrit AVANT tout calcul) — Effet de fin de mois (« turn of the month ») sur US100 / US500

Date : 2026-09-24. Demande d'Esdras : « teste les flux de fin de mois ». Effet publié et expliqué par des flux (versements de salaires et de retraites investis en début de mois, rééquilibrages de fin de mois) : Ariel (1987, *JFE* 18), Lakonishok & Smidt (1988, *RFS* 1), McConnell & Xu (2008, *Financial Analysts Journal* 64 : l'essentiel du rendement des actions américaines se fait du dernier jour de bourse du mois au 3e jour du mois suivant). Aucun chiffre de cet effet n'a été calculé sur les données du projet avant ce texte.

## Règles (identiques pour les deux indices)
1. **Jours de bourse** = séances de la bourse de New York présentes dans les données (barre M1 à 9:30 NY). Mois = date de New York. Jour −1 = dernier jour de bourse du mois ; jour −2 = celui d'avant ; jours +1, +2, +3 = trois premiers jours de bourse du mois suivant.
2. **Achat à la clôture du jour −2** (dernière barre M1 avant 16:00 NY, à l'ask = bid + spread) ; **vente à la clôture du jour +3** (au bid). Détention : jours −1, +1, +2, +3 (définition de McConnell & Xu). Pas de stop, pas de filtre, pas de vente à découvert. Un trade par mois.
3. Si les données ont un trou de plus de 4 jours calendaires entre deux séances de la fenêtre, pas de trade ce mois.
4. **Coûts** : spread par défaut du projet et **swap réel du broker** pour chaque nuit détenue (triple le vendredi), en % du prix du moment, comme `runOvernightStudy.js` / `runLiveReplay.js`. Sensibilité à 2 × le spread (descriptive).
5. **Mesure principale** : rendement net par trade, en % du nominal.
6. **Compte (descriptif)** : nominal = capital × min(4, cible / σ14), cible 0,5 / 1 % ; garde-fou du bot ; FTMO 1-Step.

## Contrôle de dérive (descriptif, obligatoire dans le rapport)
Toutes les autres fenêtres de même forme (achat à une clôture, vente 4 séances plus tard) qui ne chevauchent pas la fenêtre de fin de mois : moyenne nette et écart « fin de mois − reste du mois ». Si la fin de mois ne rapporte pas plus que n'importe quelle fenêtre de 4 jours, ce n'est que la hausse générale.

## Périodes (protocole du projet)
Entraînement 2010-2022 = HistData M1 ; test 2023-2025 et 2026 (→ 2026-09-21) = M1 du broker.

## Critère de succès (le même que les études précédentes)
- Deux jambes principales : **US500** (indice de l'article) et **US100**, jugées séparément. **Candidate** si, sur l'entraînement : ≥ 60 trades, moyenne nette > 0 avec **t ≥ 2**, positive en 2010-2016 ET en 2017-2022 ; PUIS au test 2023-2025 (lu une fois) : ≥ 30 trades, moyenne nette > 0. 2026 : descriptif.
- Environ 156 trades à l'entraînement et 36 au test : t ≥ 2 demande un effet assez fort ; c'est voulu.
- Tests multiples : 2 jambes très corrélées. Candidate → démo/alerte d'abord. Rien ne passe → on n'ajoute pas de filtres.
- Limites déclarées : swap de 2026 appliqué au passé (surestimé les années à taux zéro) ; effet publié depuis 1987, possiblement affaibli ; CFD ≠ actions.
