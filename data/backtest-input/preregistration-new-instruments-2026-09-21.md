# Pré-enregistrement : mécanismes existants sur de nouveaux instruments (écrit le 2026-09-21 AVANT tout calcul et AVANT tout téléchargement de données)

**Demande d'Esdras :** essayer les mécanismes qui marchent (FVG, Weekly Sweep, NWOG, Divergence) sur des instruments jamais testés. Ce document fixe les hypothèses, les règles et les critères de décision. **Il ne sera pas modifié après avoir vu un résultat** ; toute déviation sera écrite ici avec sa date et sa raison.

## Instruments candidats (noms exacts à confirmer sur le broker avec `list-symbols`, non disponibles = ignorés et notés)
- **XAGUSD** (argent), configuration = celle de son frère **XAUUSD** (FVG : `CONFIG.fvg.perSymbol.XAUUSD` copiée telle quelle, fenêtre de session comprise).
- **US30** (Dow Jones), configuration = celle d'**US100** pour FVG et NWOG, d'**US500** pour Weekly Sweep. Très corrélé aux indices : sert surtout de contrôle.
- **USOIL** (pétrole brut), configuration = celle d'**US500** (aucun frère naturel ; instrument **exploratoire**, sa moindre crédibilité est déclarée d'avance).
- Aucun autre instrument n'est ajouté après coup. Déjà rejetés dans ce dépôt et non retestés : AUDUSD, NZDJPY, UKX, USDJPY, USDCAD, GBPUSD, BTCUSD, GER40.

## Hypothèses (11, comptées ; le seuil est durci en conséquence)
FVG : H1 XAGUSD, H2 US30, H3 USOIL. Weekly Sweep : H4 XAGUSD, H5 US30, H6 USOIL. NWOG : H7 XAGUSD, H8 US30, H9 USOIL. Divergence (paramètres du mécanisme actuel : lookback 100, z 2, ATR 14, stop 1,5 ATR, RR 3, échelle H1) : H10 paire XAUUSD/XAGUSD, H11 paire US100/US30.
**Aucun paramètre n'est réglé** : chaque hypothèse utilise la configuration copiée de son frère, sans optimisation, ni de RR, ni de fenêtre, ni de filtre.

## Données et méthode
- M1 réel du broker (export `getHistoricalCandles`, fenêtres de 8 jours, contrôle des trous à la fusion, comme `data/real-m1-full`), reconstruit en M15, décalé de -5 h (temps moteur).
- Vrai moteur (`LiveStrategyEngine.warmUp`, `completeDivergencePair: true`), règlement à la minute (M1 exact), garde-fous réels rejoués (3 trades/jour, pause 30 min, arrêt du jour), une position par instrument.
- **Découpage :** entraînement = avant 2025-01-01 ; test = 2025-01-01 → dernière donnée. Décision sur l'entraînement, le test est lu **une seule fois**.
- **Coûts :** spread supposé = **2 × le spread par défaut de l'instrument frère** (US30 : 2 × US100 ; XAGUSD : 2 × XAUUSD rapporté au prix ; USOIL : 2 × US500 rapporté au prix), sans commission ni swap. Résultat aussi à 1 × pour la sensibilité, mais la décision se prend à **2 ×**. Remplacé par le spread mesuré (`bot_spread_samples`) dès qu'on a mesuré l'instrument.

## Critères, écrits à l'avance
1. **Retenue pour lecture du test** si, à l'entraînement : au moins **60 trades**, **R net par trade ≥ +0,10**, et positif sur **au moins 2 années civiles complètes** (ou sur les deux moitiés de l'entraînement s'il y a moins de 3 années). Sinon : **rejetée, test non lu**.
2. **Réussie sur le test** si : au moins **30 trades**, **R net par trade ≥ +0,10** (même seuil qu'à l'entraînement, coûts à 2 ×), R net total positif, et **corrélation mensuelle du R avec le combo actuel < 0,3** (sinon elle ne diversifie pas).
3. **Aucune adoption directe.** Une hypothèse réussie devient « candidate » : suivi en **mode alerte** dans la démo (signaux enregistrés sans ordres) jusqu'à **100 signaux hors échantillon** à ≥ +0,1 R/trade réglés au M1 exact, puis décision d'Esdras.
4. **Correction des comparaisons multiples :** avec 11 hypothèses, on s'attend à ~1 faux positif par chance à ce seuil ; une seule réussite isolée et modeste (R/trade < +0,15 ou moins de 40 trades au test) est traitée comme **non concluante**, pas comme un succès.
5. Tout résultat (y compris les rejets) est consigné dans `data/research-memory.json`.

## Ce qui est interdit
Changer le RR, la fenêtre de session, le filtre de direction, le spread supposé ou le découpage après avoir vu des chiffres ; retirer une hypothèse gênante du décompte ; lire le test avant la décision d'entraînement ; conclure sur moins de 30 trades.

## Limites connues
Historique court (métaux dès 2022-05, indices dès 2023-01 chez ce broker, donc 2,5 à 3 ans d'entraînement) ; coûts partiels ; l'argent est très corrélé à l'or, US30 aux indices déjà tradés ; le pétrole est sensible aux annonces et n'a pas été conçu pour ces mécanismes.
