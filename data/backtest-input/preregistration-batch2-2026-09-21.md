# Pré-enregistrement, LOT 2 : les autres mécanismes sur les nouveaux instruments (écrit le 2026-09-21 AVANT tout calcul de ce lot)

**Contexte.** Le lot 1 (`preregistration-new-instruments-2026-09-21.md`) a donné une seule candidate sur 11 : FVG XAGUSD. Calculé APRÈS coup, sans changer son statut du lot 1 : sur le test, sa moyenne est +0,209 R/trade, son écart-type 2,11 R sur 67 trades, soit un **t = 0,81** (les deux autres retenues ont t = -0,20 et +0,03). C'est statistiquement indiscernable du hasard. Le lot 2 durcit donc les règles.

**Périmètre : 12 hypothèses, comptées.** Les 4 mécanismes qui n'ont pas été essayés au lot 1 (Silver Bullet, CBDR, Judas Swing, Breaker Block) sur les 3 instruments déjà téléchargés (XAGUSD, US30, XTIUSD ; `data/real-m1-new-full`). Aucun nouveau téléchargement, aucune paire ajoutée après coup.
- B1-B3 Silver Bullet sur XAGUSD, US30, XTIUSD ; B4-B6 CBDR ; B7-B9 Judas Swing ; B10-B12 Breaker Block.
- **Configuration = le bloc du mécanisme tel qu'il est codé** (`CONFIG.silverBullet`, `CONFIG.cbdr`, `CONFIG.judasSwing`, `CONFIG.breakerBlock`), avec la liste des symboles remplacée par l'instrument testé ; RR, fenêtre et filtres inchangés (Silver Bullet RR 3, CBDR RR 3, Judas Swing RR 3, Breaker Block RR 5). Aucun réglage.

**Méthode (identique au lot 1).** Vrai moteur, M1 exact, garde-fous réels rejoués à 0,3 %, spread = 2 × celui du frère en valeur relative (mêmes valeurs absolues que le lot 1 : XAGUSD 0,0073, US30 2,51, XTIUSD 0,0065) ; entraînement = avant 2025-01-01 (30 jours de chauffe), test = 2025-01-01 → fin, lu UNE fois pour les retenues, après commit du résultat d'entraînement.

**Critères durcis, écrits à l'avance**
1. **Retenue pour lecture du test** si, à l'entraînement : **≥ 80 trades**, **R net/trade ≥ +0,15** (2 × le spread), R net positif sur les **deux moitiés** de l'entraînement.
2. **Réussie au test** si : **≥ 40 trades**, **R net/trade ≥ +0,12**, R total positif, corrélation mensuelle avec le combo actuel **< 0,3**, **et t = moyenne / (écart-type / √n) ≥ 2,0** (sinon « non concluante »).
3. **Comparaisons multiples :** lots 1 et 2 = 23 hypothèses. Un seuil t ≥ 2 laisse attendre ~0,5 faux positif sur l'ensemble. Une réussite du lot 2 reste une **candidate** (mode alerte, 100 signaux hors échantillon à ≥ +0,1 R/trade, jamais d'adoption directe).
4. **Statut du lot 1 :** FVG XAGUSD reste « candidate faible » (t = 0,81) ; elle n'est ni promue ni retirée par le lot 2, mais son suivi en mode alerte ne doit pas être présenté comme un résultat solide.

**Interdit :** modifier un paramètre, un seuil, le spread ou le découpage après avoir vu un résultat ; retirer une hypothèse du décompte ; lire le test avant d'avoir commité l'entraînement.

**Limites :** mêmes que le lot 1 (historique court, spreads supposés non mesurés, corrélation sur ~21 mois). Silver Bullet et CBDR ont été conçus pour les indices américains ; Judas Swing pour l'EURUSD ; Breaker Block pour GER40 : on s'attend à ce que la plupart échouent, ce qui est un résultat utile.
