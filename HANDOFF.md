# Handoff — assistant ICT/trading semi-automatisé (FundingPips/FTMO via cTrader)

Ce fichier résume l'état du projet pour reprendre le travail dans une nouvelle session Cowork (autre compte). Donne-le à Claude en premier message : "voici mon projet, lis HANDOFF.md et continue avec moi."

## Contexte du projet

Esdras construit un assistant de trading ICT (Inner Circle Trader) SEMI-automatisé pour un compte de challenge prop firm (FundingPips/FTMO) via cTrader — PAS un bot autonome : le système alerte, l'utilisateur clique Buy/Sell manuellement. But : gagner du temps et imposer une discipline contre le surtrading/revenge-trading.

Discipline méthodologique suivie PARTOUT dans ce projet (à ne jamais casser) :
- Aucun regard en avant (no-lookahead) : remplissage à l'ouverture de la bougie SUIVANTE, jamais la même bougie.
- Split TRAIN (2019-2023) / TEST (2024-2025), coupure au 2024-01-01.
- Règle de verdict : `testExp<=0` → "❌ ne tient pas" ; `trainExp>0 ET testExp>=0.3*trainExp` → "✅ tient" ; sinon → "⚠️ affaibli" ; et si `trainN<10` ou `testN<10` → "❓ pas assez de trades" (garde-fou ajouté cette session — un verdict sur une poignée de trades ne veut rien dire).
- Paramètres de chaque nouvelle stratégie candidate = conventions PUBLIÉES/standards décidées AVANT de regarder les résultats — jamais ajustés sur nos données (anti data-snooping).
- ⚠️ **Mise en garde épistémique (nouvelle cette session)** : 2019-2025, ce ne sont PAS 7 tirages indépendants. Les années adjacentes partagent le même régime macro (série corrélée) — l'échantillon "vraiment indépendant" derrière tout ça, c'est plutôt 1 à 2 régimes macro (un krach en 2020, un bear market en 2022, quelques bull runs), pas 7 ans. Et chaque nouvelle stratégie/variante testée sur ces mêmes données augmente le risque de comparaisons multiples (data-snooping involontaire, même en respectant train/test). Conclusion pratique : rester très conservateur sur ce qu'on ajoute au combo, préférer un forward-test démo réel à toute nouvelle "amélioration" trouvée seulement en historique.

## Ce qui est VALIDÉ (à trader réellement)

1. **FVG (Fair Value Gap)** — config propre par instrument, trouvée par grid-search train/test :
   - US100 : variant H4_EMA200, stop fvg-edge, RR 1:3, filtre structure BOS + session Silver Bullet (10h-11h NY) + confluence liquidity sweep (MÊME instrument).
   - US500 : variant H1_EMA50, stop fvg-edge, RR 1:3, mêmes filtres structure+session Silver Bullet+sweep (MÊME instrument).
   - XAUUSD : variant H4_EMA20, stop swing, RR 1:3, filtres structure+sweep, mais fenêtre session Londres-NY overlap (7h-10h NY) au lieu de Silver Bullet.
   - Timeframe M15 confirmé optimal après comparaison directe M15 vs H1 vs H4 (voir section dédiée plus bas) — ce n'est pas un choix arbitraire.
2. **Divergence** — mean-reversion entre US100/US500 (paire, log-ratio, lookback 100, seuil z=2, stop 1.5xATR(14) H1, cible 1:3, timeout 480 bougies M15). Scope intrinsèquement limité à ces deux instruments (c'est une relation entre eux, pas applicable seule à l'or).
3. **RSI(2) Connors (réserve)** — mean-reversion US100/US500 seul, EMA200 filtre de tendance, stop 2xATR(14), sortie SMA(5)/10 jours max. Validé mais actuellement PAS recommandé en plus du combo FVG+Divergence (voir "diminishing returns" ci-dessous) — à garder en réserve pour un FUTUR nouvel instrument, pas à empiler sur US100/US500 déjà occupés.

**Netting** : au plus UNE position ouverte par instrument, peu importe la source (FVG/Divergence/RSI-2) — implémenté via `anyOpenOnSymbol(symbol)`.

**Combo recommandé actuel** : FVG (US100+US500+XAUUSD, config propre à chacun) + Divergence (US100/US500), netting à 3, règles FTMO 1-Step (cible unique +10%, perte max 10% TRAILING sur le plus haut solde jamais atteint). Résultat : challenge complété en 49 à 107 jours selon l'année testée (2024/2025), aucun bust sur les 7 années (2019-2025), drawdown trailing max ~9.4% (2020, à surveiller).

## Position sizing dynamique — testé sur le VRAI combo, PAS retenu (garder le risque fixe 0.5%)

À la demande explicite de creuser la gestion de position/sizing plutôt que d'empiler encore des signaux d'entrée faibles (voir section ICT ci-dessous). En creusant le repo, un script exploratoire (`scripts/runAdaptiveRiskAccountImpact.js`, "échelle de risque évolutive gagne=monte/perd=redescend") existait déjà, construit par une session précédente mais **jamais documenté ici ni vérifié sur le vrai combo** — il ne testait que FVG US100/US500 seul (2 sources sur 4), sans XAUUSD ni Divergence, sous les règles FundingPips (drawdown statique) et non les règles FTMO réelles (trailing). Ce chantier a été repris et fermé proprement cette session :

1. **Re-vérification du postulat sur le VRAI combo** (`scripts/checkOutcomeSerialCorrelationFullCombo.js`) : l'idée d'une échelle qui monte après un gain et redescend après une perte ne vaut que si un trade gagnant rend vraiment le suivant plus probable. Sur le sous-ensemble FVG seul (test initial d'une session précédente), l'écart était net : P(gagne | précédent gagné)=56.5% vs P(gagne | précédent perdu)=35.4%. Mais sur le VRAI combo — où la Divergence (mean-reversion, mécanisme totalement différent) fournit ~70% des trades — cet écart s'effondre : 37.4% vs 32.8% au global, et devient statistiquement NUL en test (33.7% vs 33.5%, n=95/188). **Le postulat qui justifiait l'échelle ne tient quasiment plus sur ce que le bot trade réellement.**
2. **Test empirique quand même** (`scripts/runFtmo1StepAdaptiveRiskAccountImpact.js`), sur le combo réel complet sous règles FTMO 1-Step (trailing 10%), 3 scénarios comparés au risque fixe actuel (0.5%) : aucun bust dans aucun scénario sur les 7 années (le fixe 0.5% ne s'approche jamais dangereusement de 10%, max observé 9.4% en 2020). L'échelle évolutive (mêmes paramètres que le script d'origine, non retouchés) réduit le drawdown trailing dans plusieurs années (ex. 2019 : 3.0% au lieu de 7.8%) MAIS complète le challenge nettement plus lentement (2025 test : jour 303 au lieu de jour 49 !) et ne complète PAS du tout en 2021 (contre jour 311 en fixe). Un DEUXIÈME mécanisme sans dépendance au postulat — un simple frein sur drawdown (0.5% plein tant que le trailing reste sous 5%, réduit à 0.25% au-delà, retour au plein sous 3%) — est beaucoup plus doux (ne se déclenche même pas en 2023/2025, années où le drawdown reste bas) et réduit un peu le pire drawdown (2020 : 7.5% au lieu de 9.4%), mais ralentit aussi la complétion certaines années (2022 : jour 332 au lieu de jour 254) et empêche la complétion en 2021 dans cet essai.
3. **Conclusion sur ces deux mécanismes** : ni l'un ni l'autre n'apporte un vrai gain. Le risque fixe 0.5% ne buste JAMAIS sur les 7 années testées (marge confortable même dans la pire année, 9.4% de drawdown sur un plafond de 10%), donc la protection supplémentaire qu'offre un sizing dynamique n'est pas nécessaire — et son coût réel (challenge parfois beaucoup plus lent, parfois non complété dans l'année) est net et mesuré, pas hypothétique. Détail complet : `data/backtest-input/ftmo-1step-adaptive-risk-account-impact.md`.

4. **Sizing par VOLATILITÉ (ATR)** — NOUVEAU (à la demande explicite d'explorer cet angle plutôt que le drawdown). Vérification préalable (`scripts/checkVolatilityRegimeImpactFullCombo.js`) : chaque trade du VRAI combo est classé selon la volatilité de SON PROPRE instrument à l'entrée (ATR(14) quotidien vs sa SMA(100), seuils 0.8x/1.5x fixés avant tout résultat — mêmes conventions que le filtre de régime bull/bear/range déjà en place). Constat robuste, cohérent train ET test : le régime 'normal' porte l'essentiel de l'edge (train 0.48R, test 0.44R, 585/994 trades), 'high' reste solide (train 0.24R, test 0.13R), mais 'low' (marché calme) est le maillon faible — à peine positif en train (0.09R) et **NÉGATIF en test** (-0.04R). C'est l'INVERSE du sizing par volatilité classique (qui réduit la taille quand la vol est HAUTE) : ici c'est la vol BASSE qui pose problème. ⚠️ Écart de discipline assumé : contrairement aux seuils de régime (fixés avant résultat), le choix de réduire spécifiquement en 'low' (plutôt qu'en 'high', comme le voudrait la convention standard) a été informé par ce constat lui-même.
   - Schéma testé (`scripts/runFtmo1StepVolAdaptiveRiskAccountImpact.js`) : risque réduit à 0.25% en régime 'low', 0.5% inchangé ailleurs. Comparé au risque fixe 0.5% sur le VRAI combo, règles FTMO 1-Step, 7 années :
   - 2019 : quasiment identique. 2020 : challenge complété plus vite (jour 49 au lieu de 61), même drawdown. **2021 : nettement meilleur sur tous les plans** (drawdown trailing 3.8% au lieu de 7.5%, complété plus vite : jour 285 au lieu de 311). 2022 : quasiment identique. **2023 : plus lent** (jour 225 au lieu de 197) — le seul vrai recul observé. 2024 (test) : complété plus vite (jour 102 au lieu de 107), même drawdown. 2025 (test) : même vitesse, même drawdown.
   - **Bilan : 4 années identiques ou meilleures, 1 année nettement meilleure (2021), 1 année plus lente (2023), aucun bust dans les deux scénarios.** C'est le résultat le plus favorable des trois mécanismes de sizing testés cette session — contrairement à l'échelle évolutive et au frein sur drawdown (qui coûtaient tous les deux de la vitesse sans bénéfice net), celui-ci n'a qu'un seul vrai revers (2023) contre plusieurs améliorations, dont une nette (2021). Reste un test unique sur un seul découpage train/test, pas une preuve définitive — mais c'est un candidat sérieux, contrairement aux deux premiers. Détail complet : `data/backtest-input/ftmo-1step-vol-adaptive-risk-account-impact.md` (résultat par année) et `scripts/checkVolatilityRegimeImpactFullCombo.js` (détail par instrument — l'or et US500 montrent le même schéma qualitatif : edge le plus faible/négatif en régime calme).

**Recommandation mise à jour** : garder le risque fixe 0.5%/trade pour l'instant (le gain du sizing par volatilité, bien que réel dans ce test, est modeste et repose sur un seul découpage historique) — mais c'est la piste de sizing dynamique la plus prometteuse trouvée à ce jour, contrairement aux deux autres testées. Avant de l'activer en réel, il faudrait au moins un forward-test démo pour confirmer que le régime 'low' continue de sous-performer en conditions live, pas seulement en historique.

**Bot live/démo maintenant CÂBLÉ correctement (DONE cette session — voir ancien point "Prochaines étapes" #2)** : `src/liveStrategyEngine.js` implémente en streaming le combo FVG (filtré, config exacte de production) + Divergence, avec conception "rebuild-and-replay" (réplique l'historique complet à chaque nouvelle bougie pour ne dépendre d'aucun état caché divergent du backtest), netting, et `_blockReason()` (vérifications netting/spread/guardrail). `src/store.js` instancie `LiveStrategyEngine` (au lieu d'un `FvgEngine` brut par symbole comme avant) et `src/config.js` confirmé identique caractère pour caractère aux configs de backtest validées. **L'écart entre "ce qui est validé en backtest" et "ce qui tourne réellement en live" est donc comblé.**

## Pyramide (ajouter une 2e unité sur un trade gagnant) — deux designs testés, aucun recommandé pour l'instant

À la demande explicite d'expliquer pourquoi la pyramide "classique" (déjà dans le repo, mode `pyramid` de `runBacktestManaged`) ne marche pas bien, puis de chercher un MEILLEUR design qui ne force pas le stop à breakeven.

1. **Ancien design (stop partagé + breakeven)** : à +1R, on ajoute une 2e unité de même taille, et le stop des DEUX unités remonte à l'entrée d'origine. Diagnostic confirmé par script de vérification (`checkPyramidSkip` en scratch) : deux causes cumulées expliquent le résultat décevant.
   - Beaucoup de trades gagnants résolvent en UNE SEULE bougie (le prix saute directement au-delà de +1R ET de la cible +3R dans la même bougie) : sur US100 comme US500, 100% des trades gagnants NON-pyramidés avaient une durée d'exactement 1 bougie — le déclencheur de pyramide n'est simplement jamais vérifié pour eux, car le code résout d'abord la bougie (stop/cible atteints) avant de vérifier les seuils de gestion.
   - Même quand la pyramide se déclenche, le stop à breakeven PARTAGÉ transforme certains trades qui auraient fini gagnants (si leur stop d'origine n'avait jamais bougé) en trades nuls/perdants dès qu'un simple retour sur l'entrée survient avant la reprise vers la cible — confirmé par une baisse mesurée du taux de gain chaque année dans `pyramid-account-impact.md` (ex. 2019 : 45.8%→33.3%).
   - Au niveau du COMPTE complet (`pyramid-account-impact.md`), comparé à risque de pire cas égal (0.125% de base, pour que le pire scénario dollar soit identique au risque fixe actuel), cet ancien design n'atteint JAMAIS la phase 1 (+8%) sur AUCUNE des 7 années testées — pire que le risque fixe qui, lui, y arrive dans 5 années sur 7.

2. **Nouveau design "stops indépendants, sans breakeven"** (`runBacktestPyramidIndependentStops` dans `backtestEngine.js`, + mode `pyramid-independent` ajouté à `runPortfolioBacktest`) : le stop de l'unité D'ORIGINE n'est JAMAIS touché — elle se comporte texto comme si aucune gestion active n'existait. Une 2e unité, complètement indépendante (sa propre entrée à +1R, son propre stop, sa propre cible), est ajoutée en plus. Les deux se résolvent chacune de leur côté : un retour qui stoppe la 2e unité NE touche PAS la 1ère, qui peut très bien continuer et atteindre sa cible plus tard.
   - **Par trade** (`trade-management-comparison.md`) : contrairement à l'ancien design, le taux de gain de l'unité d'origine reste EXACTEMENT identique au sans-gestion (US100 train 47.1%/47.1%, US500 train 43.7%/43.7% — logique, son stop n'a jamais bougé). Le R net moyen s'améliore sur les deux instruments en train (US100 : 0.79→1.00R ; US500 : 0.63→0.58R, quasi stable) et en test (US100 : 0.70→0.73R ; US500 : 0.70→1.19R). Contrepartie : le drawdown max en R augmente (US100 train 5.79→6.80R ; US500 train 7.03→11.41R) — logique aussi, le pire cas d'un trade pyramidé est maintenant -2R (les deux unités perdent chacune de leur côté) au lieu du plancher à 0R de l'ancien design (stop à breakeven = jamais négatif une fois déclenché).
   - **Au niveau du COMPTE complet** (`pyramid-independent-account-impact.md`, même méthode que l'ancien test — $10k, règles FTMO 1-Step trailing, risque normal ET risque de base moitié pour comparaison à pire cas égal) : à risque plein (0.5% de base), ce nouveau design atteint la phase 1 un peu PLUS VITE que le risque fixe actuel dans toutes les années où les deux y arrivent (ex. 2022 : jour 281 au lieu de 311 ; 2024 : jour 142 au lieu de 227 ; 2025 : jour 225 au lieu de 239) — et plus vite aussi que l'ancien design pyramide dans ces mêmes années. Aucun bust observé sur les 7 années testées, dans aucun des 5 scénarios de risque. MAIS à risque de pire cas égal (0.125% de base, la comparaison la plus honnête), il retombe dans le même travers que l'ancien design : phase 1 jamais atteinte sur aucune des 7 années — l'essentiel du gain de vitesse vient du fait de risquer davantage au total sur les trades pyramidés, pas d'un edge structurellement meilleur.

**Conclusion honnête** : le nouveau design est clairement plus logique et moins destructeur que l'ancien (il ne casse plus jamais le taux de gain de l'unité d'origine, et accélère légèrement le passage de challenge à risque plein) — mais le gain reste modeste, s'accompagne d'un drawdown en R plus élevé sur certains trades, et disparaît à la comparaison à risque strictement égal. **Pas recommandé pour la production en l'état** — comme le sizing par volatilité, c'est une piste plus prometteuse que les autres testées, mais un seul découpage historique ne suffit pas à la valider ; un forward-test démo serait nécessaire avant d'y risquer du capital réel. Détail complet : `data/backtest-input/pyramid-independent-account-impact.md`, `scripts/runPyramidIndependentAccountImpact.js`, `scripts/runTradeManagementComparison.js` (ligne "Pyramide (stops indépendants, sans breakeven)").

3. **Câblage live pour l'exécution automatique de la 2e unité** — NOUVEAU (à la demande explicite : "comment m'alerter qu'il faut ouvrir une deuxième position... est-il possible que le bot lui-même clique sur le bouton trade?"). Vérifié au préalable : cTrader Open API supporte bien l'envoi d'ordres programmatiques (`ProtoOANewOrderReq`, permission "trade" du token OAuth), FundingPips autorise l'automatisation complète pour du code personnel avec preuve de propriété (ce repo qualifie), et FTMO autorise les EA sur cTrader (trend/breakout/swing, avec restriction "pas de trade dans les 2 min autour d'une news majeure" à respecter). Design retenu, délibérément PARTIEL : l'entrée d'origine reste alertée manuellement (le choix "semi-automatique" du projet, pour la discipline anti-surtrading, n'est pas remis en cause) — seul l'ajout mécanique de la 2e unité à +1R est automatisé, parce que c'est une règle sans jugement (pas de discrétion à préserver) et sensible au temps (peut être raté si personne n'est devant l'écran au bon moment).
   - `src/liveStrategyEngine.js` : nouvelle logique pure/testable (`_maybeRequestPyramid`, `markPyramidOrderPlaced`, `markPyramidOrderFilled`) qui décide QUAND demander/annuler l'ordre d'ajout, sans toucher au stop de la position d'origine (jamais lue ni modifiée par cette logique). 6 nouveaux tests unitaires dans `test/liveStrategyEngine.test.js` (153 tests au total maintenant).
   - Contrairement au backtest (qui vérifie le déclenchement bougie par bougie), le live place un vrai ordre STOP en attente dès l'ouverture de la position d'origine, avec stop-loss/take-profit DÉJÀ ATTACHÉS (ordre bracket) — le broker protège la position même si ce process tombe, plutôt que de dépendre d'un polling constant.
   - `src/dataSources/cTraderDataSource.js` : ajout de `_placeStopOrder`/`_cancelOrder` (premier code du projet qui ÉCRIT sur le compte réel, pas seulement lecture) + notifications push (ntfy.sh) à chaque étape (ordre programmé, rempli, annulé, clôturé, ou en échec).
   - `src/config.js` : `CONFIG.pyramid.enabled` (coupe-circuit, `false` par défaut — variable d'env `PYRAMID_ENABLED=true` pour activer), scope volontairement limité à US100/US500 en source FVG (jamais testé sur Divergence ni XAUUSD).
   - **Statut : construit, PAS testé en live** (comme tout `cTraderDataSource.js` déjà avant cette session) — en particulier l'unité exacte du champ `volume` de l'API (`lots x lotSize x 100`, convention documentée mais jamais confirmée) doit être vérifiée contre une vraie réponse `ProtoOASymbolsListReq` avant d'activer avec de l'argent réel. Voir `docs/CTRADER_SETUP.md` (nouvelle section "Pyramide automatique") pour la checklist avant activation (scope OAuth `trading`, specs de lot vérifiées).

4. **"Mode indisponible" : exécution automatique de l'ENTRÉE d'origine, activée manuellement par Esdras pour une fenêtre limitée** — NOUVEAU (à la demande explicite : "surtout en fin de mois, le travail d'Esdras est tellement chargé qu'il ne peut peut-être pas cliquer sur buy ou sell"). Question posée et tranchée par l'utilisatrice : plutôt qu'un délai fixe avant exécution auto (qui n'aide pas si Esdras est indisponible pendant PLUSIEURS HEURES d'affilée) ou un mode "tout automatique en permanence" (qui retire le filtre humain même quand ce n'est pas nécessaire), le choix retenu est un **bouton qu'Esdras active lui-même juste avant une période chargée** — le bot reste semi-automatique (alerte + clic manuel) le reste du temps, et ne bascule en exécution automatique des ENTRÉES que pendant cette fenêtre explicitement choisie.
   - `src/store.js` : nouvel état `store.autoExecute` ({enabled, expiresAt, enabledAt}) + `setAutoExecute(enabled, hours)` (active pour `hours` heures, plafonné à 7 jours — **impossible de l'activer "pour toujours"**, un oubli revient automatiquement au mode semi-automatique plus sûr) + `isAutoExecuteActive()` (pure, testée : 5 tests dans `test/store.test.js`).
   - `src/server.js` : `POST /api/auto-execute` ({enabled, hours}) pour activer/désactiver, statut inclus dans `GET /api/status`.
   - `public/index.html` : nouvelle carte "Mode indisponible" sur le dashboard — boutons "Activer 4h/8h/24h/72h" et "Désactiver maintenant", avec le temps restant affiché en direct.
   - `src/dataSources/cTraderDataSource.js` : `_handleAutoExecuteEntry()` soumet l'entrée d'origine EXACTEMENT comme elle aurait été alertée (même entrée/stop/cible, rien de recalculé) dès qu'un signal valide et non bloqué arrive PENDANT la fenêtre active. Type d'ordre fidèle à la définition de chaque source : FVG → ordre LIMIT au niveau exact de la zone (le prix l'a déjà touché ce tick-ci — c'est l'automatisation fidèle de "poser un ordre limite à ce niveau", pas une poursuite de prix à un prix moins bon), avec une expiration courte (~1h) pour ne pas rester en attente indéfiniment si le prix ne revient jamais. Divergence → ordre MARKET (l'entrée y est déjà définie comme "l'ouverture de LA bougie en cours").
   - **Important, assumé consciemment** : automatiser les entrées retire le filtre humain qui existait pour repérer un problème avant qu'il ne devienne un vrai trade (donnée aberrante, actualité imprévue, bug de stratégie) — voir la discussion avec l'utilisatrice. C'est pour ça que ce n'est PAS le mode par défaut, que la fenêtre est bornée dans le temps et plafonnée à 7 jours, et que ça reste un choix explicite d'Esdras à chaque activation, pas un réglage qu'on oublie.
   - **Statut : construit, PAS testé en live** — mêmes réserves que le point 3 ci-dessus (specs de lot/volume à vérifier), plus une limitation assumée : si l'ordre LIMIT de l'entrée FVG n'est jamais rempli (le prix ne revient pas), le modèle interne "croit" quand même qu'une position est ouverte jusqu'au timeout — comportement identique à un humain qui aurait ignoré l'alerte (pas une régression, déjà documenté comme limitation du netting "believed").

## Cible étendue (1:4 / 1:5 au lieu de 1:3) — résultat le plus fort de la session, candidat sérieux pour la production

À la demande explicite : "est-ce qu'il y a des éléments spécifiques dans le trading qui permettent d'aller à 1:4, 1:5, même si c'est 1 fois par semaine ?" Réponse empirique, testée avant d'être affirmée : OUI, et c'est plus fort que "rare et sélectif" — c'est un changement SYSTÉMATIQUE du multiple R:R, sur les MÊMES signaux/entrées/stops déjà validés (rien de nouveau ajouté), qui améliore l'espérance sur les trois instruments FVG. L'explication ICT plausible : les filtres déjà en place (biais HTF, structure BOS, fenêtre de session, confluence liquidity sweep) ne gardent que des trades avec un vrai alignement directionnel — une fois enclenché, le prix est "attiré" (draw on liquidity, concept ICT) vers le prochain pool de liquidité important, souvent plus loin que 3R ; la cible fixe à 1:3 coupe donc une partie des gagnants avant qu'ils n'aillent chercher cette liquidité plus loin.

- **US100** : espérance train 0.79R (1:3) → 1.12R (1:4) → 1.38R (1:5) ; test 0.70R → 1.15R → 1.44R. Amélioration MONOTONE (chaque palier améliore le précédent) sur train ET test, malgré un taux de gain qui baisse mécaniquement (47.1%→44.1%→41.2% train) — logique, le seuil de rentabilité baisse aussi (25%→20%→16.7%).
- **US500** : espérance train 0.63R → 0.74R → 1.02R ; test 0.70R → 0.97R → 1.13R. Même schéma, amélioration monotone.
- **XAUUSD** : espérance train 0.70R → 0.88R → 0.95R ; test 0.48R → 0.61R → 0.52R — améliore nettement à 1:4, mais REDONNE un peu de terrain à 1:5 en test (toujours mieux que 1:3, mais 1:4 semble le point optimal pour cet instrument spécifiquement).

**Vérification année par année (2019-2025, avant coûts)** — le vrai test de robustesse, avant de croire un chiffre agrégé train/test :
- US100 : amélioration à chaque palier dans 6 années sur 7 (seule 2022 dévie légèrement — creux à 1:4 puis remonte à 1:5, jamais pire que 1:3). Le signal le plus propre des trois.
- US500 : les années déjà positives (2020, 2022, 2024, 2025) s'améliorent nettement avec la cible étendue ; les années déjà négatives (2021, 2023) restent négatives mais ne s'aggravent pas fondamentalement. Pas un cas de "ça masque une dégradation" — les mauvaises années restent mauvaises indépendamment du R:R choisi.
- XAUUSD : 2020 et 2025 culminent à 1:4 puis redonnent du terrain à 1:5 (cohérent avec le résultat agrégé test) — confirme que 1:4 est probablement le point d'équilibre pour cet instrument, pas 1:5.

**Ce qui reste prudent de garder à l'esprit** (même mise en garde épistémique que partout ailleurs) : un seul découpage train(2019-2023)/test(2024-2025), et 2019-2025 n'est pas 7 tirages indépendants (voir mise en garde en tête de ce fichier). Choisir un R:R DIFFÉRENT par instrument (5 pour US100/US500, 4 pour XAUUSD) après avoir vu ce résultat serait un petit écart de discipline (informé par le résultat lui-même) — à assumer explicitement si on va dans cette direction, comme pour le sizing par volatilité.

**Recommandation** : c'est le résultat le plus solide et le plus généralisable trouvé cette session — contrairement au sizing dynamique ou à la pyramide (gains modestes, compromis à faire), ici l'espérance quasi-double sur US100 et US500 sans rien changer d'autre. Sérieusement candidat pour remplacer le 1:3 actuel en production, mais décision à prendre consciemment (pas fait automatiquement) : passer `rrMultiple` de 3 à 4 (XAUUSD) et 4 ou 5 (US100/US500) dans `src/config.js` changerait le comportement réel du bot. Avant d'y aller, un forward-test démo serait la étape logique suivante — même limite que pour la pyramide et le sizing. Détail complet : `data/backtest-input/extended-target-analysis.md`, script : `scripts/runExtendedTargetAnalysis.js`.

**Mise à jour 2026-09-07 : décision prise, `src/config.js` MODIFIÉ.** À la demande explicite de l'utilisatrice ("modifie les"), `rrMultiple` est passé de 3 à **5 pour US100, 5 pour US500, 4 pour XAUUSD** (différencié par instrument comme discuté ci-dessus, justification laissée en commentaire directement dans `src/config.js`). `npm test` reste à 158/158 (le changement touche seulement la config live/démo, aucun fichier testé). **Statut : changé dans le code, PAS ENCORE forward-testé en démo** — le bot enverra désormais ses alertes (et, si le "mode indisponible" ou la pyramide sont activés, ses ordres) avec ces nouvelles cibles dès le prochain déploiement. Rien n'a changé côté OAuth/connexion (toujours en pause, voir "Prochaines étapes" point 1) — ce changement prendra effet seulement une fois le bot réellement connecté à un compte (démo recommandé en premier).

**Extension 2026-09-09 : test de 1:6 et 1:7, la config actuelle (5/5/4) reste la bonne — pas de nouveau gain net.** À la demande explicite de vérifier si l'amélioration continue au-delà de 1:5 (même script étendu, `RR_VARIANTS` passé à `[3,4,5,6,7]`) :

- **US100** : l'espérance BRUTE continue de monter jusqu'à 1:7 (train 1.38→1.42→1.49R ; test 1.44→1.65→2.02R), mais le gain marginal en TRAIN (le jeu censé guider la décision, avant de regarder le test) s'est déjà quasiment arrêté après 1:5 (+0.04R puis +0.07R, contre +0.33R puis +0.26R pour 3→4→5) alors que le TEST continue lui de grimper fort. Ce décalage (train plat, test qui s'envole) est le même type de signal d'alerte que le "train excellent/test dégradé" déjà vu ailleurs dans ce document (juste inversé) : plus probablement de la chance de la période test que du vrai edge continu. Le nombre de trades diminue aussi légèrement (68→67) — la queue de distribution s'amincit.
- **US500** : contrairement à 3→4→5, le TRAIN n'est PAS monotone à 1:6 (R retombe à 0.79 depuis 1.02 à 1:5, taux de gain chute à 26.9%), et le max drawdown bondit nettement (7.03R à 1:3 → 8.96R à 1:5 → 13.77R à 1:6/1:7, +54% par rapport à 1:5). 1:6 et 1:7 partagent en plus exactement le même n (68) et le même taux de gain (26.9%) en train — signe que ce sont essentiellement les MÊMES trades qui échouent à atteindre la cible dans les deux cas, pas deux vérifications indépendantes.
- **XAUUSD** : confirme ce qu'on savait déjà (1:4 est le point d'équilibre) — 1:6 redonne encore du terrain et 1:7 s'effondre en train (0.63R, pire que même le 1:3 d'origine) malgré un test qui remonte à 0.82R sur un taux de gain de seulement 23.1% (n=40) — signature bruit, pas edge, cohérent avec la mise en garde déjà faite sur 1:5.

**Conclusion : on NE pousse PAS au-delà de la config actuelle.** `rrMultiple` reste à 5/5/4 (US100/US500/XAUUSD), déjà en prod depuis le 2026-09-07 — aucun changement de code nécessaire. Le signal le plus propre (US100) a lui-même un train qui s'aplatit après 1:5 ; US500 casse la monotonie du train à 1:6 avec un drawdown en forte hausse ; XAUUSD était déjà tranché. Détail complet (5 paliers 3/4/5/6/7) : `data/backtest-input/extended-target-analysis.md`, script : `scripts/runExtendedTargetAnalysis.js` (`RR_VARIANTS` étendu, comportement identique pour 3/4/5 — pas de régression).

### Question ouverte d'Esdras (2026-09-09, fin de session) — POURQUOI le taux de gain baisse avec la cible étendue, et peut-on le garder stable ?

Question posée : "les pertes que j'ai vues à 1:4/1:5, est-ce que c'est le marché qui va directement dans le stop, ou est-ce des trades qui allaient bien mais où la cible est trop loin ? Et est-ce qu'on peut trouver un moyen de savoir AVANT si le marché va vraiment jusqu'à 1:4/1:5, pour éviter les cas où il n'y va pas et garder le taux de gain aussi haut qu'à 1:3 ?"

**Vérifié empiriquement avant de répondre** (script jetable, comparaison trade-par-trade 1:3 vs 1:5 sur la vraie config US100, mêmes entrées/stops, dataset complet 2019-2025, 141 trades) :
- 78 trades restent des pertes directes dans LES DEUX cas (stop touché sans jamais approcher la cible) — **cette population est totalement INCHANGÉE par la distance de la cible**, comme attendu (le stop ne bouge pas).
- 57 trades restent gagnants dans les deux cas (le prix va assez loin pour atteindre même 1:5).
- **5 trades — et EXACTEMENT 5, ce qui correspond pile à la baisse observée du taux de gain (62 gains à 1:3 → 57 gains à 1:5) — étaient gagnants à 1:3 puis ont fait demi-tour et sont revenus jusqu'au stop ORIGINAL avant d'atteindre 1:5.** Zéro trade n'a basculé en "timeout" (personne n'a juste dérivé sans jamais toucher stop ni cible).
- **Réponse directe : ce sont des trades qui allaient bien (déjà en profit, parfois bien au-delà de +3R) puis qui ont TOUT redonné jusqu'au stop d'origine avant d'atteindre la cible plus large.** Ce n'est PAS "le marché va directement dans le stop" — cette catégorie-là ne change jamais, quelle que soit la cible choisie.

**Sur son idée ("trouver quelque chose qui dit avec certitude si le marché va jusqu'à 1:4/1:5")** : l'idée est juste et déjà une piste ICT connue — le concept s'appelle le "draw on liquidity" (le prix est "attiré" vers le prochain bassin de liquidité important — un swing high/low, un plus-haut de session, etc. — et a tendance à s'arrêter/retourner LÀ, pas à une distance R arbitraire). Piste concrète à tester (PAS encore codée, à décider et figer AVANT de regarder le résultat, même discipline que partout ailleurs) :
1. Au moment de l'entrée, mesurer la distance jusqu'au prochain swing high/low opposé (`detectSwingPoints`, déjà dans `marketStructure.js`) ou plus-haut/bas de session récent.
2. Hypothèse à tester : si ce bassin de liquidité est LOIN (au-delà de 5R), le trade a plus de chances de continuer jusqu'à la cible étendue ; s'il est PROCHE (proche de 3R), c'est probablement là que le prix va réagir/retourner — donc utiliser une cible DYNAMIQUE (viser CE bassin plutôt qu'un multiple R fixe) au lieu d'une cible fixe 1:4/1:5 pour tout le monde.
3. Comparer : cible dynamique (basée sur le bassin de liquidité réel) vs cible fixe actuelle (5/5/4), même entrées/stops, même split train/test.
4. Attention à la discipline anti-data-snooping : les seuils (ex. "loin" = au-delà de combien de R) doivent être choisis AVANT de regarder si ça marche, pas ajustés après.

**Statut : hypothèse TESTÉE (session suivante, même jour) — REJETÉE, voir ci-dessous.**

### Suite (2026-09-09, même jour) — hypothèse "swing H4 le plus proche" testée sur les 5 trades eux-mêmes : ne tient pas

Script jetable, réidentifie les 5 trades exacts par entryIndex (moteur FVG, pas une recherche heuristique par date — une première tentative par date a révélé un piège : rejouer le backtest avec gestion active décale QUELS signaux entrent, parce que la durée de vie des trades précédents change ; voir plus bas), puis calcule pour chacun (a) le MFE réel (jusqu'où le prix est allé avant de retourner) et (b) le swing H4 le plus proche confirmé avant l'entrée, du même côté que la cible :

| Date | MFE atteint | Swing H4 le plus proche | Cohérent avec l'hypothèse? |
|---|---|---|---|
| 2019-02-26 | 4.55R | 0.29R | ❌ prix a traversé le swing sans réagir |
| 2019-04-05 | 3.04R | 2.78R | ✅ seul cas cohérent |
| 2022-11-11 | 3.21R | 0.41R | ❌ |
| 2023-01-03 | 4.18R | 0.92R | ❌ |
| 2025-01-13 | 4.74R | 2.49R | ❌ swing nettement plus proche que le vrai retournement |

**1 cas cohérent sur 5.** Le swing H4 le plus proche ne prédit pas où le prix retourne réellement — dans 4 cas sur 5, le prix a traversé ce niveau largement avant de finalement faire demi-tour. **Conclusion : abandonner cette piste précise (swing H4 comme prédicteur) — pas assez de preuve pour la coder sans risquer de calibrer un seuil sur du bruit (5 points, aucune signification statistique).** La théorie ICT "draw on liquidity" n'est pas invalidée en soi, juste cette implémentation simple (swing le plus proche, une seule timeframe).

**Découverte annexe en cours de route** : sur ce dataset, 141 trades entrent à 1:3 fixe mais seulement 140 à 1:5 fixe — un signal (7 nov. 2019) qui entre en trade dans le run 1:3 ne trouve JAMAIS l'occasion d'entrer dans le run 1:5, parce qu'une position antérieure y reste ouverte plus longtemps (cible plus loin) et bloque l'entrée suivante (règle "une seule position ouverte à la fois"). Le multiple R:R choisi influence donc indirectement QUELS signaux ont même la chance d'être pris, pas seulement comment ils se terminent — à garder en tête pour toute comparaison future entre configs à cible différente.

### Suite — gestion active (breakeven/partiel/pyramide) testée à +3R avec cible 1:5, comme piste alternative

Sur les 5 trades de retournement eux-mêmes (calcul à la main, entrée/stop tenus fixes pour éviter le piège de dérive d'entrée découvert ci-dessus) :

| Mode | Résultat sur les 5 trades |
|---|---|
| Breakeven à +3R | 0.00R (scratch — sauve la perte, aucun gain capturé) |
| **Partiel 50% à +3R + breakeven** | **+1.50R (meilleur des trois)** |
| Pyramide (+1 lot à +3R, stop partagé) | **-3.00R (pire que ne rien faire!)** — la 2e unité entre à +3R avec son propre risque ; quand le prix retourne à l'entrée d'origine (stop partagé), c'est une vraie perte de -3R pour CETTE unité, pas juste une neutralisation |

**Mais ça ne tient PAS une fois testé sur tout le dataset (train 2019-2023 / test 2024-2025), pas seulement ces 5 trades :**

| Config US100 | Train | Test |
|---|---|---|
| 1:3 fixe (validé) | 0.79R | 0.70R |
| **1:5 fixe (déjà le résultat le plus fort connu)** | **1.38R** | **1.44R** |
| Breakeven à +3R, cible 1:5 | 1.26R | 1.47R |
| Partiel à +3R, cible 1:5 | 1.18R | 1.35R |

Sur US100, le 1:5 fixe simple reste le meilleur choix — la gestion active fait PIRE en train (1.26/1.18 vs 1.38) et à peine mieux en test (1.47 vs 1.44), pas assez pour compenser. **Leçon méthodologique explicite : un pattern prometteur sur 5 trades isolés ne se généralise pas forcément à l'ensemble — exactement le piège de data-snooping que la discipline de ce projet essaie d'éviter partout ailleurs.**

**Découverte annexe utile, différente de ce qu'on cherchait** : sur US500, le breakeven à +3R (cible 1:5) BAT le 1:5 fixe sur les DEUX périodes (train 1.10R vs 1.02R, test 1.33R vs 1.13R) — signal réel, pas testé plus loin cette session, à garder en réserve pour une future piste dédiée (pas un ajout automatique à la config actuelle, un seul découpage historique comme toujours).

**Conclusion finale pour la config actuelle : rien ne bat le 1:5 fixe déjà en place pour US100.** Les 5 trades de retournement restent une perte réelle mais rare (5/141 ≈ 3.5%) et, avec ce qu'on a testé jusqu'ici, non évitable sans sacrifier plus qu'on ne gagnerait ailleurs. Aucun changement de code proposé suite à cette recherche — statu quo justifié empiriquement, pas juste par défaut.

## ⚠️ INCIDENT DE PRODUCTION (2026-09-09) — site injoignable ~10 min à répétition : rapport O(n²) qui saturait le CPU

**Symptôme rapporté** : « le site a un vrai problème de démarrage… à plusieurs reprises il veut pas monter. Ça fait 10 minutes et je ne peux pas monter sur le site. »

**Diagnostic (métriques Render, pas une supposition)** :
- CPU **collé exactement à la limite du plan gratuit (0.15)** en continu à partir de 12:16, sans redescendre — pendant que 12:13-12:15 était au repos (0.003-0.008).
- Mémoire qui monte lentement (85 → 126 MB) — donc pas un OOM.
- **Zéro requête HTTP terminée** dans les logs. Aucune erreur, aucun crash : le process tournait, mais l'event loop était affamé.

**Cause racine** : `/api/recent-performance` appelait `buildRecentPerformanceReport()`, qui rejouait l'historique via `engine.ingestCandle()` **une fois par bougie**. Or chaque appel reconstruit tout le moteur filtré et rejoue TOUT l'historique retenu (design « rebuild-and-replay » de `liveStrategyEngine.js`) → le rapport était **O(n²)** : ~8600 bougies × 3 symboles ≈ **224 millions d'étapes internes**.

Mesuré (pas estimé) : **~60 s en local** à la taille réelle de production — extrapolation quadratique cohérente depuis 3 tailles (500/1000/1500 bougies : 69 s / 54 s / 58 s). Sur le CPU bridé de Render (0.15), cela représente **~10-20 minutes pour UN seul calcul**.

**Ce qui transformait ça en spirale de mort** : le cache n'est écrit qu'une fois le rapport TERMINÉ. Le dashboard sonde cet endpoint **toutes les 120 s** → pendant qu'un calcul de 10-20 min tournait, chaque sondage en démarrait un NOUVEAU par-dessus. Tous se disputaient les mêmes 0.15 CPU et se ralentissaient mutuellement → la file ne se vidait jamais. **Ouvrir le dashboard tuait le service de façon fiable et reproductible.**

**C'est le MÊME piège O(n²) déjà corrigé deux fois dans ce projet** (le warm-up au boot, puis `chartOverlays.js`). `recentPerformanceReport.js` n'avait simplement jamais été migré vers `warmUp({ onEvent })`.

**Correctifs appliqués** :
1. `recentPerformanceReport.js` migré vers `warmUp({ onEvent })` (chemin O(n), déjà prouvé bit-pour-bit équivalent au replay séquentiel par le test d'équivalence existant). **Mesuré à la taille réelle de production (8639 × 3 symboles) : 99 ms**, contre ~60 s avant.
2. `forwardTest.js` : même bug latent (écrit plus tôt le même jour), même correctif — cet endpoint aurait figé le service de la même façon s'il avait été appelé.
3. `server.js` : garde-fou « in-flight » sur `/api/recent-performance` — au plus UN calcul à la fois, les appels concurrents attendent la même promesse. Le passage en O(n) rend chaque calcul trivial ; ce garde-fou rend l'empilement **structurellement impossible** quel que soit le coût futur.
4. `KEEP_ALIVE=true` activé sur Render (il était codé depuis longtemps mais **jamais activé** — d'où aussi les démarrages à froid à chaque visite après 15 min d'inactivité). Ping borné aux heures de marché, donc compatible avec le quota d'heures du plan gratuit.
5. `CTRADER_ACCOUNT_ID=48587457` épinglé (les logs le suggéraient eux-mêmes) — évite un aller-retour de découverte à chaque boot.

**Discipline appliquée** : le gain de vitesse ne vaut que si la SORTIE est inchangée. Vérifié byte-pour-byte sur données réelles avant/après, puis **verrouillé par un test de non-régression permanent** qui exécute l'ancienne boucle par-bougie comme implémentation de référence et compare en `deepEqual`. 292/292.

**Leçon pour la suite** : tout endpoint qui rejoue l'historique DOIT utiliser `warmUp({ onEvent })`, jamais `ingestCandle()` en boucle. Et tout cache écrit-après-calcul sur un endpoint sondé périodiquement a besoin d'un garde-fou in-flight, sinon il s'empile.

### Suite — `KEEP_ALIVE_WINDOWS` : garder le bot éveillé UNIQUEMENT aux heures où il trade réellement

Question d'Esdras juste après : « où se trouve la majorité de nos trades ? On pourrait programmer le keep-alive uniquement dans les heures où on a le plus de chance d'avoir un trade. »

**Répondu empiriquement** (rejeu de la config de production exacte sur 2019-2025, 1120 entrées non bloquées, réparties par heure NY réelle DST-aware et par jour) — pas au jugé :

| Source | Où elle tire vraiment |
|---|---|
| **FVG** (le cœur validé) | **100 % entre 07h et 10h NY, lun-ven** — zéro ailleurs. Ses filtres de session la contraignent déjà. |
| **NWOG** | **351 sur 361 le DIMANCHE, 18h-19h NY** — c'est le gap de réouverture hebdomadaire. |
| **Divergence** | Étalée sur les 24 h — seule source sans filtre de session, et donc la seule raison pour laquelle le gate actuel était 24/5. |

**Arbitrage mesuré** pour `Mon-Fri@06:30-12:00,Sun@17:00-22:00` :

| | Trades | Total R | Espérance | Heures/sem |
|---|---|---|---|---|
| Couverture 24/5 précédente | 1120 | +651 R | 0.581 R | 120 h |
| **Fenêtre resserrée** | **926** | **+595 R (91 %)** | **0.643 R** | **30 h (−75 %)** |
| Ce qui est coupé | 194 | +56 R | 0.289 R | — |

**Les trades gardés sont de MEILLEURE qualité** (0.643 R vs 0.289 R), et **aucune entrée FVG n'est jamais perdue** — les 194 coupées sont de la Divergence (184) plus 10 NWOG isolées. Ce n'est pas gratuit pour autant : +56 R sur 7 ans ≈ **+8 R/an abandonnés**, dit clairement plutôt que présenté comme sans coût.

**Implémentation** (`keepAlive.js`) :
- `parseKeepAliveWindows()` : parseur pur pour des segments `Jour[-Jour]@HH:MM-HH:MM` en heure de New York. Les plages de jours peuvent enjamber la fin de semaine (`Fri-Mon`). **Rejette explicitement** une fenêtre qui traverse minuit (message actionnable : la découper en deux), un jour inconnu, une heure hors bornes — jamais d'analyse silencieusement fausse.
- `isWithinKeepAliveWindows()` : prédicat pur, DST-aware, **fail OPEN** si la sortie locale n'est pas reconnue — même choix défensif que `isMarketOpen()`.
- Quand `KEEP_ALIVE_WINDOWS` est défini, il **remplace** le gate heures-de-marché (il est strictement plus étroit par construction). **Un spec malformé émet un warning et retombe sur le gate PLUS LARGE** : une faute de frappe doit coûter des heures d'instance, jamais laisser le bot endormi pendant une session de trading.
- +8 tests (301/301) : minutes de bordure exactes (06:00 vs 06:30, 12:00 vs 13:00), fenêtre NWOG du dimanche, samedi, plage de jours qui enjambe, chaque rejet du parseur, et le repli sur spec malformé. Les timestamps de fixture sont écrits avec leur équivalent NY pour qu'une régression DST ne passe pas inaperçue.

**Variables d'environnement Render actives** : `KEEP_ALIVE=true`, `KEEP_ALIVE_WINDOWS=Mon-Fri@06:30-12:00,Sun@17:00-22:00`, `CTRADER_ACCOUNT_ID=48587457`.

**Marge volontaire** : la fenêtre démarre à 06:30 alors que le premier FVG tire à 07h — le réveil (boot + warm-up + connexion cTrader) prend ~20-25 s et les pings sont espacés de 10 min, donc cette demi-heure garantit que le bot est chaud avant la première entrée possible.

**Si Esdras veut plus de couverture** (chiffré sur les mêmes données) : `Mon-Fri@06:00-13:00,Sun@17:00-22:00` = 85 % des entrées pour 40 h/sem ; `Mon-Fri@06:00-22:00,Sun@17:00-23:00` = 97 % pour 86 h/sem. Le passage à 24/5 ne rachète que les ~3 % restants pour 34 h/sem de plus.

## Forward-test 2026 sur données RÉELLES cTrader (2026-09-09, à la demande explicite d'Esdras)

"Peux-tu tester mon bot sur les 8 derniers mois qui viennent de passer?" — un vrai test out-of-sample, sur des données qui n'existaient pas quand la config a été choisie (2019-2025). Nécessitait d'exporter l'historique récent depuis le VRAI compte cTrader (ni les CSV 2019-2025 ni l'historique en mémoire du bot live — capé à 90 jours — ne couvraient cette période) :

- Ajouté `getHistoricalCandles()` (`cTraderDataSource.js`) + `GET /api/admin/export-candles?symbol=X&days=N&token=...` (`server.js`, gated par `ADMIN_EXPORT_TOKEN`, opt-in) — réutilise la connexion cTrader déjà active en prod, cTrader accepte jusqu'à 35 semaines (~245 jours) en une requête. Session de code n'a PAS d'accès réseau direct à onrender.com (bloqué par la politique d'organisation, confirmé avec curl ET WebFetch) — Esdras a dû visiter les 3 URLs elle-même dans son navigateur pour télécharger les CSV, puis me les partager.
- Données obtenues : 2026-02-05 → 2026-09-09 (~7 mois), sauvegardées dans `data/forward-test-2026/`.
- Config de PRODUCTION utilisée telle quelle (`CONFIG.fvg.perSymbol` — rrMultiple 5/5/4) — pas de nouveau grid-search, script `scripts/runForwardTest2026.js`.

**Résultat (détail complet : `data/forward-test-2026/results.md`)** :

| Symbole | Signaux net | Win rate net | Total R net |
|---|---|---|---|
| US100 (1:5) | 3 | 66.7% | **+8.62R** |
| US500 (1:5) | 4 | 75.0% | **+13.34R** |
| XAUUSD (1:4) | 7 | 14.3% | **-2.15R** |
| **Portefeuille** | **14** | | **+19.81R** |

**US100/US500 : très positifs, cohérents avec le backtest 2019-2025 (win rate 66-75% dans la fourchette attendue), mais échantillon minuscule (3-4 trades) — direction confirmée, pas une preuve statistique.**

**XAUUSD : signal d'alerte réel.** 1 seul gain sur 7 (14.3%), sous le seuil de rentabilité mécanique à 1:4 (20%), résultat net négatif sur la période. Cohérent avec ce qui était déjà su (XAUUSD = le plus fragile des trois, seul instrument dont l'edge redonne du terrain à 1:5). Ne justifie PAS de couper XAUUSD sur la base de 7 trades seuls, mais mérite une vigilance accrue sur les prochains mois plutôt qu'une confiance égale aux deux autres.

**Effet de bord utile** : construire ceci a aussi produit une PWA installable (voir section dédiée plus bas) — demandé par Esdras en cours de route pour accéder plus facilement au dashboard depuis son téléphone.

**Statut : information, aucun changement de config décidé.** L'endpoint `/api/admin/export-candles` reste déployé (gated par token) — utile pour un futur forward-test similaire sans tout reconstruire.

### Suite (même jour) — "et si on retire le netting, et on accepte 2 positions à la fois?" TESTÉ, REJETÉ

Question posée après avoir vu le faible nombre de trades du forward-test. Nouvelle fonction `runBacktestMultiPosition()` (`backtestEngine.js`, +3 tests) — identique à `runBacktest()` (mêmes signaux/entrées/stops), seule la règle d'ouverture change : jusqu'à `maxConcurrentPositions` positions simultanées au lieu d'une seule. `maxConcurrentPositions=1` reproduit `runBacktest()` bit-pour-bit (test d'équivalence). Script `scripts/runMultiPositionAnalysis.js`, config de production inchangée (rrMultiple 5/5/4).

| Symbole | Positions | Signaux train/test | R net moyen train/test | Max DD train/test* |
|---|---|---|---|---|
| US100 | 1 | 68/38 | 1.38/1.44 | 5.79/5.40 |
| US100 | 2 | 79/44 (+16%) | **1.33/1.23 (pire)** | 8.31/7.63 (pire) |
| US500 | 1 | 70/30 | 1.02/1.13 | 8.96/10.42 |
| US500 | 2 | 80/33 (+14%) | **0.75/1.10 (pire)** | 11.22/11.55 (pire) |
| XAUUSD | 1 | 82/41 | 0.88/0.61 | 6.80/6.20 |
| XAUUSD | 2 | 108/58 (+32%) | **0.77/0.46 (pire)** | 8.51/8.42 (pire) |

*avec 2 positions, le max drawdown est une BORNE BASSE — le calcul ne capture pas les 2R de risque réellement exposés simultanément (voir la mise en garde dans le code).

**Verdict : plus de trades, mais de moins bonne qualité en moyenne, sur LES TROIS instruments, train ET test.** Le netting ne bloque pas des signaux au hasard — il bloque spécifiquement les signaux qui arrivent pendant qu'un trade est déjà en cours, et ces signaux-là sont en moyenne plus faibles (probablement des configurations redondantes dans une période déjà volatile, pas des opportunités vraiment distinctes). Rejeté.

**Et sur le forward-test 2026 spécifiquement — ça n'aurait même pas aidé l'observation qui a motivé la question** : US100 et US500 obtiennent EXACTEMENT le même nombre de trades (3 et 4) avec 1 ou 2 positions — aucun chevauchement ne s'est produit sur ces 7 mois, donc le netting n'était PAS le facteur limitant pour ces deux instruments. XAUUSD gagne 1 trade de plus (7→8) mais le résultat empire (-2.15R → -3.17R, win rate 14.3%→12.5%) — plus de trades, mais encore pire.

**Conclusion : le faible nombre de trades vient de la sélectivité voulue de la config (fenêtre de session étroite + biais HTF + structure + sweep), pas du netting.** Retirer le netting ajoute du risque (jusqu'à 2R simultané) sans ajouter de qualité. Aucun changement de code déployé.

## NWOG intégré en mode ALERTE (Phase 1) — 2026-09-09, même session

Suite directe du problème "trop peu de trades" : au lieu de retirer le netting (rejeté ci-dessus), vérifié si NWOG (déjà identifié comme "le résultat le plus crédible de la recherche de nouvelles stratégies", voir plus bas) tiendrait sur les données 2026 fraîchement exportées. **Confirmé, et de façon frappante** : sur US100, mêmes 7 mois que le forward-test :

| | Trades | Win rate | Espérance |
|---|---|---|---|
| FVG (déjà en prod) | 3 | 66.7% | +8.62R total |
| NWOG (nouveau) | 30 | 33.3% | 0.28R/trade, +8.31R total |

**10x plus de trades**, espérance cohérente avec l'historique (train 0.15R, test 0.34R, 2026 0.28R — squarely entre les deux, pas un coup de chance). Mécanisme totalement indépendant du FVG (gap de réouverture hebdomadaire, pas un Fair Value Gap), donc un vrai AJOUT de fréquence, pas une dilution.

**Décision explicite d'Esdras après discussion** : pas d'exécution automatique tout de suite (aucune exécution réelle jamais testée, risque de tail spécifique au pari "le gap se comble" en cas de vraie actualité macro un week-end, séries de pertes attendues à 33% de win rate). Plan en 3 phases retenu :
1. **Phase 1 (codée maintenant)** : NWOG comme source de signal indépendante, alerte seulement, visible dashboard.
2. **Phase 2 (4-6 semaines de vraies alertes)** : pas pour re-prouver l'edge (déjà 344 trades sur 3 périodes indépendantes), juste pour valider la QUALITÉ D'EXÉCUTION (prix d'entrée atteignable, détection de gap propre).
3. **Phase 3** : décision (prise manuelle par Esdras, ou `autoExecute` spécifique à NWOG) selon ce que Phase 2 montre.

**Implémentation (Phase 1)** :
- `src/liveStrategyEngine.js` : nouvelle source `nwog`, avec sa PROPRE map `nwogPositions` — délibérément SÉPARÉE de `openPositions` (le vrai netting FVG/Divergence). Une alerte NWOG ne peut jamais bloquer un vrai signal FVG en prenant sa place. `_processNwogCandidate()` vérifie quand même `openPositions.has(symbol)` (blockedReason 'netting') pour prévenir l'utilisatrice si une vraie position est déjà ouverte — mais ne s'y ajoute pas elle-même. Auto-dédoublonnage via `nwogPositions` (blockedReason 'nwog-already-open'). Réutilise `detectNwogEvents()` (`src/backtest/nwog.js`) telle quelle, aucune réimplémentation.
- `nwogConfig` volontairement PAS défaulté dans le constructeur (contrairement à `fvgConfig`/`divergenceConfig`) — opt-in explicite, seul `store.js` (le VRAI moteur live) le passe. Les 3 autres instanciations (`chartOverlays.js`, `forwardTest.js`, `recentPerformanceReport.js`, tous des moteurs de replay/rapport jetables) restent inchangées, pas de NWOG qui se mélange dans "ce que le bot aurait fait".
- `src/config.js` : `CONFIG.nwog` — scope US100 UNIQUEMENT (le seul instrument où NWOG tient vraiment ; les 4 autres étaient plus faibles/rejetés).
- `public/index.html` : signals NWOG étiquetés distinctement "NWOG · observation" (pas confondu visuellement avec FVG/Divergence).
- Tests : +5 (détection, résolution win/loss, netting vs vraie position, auto-dédoublonnage) + étendu le test d'équivalence bulk-warmUp/séquentiel existant pour couvrir NWOG aussi. 291/291.

**Statut initial : déployé, mode observation actif. Aucune exécution automatique. Revoir dans 4-6 semaines (Phase 2).**

### Suite (même jour) — Esdras demande l'exécution automatique complète directement, saute Phase 2/3

Message d'Esdras : *"jvais pas te mentir, rend tout automatique, lexecution, je vais pas avoir le temps pour trader. IL doit etre comme un passive income."*

**Tension réelle identifiée avant d'agir** : le plan Phase 2 (4-6 semaines d'alertes) supposait qu'Esdras prendrait les trades manuellement pour valider la qualité d'exécution. Si elle n'a pas le temps de trader manuellement, cette vérification ne peut PAS se faire sans automatiser directement — ce qui élimine la période de contrôle prévue. Risques déjà nommés explicitement avant sa confirmation : aucun historique d'exécution réelle, risque de queue spécifique au pari "le gap se comble" (une vraie actualité macro un week-end peut faire dévier fortement), séries de pertes attendues à 33% de win rate, personne pour repérer un problème technique répété.

**Clarification importante en cours de route** : Esdras a demandé "tu dis que personne ne surveille pour couper — les trades n'ont aucun stop loss?" — NON, chaque trade a TOUJOURS un stop loss/take profit attaché directement à l'ordre envoyé au courtier (protection appliquée côté COURTIER, pas par ce process — survit même si le bot plante). Le risque nommé était à un niveau différent : un bug de détection/exécution qui se répète sans que personne ne le remarque avant plusieurs trades, pas une position sans protection.

**Proposition de compromis (garde-fou renforcé pour NWOG seul) refusée** — Esdras choisit explicitement "auto complet, mêmes règles que FVG/Divergence", pas de risque réduit ni de coupure automatique spéciale.

**Implémentation (refactor du Phase 1)** :
- `_processNwogCandidate()` (`liveStrategyEngine.js`) réécrit pour écrire dans le VRAI `openPositions` (netting réel partagé avec FVG/Divergence) au lieu de la map séparée `nwogPositions` — supprimée entièrement, ainsi que `_resolveNwogPosition()` et `getNwogPosition()`. NWOG est maintenant un pair complet de FVG/Divergence, résolu par le même `_resolveOpenPosition()` générique.
- **Bug réel trouvé et corrigé avant activation** : le signal NWOG ne portait pas `suggestedSide` (requis par `_handleAutoExecuteEntry` pour soumettre le vrai ordre — `signal.suggestedSide.toUpperCase()` aurait planté sur `undefined`). Ajouté (`bullish → 'buy'`, `bearish → 'sell'`), vérifié par un test de bout en bout simulant exactement ce que l'exécution automatique lit.
- Ordre soumis en **MARKET** (comme Divergence, pas LIMIT comme FVG) — `isFvg` dans `_handleAutoExecuteEntry`/`matchTraderDataSource.js` était déjà source-agnostic (`!isFvg → MARKET`), donc aucun changement nécessaire là, seulement documenté. **Limite d'exécution connue et assumée, pas cachée** : l'événement spot en live n'arrive qu'une fois la bougie M15 COMPLÈTE, donc l'ordre MARKET est soumis après que le prix a déjà dérivé par rapport à `entryPrice` (l'open de cette bougie) — surtout pertinent juste après un gap de week-end, quand la volatilité est élevée. Même approximation déjà faite pour Divergence, pas nouvelle, mais sans historique NWOG pour confirmer l'ampleur réelle.
- **Alertes demandées par Esdras** ("pour que je puisse le voir et vérifier") — déjà existantes génériquement (push ntfy à chaque signal actionnable + à chaque exécution soumise), mais **2 bugs d'étiquetage trouvés et corrigés** : `_notify()` et le dashboard (`index.html`) avaient un label codé en dur `source === 'divergence' ? 'divergence' : 'FVG'` qui aurait affiché NWOG comme "FVG" par erreur (dans `cTraderDataSource.js` ET `matchTraderDataSource.js`, les deux corrigés). Message de confirmation d'exécution (`_notifyText`) et le `label` de l'ordre envoyé au courtier incluent maintenant la source (`[NWOG]`, visible aussi directement dans l'historique d'ordres cTrader, pas seulement dans la notification push).
- Tests réécrits pour le nouveau comportement (netting partagé au lieu de dédoublonnage séparé) : 291/291.

**Statut final : NWOG en exécution automatique complète, US100 seulement, mêmes règles que FVG/Divergence. Décision consciente d'Esdras après discussion des risques.**

## Résultats MITIGÉS — pas encore prêt pour la production (vérifications supplémentaires nécessaires)

- **Judas Swing ICT (killzone Londres)** — NOUVEAU (session 2026-09-06, suite, à la demande explicite de continuer sur un concept ICT puisque c'est de là que vient la seule stratégie pleinement validée). Concept ICT publié jamais testé jusqu'ici, différent de l'Order Block/IFVG/Turtle Soup déjà rejetés et du FILTRE liquidity sweep déjà en place sur le FVG (celui-là utilise un pivot fractal à toute heure ; celui-ci utilise le plus-haut/plus-bas de la VEILLE (PDH/PDL), limité à la killzone Londres ICT 02h-05h NY). Signal = mèche qui dépasse le PDH/PDL PUIS clôture de l'autre côté, même bougie (même convention que `liquiditySweep.js`), un signal par direction par jour max. Entrée à l'ouverture de la bougie suivante, stop à l'extrême du sweep, cible fixe 1:3, timeout 480 bougies M15 (conventions déjà utilisées ailleurs, rien inventé pour la sortie). Testé sur les 5 instruments. Résultat, contrairement à tout ce qui a été testé récemment, MITIGÉ plutôt que clairement négatif :
  - US100 : ✅ tient (train n=360, exp=0.08R ; test n=142, exp=0.04R)
  - EURUSD : ✅ tient (train n=532, exp=0.04R ; test n=163, exp=0.15R)
  - US500 : ⚠️ affaibli (train n=346, exp=-0.16R ; test n=140, exp=+0.04R — train négatif, test positif : signe probable de bruit plutôt que d'edge réel)
  - XAUUSD : ⚠️ affaibli (train n=282, exp=-0.11R ; test n=149, exp=+0.03R — même remarque)
  - GBPUSD : ❌ ne tient pas (train n=434, exp=0.05R ; test n=152, exp=-0.24R)
  
  **Pourquoi ce n'est PAS ajouté au combo malgré 2 "✅ tient" sur 5** : les espérances qui "tiennent" sont très faibles (0.04-0.15R, contre 0.7-2R+ pour le FVG/Divergence déjà validés), le taux de gain reste bas (24-33%) avec un profit factor à peine au-dessus de 1 (1.05-1.19) — un edge minuscule, pas franchement distinct du bruit, alors que le volume de trades est élevé (140-530 par cellule).

  **Vérifications supplémentaires faites (session suivante, à la demande explicite de creuser)** :
  - *Chevauchement avec le FVG déjà en place (US100)* : seulement 6.1% des jours de signal Judas Swing tombent aussi un jour de signal FVG (33/539) → l'edge (faible) n'est PAS une redite du FVG, c'est un signal réellement distinct.
  - *Distribution annuelle US100 (brut, avant coûts)* : 2019 0.24R, 2020 0.25R, 2021 0.33R, 2022 0.08R, 2023 0.01R, 2024 0.21R, 2025 -0.06R — tendance clairement DÉCROISSANTE dans le temps (fort en 2019-2021, quasi nul 2022-2023, rebond 2024, négatif 2025). Signature d'un edge qui s'estompe, pas d'un edge stable — la conclusion "✅ tient" formelle (basée sur TRAIN 2019-2023 vs TEST 2024-2025 agrégés) masque cette dégradation année par année. **US100 doit être considéré plus fragile que le verdict formel ne le suggère.**
  - *Distribution annuelle EURUSD (brut, avant coûts)* : positif 6 années sur 8 (2018 0.38R, 2019 0.41R, 2022 0.38R, 2023 0.10R, 2024 0.41R, 2025 0.35R), négatif seulement 2020-2021 (-0.06R, -0.08R, période COVID/taux bas). Les deux années TEST (2024, 2025) sont TOUTES DEUX solidement positives avant coûts. **EURUSD est le résultat le plus crédible de ce lot** — d'autant qu'aucune stratégie n'est actuellement en production sur EURUSD (pas de conflit de netting, un ajout ici serait un vrai incrément, pas une dilution).
  
  **Conclusion mise à jour : ni rejeté, ni recommandé pour du capital réel — mais EURUSD est un candidat sérieux pour un forward-test démo (voir "prochaines étapes"), US100 est à surveiller avec méfiance vu la tendance décroissante.** Détail : `data/backtest-input/judas-swing-strategy-analysis.md`, code : `src/backtest/judasSwing.js` (7 tests unitaires), script : `scripts/runJudasSwingStrategyAnalysis.js`.

- **Asian Range Breakout ICT** — NOUVEAU (même session, deuxième concept ICT ajouté à la demande de continuer la recherche). Contrairement au Judas Swing (reversal), celui-ci est un mécanisme de CASSURE/continuation : la killzone asiatique ICT (20h-00h NY, jamais utilisée ailleurs dans ce projet) forme un range ; la première bougie qui clôture au-delà de ce range pendant la fenêtre 00h-05h (clôture asiatique → fin killzone Londres) déclenche un trade dans le sens de la cassure. Stop = côté opposé du range (même convention que l'ORB déjà rejeté, mais ORB utilise l'ouverture actions NY 09h30-10h00 et force une clôture le jour même — mécanisme et fenêtre différents). Cible fixe 1:3, timeout 480 bougies M15. Testé sur les 5 instruments :
  - US100 : ✅ tient (train n=783, exp=0.10R ; test n=326, exp=0.11R — test LÉGÈREMENT MEILLEUR que train, signe plutôt rassurant)
  - XAUUSD : ✅ tient (train n=639, exp=0.05R ; test n=253, exp=0.08R)
  - US500 : ⚠️ affaibli (train négatif -0.07R, test positif +0.04R)
  - EURUSD : ⚠️ affaibli (train négatif -0.04R, test positif +0.08R)
  - GBPUSD : ⚠️ affaibli (train négatif -0.03R, test positif +0.02R)
  
  Même profil que le Judas Swing : espérances faibles (0.05-0.11R), PF à peine >1 (1.07-1.16), mais volume de trades ENORME (639-1109 par cellule train — ce range se casse presque tous les jours). Vérifications : chevauchement avec le FVG déjà en place ~7-9% seulement (signal distinct) mais chevauchement avec le Judas Swing 32-38% (attendu, les deux dérivent d'extrêmes de range proches dans le temps — PAS indépendants l'un de l'autre, à ne jamais compter comme deux edges séparés dans un même combo). Distribution annuelle US100 : positif 5 années sur 7, y compris les deux années TEST (2024 0.14R, 2025 0.11R) — plus stable que le Judas Swing sur ce même instrument. XAUUSD : plus irrégulier (2024 test négatif -0.10R brut, compensé par 2025 fortement positif +0.33R — la conclusion "tient" sur XAUUSD est portée par une seule bonne année, à prendre avec précaution). **Conclusion : même statut que le Judas Swing — ni rejeté ni recommandé pour du capital réel ; US100 est ici aussi le résultat le plus stable des deux nouveaux concepts.** Détail : `data/backtest-input/asian-range-breakout-strategy-analysis.md`, code : `src/backtest/asianRangeBreakout.js` (7 tests unitaires), script : `scripts/runAsianRangeBreakoutStrategyAnalysis.js`.

**Bilan honnête de cette session de recherche** : sur 2 nouveaux concepts ICT testés, aucun n'approche l'ampleur de l'edge du FVG (0.7-2R+ d'espérance, PF nettement >1, taux de gain cohérent) — tous deux montrent une espérance minuscule (0.02-0.15R) avec un profit factor à peine positif. Le signal le plus crédible qui ressort : **EURUSD sur le Judas Swing** (positif 6/8 années, aucune stratégie concurrente sur cet instrument) et, dans une moindre mesure, **US100 sur l'Asian Range Breakout** (plus stable dans le temps que le Judas Swing sur le même instrument). Aucun des deux n'est proposé pour du capital réel — la discipline de ce projet (voir mise en garde épistémique) est justement de ne pas confondre "passe le test formel" avec "edge réel exploitable", surtout à cette magnitude.

- **NWOG (New Week Opening Gap)** — NOUVEAU (session 2026-09-09, à la demande explicite de continuer à chercher d'autres stratégies en ligne). Concept ICT publié (anthonyjohnson.dev, liquidityscan.io, icttraders.net, innercircletrader.net, convergents) jamais testé ici : pari sur le comblement du gap de week-end (le "vide" entre la dernière bougie du vendredi et la première à la réouverture). Gap détecté DIRECTEMENT depuis les horodatages réels des données (aucune heure de session codée en dur) — vérifié empiriquement que les vrais gaps de week-end de ce projet se regroupent entre ~24h et ~80h sur les 5 instruments, un seul point aberrant (~1 an, XAUUSD, qualité de donnée) exclu par la borne haute plutôt que traité comme un vrai gap. Direction = pari sur le comblement (gap haussier → trade baissier, et inversement), entrée une bougie après, stop au-delà de l'extrême de la bougie de gap, cible fixe 1:3, timeout 480 bougies M15. Testé sur les 5 instruments :
  - **US100 : ✅ tient nettement** (train n=224, WR 31.3%, PF 1.20, exp=0.15R ; test n=90, WR 35.6%, PF 1.49, exp=**0.34R** — le test est même MEILLEUR que le train, signe rassurant plutôt qu'un artefact).
  - **US500 : ✅ tient mais faible** (train exp=0.07R, PF 1.09 — à peine positif ; test exp=0.28R, PF 1.39).
  - GBPUSD : ✅ formellement "tient" mais train quasi NUL (exp=0.01R, PF 1.01) — à traiter comme du bruit, pas un signal, même si le test (0.18R) a l'air bien.
  - XAUUSD, EURUSD : ❌ ne tiennent pas (négatifs sur les deux périodes).
  - **Conclusion : US100 est le résultat le plus crédible de toute cette recherche de nouvelles stratégies cette session** — espérance comparable ou légèrement supérieure aux autres candidats "mitigés" déjà en liste (Judas Swing/EURUSD, Asian Range Breakout/US100). Ni rejeté ni recommandé pour du capital réel (même réserve épistémique que partout : un seul découpage train/test) — mais c'est le meilleur candidat pour un futur forward-test démo issu de cette session. Détail : `data/backtest-input/nwog-strategy-analysis.md`, code : `src/backtest/nwog.js` (8 tests unitaires), script : `scripts/runNwogStrategyAnalysis.js`.

- **Breaker Block (Order Block invalidé puis reconquis)** — NOUVEAU (même session). Distinct de l'Order Block déjà rejeté : celui-ci exige que la zone soit CASSÉE (invalidée) avant de trader un retest dans le sens OPPOSÉ (retournement), pas une mitigation dans le même sens que le BOS d'origine. Réutilise la détection BOS/swing déjà existante. Entrée au retest du niveau à 50% du corps du bloc, stop au-delà du bord opposé, cible fixe 1:3, timeout 480. Testé sur les 5 instruments :
  - US100 : ✅ tient mais modeste (train exp=0.18R PF1.23 ; test exp=0.09R PF1.12 — le test retombe à environ la moitié du train, encore au-dessus du seuil mais un edge qui s'affaiblit).
  - US500, EURUSD : ⚠️ affaiblis (train négatif, test légèrement positif — signature bruit déjà vue ailleurs, pas fiable).
  - XAUUSD, GBPUSD : ❌ ne tiennent pas.
  - **Conclusion : au mieux un signal modeste sur US100, rien d'exploitable ailleurs.** Pas recommandé, pas prioritaire pour un forward-test (plus faible que NWOG/US100 ci-dessus). Détail : `data/backtest-input/breaker-block-strategy-analysis.md`, code : `src/backtest/breakerBlock.js` (3 tests unitaires), script : `scripts/runBreakerBlockStrategyAnalysis.js`.

- **Power of Three / AMD, testé comme "fade du range asiatique"** — NOUVEAU (même session). Miroir exact de l'Asian Range Breakout déjà mitigé : même définition du range asiatique (réutilisée directement, pas réécrite), mais au lieu d'une clôture nette au-delà du range (continuation), exige un balayage PUIS une reconquête même bougie (comme liquiditySweep.js/Judas Swing) et trade dans le sens OPPOSÉ (fade/retournement). Testé sur les 5 instruments : **rejeté partout** — US100/US500 ⚠️ affaiblis (train légèrement négatif, test à peine positif, même signature bruit) ; XAUUSD/EURUSD/GBPUSD ❌ nettement négatifs sur les deux périodes. **Constat complémentaire intéressant** : ni la continuation (Asian Range Breakout, mitigé) ni le fade (celui-ci, rejeté) du range asiatique ne produisent d'edge net cohérent — le bord du range asiatique lui-même ne semble pas porter un signal fiable dans un sens ou dans l'autre sur ces données. Détail : `data/backtest-input/asian-range-fade-strategy-analysis.md`, code : `src/backtest/asianRangeFade.js` (8 tests unitaires), script : `scripts/runAsianRangeFadeStrategyAnalysis.js`.

## Ce qui a été TESTÉ et REJETÉ (ne pas retester sans nouvelle idée)

- **Turtle System 1** (20j entrée/10j sortie) : échoue sur indices, tient sur l'or seul.
- **Turtle System 2** (55j entrée/20j sortie) : a un vrai edge SEUL, mais rejeté du combo car sa longue durée de détention (médiane 21-25j, jusqu'à 160j) occupe ~46-47% des jours-instrument et bloque la Divergence via le netting bien plus qu'il n'apporte lui-même (leçon clé : l'impact d'un mécanisme sur le netting partagé dépend de sa DURÉE de détention, pas de sa fréquence).
- **ORB (Opening Range Breakout)**, brut et avec filtre de tendance EMA50 : négatif/quasi nul, rejeté.
- **Order Block ICT** : négatif malgré un très grand nombre de signaux.
- **IFVG (FVG inversé)** : quasi nul (train légèrement négatif, test légèrement positif) → "affaibli", pas retenu.
- **Turtle Soup (fausse cassure)** : négatif clairement sur les deux instruments/deux périodes.
- **RSI-2 empilé sur le combo déjà fort** (FVG x3 + Divergence + RSI-2) : légèrement PIRE que sans RSI-2 (2024 jour135 vs jour107) — leçon : une fois un combo déjà fort, ajouter un mécanisme de plus sur les MÊMES instruments contestés peut avoir un rendement marginal négatif.
- **Bollinger(20,2) + RSI(2) double confirmation (ma propre construction)**, testée avec deux sorties différentes : (a) retour à la SMA20 — taux de gain jusqu'à 65% en test (US500) mais espérance TRAIN plate/négative sur les 3 instruments → rejeté ; (b) sortie 1:3 fixe — taux de gain effondré à 0-10% (le signal n'a pas la portée nécessaire pour parcourir 3x la distance du stop avant le timeout de 10 jours), toujours non rentable partout. Leçon double : un taux de gain élevé seul ne veut rien dire si l'espérance ne tient pas en train, ET le RR choisi doit correspondre à la distance de parcours naturelle du signal.
- **DMI/ADX trend, OTE (Fibonacci Optimal Trade Entry), RSI(14) divergence classique** (testés par l'autre session ayant construit le bot) : les trois rejetés/marginaux, cohérent avec la discipline existante. Fichiers : `data/backtest-input/dmi-trend-strategy-analysis.md`, `ote-strategy-analysis.md`, `rsi-divergence-strategy-analysis.md`.
- **Divergence appliquée à EURUSD/GBPUSD** (même mécanisme que US100/US500 mais sur une autre paire) : testé par l'autre session, rejeté/marginal — la relation ne se généralise pas automatiquement à n'importe quelle paire corrélée. Fichier : `data/backtest-input/divergence-eurusd-gbpusd-analysis.md`.
- **FVG natif en H1** (au lieu de M15 avec agrégation) : avec la config déjà validée, s'effondre à seulement 5-18 trades train / 2-3 trades test par instrument → "❓ pas assez de trades" partout. Cause : la fenêtre de session (ex. Silver Bullet 10h-11h NY) ne capture plus qu'~1 bougie H1/jour au lieu de ~4 bougies M15/jour — le filtre devient presque dégénéré à cette granularité. Conclusion : rester en M15. Fichier : `data/backtest-input/fvg-h1-native-analysis.md`.
- **Comparaison de timeframe M15 vs H1 vs H4** (FVG brut, sans filtre, isolé pour tester une seule variable) : le taux de gain reste ~27-34% peu importe le timeframe testé — confirme que le taux de gain "bas" est une CONSÉQUENCE MÉCANIQUE du RR 1:3 (seuil de rentabilité à 25% avant coûts), PAS un artefact de bruit/granularité M15. Fichier : `data/backtest-input/timeframe-comparison-analysis.md`.
- **Confluence de liquidity sweep CROISÉE US100↔US500** (l'idée : un instrument fait le "sweep" du stop loss sur un swing high/low, l'autre tombe dans un FVG — les deux dans le même sens, celui qui tombe dans le FVG est le plus faible, c'est lui qu'on trade), en deux variantes : sweep sur le partenaire seul, et double confirmation (sweep exigé SUR LES DEUX à la fois). Résultat : les deux variantes "tiennent" individuellement en test (ex. double confirmation US100 exp=0.84R n=25 ; US500 exp=0.58R n=25), MAIS aucune ne bat proprement et de façon cohérente le filtre déjà en place (même instrument) sur les deux symboles à la fois. Décision : ne PAS changer le filtre existant — refus explicite de choisir "le meilleur variant par instrument" après coup (ç'aurait été du cherry-picking). Fichier : `data/backtest-input/cross-pair-sweep-confluence-analysis.md`.
- **Exclusion de jours calendaires** (lundi, vendredi, jours fériés NYSE, jours NFP/FOMC/CPI réels — sourcés directement des calendriers officiels Fed/BLS, jamais d'un proxy de volatilité réalisée a posteriori, ce qui serait du lookahead), 9 variantes testées x 3 instruments : les jours fériés n'ont pratiquement aucun effet partout ; exclure NFP/FOMC/CPI individuellement donne des effets INCOHÉRENTS selon l'instrument (parfois ça dégrade même le TRAIN, ex. US100 sans NFP : train 0.79→0.53R) ; exclure lundi+vendredi aide US500 en test (0.70→1.79R) mais nuit à XAUUSD (0.48→0.20R) ET l'échantillon est trop mince (n=16) pour trancher ; la combinaison "tout exclure" montre la signature classique du surapprentissage — excellent en TRAIN (0.78-1.09R) mais dégradé/peu fiable en TEST (XAUUSD 0.12R, US100 0.45R, tous deux pires que la référence ; US500 2.11R mais n=10, trop mince). **Conclusion : ne rien ajouter en production.** Fichier : `data/backtest-input/calendar-exclusion-analysis.md`.
- **Croisement MACD (Appel)** — NOUVEAU (session 2026-09-06, suite) : système de suivi de tendance publié, mécanisme différent de l'ADX/DMI déjà testé (écart entre deux EMA de prix, pas dominance directionnelle). Paramètres d'Appel eux-mêmes (12/26/9), stop 2xATR(14), sortie stop ou croisement opposé (retournement direct), aucune cible R:R ni plafond de durée — même philosophie que DMI. Testé sur les 5 instruments. Résultat : ne tient nulle part. US100 ❌ (train quasi nul -0.01R, test -0.25R). US500 ❌ (train quasi nul 0.01R, test -0.17R). EURUSD ❌ (train -0.07R, test -0.21R). GBPUSD ❌ (train -0.03R, test -0.14R). XAUUSD ⚠️ affaibli (train négatif -0.03R, test positif +0.26R — train négatif reste le signal le plus fiable, probablement du bruit vu le peu de trades train/test dans ce régime). Conclusion : encore un mécanisme de suivi de tendance publié qui ne capture pas d'edge net une fois les coûts appliqués — cohérent avec le rejet de DMI/Turtle System 1 sur les mêmes instruments (le "croisement de moyennes/indicateur" en suivi de tendance pur ne semble pas fonctionner sur ces données, peu importe la variante). Détail : `data/backtest-input/macd-trend-strategy-analysis.md`, code : `src/backtest/macdTrend.js` (testé, 5 tests unitaires), script : `scripts/runMacdTrendStrategyAnalysis.js`.
- **SMT Divergence ICT (Smart Money Technique)** — NOUVEAU (session 2026-09-09, à la demande explicite de continuer à vérifier d'autres stratégies disponibles en ligne). Recherche faite sur plusieurs sources ICT convergentes (road2fundedtrading.com, litefinance.org, fxopen.com, tradingfinder.com) avant d'écrire une ligne de code, comme pour Judas Swing/Asian Range Breakout. Concept distinct de tout ce qui existe déjà avec la paire US100/US500 : contrairement à la Divergence statistique déjà en production (qui trade l'ÉCART entre les deux), la SMT trade UN SEUL des deux instruments directionnellement, l'autre servant uniquement de confirmation structurelle à ses points de swing (fractal symétrique déjà utilisé par `marketStructure.js`/`liquiditySweep.js`, lookback=5) — et contrairement au filtre de confluence liquidity-sweep croisé déjà rejeté, ceci ne touche à aucun FVG. Méthode : divergence quand A dépasse son propre swing extrême précédent alors que B ne confirme pas au même point de swing ; entrée seulement après un Market Structure Shift sur A lui-même (même règle BOS que `marketStructure.js`) ; stop au-delà de l'extrême balayé ; cible fixe 1:3 ; timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Les deux sens testés (A=US100/B=US500 et le miroir), décidé à l'avance.
  - **Bug réel trouvé et corrigé avant de croire un seul chiffre** : la première exécution donnait une espérance train/test étonnamment positive (0.11-0.14R / 0.25-0.31R) mais avec un taux de gain (18-23%) sous le seuil mécanique de rentabilité à 1:3 (25%) — signe qu'un chiffre ne collait pas. Investigation : sur ~11% des signaux bruts, le stop (fixé au moment de la divergence) se retrouvait du MAUVAIS côté du prix d'entrée (ex. stop au-dessus de l'entrée sur un trade long) — un ordre stop-loss impossible à poser chez un vrai courtier, pas juste un mauvais trade. Cause : le niveau balayé (figé au moment de la divergence) et le swing opposé qui confirme le Market Structure Shift (suivi indépendamment) n'ont AUCUNE garantie de rester dans le bon ordre le temps que le MSS se déclenche. Corrigé à la source (`validStopSide` dans `src/backtest/smtDivergence.js`) : un signal dont le stop tomberait du mauvais côté de l'entrée est écarté, jamais gardé mal signé. Leçon générale (utile si une future stratégie combine deux niveaux de référence suivis indépendamment) : toujours vérifier que le stop résultant est bien du côté protecteur de l'entrée avant de compter un trade, ne jamais le supposer.
  - **Résultat après correctif** : US100 dirige (US500 confirme) : train n=547, WR 22.8%, PF 0.95, espérance **-0.03R** ; test n=210, WR 26.5%, PF 1.17, espérance +0.12R. US500 dirige (US100 confirme) : train n=505, WR 22.7%, PF 0.95, espérance **-0.04R** ; test n=200, WR 28.2%, PF 1.27, espérance +0.18R. Le TRAIN (le jeu censé trancher) est légèrement NÉGATIF dans les deux sens testés — PF sous 1, taux de gain sous le seuil de rentabilité mécanique — alors que le test est modestement positif. C'est le même profil "train qui ne passe pas la barre, test positif par chance" déjà vu (en miroir) ailleurs dans ce document, et un train négatif de façon cohérente dans les DEUX sens (pas juste un résultat mitigé isolé) est un signal de rejet plus net que Judas Swing/Asian Range Breakout (qui avaient au moins un train positif dans leurs cas "tient").
  - **Conclusion : rejeté** — un concept ICT publié et bien sourcé de plus qui ne produit pas d'edge net une fois testé rigoureusement sur ce couple d'instruments. Détail complet : `data/backtest-input/smt-divergence-strategy-analysis.md`, code : `src/backtest/smtDivergence.js` (6 tests unitaires), script : `scripts/runSmtDivergenceStrategyAnalysis.js`.
  - **Question légitime posée par l'utilisatrice après coup : ce bug touche-t-il les analyses déjà faites ?** Vérifié concrètement (pas supposé) sur chaque stratégie qui compte :
    - **FVG (production)** : entrée ET stop viennent de la MÊME zone, calculés au même instant — géométriquement impossible d'être mal ordonné. Vérifié empiriquement sur les 399 vrais trades de la config de production (US100+US500+XAUUSD, 2019-2025, `stopMode` fvg-edge ET swing) : **0 cas**.
    - **Divergence statistique (production)** : stop = `entrée − 1.5×ATR` avec ATR toujours positif (vérifié avant ouverture) — mathématiquement impossible d'être mal ordonné.
    - **Judas Swing** : 0 cas sur US100/XAUUSD/EURUSD/GBPUSD, mais **2 cas sur 577 trades (0.35%) sur US500** — même famille de cause (écart entre bougie de signal et bougie d'entrée), mais l'attente y est plafonnée à UNE bougie (contre une attente non bornée pour la SMT), donc ~30x plus rare. Ne change pas la conclusion déjà écrite (US500/Judas Swing déjà "⚠️ affaibli", jamais recommandé) — signalé pour l'honnêteté, pas corrigé (impact nul sur toute décision actuelle).
    - **Asian Range Breakout** : 0 cas sur les 5 instruments testés.
    - **Non audités** (Order Block, IFVG, Turtle Soup, OTE, DMI, MACD, RSI-2, Bollinger+RSI, Turtle System 1&2, ORB, RSI divergence classique) : déjà rejetés sur leur propre mérite, un même bug éventuel ne changerait aucune décision actuelle — pas vérifiés par manque de nécessité, pas par oubli.
    - **Conclusion : le combo FVG+Divergence réellement tradé n'est PAS affecté** — le bug était spécifique à la SMT Divergence parce que c'est la SEULE stratégie de ce projet avec une attente NON bornée entre signal et entrée (le Market Structure Shift peut prendre des dizaines de bougies) ; toutes les autres stratégies attendent au plus UNE bougie ou dérivent stop/entrée de la même donnée figée, ce qui rend ce mode de défaillance structurellement improbable ou impossible ailleurs.
  - **Pistes ICT vues pendant la recherche mais PAS encore codées** (candidats pour une future session, aucune priorité assignée) : Breaker Block (order block invalidé puis reconquis — variante du Order Block déjà rejeté, mécanisme d'entrée différent), NWOG/NDOG (gap d'ouverture de semaine/jour, idée de comblement de gap différente du FVG), Power of Three / AMD (accumulation-manipulation-distribution, modèle de session plus large qui recouperait probablement les fenêtres de session déjà utilisées comme filtre).
- **Weekly Liquidity Sweep (PWH/PWL)** — NOUVEAU (session 2026-09-10, suite à "on continue a Chercher de nouveau concept"). Même mécanique que Judas Swing (sweep + clôture de retour à l'intérieur), mais sur le plus haut/bas de la SEMAINE précédente plutôt que de la veille, sans restriction horaire (aucune killzone ICT canonique spécifique trouvée en recherche pour ce concept précis — cherché sur toute la semaine plutôt que d'inventer une heure non testée). Limites de semaine détectées depuis les horodatages réels (même technique que `nwog.js`), garde-fou `validStopSide` appliqué par précaution. Testé sur les 5 instruments, écran TRAIN/TEST identique à partout ailleurs. **Résultat : techniquement "tient" sur 2/5 (US100 train 0.09R→test 0.04R ; US500 train 0.06R→test 0.04R) selon la règle de verdict standard, mais l'édge est BEAUCOUP plus fin que NWOG sur les mêmes deux instruments (NWOG : test 0.34R/0.28R) — à peine positif, PF à peine au-dessus de 1 (1.05 sur les deux), et donc à haut risque d'être avalé par un coût de transaction légèrement sous-estimé ou par le hasard d'échantillonnage.** XAUUSD et GBPUSD rejetés franchement (test négatif), EURUSD affaibli (train négatif -0.21R, test positif +0.09R par hasard probable). **Décision : ne PAS activer en production** — passer la barre du verdict n'est pas suffisant en soi quand la marge est aussi mince ; pas assez convaincant pour justifier l'espace de netting qu'il prendrait sur un instrument (US100) qui porte déjà 3 sources live. Détail : `data/backtest-input/weekly-liquidity-sweep-strategy-analysis.md`, code : `src/backtest/weeklyLiquiditySweep.js` (11 tests unitaires), script : `scripts/runWeeklyLiquiditySweepStrategyAnalysis.js`.

## Analyse par régime de marché (bull/bear/range)

Classification ADX(14) Wilder + SMA(100) quotidienne, seuil ADX=25 (convention standard, décidée a priori). ~55-60% des jours sont en "range", ~25-30% en "bull", seulement ~10-12% en "bear" (peu de jours = prudence sur cette case). FVG et Divergence tiennent (espérance positive) dans LES TROIS régimes sur US100/US500 — pas de dépendance cachée à un seul type de marché. XAUUSD est même meilleur en range/bear qu'en bull (config différente : fenêtre Londres-NY + stop swing). RSI-2 est le plus faible en bear (0.04-0.07R). Fichier détaillé : `data/backtest-input/market-regime-analysis.md`.

## Pourquoi les traders institutionnels/le 1% des retraits gagnent (contexte, pas une action)

Statistiques industrie (sourcées web, track360.io / thepropfirmguide.com) : 5-14% des tentatives de challenge atteignent le statut financé ; ~45% des traders financés touchent au moins un retrait (~7% de tous les acheteurs de challenge) ; seulement ~1-3% deviennent des traders financés/payés de façon durable sur le long terme. La majorité des échecs précoces viennent de violations de la limite de perte journalière, pas d'un objectif de profit manqué — cohérent avec l'importance donnée ici au guardrail et au RR/gestion du risque plutôt qu'à la seule recherche d'un taux de gain élevé.

## Connecteur Match-Trader — écrit (2026-09-07), PAS testé en live, deux limites réelles découvertes

À la demande explicite ("écrire le connecteur `src/dataSources/matchTraderDataSource.js`"). Recherche faite sur la vraie documentation Match-Trader (docs.match-trade.com, PDF officiel) avant d'écrire une ligne de code — même discipline que pour cTraderDataSource.js (écrit contre la doc, jamais testé en vrai, chaque hypothèse non confirmée flaguée en commentaire dans le fichier). `src/config.js` (bloc `broker.matchTrader` + `getConfiguredPlatform()`) et `src/server.js` (choisit Match-Trader ou cTrader au démarrage selon les identifiants présents, `BROKER_PLATFORM` pour forcer) mis à jour en conséquence. `npm test` reste vert (164/164 — 6 nouveaux tests pour `M15CandleBuilder`, la seule partie du fichier qui soit de la logique pure testable sans un vrai serveur, comme cTraderDataSource.js qui lui n'a aucun test).

**Deux limites RÉELLES de l'API Match-Trader découvertes en écrivant ce fichier (pas des suppositions) :**
1. **Aucun endpoint d'historique de bougies documenté** — seulement une photo des prix en direct (`quotations`). Le bot construit donc lui-même ses bougies M15 en interrogeant les prix toutes les 15s (`M15CandleBuilder`, pure et testée). Conséquence : à la connexion, aucun historique pour les filtres (H4/EMA200, etc.) — nos CSV s'arrêtent au 31 décembre 2025, trop loin d'aujourd'hui pour servir de base. Le bot restera donc "silencieux" un vrai moment après la connexion, le temps d'accumuler de l'historique en direct. Piste explorée mais PAS codée : utiliser cTrader uniquement en LECTURE (données de marché seulement, un compte démo suffirait, pas besoin d'attendre FundingPips) pendant que Match-Trader gère l'exécution — à évaluer si l'attente de rodage s'avère trop longue en pratique.
2. **La création d'un ordre ne renvoie pas d'identifiant confirmé** — le bot doit retrouver l'ordre juste après en relisant la liste des ordres en attente (appariement par instrument+sens, approximatif — pas garanti si un ordre est aussi passé à la main au même moment sur le même instrument). Contrairement à cTrader, aucun champ "label/commentaire" documenté sur un ordre Match-Trader pour l'identifier de façon fiable.

Détail complet, avec toutes les hypothèses non confirmées listées une par une (base d'URL manager vs mtr-api, sens de `systemUuid`, forme exacte de la réponse `/last-finance`, etc.) : en-tête de `src/dataSources/matchTraderDataSource.js`. Guide utilisateur mis à jour : `docs/MATCHTRADER_SETUP.md` section 7.

## cTrader — l'app a été APPROUVÉE par Spotware (2026-09-07) — retour de cTrader comme plateforme PRINCIPALE

Revirement important par rapport à la décision "abandon de cTrader" ci-dessous (gardée telle quelle pour l'historique) : Spotware a approuvé l'app le même jour où le connecteur Match-Trader a été fini. Comme cTrader n'a AUCUNE des deux limites réelles découvertes côté Match-Trader (historique de bougies natif via `ProtoOAGetTrendbarsReq`, identifiant d'ordre fiable), **cTrader redevient la plateforme principale** dès que la connexion est terminée — Match-Trader reste écrit et disponible en secours (`BROKER_PLATFORM=matchtrader` pour forcer), mais n'est plus la priorité tant que `MATCHTRADER_BROKER_ID`/`MATCHTRADER_PLATFORM_URL` ne sont pas obtenus du support FundingPips.

**Où en est la connexion cTrader, précisément :**
- **Client ID** (sans risque à partager) : `38835_3JRh8s5wwhjyupk8jpItMLV9HocfVRXiozbcuO7h4NVqdjqPsW`.
- **Client Secret, Access Token, Refresh Token** : obtenus (flux OAuth complet fait dans le chat Cowork, avec l'accord explicite de l'utilisateur de les faire passer par la conversation plutôt que par un terminal séparé — donc **techniquement exposés dans l'historique de cette conversation**, ce qui est exactement ce que la règle du projet "ne jamais partager la Secret dans le chat" voulait éviter à l'origine. Pas alarmant en soi, mais à garder en tête : envisager de régénérer la Client Secret depuis openapi.ctrader.com/apps une fois le déploiement stable, par hygiène). Access Token valable ~30 jours (obtenu 2026-09-07, donc à renouveler vers le **2026-10-07** — **aucune logique de rafraîchissement automatique n'est encore codée**, il faudra soit refaire le flux OAuth manuellement à ce moment-là, soit ajouter le rafraîchissement via `refresh_token` avant l'échéance).
- **Account ID (`ctidTraderAccountId`) : PAS ENCORE CONNU.** Tenté de le récupérer automatiquement, sans succès pour l'instant :
  - `https://openapi.ctrader.com/connect/tradingaccounts?accessToken=...` → 404 (endpoint probablement inexistant/déprécié).
  - `https://api.spotware.com/webserv/connect/api/tradingaccounts?access_token=...` (mentionné sur un forum communautaire, pas la doc officielle) → pas testé avec succès non plus.
  - La vraie méthode documentée (help.ctrader.com) est le message protobuf `ProtoOAGetAccountListByAccessTokenReq`, envoyé sur la même connexion TCP que `cTraderDataSource.js` utilise déjà — **`cTraderDataSource.js` a été modifié pour le faire automatiquement** : si `CTRADER_ACCOUNT_ID` n'est pas défini au démarrage, il se connecte, demande la liste des comptes liés à l'access token, l'affiche dans les logs, et l'utilise automatiquement s'il n'y en a qu'un (`pickAccountOrThrow()`, fonction pure, 4 tests unitaires ajoutés — `test/cTraderDataSource.test.js`). Si zéro ou plusieurs comptes trouvés, il refuse de deviner et republie explicitement ce qu'il a trouvé dans les logs plutôt que de risquer de trader le mauvais compte.
  - **Cette découverte n'a pu être vérifiée nulle part encore** : le bac à sable Cowork ne peut contacter NI `openapi.ctrader.com` (HTTPS) NI `demo.ctraderapi.com:5035` (TCP, le port que le vrai bot utilise) — confirmé en testant directement (connexion refusée par une politique réseau du bac à sable, indépendamment des identifiants). Il faudra donc lire les logs du PREMIER déploiement réel (Render ou ailleurs) pour voir la liste des comptes découverts et, si plusieurs comptes apparaissent, fixer `CTRADER_ACCOUNT_ID` explicitement avant de continuer.
- `src/config.js` : bloc `CONFIG.broker` (cTrader) inchangé de structure, mais `getConfiguredPlatform()` ne requiert plus `accountId` pour considérer cTrader "prêt" (seulement clientId+clientSecret+accessToken) — c'est justement ce qui permet la découverte automatique au premier démarrage. `isLiveConfigured()` en dépend, donc son sens a légèrement changé (signifie maintenant "va tenter une connexion live", pas "a toutes les valeurs y compris le compte").

**Tentative de déploiement (Render) — bloquée, en cours de résolution :**
- Compte Render déjà connecté (workspace "Esdras's workspace", `tea-d9h2bivlk1mc738tli3g`) — confirmé fonctionnel.
- `create_web_service` de Render exige une URL de dépôt Git à cloner (testé directement : refusé avec "repo is required when using runtime: node") — aucune option pour uploader du code brut. Aucun connecteur GitHub disponible côté Cowork (vérifié via la liste des connecteurs ET le répertoire de connecteurs disponibles — absent des deux).
- L'utilisateur a créé `https://github.com/gateslittle4/ict-fvg-bot` (public, vide) et généré un jeton d'accès à portée limitée (Contents: read/write, ce seul dépôt, expiration courte).
- **`git push` depuis ce bac à sable Cowork échoue quand même** : un "git proxy" interne au bac à sable bloque tout accès à un dépôt qui n'est pas dans un "authorized repository set" de la session, débloquable via un outil `add_repo` — **qui n'existe que côté Claude Code, pas côté Cowork** (confirmé : absent de la liste d'outils, la tentative de push ET un appel direct à l'API GitHub renvoient tous les deux ce même message). Donc, indépendamment du jeton fourni, ce bac à sable ne peut PAS pousser vers GitHub, point final — pas un problème de credentials.
- **Décision en cours avec l'utilisateur** : le push doit se faire depuis un environnement sans cette restriction — soit son laptop (GitHub Desktop, le plus simple sans terminal ; ou `git` en ligne de commande avec le jeton déjà généré, les deux méthodes lui ont été données en détail dans le chat) soit une session Claude Code (locale sur son laptop, ou en cloud si elle a le mode utilisé pour son autre projet "chf app2" qui a apparemment déjà ce mécanisme `add_repo` disponible). **Pas encore fait au moment de cette mise à jour.**
- Une fois le code sur GitHub : reprendre ici avec `create_web_service` (name: `ict-fvg-bot`, runtime: `node`, buildCommand: `npm install`, startCommand: `npm start`, workspaceId: `tea-d9h2bivlk1mc738tli3g`), puis `update_environment_variables` avec `CTRADER_CLIENT_ID`/`CTRADER_CLIENT_SECRET`/`CTRADER_ACCESS_TOKEN` (**volontairement PAS `CTRADER_ACCOUNT_ID`** au premier déploiement, pour laisser la découverte automatique s'exécuter et lire le résultat dans les logs Render), puis relire les logs pour récupérer l'account id et le fixer en variable d'environnement pour les déploiements suivants.

**Mise à jour 2026-09-07 (session Claude Code, pas Cowork) : FAIT.** Cette session avait l'accès GitHub (`add_repo`) qui manquait à Cowork — le code a été poussé sur `https://github.com/gateslittle4/ict-fvg-bot` (branche `claude/lire-handoff-hxisa5`), puis le service Render `ict-fvg-bot` créé (`srv-dafkaav40ujc73bm3cl0`, https://ict-fvg-bot.onrender.com, workspace `tea-d9h2bivlk1mc738tli3g`) avec les 3 identifiants OAuth cTrader (sans `CTRADER_ACCOUNT_ID`, comme prévu). Résultat du premier déploiement, lu dans les logs Render :
- **Découverte automatique du compte confirmée en conditions réelles** : `ctidTraderAccountId=48587457` (démo, `isLive: false`, `traderLogin: 1122521`) — un seul compte trouvé, auto-sélectionné comme prévu par `pickAccountOrThrow()`. **`CTRADER_ACCOUNT_ID=48587457` à fixer en variable d'environnement Render pour les prochains déploiements** (évite de refaire la découverte à chaque boot), pas encore fait au moment de cette note.
- **Bug réel trouvé et corrigé** : `ProtoOAGetTrendbarsReq` (warm-up de l'historique M15 dans `_subscribeLiveCandles`) plantait au boot avec `Missing required field ... fromTimestamp` — le code n'envoyait que `count`, alors que `fromTimestamp`/`toTimestamp` sont `required` d'après `OpenApiMessages.proto` (`count` est seulement une limite optionnelle appliquée en partant de `toTimestamp`). Corrigé : la requête envoie maintenant une fenêtre de 90 jours (`Date.now() - 90j` à `Date.now()`), largement sous le plafond de 35 semaines pour la période M15/H1. Le bot retombait silencieusement en mode démo interne (`[boot] live cTrader connection failed, falling back to demo mode`) à cause de ce bug — **pas encore re-déployé/re-vérifié après le correctif au moment de cette note.**
- Tout le reste du boot a fonctionné avant ce point de blocage : `ProtoOAApplicationAuthReq`, découverte de compte, `ProtoOAAccountAuthReq`, `_loadSymbols`, `_loadBalance`, `_loadClosedDeals` (celle-ci envoie déjà `fromTimestamp`/`toTimestamp` correctement, seul `_subscribeLiveCandles` avait le bug) — donc probablement le seul obstacle réel restant avant un vrai fonctionnement live, mais à confirmer par un nouveau déploiement.

**Mise à jour 2026-09-07 (suite, même session Claude Code) : 2 bugs réels supplémentaires trouvés en observant le redéploiement en direct, + une découverte de performance sérieuse.**

1. **Pas de timeout sur `sendCommand()`** — la librairie `@reiryoku/ctrader-layer` n'a AUCUN timeout intégré : sa promesse ne se résout que quand une réponse arrive avec le bon `clientMsgId` ; si le serveur ne répond jamais, ça bloque `start()` indéfiniment, SANS erreur ni log. Confirmé en direct : après le premier correctif (`fromTimestamp`), le déploiement suivant s'est bloqué silencieusement juste après l'authentification du compte, sans aucune progression pendant plusieurs minutes. Corrigé (`sendCommandWithTimeout()`, 20s par défaut/60s pour le warm-up des bougies) + un `console.log` avant/après chaque étape du boot pour que le prochain blocage soit diagnosticable depuis les logs Render sans deviner.
2. **`ProtoOASubscribeLiveTrendbarReq` manquait son prérequis** — le commentaire de doc du proto lui-même dit : *"Requires subscription on the spot events, see ProtoOASubscribeSpotsReq"*. Ce `ProtoOASubscribeSpotsReq` n'était JAMAIS envoyé dans le code, alors que le bot écoute déjà `ProtoOASpotEvent` pour les bougies live. Résultat observé en direct grâce au correctif #1 ci-dessus : le warm-up de US100 s'est terminé, puis `ProtoOASubscribeLiveTrendbarReq` a timeout (aucune réponse du serveur) — cohérent avec le prérequis manquant. Corrigé : `ProtoOASubscribeSpotsReq` envoyé pour chaque symbole avant `ProtoOASubscribeLiveTrendbarReq`.
3. **⚠️ DÉCOUVERTE DE PERFORMANCE SÉRIEUSE, PAS ENCORE CORRIGÉE — nécessite une décision consciente, pas un correctif unilatéral.** Le commentaire d'en-tête de `liveStrategyEngine.js` (conception "rebuild-and-replay", voir plus haut) affirme qu'un rebuild+replay complet sur ~35 000 bougies/instrument/an est "well under a second in Node". **Ce chiffre est faux, vérifié par un micro-benchmark local** (`_detectFvgSignal` rebuild `buildFilteredEngine()` depuis zéro à CHAQUE bougie, donc coût O(n²) sur la durée du warm-up) : 8639 bougies (90 jours) pour US100 seul = **15.7 secondes** sur cette machine de dev, pas "sous la seconde". **En conditions réelles sur le plan gratuit Render, c'est bien pire** : le déploiement en direct a mis environ **3 minutes 47** rien que pour le warm-up de US100 (confirmé par les logs : "replaying..." à 23:22:44, prochain log à 23:26:31) — cohérent avec un CPU du plan gratuit très bridé. Avec 3 symboles (US100/US500/XAUUSD) à réchauffer à chaque déploiement, ça peut représenter facilement 10+ minutes juste pour démarrer.
   - **⚠️ Correction 2026-09-08, après un calcul refait proprement à la demande de l'utilisatrice ("c'est seulement dans le chargement que c'est lent, non ?") : l'extrapolation "plusieurs MINUTES par tick après quelques mois" ci-dessus (première version de cette note) était FAUSSE — erreur de calcul, corrigée ici pour ne pas induire une future session en erreur.** Le benchmark local (15.7s pour 8639 bougies) mesure un coût CUMULÉ (somme sur tout le rejeu), pas le coût d'UNE bougie isolée à une longueur d'historique donnée. En isolant correctement le coût d'un seul tick à une longueur d'historique N (coût ∝ N, pas une somme) : à N=8640 (juste après le warm-up), un seul tick ≈ 3.6ms en local ; même après un an complet de fonctionnement continu sans redémarrage (~35 000 bougies accumulées, le chiffre du commentaire d'origine), un seul tick ≈ 14.8ms en local, soit environ 0.2-0.3s en conditions réelles sur le CPU bridé de Render (facteur ~15-20x observé sur le warm-up complet) — largement dans la marge des 15 minutes entre deux bougies, PAS un risque de dérive/retard progressif comme affirmé précédemment.
   - **Ce qui reste vrai, avec la sévérité corrigée** : le design reste inefficace par principe (O(n) par tick au lieu de O(1)), et le coût `this.history` (jamais purgé) grandit bien indéfiniment — mais reste négligeable devant l'intervalle M15 pour n'importe quelle durée de fonctionnement continu réaliste (années). **Le vrai coût pratique, c'est le REDÉMARRAGE** (chaque redémarrage — veille Render gratuite, nouveau déploiement — repaie l'intégralité du warm-up, ~14 minutes), pas une dégradation progressive pendant que le bot tourne. Priorité pratique donc : réduire la fréquence/coût des redémarrages (plan payant Render, voir section dédiée) plutôt que de se presser à rendre le calcul incrémental.
   - Rendre `buildHtfBiasSeries`/`buildStructureBiasSeries`/`buildLiquiditySweepEvents` incrémentales resterait la solution la plus propre à terme (accélérerait aussi chaque redémarrage), mais le commentaire du code d'origine la flague comme "hors scope ici, car ça risque de changer silencieusement un comportement déjà validé" — donc toujours une décision consciente à prendre avant d'y toucher, pas un correctif improvisé, et surtout pas urgent vu la correction ci-dessus.
   - Script de mesure (scratch, pas commité dans le repo) : instancie `LiveStrategyEngine` avec la config `CONFIG.fvg.perSymbol.US100` réelle et rejoue les 8639 premières bougies M15 de `data/backtest-input/US100.csv` en mesurant le temps à des points de contrôle (500/1000/2000/4000/8639 bougies) — croissance clairement quadratique (57ms → 146ms → 597ms → 2790ms → 15744ms).

**Mise à jour 2026-09-07 (suite) : les 3 correctifs ont marché — premier boot cTrader 100% réussi en conditions réelles.** Après le fix "yield toutes les 200 bougies" (heartbeat), le déploiement suivant a atteint `[cTrader] connected and live for account 48587457` pour les 3 symboles (US100 23:40, US500 23:47, XAUUSD 23:50 — démarrage complet ~14 minutes). Aucune erreur. Le connecteur cTrader fonctionne réellement, pour la première fois, contre un vrai compte démo.

**⚠️ NOUVEAU problème découvert en discutant avec l'utilisatrice, PAS corrigé — décision consciente prise : laisser tel quel pour l'instant (test démo seulement).** Le service Render tourne sur le plan **gratuit**, qui met le service en veille après ~15 minutes sans requête HTTP entrante. Contrairement à un simple dashboard qui dormirait, **la mise en veille tue le process Node entier** — connexion cTrader, heartbeat, tout meurt avec. Le réveil ne se déclenche que sur une requête HTTP entrante (quelqu'un visite le dashboard), et redéclenche alors TOUT le boot depuis zéro, warm-up complet de ~14 minutes inclus. Concrètement : si personne ne visite le dashboard, le bot reste éteint indéfiniment sans surveiller le marché, silencieusement — et même avec des visites régulières, il perd ~14 minutes à chaque redémarrage. Question posée à l'utilisatrice, décision explicite : **garder le plan gratuit pour l'instant**, puisque c'est un compte démo (pas d'argent réel, but = valider que le connecteur marche techniquement, ce qui est fait). Options discutées pour plus tard, avant de connecter un vrai compte de challenge :
  1. Passer au plan payant Render Starter (~7$/mois) — élimine la mise en veille, le bot démarre une fois puis reste connecté en continu. Recommandé si on va vers un usage réel.
  2. Garder le gratuit + ping externe (ex. UptimeRobot) pour empêcher la veille — gratuit mais fragile (si le ping tombe, le bot se rendort sans alerte), et comme le process ne redémarrerait alors quasiment jamais, ça rend PLUS urgent de régler le problème O(n²) ci-dessus (le coût par tick grandirait sans jamais être remis à zéro par un redémarrage).
  **Ne pas oublier de trancher ce point avant tout passage en argent réel.** Note 2026-09-08 : le lien fait initialement ici avec la "croissance O(n²)" est à relativiser — voir la correction dans la section dédiée plus haut (le coût par tick reste négligeable même après un an de fonctionnement continu). Le vrai enjeu de la veille gratuite reste simplement celui décrit ci-dessus : le bot ne surveille pas le marché quand il dort, et chaque redémarrage recoûte ~14 minutes.

**Mise à jour 2026-09-08 : bug critique du fuseau horaire NY trouvé et corrigé, + nouveau "Journal de trading" sur le dashboard.**

1. **Bug trouvé en répondant à la question "quand exactement le bot trade-t-il ?"** : `nySession.js` (partagé backtest+live) convertit une heure "convention HistData" (EST fixe, +5h pour obtenir l'UTC réel) vers l'heure NY réelle. Les bougies backtest (CSV) suivent bien cette convention, mais les bougies LIVE de cTrader (`utcTimestampInMinutes`) sont déjà en UTC réel — leur passer directement dans le pipeline partagé ajoutait 5h en trop. Vérifié empiriquement : à l'heure réelle NY 21h25, le bot calculait 2h25. Conséquence concrète : les fenêtres de session validées (Silver Bullet 10h-11h NY pour US100/US500, chevauchement Londres-NY 7h-10h NY pour XAUUSD) vérifiaient en réalité 5h-6h et 2h-5h du matin — le bot ne tradait donc PAS dans les fenêtres sur lesquelles tout l'edge a été validé.
   - **Corrigé dans `src/dataSources/cTraderDataSource.js` uniquement** (`_toEngineCandle()`), sans toucher `nySession.js`/`weekdayFilter.js` ni aucun test de backtest : le time réel (UTC, utilisé pour l'affichage dashboard et les `expirationTimestamp` envoyés au broker) reste inchangé ; seule la copie de la bougie envoyée à `LiveStrategyEngine.ingestCandle()` est décalée de -5h pour retomber dans la même convention que les CSV de backtest. Vérifié par un test manuel (`isInNySessionWindow` passe de `false` à `true` pour une bougie réelle à 10h30 NY) et par `npm test` (179/179, aucun test de backtest touché).
   - Effet de bord cosmétique assumé : l'heure "validé HH:MM" affichée à côté d'un signal actionnable montre l'heure décalée (convention interne), pas l'heure réelle — comme le reste du système en interne. Pas corrigé pour l'instant, purement cosmétique.
   - `weekdayFilter.js` a le même bug latent (copié-collé de la même logique) mais n'est PAS câblé en production (`excludedWeekdays` vide dans `CONFIG`) — inoffensif tel quel, mais à corriger si jamais activé un jour.

2. **Journal de trading** (`GET /api/trade-history`, nouvelle section dashboard) — à la demande explicite de l'utilisatrice ("historique des transactions... comme un journal de trading avec le point d'entrée, stop, sortie, RRR"). Décisions prises avec elle :
   - **Aucun stockage ajouté** : interrogation de `ProtoOADealListReq` à la demande à chaque chargement de la page (survit aux redémarrages fréquents du plan gratuit, sans base de données à maintenir). Limite acceptée : la fenêtre max est 1 semaine (plafond dur de l'API cTrader), pas 30 jours.
   - **Stop/cible NON affichés, volontairement** : `ProtoOADealListReq` ne contient pas le stop-loss/take-profit prévu d'une position déjà fermée, et il n'existe pas de moyen documenté de le retrouver après coup pour une position clôturée. Plutôt que d'inventer une valeur, le journal affiche uniquement entrée/sortie/direction/P&L — vérifiable à 100% depuis les deals cTrader — avec une explication visible sur le dashboard.
   - **Mini-graphique en chandelier inclus dès la V1** (choix explicite de l'utilisatrice) : SVG généré en JS pur (pas de librairie), bougies + lignes pointillées entrée (bleu)/sortie (ambre) avec libellés qui s'auto-ajustent pour ne jamais sortir du cadre. Bougies de contexte récupérées via un `ProtoOAGetTrendbarsReq` supplémentaire par trade (fenêtre ±3h autour de l'entrée/sortie).
   - **Résumé ajouté au-dessus de la liste** : nombre de trades/taux de réussite/P&L net sur 7 jours, calculé côté serveur (`summarizeTrades()`), pas de nouvel appel réseau.
   - Nouveau fichier `src/dataSources/dealPairing.js` (logique pure, testée : `pairDealsIntoTrades()` regroupe les exécutions cTrader par position en trades fermés ; `summarizeTrades()` calcule les stats) — 11 nouveaux tests (`test/dealPairing.test.js`), `npm test` à 179/179.
   - Testé visuellement avec Playwright + données factices (captures d'écran) : rendu correct, aucune erreur console, libellés lisibles même en bord de graphique.
   - **Statut : PAS encore testé avec de vrais trades** (aucun trade réel n'a encore eu lieu sur le compte démo au moment de cette note) — à vérifier dès qu'un premier trade se clôture.

## Prochaines étapes en attente (jamais confirmées par l'utilisateur, proposées mais pas commencées)

1. ~~Reprendre la config OAuth cTrader Open API~~ — **FAIT ET CONFIRMÉ EN CONDITIONS RÉELLES (2026-09-07 soir → 2026-09-08 nuit).** cTrader est la plateforme principale, déployée sur Render (`https://ict-fvg-bot.onrender.com`, service `srv-dafkaav40ujc73bm3cl0`, plan gratuit), et a atteint `[cTrader] connected and live for account 48587457` sur les 3 symboles à plusieurs reprises cette nuit, sans erreur, après 4 bugs réels trouvés et corrigés en conditions réelles (voir sections dédiées ci-dessus : `fromTimestamp` manquant, absence de timeout sur `sendCommand`, `ProtoOASubscribeSpotsReq` manquant, heartbeat affamé pendant le rejeu). Match-Trader reste en secours, codé mais jamais utilisé, toujours bloqué sur le `brokerId`/URL FundingPips non obtenus.

   *Ancien raisonnement (abandon, matin du 2026-09-07, dépassé mais gardé pour comprendre la décision Match-Trader)* : sur cTrader, il fallait faire approuver manuellement une "app" par Spotware avant d'obtenir les identifiants — un blocage qui a mis le projet en pause depuis le début. Sur Match-Trader, l'authentification se fait directement avec l'email/mot de passe habituels de connexion, sans approbation tierce. FundingPips propose Match-Trader comme plateforme alternative (pas besoin de changer de compte/challenge). Guide de connexion : `docs/MATCHTRADER_SETUP.md`. Étape bloquante restante pour Match-Trader (si jamais on y revient) : demander au support FundingPips le `brokerId` et l'URL de plateforme, ou tester d'abord sur une démo Born2trade. ATTENTION : ne jamais partager le mot de passe Match-Trader en clair dans le chat — le poser directement en variable d'environnement du déploiement.
2. ~~Câbler le bot live/démo pour qu'il applique réellement les filtres validés~~ — **FAIT cette session**, voir section "Ce qui est VALIDÉ" ci-dessus.
3. Vérifier les vrais spreads FundingPips/FTMO cTrader pour US100/US500/XAUUSD (actuellement INDICATIFS/non confirmés dans `transactionCosts.js`). Idem pour les specs de `lotCalculator.js` (`DEFAULT_SYMBOL_SPECS`, tous marqués `verified: false` intentionnellement).
4. Vérifier le prix réel actuel d'un compte FTMO 1-Step $10k (non trouvé via recherche web — la page ne publie pas de tarif statique).
5. Envisager un forward-test sur compte démo (4-6 semaines) avant d'engager du capital réel de challenge.
6. Judas Swing/Asian Range Breakout (résultats mitigés, voir section dédiée ci-dessus, vérifications de chevauchement et distribution annuelle déjà faites) : si on veut aller plus loin, la piste la plus raisonnable est un forward-test démo EURUSD (Judas Swing) — pas un ajout direct au combo réel. Ne jamais compter le Judas Swing ET l'Asian Range Breakout comme deux edges indépendants dans un même combo (32-38% de chevauchement de jours entre les deux sur US100/XAUUSD).
7. Pyramide "stops indépendants" (voir section dédiée ci-dessus) : plus prometteuse que l'ancien design mais pas validée sur un seul découpage historique — un forward-test démo serait la prochaine étape avant d'y risquer du capital réel, pas un ajout direct.
8. Cible étendue 1:4/1:5 (voir section dédiée ci-dessus) : résultat le plus solide de la session mais toujours un seul découpage historique — décision consciente à prendre (changer `rrMultiple` dans `src/config.js`) après un forward-test démo, pas automatiquement.

## Session Claude Code 2026-09-07 soir → 2026-09-08 nuit : bilan de fin de session

Session longue (import du handoff, déploiement Render, débogage cTrader en conditions réelles, corrections en direct avec l'utilisatrice). Elle a dit vouloir passer à une autre session Claude pour la suite — voici l'état exact laissé et ce qui reste à faire, dans l'ordre où ça a été identifié :

- **Bot actuellement LIVE** sur `https://ict-fvg-bot.onrender.com`, compte démo cTrader `48587457` (login `1122521`), les 3 symboles connectés. Dernier redémarrage confirmé complet à 02:26:56 UTC le 2026-09-08. `git log` de cette session : `f8521d1` → `640b865` (8 commits), tous poussés sur `claude/lire-handoff-hxisa5`, working tree propre au moment de cette note.
- **Nouveau bug trouvé et corrigé** (pas dans les sections dédiées ci-dessus, ajouté en fin de session) : le bandeau du dashboard affiche en dur "connecté à ton compte FundingPips via cTrader" — **c'est faux/trompeur**, on ne sait pas si ce compte démo est réellement chez FundingPips ou un autre broker en marque blanche cTrader. `ProtoOATrader` (déjà récupéré par `_loadBalance()` pour le solde) contient un champ `brokerName` (whitelabel assigné par le courtier) actuellement ignoré. **PAS ENCORE CORRIGÉ, décision explicite de l'utilisatrice : "on garde ça pour modification"** — remplacer le texte en dur par le vrai `brokerName` renvoyé par cTrader (+ indiquer clairement démo/réel) à faire dans une prochaine session.
- **Comportement à re-expliquer/documenter pour la prochaine session si besoin** : pendant le warm-up, le rejeu de l'historique pousse des signaux/positions "actionnables" historiques dans `store.signalLog`/`openPositions` (ce n'est pas un bug de trading, juste un artefact d'affichage) — ils disparaissent une fois le warm-up fini et remplacés par les vrais signaux/positions live. Piste non retenue mais utile si ça reprête à confusion : filtrer l'affichage des signaux du warm-up, et/ou afficher la date en plus de l'heure sur `validatedAt`.
- **Décision Render en attente** : plan gratuit gardé volontairement pour l'instant (test démo, voir section dédiée) — le service se met en veille après ~15 min sans visite, tuant la connexion cTrader ; chaque redémarrage recoûte ~14 minutes de warm-up. Repenser cette décision avant de connecter un vrai compte de challenge (plan payant Starter ~7$/mois recommandé, ou ping externe).
- **Journal de trading pas encore testé avec un vrai trade fermé** (voir section dédiée) — à vérifier dès qu'un premier trade (réel, cliqué manuellement dans cTrader) se clôture.
- Pas de mot de passe sur le dashboard (voir section OAuth/déploiement) — pas urgent tant que démo, à faire avant tout compte réel.

## Rapport "performance récente" (90 derniers jours, hypothétique) + nom du courtier réel — 2026-09-08 nuit (suite)

Deux ajouts faits juste avant la fin de session, à la demande explicite de l'utilisatrice.

1. **`GET /api/recent-performance` + nouvelle carte dashboard "Performance récente"** : après avoir expliqué que le warm-up recalcule déjà tous les signaux sur l'historique récent mais jette le résultat (cause du "signaux qui apparaissent puis disparaissent" observé par l'utilisatrice), elle a demandé un vrai rapport à partir de cette donnée. Implémenté en réutilisant `LiveStrategyEngine` lui-même (instance fraîche et isolée, aucun effet de bord sur le live réel) — même classe que celle qui tourne en production, déjà corrigée du bug de fuseau horaire ce soir — plutôt que d'écrire une simulation séparée qui risquerait de dériver silencieusement de la vraie logique de signal.
   - Nouveau fichier `src/backtest/recentPerformanceReport.js` (`buildRecentPerformanceReport()`, async) + `LiveStrategyEngine.getHistory(symbol)` (nouvelle méthode, copie en lecture seule de l'historique conservé).
   - **⚠️ Piège évité, pas juste théorique** : cette fonction a le même coût O(n²) que le warm-up (même moteur, même rejeu). Lancée telle quelle de façon synchrone dans une requête HTTP, elle aurait pu re-provoquer EXACTEMENT le bug de famine du heartbeat qu'on vient de corriger ce soir — potentiellement plusieurs minutes de blocage sur une requête dashboard, cette fois. Corrigé de la même façon (souffle toutes les 200 bougies via `setImmediate`) + mis en cache côté serveur 15 minutes (les bougies ne changent de toute façon qu'à ce rythme) pour ne pas relancer le calcul à chaque poll du dashboard.
   - Stop/cible non plus inventés pour les trades "expirés" (timeout) : `rMultiple` reste `null` dans ce cas plutôt que d'estimer un prix de sortie non disponible dans l'événement `'closed'` — même discipline que le journal de trading (`dealPairing.js`).
   - Un signal déjà ouvert AVANT le début de la fenêtre de 90 jours est explicitement exclu (pas d'entrée réelle connue) plutôt que deviné.
   - 6 nouveaux tests (`test/recentPerformanceReport.test.js` + 2 pour `getHistory()` dans `test/liveStrategyEngine.test.js`), testés contre de VRAIES données CSV (échantillon réduit à ~1800 bougies pour garder la suite rapide — voir commentaire dans le fichier de test sur le coût O(n²)). `npm test` à 185/185.
   - Testé visuellement (Playwright + données factices) : rendu correct, aucune erreur console.

2. **Bandeau "connecté à ton compte FundingPips" corrigé** (décision "on garde ça pour modification" de plus tôt dans la session, finalement faite avant la fin) : `ProtoOATrader.brokerName` (déjà récupéré par `_loadBalance()` pour le solde, jusqu'ici ignoré) est maintenant utilisé pour afficher le vrai nom du courtier, avec repli explicite ("courtier inconnu") si absent plutôt que d'afficher un nom faux. Le statut démo/réel est dérivé de l'hôte cTrader utilisé (`demo.ctraderapi.com` vs `live.ctraderapi.com`), jamais deviné. Nouveau `store.broker = {name, isDemo}` + `setBrokerInfo()`, exposé via `/api/status`.

## Structure du repo (après extraction du zip)

- `scripts/` — tous les scripts d'analyse/backtest en Node.js (`node scripts/run....js data/backtest-input`).
- `data/backtest-input/*.csv` — données M15 historiques (US100, US500, XAUUSD, EURUSD, GBPUSD).
- `data/backtest-input/*.md` — tous les rapports de résultats déjà générés (à relire avant de retester quoi que ce soit).
- `src/` — moteurs (FvgEngine, GuardrailEngine, LiveStrategyEngine), filtres (htfBias, marketStructure, nySession, liquiditySweep, weekdayFilter), `gridRunner.js` (logique de grid-search partagée), `correlation.js` (helpers partagés z-score/alignement pour Divergence). `dataSources/` contient `cTraderDataSource.js` (**plateforme PRINCIPALE de nouveau depuis l'approbation Spotware**, avec découverte automatique du compte via `pickAccountOrThrow()` — voir section dédiée) et `matchTraderDataSource.js` (connecteur de secours, écrit et testé mais jamais utilisé en live, bloqué sur des identifiants FundingPips non obtenus). Note : l'exclusion de jours calendaires (`runCalendarExclusionAnalysis.js`) est implémentée en ligne dans le script lui-même, pas comme un filtre `src/backtest/dateExclusion.js` séparé — corrigé ici après vérification, aucun tel fichier n'existe dans le repo.
- `test/` — 179 tests au 2026-09-08 (168 au 2026-09-07 + 11 pour `dealPairing.js`, voir section "Journal de trading"), `npm test` doit rester au vert après CHAQUE modification d'un fichier `src/`.

Après extraction : `npm install` (reconstruit `node_modules`, pas inclus dans l'export), puis `npm test` pour vérifier que tout fonctionne avant de continuer.

## Compte réel (équité/marge/réconciliation) + graphique de marché — 2026-09-08, suite

À la demande explicite ("est-ce que le bot détermine le montant du compte, le PnL actuel, tous les infos du compte ?" → "on règle tout ce qui peut l'être" + "un graphe des marchés choisis, même dans un autre onglet").

**Diagnostic avant de coder** : lu les vrais fichiers `.proto` de `@reiryoku/ctrader-layer` (`node_modules/@reiryoku/ctrader-layer/protobuf/*.proto`) plutôt que deviner les champs de l'API — même discipline que le reste du projet. Trouvailles :
- `ProtoOATrader.moneyDigits` existe et est censé remplacer le `/100` codé en dur dans `_loadBalance()` (déjà flagué "VERIFY" dans le code depuis le début) — corrigé pour lire le vrai `moneyDigits` de la réponse, avec repli à 2 (équivalent à l'ancien comportement) seulement si absent.
- `ProtoOAReconcileReq`/`Res` donne les VRAIES positions ouvertes chez le courtier (pas une estimation) — jamais utilisé avant cette session. C'est la bonne réponse à "est-ce que le bot connaît le vrai état du compte" : jusqu'ici, le dashboard n'affichait QUE ce que `LiveStrategyEngine` CROIT avoir ouvert d'après ses propres signaux (déjà documenté comme limitation "believed netting" dans `liveStrategyEngine.js`), jamais une vraie photo du compte.
- **Aucun champ "equity" interrogeable en direct dans l'API** (le seul champ `equity` trouvé dans tout le proto n'existe que dans `ProtoOADepositWithdraw`, un événement historique de dépôt/retrait — pas un état courant). L'équité doit donc être calculée : solde réel + P&L flottant estimé des positions réellement ouvertes.
- Calcul du P&L flottant conçu pour dépendre le MOINS possible de données non vérifiées : `tradeData.volume` (cents des unités réelles du sous-jacent) est DÉJÀ ce que `_placeStopOrder()` utilise (convention `volume = lots × lotSize × 100`, donc `unités = volume / 100`) — aucune table de specs par instrument nécessaire (contrairement au calculateur de taille de lot, `lotCalculator.js`, dont la table `DEFAULT_SYMBOL_SPECS` reste `verified: false`). Seule hypothèse assumée (documentée dans le code) : devise de cotation = devise de dépôt (vrai pour US100/US500/XAUUSD, tous cotés en USD, sur un compte FundingPips/FTMO en USD).
- `usedMargin`/`swap`/`commission` sur chaque position réelle sont directement fournis par le courtier (mis à l'échelle par `moneyDigits` propre à la position) — pas de calcul inventé, juste une conversion d'unité documentée.

**Trois niveaux de confiance, gardés visiblement séparés plutôt que mélangés dans un seul chiffre trompeur** (voir en-tête de `src/dataSources/accountReconciliation.js`) :
1. RÉEL, calculé par le courtier : solde, marge utilisée par position, prix d'entrée, stop/cible réels.
2. DÉRIVÉ avec une seule hypothèse étroite et documentée : P&L flottant depuis le mouvement de prix.
3. ESTIMATION, explicitement labellisée comme telle dans l'UI : équité (solde + P&L flottant), P&L net par position (inclut swap/commission — convention de signe assumée, pas encore confirmée contre une vraie réponse, flaguée dans le code).

**Nouveau : réconciliation "croyance du bot" vs "réalité du courtier"** — compare les positions RÉELLEMENT ouvertes (`ProtoOAReconcileReq`) à ce que `LiveStrategyEngine` croit avoir ouvert par symbole, et signale les écarts : `real-only` (position réelle sans alerte du bot — probablement un trade manuel) ou `believed-only` (le bot pense qu'une alerte aurait dû être suivie mais rien n'est ouvert — probablement un signal ignoré). Affiché sur le dashboard.

- Nouveau fichier pur/testé : `src/dataSources/accountReconciliation.js` (`enrichRealPosition`, `reconcileAccount`, `estimateEquity` — 13 tests, `test/accountReconciliation.test.js`).
- `CTraderDataSource.getAccountReconciliation()` — appelé à la demande (comme `getTradeHistory()`), pas mis en cache en arrière-plan (un `ProtoOAReconcileReq` est léger, contrairement au warm-up de 90 jours).
- Nouvel endpoint `GET /api/account`, nouvelle carte dashboard "Compte réel (cTrader)" (solde, équité estimée, marge utilisée réelle, P&L flottant, liste des positions réelles, avertissements de réconciliation).
- Testé visuellement (Playwright + serveur factice imitant une vraie réponse `/api/account`) : rendu correct, aucune erreur console, la réconciliation "real-only"/"believed-only" s'affiche bien en avertissement ambre.

**Graphique de marché** (deuxième demande, même session ; **refait en interactif le soir même**, voir ci-dessous) : première version en SVG maison, remplacée depuis par un vrai graphique interactif.

`npm test` : 202/202 après ces ajouts. **Statut : commité, PAS ENCORE déployé sur Render au moment de cette note** — même processus que d'habitude nécessaire (fast-forward vers `claude/lire-handoff-hxisa5`, la branche suivie par Render) pour que ça prenne effet sur le bot live.

## "Le site monte quand il veut" — cause trouvée (mise en veille du plan gratuit) + anti-veille codé — 2026-09-08 soir

Signalé par l'utilisatrice : le dashboard ne charge pas de façon fiable (page noire figée avec une barre de chargement bloquée, sur téléphone, en WiFi comme en 4G).

**Erreur de diagnostic à corriger pour la prochaine session** : j'ai d'abord conclu "aucune requête n'atteint le serveur" en me basant sur l'absence de logs de type `request` côté Render. **Cette conclusion était FAUSSE.** Preuve : le service a démarré à 10h31 et 10h43 UTC le 2026-09-08 alors qu'AUCUN déploiement n'a eu lieu entre 03h31 et 12h38 — deux démarrages sans déploiement = deux réveils après mise en veille, donc déclenchés par de vraies visites. Conclusion pratique : **les logs `type: request` ne capturent pas les requêtes sur ce service** (plan gratuit), leur absence ne prouve donc RIEN. Ne pas refaire ce raisonnement.

**Vraie cause** : le plan gratuit Render endort le service après ~15 min sans trafic entrant. Quand l'utilisatrice ouvre le lien, soit le service est réveillé (ça charge tout de suite), soit il dort et Render doit redémarrer le conteneur — plusieurs dizaines de secondes pendant lesquelles le navigateur mobile affiche une page blanche/noire figée. D'où l'impression "il monte quand il veut". Et surtout : **pendant qu'il dort, le bot ne surveille plus le marché du tout** (le process Node entier est tué, connexion cTrader comprise) — ce n'est pas qu'un souci d'affichage.

**Codé : `src/keepAlive.js`** — le service se pingue lui-même sur son propre `/healthz` toutes les 10 min (sous le seuil de ~15 min de Render), ce qui compte comme du trafic entrant et l'empêche de s'endormir. Nouveau `GET /healthz` volontairement minimal (aucun appel courtier, aucun travail moteur). `resolveKeepAliveConfig()` est pure et testée (12 tests, `test/keepAlive.test.js`), le timer est `unref()` et une erreur de ping est avalée avec un log (un incident réseau ne doit jamais tuer un bot en cours d'exécution). Limite assumée et documentée : ça ne peut que PRÉVENIR la veille, jamais en sortir (une fois le process mort, plus rien ne tourne pour envoyer un ping).

**⚠️ Volontairement OPT-IN (`KEEP_ALIVE=true`), à cause d'un vrai compromis** : Render accorde 750 heures d'instance gratuites par MOIS et par COMPTE, partagées entre TOUS les services gratuits du compte. Garder ce service éveillé en permanence consomme ~720 h à lui seul, soit quasiment tout le budget mensuel — ce qui affamerait les autres services gratuits du compte (chf-app, chf-demo2, chf-backend-test, etc., une dizaine au total dans ce workspace).

**Filtre heures de marché (actif par défaut quand le keep-alive est activé)** : le ping est sauté quand le marché est fermé, c'est-à-dire en dehors de dimanche 17h → vendredi 17h heure de New York (`isMarketOpen()`, pure, DST-aware via `Intl`, 7 tests dont des vérifications explicites en EDT ET en EST — la borne est une heure d'horloge NY, pas un décalage UTC fixe). **Coût fonctionnel : ZÉRO** — le bot ne peut pas trader un marché fermé, et grâce au correctif de warm-up rapide il reconstruit tout son état depuis l'historique cTrader en ~9 s au réveil. Gain : ~200 h/mois de gaspillage pur supprimées (tous les week-ends), soit **~520 h/mois au lieu de ~720 h**, ce qui laisse ~230 h pour les autres services gratuits du compte (largement suffisant pour des apps de démo rarement visitées : chacune s'endort après 15 min d'inactivité). `KEEP_ALIVE_ALWAYS=true` désactive ce filtre.

⚠️ Ne PAS restreindre le keep-alive aux seules fenêtres de session FVG (7h-11h NY) : la **Divergence fournit ~70% des trades** et n'est PAS limitée à une session (elle se déclenche aux frontières H1 à toute heure, y compris session asiatique). Piste envisagée puis écartée pour cette raison.

Le correctif vraiment propre reste le plan payant Render Starter (~7$/mois) : pas de veille du tout et aucune consommation du pool gratuit. **Décision laissée à l'utilisatrice** (voir "Décision Render en attente" plus haut, qui n'est donc toujours pas tranchée ; au 2026-09-08 soir elle a répondu "ni l'un ni l'autre pour l'instant" aux deux premières options, avant que le filtre heures de marché n'existe).

`npm test` : 221/221.

## Correctif du redémarrage lent (~14-17 min → ~9 secondes) — 2026-09-08, nouvelle session Claude Code

À la demande explicite de l'utilisatrice ("créer une base de données pour que le bot n'ait pas besoin de tout repasser au redémarrage"). Diagnostic AVANT de coder : la cause réelle n'était PAS le re-téléchargement des 90 jours de bougies depuis cTrader (rapide, ~2-3s/symbole), mais un **bug d'algorithme O(n²)** dans `liveStrategyEngine.js` — `ingestCandle()` reconstruisait et rejouait TOUTE l'historique déjà accumulée à CHAQUE bougie rejouée (le design "rebuild-and-replay" documenté en tête du fichier), donc O(n) de travail par bougie × n bougies = O(n²) au total. Une base de données seule (juste pour mettre en cache les bougies) n'aurait rien réglé : le rejeu coûteux se serait quand même produit en mémoire, peu importe la source des bougies. Expliqué et confirmé avec l'utilisatrice avant de choisir l'approche (voir échange) : corriger l'algorithme d'abord (obligatoire pour vraiment résoudre le problème), Supabase en complément (mis en pause, voir plus bas).

**Correctif** : nouvelle méthode `LiveStrategyEngine.warmUp(candlesBySymbol)` — reconstruit l'état final (historique, positions ouvertes, pyramide, index de formation FVG) en **une seule passe** par symbole au lieu d'une passe par bougie historique. Sûr parce que les lookups HTF-bias/structure/liquidity-sweep du FVG sont causaux (`closeTime <= t`) et la série z-score/ATR de la Divergence est strictement rétrospective — construire ces séries UNE FOIS sur le tableau complet donne exactement le même résultat à chaque préfixe que les reconstruire à chaque étape ; seul le nombre de fois où le calcul (coûteux) tourne change, pas ce qu'il calcule. Préserve exactement l'ordre séquentiel par symbole déjà utilisé en production (US100 entièrement rejoué avant US500, etc.), y compris sa particularité préexistante (le PREMIER symbole traité d'une paire Divergence ne voit pas encore l'historique du partenaire, donc ne détecte aucun signal Divergence pendant SON propre warm-up — comportement déjà présent avant ce correctif, pas changé).

**Preuve d'équivalence** : nouveau test différentiel (`test/liveStrategyEngine.test.js`) qui rejoue les MÊMES données CSV réelles (US100/US500/XAUUSD, config de production réelle, pyramide activée) via l'ancien chemin séquentiel (`ingestCandle()` bougie par bougie) ET via le nouveau chemin bulk (`warmUp()`), puis compare l'état interne complet (historique, positions ouvertes, positions pyramide, index de formation) — identique bit pour bit. Un second test vérifie que le PROCHAIN événement live après warm-up est aussi identique dans les deux cas. `npm test` : 189/189.

**Gain mesuré** :
- Benchmark local (script scratch, hors repo) : 99ms (bulk) vs 89.5s (séquentiel, ancienne méthode) pour la fenêtre complète 90 jours × 3 symboles — ~900x plus rapide.
- **Confirmé en production sur Render** (comparaison directe des logs, même service `srv-dafkaav40ujc73bm3cl0`) :
  - Ancien déploiement (avant correctif) : `US100: requesting warm-up` (10:43:21) → `connected and live for account 48587457` (11:00:40) = **17min19s**.
  - Nouveau déploiement (après correctif, même nuit) : `US100: requesting warm-up` (12:39:19.658) → `connected and live` (12:39:29.016) = **9.4 secondes**.
  - Soit ~110x plus rapide en conditions réelles pour les 3 symboles. Le fetch réseau cTrader (~2-3s/symbole) est maintenant le seul coût significatif restant, plus du tout le calcul.

**Déployé** : commit `6360dbe` poussé sur `claude/lire-le-handoff-8bbrxx` (branche de travail de cette session) PUIS fast-forward sur `claude/lire-handoff-hxisa5` (branche que Render suit en auto-deploy) avec la permission explicite de l'utilisatrice — déploiement Render `dep-dag03jh7lnhs7386mklg` confirmé `live`, les 3 symboles connectés, aucune erreur.

**Conséquence pratique pour le plan Render gratuit** (voir section dédiée plus haut) : la mise en veille après ~15 min d'inactivité HTTP reste un problème (le bot arrête de surveiller le marché pendant qu'il dort), mais le COÛT de chaque redémarrage n'est plus ~14 minutes, il est maintenant de l'ordre de ~10 secondes. Ça ne supprime pas le besoin de trancher la question du plan payant avant un compte réel, mais ça change nettement le calcul coût/bénéfice d'un ping externe (UptimeRobot) en attendant.

**Supabase — mis en PAUSE à la demande de l'utilisatrice** : la création d'un projet Supabase dédié à ict-fvg-bot a été bloquée (compte déjà à la limite du plan gratuit : 2 projets actifs, `chf-backend-test` et `Chfproject`, tous deux liés à l'autre projet "chf app2"). Options discutées mais pas tranchées : réutiliser un projet existant, mettre en pause l'un des deux projets chf, ou passer à un plan payant. L'utilisatrice a confirmé que le correctif d'algorithme ci-dessus réglait déjà le problème initial (temps de redémarrage), donc Supabase n'est plus urgent — resterait utile pour d'autres raisons (accumuler plus de 90 jours d'historique, filet de sécurité si l'API cTrader est indisponible au redémarrage) mais n'est plus nécessaire pour ce problème précis. À reprendre seulement si l'utilisatrice le redemande.


## Graphique interactif type broker (Lightweight Charts) — 2026-09-08 soir

À la demande explicite : « est-ce qu'on peut faire le chart devenir interactif comme les chartes des brokers, Match-Trader, MT4, est-il même possible d'avoir des chartes pareils ? ». Oui — la première version (SVG dessiné à la main) a été remplacée par **Lightweight Charts**, la bibliothèque open-source de TradingView eux-mêmes (v5.2.1, ajoutée en dépendance npm).

Ce que ça donne, au niveau d'un graphique de broker : zoom (molette/pince), déplacement au glisser, crosshair qui suit le pointeur avec l'heure sur l'axe du temps, lecture OHLC de la bougie survolée, étiquettes de prix sur l'échelle de droite, et sélecteur d'unité de temps **M15 / H1 / H4 / D1**. Les niveaux entrée/stop/cible de la position ouverte sont tracés en lignes de prix étiquetées (`createPriceLine`).

Détails d'implémentation à connaître :
- **Servie depuis notre propre origine**, pas depuis un CDN (`app.use('/vendor/lightweight-charts', express.static(node_modules/lightweight-charts/dist))`). Volontaire : le dashboard est déjà difficile à atteindre depuis le réseau de l'utilisatrice, un CDN ajouterait un deuxième hôte à résoudre avant que le graphique puisse s'afficher. La lib vient de la dépendance npm, donc pas de blob vendored copié dans le repo.
- **API v5** (différente de la v4 qu'on trouve dans la plupart des tutos) : `chart.addSeries(LightweightCharts.CandlestickSeries, opts)` et non `chart.addCandlestickSeries(opts)`.
- **`/api/candles` accepte maintenant `timeframe=M15|H1|H4|D1`**, re-échantillonné côté serveur via le `resampleCandles()` déjà existant (`htfBias.js`). Re-échantillonnage AVANT la découpe `limit`, pour qu'un bucket ne soit jamais construit sur une tranche partielle.
- **⚠️ Bug d'heure corrigé au passage** : les bougies conservées par `LiveStrategyEngine` sont dans la convention interne fixed-EST-as-UTC (décalées de −5h par `_toEngineCandle()`), donc les afficher telles quelles mettait chaque bougie 5 heures trop tôt. `CTraderDataSource` expose désormais `candleTimeOffsetMs` (« combien ajouter pour retrouver un vrai instant UTC ») et `/api/candles` l'applique. Exposé comme propriété de la source de données plutôt que déduit de `store.mode` : la convention appartient à la source qui a produit les bougies, pas à un drapeau global. Le mode démo (mockDataSource) ne décale pas, d'où un offset de 0 — l'asymétrie est réelle et c'est pour ça qu'elle est explicite.
- Le rafraîchissement automatique (60 s) **ne réinitialise pas la vue** (`loadChart({ keepView: true })`) : un graphique qui te ramène de force au zoom initial toutes les minutes est inutilisable.

Vérifié avec Playwright contre de vraies données CSV (1500 bougies US100 + position factice) : rendu correct, lecture OHLC au survol (`O 25461.39 H 25464.65 B 25444.39 C 25454.96`), zoom molette effectif (1499 → 1363 bougies visibles), changement d'unité de temps fonctionnel, aucune erreur console. Endpoint réel testé aussi : buckets H1 bien alignés sur l'heure pile, timeframe/symbole invalides rejetés proprement.

`npm test` : 221/221 (inchangé — la logique de re-échantillonnage réutilise `resampleCandles()`, déjà couvert par `htfBias.test.js`).

**Piste évidente pour la suite, PAS faite** : superposer sur ce graphique les zones FVG détectées et les signaux passés du bot. C'est le seul truc qu'un graphique de broker ne peut PAS afficher — MT4/Match-Trader ne connaissent pas la logique du bot. Les données existent déjà côté serveur (`store.signalLog`, et le rapport 90 jours de `recentPerformanceReport.js` calcule déjà entrées/sorties/résultats).


## Zones FVG + signaux du bot dessinés sur le graphique — 2026-09-08 soir (suite)

À la demande explicite (« ajoute les zones FVG et les signaux sur le graphique »). C'est la seule chose qu'un graphique de broker ne peut structurellement PAS montrer : MT4/Match-Trader ne connaissent rien à cette stratégie.

- **`src/backtest/chartOverlays.js`** (nouveau, 12 tests) : rejoue l'historique conservé dans un `LiveStrategyEngine` FRAIS et isolé — même discipline que `recentPerformanceReport.js`, donc ce qui est dessiné est par construction ce que le bot détecte vraiment, pas une reconstitution parallèle qui pourrait dériver.
- **`LiveStrategyEngine.warmUp()` accepte désormais un `onEvent(event, candle)` optionnel** : le rejeu calculait déjà tous ces événements et les jetait. Sans callback, comportement strictement inchangé (le test d'équivalence bulk-vs-séquentiel passe toujours). Grâce à ça l'overlay coûte **O(n) et non O(n²)** : ~80 ms pour 12 000 bougies × 3 symboles, donc servable directement par HTTP (`GET /api/overlays?symbol=X`, cache 5 min).
- Le `candle` est passé en second argument parce que l'événement `'expired'` du `FvgEngine` **ne porte aucun timestamp**.

**Deux découvertes réelles faites en construisant ça** (à connaître, elles ne cassent rien mais elles piègent) :

1. **`CONFIG.fvg.maxAgeCandles: 50` est du réglage MORT** — jamais lu nulle part. `buildFilteredEngine()` fait `new FvgEngine({ symbol })` sans le passer, donc c'est le défaut interne du moteur qui s'applique. Il vaut aussi 50, donc **aucun comportement n'est faux** et aucun backtest n'est invalidé — mais éditer la valeur dans `CONFIG` en croyant changer quelque chose ne ferait rien.
2. **Une zone rejetée par un filtre disparaît silencieusement.** Quand un wrapper (biais HTF / structure / session / sweep) refuse une validation, le `FvgEngine` interne consomme quand même la zone, mais l'événement `'validated'` est filtré avant d'atteindre l'observateur. Résultat mesuré sur données réelles : **2258 zones sur 2535 restaient nominalement « watching », d'âge médian 92 JOURS** contre un âge max moteur de 50 bougies (~12 h). Dessinées telles quelles, elles s'étirent chacune jusqu'au bord droit et enterrent complètement le graphique (vérifié, c'était illisible).
   - Correctif : au-delà de l'horizon d'âge max du moteur, une zone ne PEUT plus être vivante quoi qu'on ait observé ; elle est donc fermée à cet horizon et étiquetée **`stale`** — statut gardé distinct de `expired` (« on l'a vue mourir ») parce que la différence est réelle : `stale` = « on sait qu'elle ne peut plus être vivante ». Résultat : 10 zones réellement ouvertes au lieu de 250.

**Rendu** : zones en boîtes bleues (haussières) / rouges (baissières), opacité selon le statut (validée > en surveillance > périmée) ; signaux en flèches ▲▼ colorées par résultat (vert gagné, rouge perdu, bleu en cours) avec le prix d'entrée en libellé ; **les signaux BLOQUÉS sont affichés aussi**, en gris avec la raison (netting/garde-fou/spread) — « pourquoi il n'a pas pris celui-là ? » est exactement la question à laquelle ce graphique doit répondre. Bouton pour tout masquer.

Vérifié avec Playwright sur données réelles : marqueur rendu correctement (`FVG 7723.86 ✓` sous la bougie exacte du signal), boîtes bien accrochées aux bougies au zoom/déplacement, aucune erreur console.

**Rappel de sélectivité, utile pour ne pas croire à un bug** : la config de production est très sélective — **0 signal sur 1500 bougies M15, 3 sur 5000, 14 sur 12000** (US100). Voir aucun marqueur sur une fenêtre M15 courte est NORMAL. Les unités H1/H4/D1 couvrent bien plus de temps et en montrent davantage.

`npm test` : 233/233.


## Deux vrais bugs trouvés et corrigés sur le graphique — 2026-09-08/09 nuit

**Bug 1 — "je ne vois que le graphe de US100"** : diagnostiqué avec les vrais logs Render, pas une supposition. Le déploiement précédent avait chargé les 3 symboles proprement à 22h44, puis le service s'est rendormi (plan gratuit, ~15 min sans trafic) faute de tout autre visiteur. En rouvrant le graphique, le réveil relance le warm-up **séquentiellement par symbole** (US100 d'abord) — cliquer sur les onglets dans les toutes premières secondes affiche donc US100 déjà prêt pendant que US500/XAUUSD répondent encore "pas de données", sans indication claire que c'est temporaire. Reproduit exactement avec un faux serveur avant de corriger.
- Overlay de chargement visible (spinner + texte) tant que `/api/candles` ne renvoie aucune bougie pour le symbole affiché, au lieu d'une simple ligne de texte discrète.
- La boucle de rafraîchissement devient adaptative : toutes les 3 s tant qu'un symbole n'a pas encore de données, retour à 60 s une fois que les vraies bougies arrivent — au lieu d'attendre jusqu'à une minute complète.
- **Bug trouvé PAR MA PROPRE vérification avant de livrer** : l'overlay ne se cachait jamais, même une fois les données arrivées. Cause : `#chart-loading { display: flex; }` (règle sur l'ID) écrase le comportement natif de l'attribut `hidden` du navigateur — il fallait `#chart-loading[hidden] { display: none; }` en plus. Trouvé avec Playwright, pas en relisant le code, corrigé avant de pousser.

**Bug 2 — "je ne vois pas que le prix bouge"** : signalement de l'utilisatrice, vérifié dans le code plutôt que supposé cosmétique. Cause réelle : `LiveStrategyEngine.ingestCandle()` a son propre garde-fou anti-doublon (`candle.time <= dernière bougie connue → rejeté`) — nécessaire et INTACT pour la détection de signaux, qui ne doit garder que le premier tick de chaque bougie M15. Mais ça veut dire que `/api/candles` (qui sert cet historique) ne reflète JAMAIS l'évolution du prix à l'intérieur d'une bougie encore en formation — la dernière bougie du graphique restait figée jusqu'à la clôture suivante (15 min). `store.lastCandleBySymbol`, en revanche, EST mis à jour à chaque tick réel (déjà utilisé par la carte "Prix en direct" du dashboard) — juste jamais branché sur le graphique.
- `/api/status` expose maintenant aussi `lastOpen`/`lastHigh`/`lastLow` par symbole (en plus de `lastPrice`/`lastCandleTime` déjà existants) — lecture pure en mémoire, aucun calcul, aucun coût.
- Nouvelle boucle `startLiveTick()` dans `chart.html` : interroge `/api/status` toutes les 3 s (uniquement en M15 — sur H1/H4/D1 il faudrait agréger les ticks encore ouverts dans le plus grand bucket, pas fait, le délai de quelques secondes y est de toute façon imperceptible) et pousse le prix réel dans `candleSeries.update()`, qui fusionne dans la dernière bougie affichée sans re-déclencher le chargement complet ni toucher `lastCandles` (le tableau dont dépendent les zones/signaux) — sauf pour garder son dernier élément synchronisé en mémoire.
- **Encore un bug trouvé PAR MA PROPRE vérification** : `startLiveTick is not defined` au premier test — une erreur d'ordre dans mon propre script d'édition avait empêché l'écriture réelle des fonctions dans le fichier alors que la vérification de syntaxe passait sur l'ancien contenu inchangé. Reproduit, diagnostiqué, corrigé, revérifié avant de considérer que c'était fait.

Vérifié avec Playwright, données simulées mais représentatives : le prix affiché ET la dernière bougie de la série évoluent bien tick après tick (19540 → 19555 → 19558 sur 3 rafraîchissements), le nombre de bougies dans la série reste stable (pas de doublon), le tick live reste bien inactif en H1/H4/D1 et reprend en revenant sur M15, aucune erreur console.

`npm test` : 233/233 (inchangé — ces deux correctifs sont HTML/CSS/JS côté client + une extension mineure et sans risque de `/api/status`, aucune logique de stratégie touchée).

## Journal de trades durable dans Supabase — 2026-09-09, à la demande explicite

**Origine** : "d'après le bot, je perds beaucoup en US500, est-ce normal ? t'as pas accès à ça ?" — vraie limite découverte en répondant : `store.signalLog` (200 entrées max) ET l'historique de bougies que `/api/recent-performance` rejoue (`recentPerformanceReport.js`) vivent **uniquement en mémoire**, remis à zéro à chaque redémarrage Render (déploiement, ou le sommeil du plan gratuit déjà documenté plus haut). Impossible de répondre "est-ce normal sur la durée" sans un historique qui survit aux redémarrages.

**Où stocker** — vérifié avant de choisir, pas deviné : `mcp__Supabase__list_projects` montre que l'utilisatrice a déjà **2 projets actifs**, ce qui épuise le quota du plan gratuit (2 projets actifs max, vérifié dans la doc officielle Supabase — comptés sur tout compte Owner/Admin, tous organismes confondus). Aucun des deux n'a de rapport avec le trading : ce sont deux bases d'une appli de clinique/dossiers patients (`chf-backend-test` : 32 dossiers/68 fiches/27 episodes, jeu de test ; `Chfproject` : 244 lignes dans `episodes`, **la vraie base en production**, confirmé en comptant les lignes à sa demande). Décision explicite de l'utilisatrice : utiliser `Chfproject` quand même — elle prévoit de migrer ces données cliniques vers l'autre projet plus tard, ce qui libérera celui-ci. Un 3ᵉ projet gratuit n'est pas possible tant que les deux existants restent actifs.

⚠️ **Point de sécurité signalé en même temps, indépendant de ce chantier** : `Chfproject` a 7 tables sans RLS activé, dont `patients`/`consultations`/`episodes` — exposées à n'importe quel client avec la clé anon. SQL de correction fourni à l'utilisatrice, **pas appliqué** (pas la décision de cette session à prendre seule). À rappeler si elle ne s'en occupe pas.

**Isolation** : plutôt qu'un schéma Postgres séparé (aurait demandé d'exposer un nouveau schéma via les réglages API du dashboard Supabase, pas accessible par les outils MCP), nouvelle table `public.bot_trade_events` dans le schéma `public` existant — préfixée `bot_`, aucune colonne ni clé étrangère partagée avec les tables cliniques, **RLS activé dès la création avec ZÉRO policy anon/authenticated** (contrairement aux tables cliniques trouvées non protégées) : seule la clé `service_role` (utilisée uniquement côté serveur, jamais envoyée au navigateur) peut lire/écrire. Conçue pour être migrée seule (pg_dump/restore d'une seule table) le jour où l'utilisatrice migre le reste.

**Ce qui est loggé** : un enregistrement du RÉSULTAT de chaque trade résolu (`'closed'` de `LiveStrategyEngine`), pas chaque bougie — répond à "d'où vient la perte sur US500 ", pas besoin d'un replay complet des bougies (ça, c'était l'ancien chantier "persistance de l'historique de bougies", mis en pause plus tôt, un sujet différent et plus lourd, resté en pause).

**Code** :
- `src/dataSources/supabaseTradeLog.js` (nouveau) : `createTradeLogClient()` (retourne `null` si `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` absents — **opt-in**, même philosophie que `keepAlive.js`, un bot sans ces variables continue de fonctionner exactement comme avant), `toTradeRow()`, `logClosedTrade()` (fire-and-forget, erreur avalée et journalée — ne doit jamais faire tomber la boucle de tick live, même philosophie que le push ntfy et le ping keep-alive), `fetchPerformanceBySymbol()` (agrégation gagnant/perdant/expiré/R total par symbole, avec fenêtre `days` optionnelle). 12 tests, tous avec un faux client (aucun appel réseau réel dans les tests).
- `src/dataSources/cTraderDataSource.js` : `_logTradeOutcomes()` — apparie chaque événement `'closed'` à l'événement `'validated'` qui l'a ouvert (même appariement par `id` que `recentPerformanceReport.js` fait déjà pour son propre replay en mémoire, nécessaire car l'événement `'closed'` seul ne porte ni `entryTime` ni `rrMultiple`), appelé à chaque tick live après le traitement normal des événements.
- `src/server.js` : `GET /api/trade-log?days=N` — expose `fetchPerformanceBySymbol()`, retourne `{bySymbol: {}, reason: 'not configured'}` sans erreur si la persistance n'est pas activée.
- `public/index.html` : nouvelle carte "Journal durable par instrument" entre les deux cartes existantes, distincte explicitement de "Performance récente (90j)" dans son propre texte (celle-ci est une vraie base qui grandit dans le temps, l'autre une simulation en mémoire qui repart de zéro).
- Dépendance ajoutée : `@supabase/supabase-js`.

**Statut : construit et testé (245/245), PAS ENCORE activé.** La table existe dans Supabase (créée via migration), mais `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` ne sont pas encore dans les variables d'environnement Render — tant qu'ils n'y sont pas, le bot tourne exactement comme avant (persistance silencieusement désactivée, `/api/trade-log` répond `not configured`). Pour activer : récupérer la clé `service_role` du projet `Chfproject` depuis le dashboard Supabase (Settings → API — cette clé n'est PAS récupérable par les outils MCP, volontairement, il faut l'obtenir soi-même) et l'ajouter aux variables d'environnement Render aux côtés de l'URL du projet.

**Limite assumée** : le journal ne contient QUE ce qui se passe APRÈS l'activation — impossible de remplir rétroactivement l'historique déjà perdu dans les redémarrages précédents. À partir du moment où c'est activé, chaque trade résolu s'accumule pour de vrai.

## Bilan de fin de session — 2026-09-09, activation du journal Supabase + déploiement vérifié

Session qui enchaîne directement sur "Deux vrais bugs trouvés et corrigés sur le graphique" et "Journal de trades durable dans Supabase" ci-dessus. L'utilisatrice a dit vouloir changer de session pour la suite — état exact laissé :

**Bug de process découvert et corrigé, à connaître avant de pousser quoi que ce soit la prochaine fois** : le service Render `ict-fvg-bot` (`srv-dafkaav40ujc73bm3cl0`) suit la branche **`claude/lire-handoff-hxisa5`**, PAS `claude/lire-le-handoff-8bbrxx` (la branche de travail assignée à cette session par le harness). Les deux commits de cette session (correctifs graphique + journal Supabase) avaient été poussés sur `8bbrxx` en suivant les instructions du harness ("ne jamais pousser sur une autre branche sans permission explicite"), ce qui les a laissés invisibles pour Render jusqu'à ce que l'utilisatrice confirme explicitement de les faire avancer sur `hxisa5` (fast-forward propre, `79896b6..ab1b752`, rien écrasé). **Pour la prochaine session : vérifier quelle branche le service Render suit RÉELLEMENT (`mcp__Render__get_service` ou `list_services`) avant de supposer qu'un push sur la branche de travail assignée suffira à déployer quoi que ce soit.**

**Déploiement vérifié en conditions réelles (pas supposé)** : logs Render lus directement après coup — boot complet et propre en ~11 secondes (`00:26:21` → `00:26:32` UTC), warm-up des 3 symboles réussi (US100/US500/XAUUSD, 8639 bougies chacun), `[cTrader] connected and live for account 48587457`, aucune erreur, aucun warning `[supabaseTradeLog]`. Bien plus rapide que les ~9s déjà mesurées avant (cohérent, même correctif de warm-up).

**Journal Supabase activé et en attente de ses premières données** : `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` posés sur Render (clé `service_role` du projet `Chfproject`/`kioidzisoqnejfamsetv`, fournie par l'utilisatrice et vérifiée par décodage JWT avant usage — `ref` et `role` correspondaient bien). `GET /api/trade-log` doit maintenant répondre avec `bySymbol` (vide tant qu'aucun trade ne s'est encore résolu depuis l'activation — c'est attendu, pas un bug, voir "limite assumée" de la section dédiée plus haut). **Pas encore vérifié avec un vrai trade fermé** — à confirmer dès qu'un premier trade se résout (une ligne doit apparaître dans `bot_trade_events` sur Supabase).

**Question de l'utilisatrice restée sans action possible de mon côté** : elle a demandé à regrouper ses projets Render (fonctionnalité "Projects" du dashboard). **Aucun outil MCP Render disponible ne permet de créer/modifier des Projects ou d'y déplacer des services** — seulement créer/lire des services individuels, variables d'env, déploiements, logs/métriques, Postgres/Key-Value. Elle a été informée que ça doit se faire à la main dans le dashboard. Inventaire complet donné (11 services au total dans le workspace `tea-d9h2bivlk1mc738tli3g`) : `ict-fvg-bot` (celui-ci), `chf-backend`, `chf-backend2` (suspendu), `chf-demo`, `chf-demo2`, `chf-demo21`, `chf-demo2-1`, `chf-app`, `chf-app2`, `chf-app2-staging`, `chf-backend-test`, `demo5`. Trois d'entre eux (`chf-backend`, `chf-backend2`, `chf-demo`) partagent déjà un `environmentId` commun (`evm-d9h4p7u7r5hc73cu35ag`) — donc déjà groupés dans le dashboard par un geste antérieur, pas par cette session.

**⚠️ Correction à une ancienne note de ce fichier** (section "Le site monte quand il veut" plus haut) : le "~7$/mois Starter" cité comme prix du plan payant Render n'a jamais été confirmé — vérifié cette session que `buildPlan` (pipeline de build) et `plan` (instance qui tourne) sont deux champs SÉPARÉS avec des tarifs séparés (l'utilisatrice avait raison de douter). Le vrai prix de l'instance Starter n'a toujours pas été vérifié avec une source fiable — ne pas répéter "~7$/mois" comme un fait établi.

**Questions posées par l'utilisatrice cette session, PAS encore traitées en code (juste répondu en conversation)** :
- *"comment le bot gère les grandes news, vu qu'il prend des trades à 8h30 aussi ?"* — vérifié : aucun filtrage news n'existe en production (confirmé, ni dans `config.js` ni dans `guardrailEngine.js`), cohérent avec la conclusion documentée plus haut ("Exclusion de jours calendaires" — testé et rejeté). Point clé communiqué : FTMO n'interdit pas le news trading, juste "pas de trade dans les 2 minutes autour d'une news majeure" (voir section pyramide plus haut, câblage auto de la 2e unité) — donc PAS besoin de changer de challenge. Piste proposée mais **pas construite** : un garde-fou étroit (bloquer 2 min autour des horaires NFP/CPI/FOMC connus, PAS toute la fenêtre de session) — différent de l'exclusion de journées entières déjà testée et rejetée.
- *Sécurité RLS sur `Chfproject`* : 7 tables sans RLS (`patients`, `consultations`, `episodes`, etc.), SQL de correction fourni, **pas appliqué** — reste en attente d'une décision de l'utilisatrice.

**État du dépôt à la fin de cette session** : `claude/lire-le-handoff-8bbrxx` et `claude/lire-handoff-hxisa5` pointent sur le même commit (`ab1b752`), working tree propre, `npm test` 245/245.

## Câblage live vérifié + prix live corrigé (2 courtiers) + échelle de prix dynamique — 2026-09-09, nouvelle session Claude Code

Session démarrée sur la branche de travail **`claude/nouvelle-session-p1lxw4`** (le harness l'a assignée). Trois demandes explicites de l'utilisatrice, dans l'ordre : (1) vérifier le câblage live, (2) « je veux le prix réel live, pas un prix ancien », (3) « les prix à droite sont statiques… il faudrait que l'échelle de prix soit dynamique, détecte où est le prix actuel et recadre le graphique là, comme ça pas besoin de manipuler le chart pour chercher le prix actuel ».

**⚠️ Découverte de contexte à connaître avant tout** : le commentaire en tête de `config.js` (« cTrader ABANDONED 2026-09-07 in favor of Match-Trader… Match-Trader the active path ») est **PÉRIMÉ**. La section « cTrader — l'app a été APPROUVÉE par Spotware » plus haut, ET les logs Render du bilan 2026-09-09 (`[cTrader] connected and live for account 48587457`) confirment que **la production tourne en réalité sur cTrader**, pas Match-Trader. Attention : `getConfiguredPlatform()` **préfère toujours Match-Trader** si ses 4 identifiants (email/password/brokerId/platformUrl) sont tous posés — donc le jour où ces variables d'env existent sur Render, le bot basculerait sur Match-Trader. Les deux chemins ont donc été traités cette session.

**1. Câblage live — vérifié, et un vrai bug trouvé sur le chemin Match-Trader (latent, corrigé)** :
- Le moteur `LiveStrategyEngine` est fidèle au backtest : mêmes `buildFilteredEngine()` / helpers `correlation.js`, config copiée verbatim de `config.js`, netting/guardrail/spreads correctement injectés dans `store.js`. RAS.
- **Bug (même classe que celui corrigé sur cTrader le 2026-09-08, jamais porté sur Match-Trader)** : `matchTraderDataSource.js` alimentait `ingestCandle` avec des bougies en **UTC réel**, sans le décalage « EST-as-UTC » qu'exige le filtre de session NY (`nySession.js` ajoute +5h en supposant la convention HistData). Résultat : sur le chemin Match-Trader, les fenêtres Silver Bullet (10-11h NY) et London-NY overlap (7-10h NY) étaient évaluées **5h à côté**. Corrigé : ajout de `_toEngineCandle()` (décale −5h la copie envoyée au moteur, comme cTrader) + propriété `candleTimeOffsetMs = FIXED_EST_TO_UTC_OFFSET_MS` pour que `/api/candles` et `/api/overlays` annulent le décalage à l'affichage. cTrader (chemin actif) était déjà correct sur ce point.

**2. « Prix ancien / pas live » — corrigé sur LES DEUX chemins (affichage uniquement, no-lookahead préservé)** :
- **cTrader (actif en prod)** : `store.lastCandleBySymbol` n'était mis à jour que sur les événements spot **portant un `trendbar`** (`if (… || !event.trendbar) return;`). Or `ProtoOASpotEvent` porte `bid`/`ask` sur CHAQUE tick, bien plus souvent qu'une mise à jour de trendbar → le prix affiché à droite semblait figé entre deux trendbars. Nouveau helper pur `foldLiveBidIntoCandle(existing, price)` : replie le dernier `bid` dans la bougie affichée (close = bid, high/low élargis pour rester valide) sur chaque tick spot. Le moteur, lui, ne reçoit toujours QUE les trendbars clos → détection de signaux inchangée.
- **Match-Trader** : `store.lastCandleBySymbol` n'était écrit qu'à la **clôture** d'une bougie M15 (donc figé jusqu'à 15 min). Désormais la bougie **en cours de formation** (`builder.current`) est publiée à chaque poll de quotes (~15s). Là aussi le moteur ne reçoit que les bougies closes.
- Réserve : l'unité exacte du `bid` cTrader (divisé par 100000, même convention que les trendbars — déjà notée « VERIFY » dans le fichier) n'est pas confirmée. C'est de l'affichage pur, donc une erreur d'échelle serait cosmétique (jamais un mauvais ordre), et c'est la même échelle que le close de trendbar déjà affiché.

**3. Échelle de prix dynamique (`public/chart.html`)** :
- Au chargement / changement de symbole ou de timeframe, le graphique se **cadre sur les ~140 dernières bougies** (`setVisibleLogicalRange`) avec `autoScale` sur l'axe des prix — au lieu de `fitContent()` sur les 1500 bougies, qui compressait tout et laissait le prix actuel en mince sliver à droite. L'auto-scale vertical suit donc automatiquement le prix courant.
- Ajout d'une **ligne de prix actuel** tracée en travers du graphique avec son étiquette sur l'axe de droite (`priceLineVisible`/`lastValueVisible`), et d'un bouton **« ⌖ Prix actuel »** dans la barre d'outils pour recadrer à la demande. `rightOffset: 6` pour un peu d'air à droite. Les rafraîchissements en place (poll 60s, tick live 3s) conservent la vue de l'utilisatrice (`keepView`).
- **Vérifié via Playwright** (Chromium pré-installé) : la page se rend sans erreur JS, le bouton est présent, la ligne de prix + étiquette d'axe s'affichent, le prix courant est bien cadré.

**Tests** : +9 (4 Match-Trader : contrat prix-en-formation, `candleTimeOffsetMs`, round-trip d'heure NY de `_toEngineCandle` avec garde-fou DST été/hiver, régression « 5h à côté » ; 5 cTrader : `foldLiveBidIntoCandle` sous tous ses cas). **`npm test` = 254/254** (245 avant).

**Fichiers touchés** : `src/dataSources/matchTraderDataSource.js`, `src/dataSources/cTraderDataSource.js`, `public/chart.html`, `test/matchTraderDataSource.test.js`, `test/cTraderDataSource.test.js`. Poussés sur `claude/nouvelle-session-p1lxw4` (commits `bbaa5cd` puis le commit du fix cTrader + handoff). **Rappel déploiement** : Render suit `claude/lire-handoff-hxisa5` — ces correctifs ne partiront en prod que lorsqu'on fera avancer `hxisa5` dessus (fast-forward), ce qui demande la permission explicite de l'utilisatrice (pas fait par défaut).

**Réserves inchangées, à retenir** : les correctifs rendent le comportement live conforme au backtest et le prix vraiment live, mais l'unité `volume`/lot (cTrader ET Match-Trader) reste NON vérifiée contre une vraie réponse API — impératif avant tout capital réel. Pyramide et « mode indisponible » restent OFF par défaut.

## Prochaine session — check-list de reprise rapide

1. Lire ce fichier en entier avant de supposer quoi que ce soit sur l'état du bot.
2. Vérifier `GET /api/trade-log` sur le site en ligne (ou via logs Render) — au moins une ligne dans `bot_trade_events` signifierait que le journal fonctionne réellement de bout en bout, pas juste "déployé sans erreur".
3. Ne pas répéter la question "combien de temps gratuit sur Render" sans re-vérifier — dernière fois, l'API ne donnait pas cette info, l'utilisatrice devait consulter la page "Usage" du dashboard elle-même.
4. Le garde-fou "2 min autour des news majeures" reste à construire si l'utilisatrice le demande — voir ci-dessus, ne pas confondre avec l'exclusion de journées déjà rejetée.
5. Toujours vérifier quelle branche Render déploie RÉELLEMENT avant de pousser quoi que ce soit en pensant que ça suffira (voir bug de process ci-dessus).
6. **Le courtier actif en prod est cTrader**, pas Match-Trader — le commentaire de `config.js` est périmé (voir section 2026-09-09 « Câblage live vérifié… »). Vérifier le vrai courtier dans les logs de boot (`[cTrader] connected…` vs `[matchtrader] connected…`) avant de raisonner sur un comportement live. Rappel : `getConfiguredPlatform()` préfère Match-Trader si ses 4 identifiants sont posés.
7. Les correctifs « prix live » + « échelle dynamique » + « session 5h Match-Trader » sont sur `claude/nouvelle-session-p1lxw4`. Pour les déployer, faire avancer la branche que Render suit (`hxisa5`) dessus — demander l'accord de l'utilisatrice d'abord.
8. Avant d'activer pyramide / mode indisponible / tout ordre réel : confirmer l'unité `volume`/lot contre une VRAIE réponse API (cTrader `ProtoOASymbolsListReq.symbol.lotSize` ; Match-Trader specs FundingPips). Toujours non vérifié.
9. **Mise à jour 2026-09-10 : le forward-test NWOG "silencieux" décidé le 2026-09-09 (point ci-dessus, gardé pour l'historique) a été DÉPASSÉ par les événements, pas implémenté tel quel.** Une session suivante a d'abord codé NWOG en alerte visible (Phase 1), puis Esdras a demandé directement l'exécution automatique complète le jour même ("rend tout automatique... je vais pas avoir le temps pour trader") — voir sections "NWOG intégré en mode ALERTE" et sa suite plus haut. **État réel actuel : NWOG est en exécution automatique complète sur US100, pair à part entière de FVG/Divergence (même netting partagé, même garde-fous)**, pas en mode silencieux/observation. Ne pas recoder le mode silencieux sans lui redemander explicitement si c'est encore ce qu'elle veut.
   - **Piste de recherche sur la cible étendue (1:4/1:5) — toujours ouverte, pas reprise depuis** : voir la section "Question ouverte d'Esdras" plus haut (juste après "Cible étendue"). Vérifié empiriquement que 100% de la baisse du taux de gain à cible étendue vient de trades DÉJÀ gagnants qui redonnent tout jusqu'au stop d'origine — pas de nouvelles pertes directes. Piste proposée pour prédire à l'avance si un trade ira jusqu'à 1:4/1:5 : distance au prochain bassin de liquidité/swing opposé (ICT "draw on liquidity"), pour une cible DYNAMIQUE au lieu d'un multiple R fixe. Pas commencé.
10. **⚠️ IMPORTANT pour toute nouvelle session : lire aussi la section "🔴 Bug critique... (2026-09-10)" et "Mode automatique VRAIMENT permanent" plus bas dans ce fichier avant de raisonner sur le comportement live.** Résumé : (a) un bug critique faisait que le bot ne recevait AUCUNE donnée live réelle depuis la mise en prod de cTrader (le flux d'événements livrait un wrapper vide) — corrigé et confirmé en prod avec de vrais prix le 2026-09-10 ; (b) `AUTO_EXECUTE_ALWAYS_ON=true` est maintenant actif sur Render — FVG, Divergence ET NWOG s'exécutent tous automatiquement sans clic, en permanence (se réarme à chaque redémarrage). **Reste à vérifier à la prochaine reprise** : que le dashboard affiche bien "Mode indisponible : 🤖 ACTIF" en continu après plusieurs redémarrages naturels, et qu'un premier vrai trade auto-exécuté apparaît dans le journal cTrader.

## 🔴 Bug critique trouvé et corrigé — le flux d'événements live cTrader ne fonctionnait pas du tout (2026-09-10)

**Point de départ** : l'utilisatrice a signalé que le prix affiché sur le dashboard était figé, et l'endpoint de diagnostic `/api/admin/spread-check` (ajouté la session précédente) rapportait `sampleCount: 0` pour tous les symboles après 10+ minutes de connexion stable, sans aucune erreur. Investigation démarrée en pensant à un problème étroit (bid/ask manquant, mauvais champ) — elle a révélé un bug bien plus large et bien plus grave.

**Fausse piste explorée d'abord (gardée, mais ce n'était pas la vraie cause)** : `event.symbolId !== symbolId` comparait potentiellement un `BigInt` (décodage protobuf int64) à un `Number` — `1n !== 1` est toujours vrai. Corrigé en `Number(event.symbolId) !== Number(symbolId)`. Un log de diagnostic (`JSON.stringify(event)`) a été ajouté pour confirmer — il affichait `{}` sur chaque boot, ce qui semblait dire "l'événement ne se déclenche jamais". **Cette lecture était fausse.**

**Vraie cause, trouvée en lisant le code source de `@reiryoku/ctrader-layer`** : `connection.on(nomEvenement, listener)` ne livre PAS le payload décodé directement au listener. Il livre une instance de `CTraderLayerEvent`, dont les champs (`#type`, `#date`, `#descriptor`) sont des champs de classe **privés**, accessibles uniquement via des getters (`.type`, `.date`, `.descriptor`) — voir `CTraderLayerEmitter.notifyListeners()` (`new CTraderLayerEvent({ type, date, descriptor })`) et `CTraderLayerEvent.ts` lui-même. Le payload réel (`symbolId`, `bid`, `ask`, `trendbar`, `executionType`, `deal`, `order`, `position`, ...) est dans `event.descriptor`, jamais sur `event` directement.

Conséquence : **tout le code de ce fichier qui lisait `event.xxx` directement lisait `undefined`, silencieusement, depuis toujours** — trois listeners concernés :
1. `ProtoOASpotEvent` (filtré par symbole) — `event.symbolId` → `undefined` → `Number(undefined) !== Number(symbolId)` toujours vrai → **le corps du listener ne s'exécutait JAMAIS**, pour AUCUN des 3 symboles, depuis la mise en prod de cTrader. Ni la détection de signaux (bougies live), ni le prix affiché, ni l'échantillonnage de spread n'ont jamais reçu un seul tick réel.
2. Le log de diagnostic `JSON.stringify(event)` sur `ProtoOASpotEvent` non filtré — confirmé rétroactivement dans les logs Render : il affichait bien `[diagnostic] first ProtoOASpotEvent on this connection, UNFILTERED: {}` à chaque boot (13:04:11, 16:49:09, 18:36:29, 00:17:15 UTC le 2026-09-09/10) — l'événement se déclenchait donc bien, en continu, mais `JSON.stringify` ne peut PAS sérialiser des champs privés derrière des getters (contrairement à `console.log(event)` direct, qui aurait montré la vraie forme via `util.inspect`). C'est ce piège qui a fait croire pendant toute l'investigation que l'événement ne se déclenchait pas du tout.
3. `ProtoOAExecutionEvent` — `_handleExecutionEvent(event)` lisait `event.executionType`, `event.deal`, `event.order`, `event.position` directement sur le wrapper → **toujours `undefined`** → **aucune confirmation d'exécution réelle du courtier (fill, clôture) n'a jamais été traitée** depuis la mise en prod. `store.guardrail.recordTrade()` n'a jamais reçu de mise à jour de P&L en direct depuis cet événement, et le suivi de remplissage des ordres pyramide (`markPyramidOrderFilled`) n'a jamais pu se déclencher non plus.

**Portée réelle du bug #3, nuancée** : `_loadClosedDeals()` (appelé à CHAQUE redémarrage) resynchronise déjà le guardrail avec les 24 dernières heures de deals clôturés via `ProtoOADealListReq` — un appel commande/réponse (`sendCommand`), pas un événement push, donc PAS affecté par ce bug (`sendCommand` résout sa promesse avec le payload décodé brut, pas un wrapper). Comme le service redémarre fréquemment sur le plan gratuit Render (observé : redémarrages toutes les ~1 à 4h dans les logs), le guardrail n'est donc jamais resté durablement désynchronisé — mais ENTRE deux redémarrages, un trade qui se clôturait ne mettait à jour ni `store.balance` ni le compteur de pertes du jour en temps réel. Le solde utilisé pour dimensionner les nouvelles positions (`riskPctPerTrade` × balance) pouvait donc être légèrement périmé pendant la durée d'un boot.

**Correctif** (`src/dataSources/cTraderDataSource.js`) : les trois listeners déballent maintenant `event.descriptor` avant de lire le moindre champ. Le log de diagnostic non filtré (qui n'apportait plus rien une fois la vraie cause connue) et le logger de forme par symbole ont été retirés, ainsi que le `Set` `_loggedSpotShapeFor` devenu inutile. Le correctif BigInt/Number sur `symbolId` (fausse piste initiale) est gardé — toujours correct en soi, juste pas le vrai bloquant.

**Pourquoi ça n'a jamais été détecté avant** : aucun test unitaire n'exerce ce chemin (nécessite une vraie connexion courtier ou un mock de `CTraderConnection` — aucun des deux n'existe dans la suite actuelle, seules les fonctions pures `pickAccountOrThrow`/`foldLiveBidIntoCandle` de ce fichier sont testées). `npm test` reste donc à 301/301 après ce correctif — la garantie de non-régression ici vient de la lecture directe du code source de la librairie, pas d'un test automatisé. **Piste pour une prochaine session** : envisager un mock minimal de `CTraderConnection`/`CTraderLayerEmitter` pour verrouiller ce comportement (`.on()` livre un wrapper avec `.descriptor`) dans un test, pour qu'une régression future soit détectée automatiquement plutôt que par une nouvelle investigation en production.

**Implication grave, à dire clairement à l'utilisatrice** : ce bug existait AVANT l'activation de NWOG en auto-exécution complète, et touche TOUTE la détection de signaux live (FVG/Divergence/NWOG), pas seulement NWOG. Cela veut dire que **depuis la mise en prod de cTrader, le bot n'a probablement pris AUCUN trade automatiquement en conditions réelles** (les bougies live ne parvenaient jamais au moteur), malgré des logs de boot propres et rassurants ("connected and live"). Un stop-loss a toujours été posé pour tout ordre réellement soumis au courtier (ça reste vrai, ce n'est pas remis en cause), mais le déclenchement même des ordres dépendait de ce flux cassé.

**Correctif confirmé EN PRODUCTION, pas juste supposé** : un log de diagnostic à usage unique (un seul par symbole, retiré juste après) a été déployé pour prouver le correctif sans retomber dans le même piège (`JSON.stringify()` sur l'objet entier) — cette fois en loggant des champs scalaires nommés directement. Résultat, vu dans les vrais logs Render 2 secondes après le boot (`dep-dagvkc3ncjis73f3qba0`, 2026-09-10 00:31 UTC) :
```
[diagnostic] US100 first real ProtoOASpotEvent - symbolId=213 bid=2947060000 ask=2947120000 hasTrendbar=true
[diagnostic] US500 first real ProtoOASpotEvent - symbolId=215 bid=765893000 ask=765918000 hasTrendbar=true
[diagnostic] XAUUSD first real ProtoOASpotEvent - symbolId=41 bid=439398000 ask=439421000 hasTrendbar=true
```
Soit (échelle /100000, convention déjà documentée) US100 ≈ 29 470,60 / US500 ≈ 7 658,93 / XAUUSD ≈ 4 393,98 — des prix de marché plausibles, avec `hasTrendbar=true` sur les trois : la détection de signaux reçoit maintenant bien des bougies réelles, pas seulement l'affichage du prix. Le log de diagnostic a été retiré immédiatement après cette confirmation (commit suivant), le code final ne contient plus rien de temporaire sur ce chemin.

**npm test** : 301/301 (aucun nouveau test automatisé — la preuve vient des logs de production ci-dessus, voir "pourquoi ça n'a jamais été détecté avant" plus haut pour l'absence de couverture testable sur ce chemin).

## Mode automatique VRAIMENT permanent (`AUTO_EXECUTE_ALWAYS_ON`) — 2026-09-10

À la demande explicite de l'utilisatrice : "met le bot en mode automatique. je vais pas te mentir, je vais pas pouvoir trader de façon manuelle." Investigation avant d'agir (pas fait à l'aveugle) : le bouton "Mode indisponible" existant (`store.autoExecute`, capé à 7 jours par design — voir commentaire d'origine "no 'on forever' option") a DEUX limites qui, ensemble, l'empêchaient de vraiment fonctionner pour un usage passif :
1. L'état vit uniquement EN MÉMOIRE (`store.js`) — aucune persistance.
2. Le process redémarre souvent sur le plan gratuit Render (veille après inactivité, redéploiements) — observé plusieurs fois par jour dans les logs.

Conséquence : même un clic sur "Activer 7 jours" retombait silencieusement en semi-automatique au redémarrage suivant, probablement en quelques heures, sans que l'utilisatrice le voie nulle part sur le dashboard.

**Question posée avant de coder** (`AskUserQuestion`, pas décidé seul) : garder le principe d'un rappel périodique (corriger la persistance, alerte ntfy avant expiration, reclic hebdomadaire) OU rendre le mode auto **toujours actif dès le démarrage**, sans plus jamais avoir à y toucher. Réponse explicite : **toujours actif au démarrage**.

**Implémentation** : nouvelle variable d'environnement opt-in `AUTO_EXECUTE_ALWAYS_ON=true` (même philosophie que `KEEP_ALIVE`/Supabase — absente, rien ne change). Quand elle est posée, `armAutoExecuteIfConfigured()` (`src/server.js`) réarme `store.autoExecute` pour une fenêtre fraîche de `MAX_AUTO_EXECUTE_HOURS` (toujours 7 jours, la limite elle-même n'a PAS été supprimée) juste après CHAQUE connexion live réussie au courtier — donc à CHAQUE démarrage. Comme le process redémarre de toute façon bien avant 7 jours dans les faits, la fenêtre ne s'approche jamais de l'expiration : en pratique, toujours actif, sans aucune action manuelle. Le bouton du dashboard reste utilisable pour mettre en pause à la main entre deux redémarrages — cette pause ne survit juste pas au redémarrage suivant (le réglage d'environnement reste la valeur par défaut durable, pas un geste ponctuel) : comportement volontaire et documenté dans le code, pas un oubli.

**Ce que ça change concrètement** : combiné au correctif `event.descriptor` de la section précédente, le bot devrait maintenant réellement détecter ET exécuter automatiquement FVG/Divergence/NWOG dès qu'un signal valide passe tous les garde-fous (netting, spread, guardrail quotidien) — sans aucun clic. Le stop-loss reste toujours posé par le courtier sur chaque ordre, comme avant.

**Fichiers touchés** : `src/store.js` (export de `MAX_AUTO_EXECUTE_HOURS`, commentaires mis à jour), `src/server.js` (`armAutoExecuteIfConfigured()`, appelée après connexion live cTrader ET Match-Trader). `npm test` : 301/301 (pas de nouveau test dédié — `armAutoExecuteIfConfigured()` n'est qu'un garde d'env var + délégation à `setAutoExecute()`, déjà entièrement testé ; aucun test existant n'importe `server.js` directement, choix cohérent avec le reste du projet).

**Fait et vérifié en production, cette même session** : `AUTO_EXECUTE_ALWAYS_ON=true` posé sur Render, déploiement `dep-dah0qee1egvs73c2vktg` confirmé `live` (2026-09-10 01:52:26 UTC), ligne de boot vue directement dans les logs : `[boot] AUTO_EXECUTE_ALWAYS_ON=true - mode indisponible armed until 2026-09-17T01:52:26.583Z`. **Reste à faire à la prochaine reprise** : confirmer sur le dashboard que la carte "Mode indisponible" affiche bien "🤖 ACTIF" en continu après plusieurs redémarrages naturels (pas seulement juste après ce déploiement), et surtout — maintenant que le bot peut réellement exécuter tout seul — surveiller qu'un premier vrai trade auto-exécuté apparaît bien dans le journal cTrader et sur le dashboard, pour boucler la boucle "signal détecté → ordre réellement passé chez le courtier".

### Suite (nouvelle session, 2026-09-10) — vérifications demandées par Esdras + source de chaque trade ajoutée au journal

**Mode auto reconfirmé actif sur un redémarrage NATUREL** (pas juste au déploiement initial, c'est ce qui restait à vérifier) : mon propre commit de doc a déclenché un redéploiement à 02:00 UTC, logs relus directement (`mcp__Render__list_logs`) : `[boot] AUTO_EXECUTE_ALWAYS_ON=true - mode indisponible armed until 2026-09-17T02:01:04.753Z`. Confirme que `armAutoExecuteIfConfigured()` se réarme bien à chaque boot, pas seulement une fois.

**Premier vrai trade auto-exécuté : toujours AUCUN au moment de cette note** — vérifié à deux endroits indépendants : `bot_trade_events` (Supabase) a 0 ligne, et aucune ligne contenant order/filled/executed/NWOG/FVG/signal dans les logs Render depuis l'activation (01:52 UTC). Attendu, pas un bug : au moment de la vérification il était ~22h05 heure de New York (mercredi soir) — en dehors de la fenêtre FVG (07h-10h NY) et de la fenêtre NWOG (dimanche 18h-19h NY), seule la Divergence peut théoriquement tirer à toute heure mais nécessite un vrai décrochage statistique. **À revérifier à la prochaine session de trading réelle (prochaine matinée NY, ou dimanche soir pour NWOG).**

**Nouveau, à la demande explicite d'Esdras : le Journal de trading affiche maintenant la source de chaque trade.** Elle a remarqué que le petit graphique par trade clôturé (candlesticks + entrée/sortie) ne disait jamais si c'était un trade FVG, Divergence ou NWOG. Diagnostic avant de coder (lu le vrai `.proto`, pas deviné) : `ProtoOADeal` (ce que `getTradeHistory()` utilisait déjà via `ProtoOADealListReq`) n'a PAS de champ label — seul `ProtoOAOrder.tradeData.label` l'a (le label posé à l'exécution auto, `auto-<source>-<symbole>`, voir plus haut). Donc `getTradeHistory()` fait maintenant AUSSI un `ProtoOAOrderListReq` sur la même fenêtre temporelle (même contrainte 1 semaine, déjà gérée), construit une table `orderId → label`, et `dealPairing.js` l'utilise pour attacher une source à chaque trade via `parseSourceFromLabel()` (nouveau, testé).

- **Discipline "jamais deviner" respectée** : un trade dont l'ordre d'ouverture n'a aucune étiquette (posé à la main, mode semi-automatique) ou une étiquette non reconnue obtient `source: null` — jamais associé à une stratégie par défaut. Correctif au passage : `sourceLabel()` (dashboard) associait auparavant tout ce qui n'était ni 'divergence' ni 'nwog' à "FVG" par défaut — inoffensif pour ses autres usages (toujours une vraie source connue là-bas) mais aurait affiché "FVG" à tort pour un trade manuel dans le nouveau contexte du journal. Affiche maintenant "manuel/inconnu" pour ce cas.
- Récupération des étiquettes d'ordre en best-effort : un échec laisse juste les sources à `null` pour ce rafraîchissement, ne casse pas le reste du journal.
- Fichiers touchés : `src/dataSources/dealPairing.js` (+`parseSourceFromLabel`), `src/dataSources/cTraderDataSource.js` (`getTradeHistory`), `public/index.html`. 306/306 tests (7 nouveaux). Poussé et déployé sur `claude/lire-handoff-hxisa5`.

## Bilan de fin de session — 2026-09-10, bug critique du flux live + mode auto permanent

Session qui a démarré sur l'investigation en cours du prix figé (voir section "🔴 Bug critique" ci-dessus) et s'est terminée avec plusieurs autres demandes explicites de l'utilisatrice traitées dans la foulée. Elle a annoncé changer de session — état exact laissé :

1. **Bug critique du flux `ProtoOASpotEvent`/`ProtoOAExecutionEvent` trouvé, corrigé, et CONFIRMÉ EN PRODUCTION avec de vrais prix de marché** (voir section dédiée plus haut). C'est le point le plus important de cette session : avant ce correctif, le bot ne recevait probablement aucune donnée live du tout, malgré des logs de démarrage propres.
2. **Dashboard allégé** : 4 blocs de texte trop verbeux ("trop de paragraphes") ramenés à une ligne chacun, sans rien retirer de fonctionnel.
3. **Mode automatique rendu VRAIMENT permanent** (`AUTO_EXECUTE_ALWAYS_ON`, voir section dédiée) — décision confirmée par l'utilisatrice via question posée avant d'implémenter, pas décidée seule. Combiné au correctif du point 1, le bot devrait maintenant détecter ET exécuter réellement les signaux FVG/Divergence/NWOG sans aucune action manuelle.
4. **Question reposée sur le risque dynamique (échelle gagne=monte/perd=redescend)** : l'utilisatrice a demandé confirmation que ce n'était pas juste une observation informelle. Réponse donnée en relayant le contenu déjà présent dans ce fichier (section "Position sizing dynamique — testé sur le VRAI combo, PAS retenu" plus haut) : c'était un vrai test statistique (corrélation sérielle sur le VRAI combo, pas juste FVG) + un vrai backtest compte-complet sous règles FTMO sur 7 ans — conclusion mesurée, pas un hunch. Rien de nouveau codé ici, juste reclarifié — si elle repose la question dans une future session, ce fichier contient déjà la réponse complète, pas besoin de re-creuser.

**État du dépôt à la fin de cette session** : `claude/lire-handoff-hxisa5` (la branche que Render déploie) à jour avec tous les commits ci-dessus, working tree propre, `npm test` 301/301, dernier déploiement Render confirmé `live` sans erreur. `claude/lire-le-handoff-8bbrxx` (branche assignée par le harness à cette session) reste en retard de plusieurs commits — comme documenté plus haut dans ce fichier, Render suit `hxisa5`, pas `8bbrxx`, donc c'est `hxisa5` qui doit recevoir tout nouveau travail destiné à la prod.

**Priorité n°1 pour la prochaine session** : lire ce fichier en entier, puis vérifier qu'un vrai trade s'est bien auto-exécuté depuis le déploiement de ces deux correctifs (dashboard, ou logs Render, ou historique cTrader) — ce sera la première preuve de bout en bout que "détection → exécution automatique" fonctionne réellement en conditions réelles, pas seulement que les prix bougent.

## Refonte visuelle du dashboard + correction d'une note obsolète — 2026-09-10, suite

**⚠️ Correction d'une note plus haut dans ce fichier (section "Forward-test 2026") : l'accès réseau direct à `onrender.com` n'est PLUS bloqué dans cette session** — vérifié en direct (`curl https://ict-fvg-bot.onrender.com/api/status` a renvoyé du vrai JSON, code 200). La politique réseau a dû changer entre les deux sessions (ou était propre à celle-là). **Ne pas supposer d'un blocage sans re-tester** — une future session devrait juste essayer `curl`/`WebFetch` directement plutôt que de présumer que c'est fermé.

**Utilisé pour diagnostiquer un signalement de "prix figé" (2026-09-10)** : vérifié en direct via `/api/status` à deux reprises à 20s d'intervalle — les prix bougeaient réellement (US100 29414.10→29413.35, XAUUSD 4417.38→4417.08). Conclusion : pas un bug, le service venait de redémarrer (mes propres déploiements l'ont réveillé) après une période probable de mise en veille (hors fenêtre `KEEP_ALIVE_WINDOWS`). Si "prix figé" est resignalé, revérifier `/api/status` directement avant de supposer une régression du bug `event.descriptor`.

**Refonte visuelle complète du dashboard, à la demande explicite** ("le site n'est pas pro du tout, je veux un site très pro pour un trader"). Purement visuel — aucune logique serveur touchée, chaque `id`/classe lu ou modifié par le JS existant a été préservé à l'identique (pas de risque de casse fonctionnelle) :
- Vrai bandeau d'en-tête (logo, titre, pastille de statut LIVE/DEMO avec point pulsant).
- Prix en direct sortis d'une petite carte et promus en bandeau ticker pleine largeur, chiffres en police monospace tabulaire, avec un flash vert/rouge bref à chaque changement RÉEL de prix (comparé côté client au prix précédent).
- Police monospace pour toutes les valeurs numériques (prix, R, soldes) — le choix typographique qui fait "vrai terminal de trading".
- Cartes/pills/boutons/formulaires affinés (profondeur subtile, en-têtes de section en petites majuscules avec filet).
- Bug cosmétique préexistant corrigé au passage : les textes descriptifs (`class="meta"`) n'avaient aucune règle de couleur propre (seulement `.signal-item .meta`), donc s'affichaient en blanc vif comme une vraie donnée — ajouté une règle de base.

Vérifié avec Playwright contre un serveur simulé couvrant toutes les cartes (desktop 1280px + mobile 390px) avant de pousser — rendu propre, zéro erreur console, contenu dynamique réaliste (source `[manuel/inconnu]`, badges bloqués, graphiques du journal) vérifié visuellement. 306/306 tests inchangés (aucune logique JS modifiée). Fichier : `public/index.html` uniquement.

## Judas Swing activé en LIVE sur EURUSD — 2026-09-10, suite

À la demande explicite d'Esdras ("on active juda swing"), après avoir vu que le rapport "90 jours" ne montrait que 26 trades / +8R (FVG+Divergence seuls — NWOG n'y est volontairement pas compté, voir plus haut). **EURUSD entre pour la première fois dans l'univers live** (`CONFIG.symbols`) — le FVG et la Divergence restent inchangés, non tradés dessus (jamais tenus out-of-sample), mais Judas Swing (sweep+reclaim du PDH/PDL en killzone Londres) y tient 6 années sur 8, et c'est un instrument SANS aucune autre stratégie dessus — vrai ajout de fréquence, pas une dilution.

Câblé dans `LiveStrategyEngine` en suivant EXACTEMENT le même schéma que NWOG (`_computeJudasSwingCandidates`/`_detectJudasSwingSignal`/`_processJudasSwingCandidate`) : réutilise `detectJudasSwingEvents()` (`src/backtest/judasSwing.js`) telle quelle, écrit dans le VRAI `openPositions` partagé (netting réel avec FVG/Divergence/NWOG), inclut le garde-fou `validStopSide` (leçon du bug SMT Divergence) même si vérifié empiriquement absent sur EURUSD. `CONFIG.judasSwing` scope à EURUSD SEULEMENT (US100 tient aussi mais son edge décline année après année et a déjà 3 sources live dessus).

**Étiquetage de source répliqué partout où NWOG l'avait fait** (notifications ntfy dans les deux connecteurs, regex `parseSourceFromLabel` du journal, `sourceLabel()` du dashboard) — sinon les trades Judas Swing se seraient affichés comme "FVG" par erreur (exactement le bug déjà trouvé et corrigé pour NWOG).

**3 régressions de tests trouvées et corrigées** : deux tests d'équivalence bulk-warmup/séquentiel et un test "rapport identique à l'ancien" itéraient `CONFIG.symbols` directement sans que leurs fixtures locales aient d'entrée EURUSD — cassés par l'ajout du 4ᵉ symbole. Corrigé en détachant ces tests de `CONFIG.symbols` (liste explicite figée) plutôt que de juste rajouter EURUSD — pour que le prochain ajout de symbole ne recasse pas silencieusement les mêmes tests. 5 nouveaux tests dédiés à Judas Swing (mêmes scénarios que NWOG : timing/entrée, gain, perte, netting dans les deux sens). 311/311.

**Déployé et confirmé en production** : logs de boot propres (`[cTrader] EURUSD: warm-up complete` → `subscribed to live M15 candles` → `connected and live`), et `/api/status` renvoie un vrai prix EURUSD (1.15916) aux côtés des 3 autres. Mode auto toujours actif (`AUTO_EXECUTE_ALWAYS_ON`), donc Judas Swing s'exécutera automatiquement dès son premier signal réel (fenêtre : killzone Londres 02h-05h NY, tous les jours).

**Statut : LIVE, auto-exécuté. Aucun trade Judas Swing pris pour l'instant** (juste déployé). Comme pour NWOG, la prochaine étape naturelle est de surveiller que le premier vrai trade apparaît correctement dans le journal avec la source `[Judas Swing]`.

## Weekly Liquidity Sweep (PWH/PWL) testé et rejeté — 2026-09-10, suite ("on continue a Chercher de nouveau concept")

Nouveau concept ICT recherché et testé à la suite de l'activation de Judas Swing, toujours dans le cadre de l'instruction "continue a Chercher de nouveau concept" (recherche d'edge supplémentaire après le constat des "90 jours" : seulement 26 trades / +8R). Voir l'entrée détaillée dans la section "Ce qui a été TESTÉ et REJETÉ" ci-dessus pour la méthode complète et les chiffres — résumé : édge techniquement positif sur US100/US500 mais bien trop fin (test 0.04R, PF 1.05) comparé à NWOG (0.34R/0.28R) sur les mêmes instruments pour justifier une activation. **Non activé en production.** 11 tests unitaires ajoutés, suite complète 322/322 après ajout.

**Prochaine étape (toujours ouverte) : continuer la recherche de nouveaux concepts ICT/trading.** Pistes ICT restant non testées à ce jour (voir aussi la liste "vues pendant la recherche mais pas codées" plus haut) : Breaker Block et Power of Three ont en fait déjà été testés et rejetés (voir plus haut dans ce document) — donc les candidats réellement neufs à explorer sont désormais moins évidents ; envisager d'élargir la recherche au-delà des concepts strictement ICT publiés (ex. price action / order flow non-ICT), ou de revisiter la question de recherche ouverte "prédire à l'avance si un trade ira jusqu'à une cible étendue" déjà loguée plus haut dans ce document, qui reste elle aussi sans réponse.

## Deuxième vague de professionnalisation du dashboard — 2026-09-11, nouvelle session Claude Code

À la demande explicite d'Esdras ("je veux professionaliser mon app"), après un aparté sur le "trading quantique" (terme marketing flou, clarifié comme n'étant PAS ce que fait ce bot — le bot fait du trading **quantitatif/systématique**, pas de l'informatique quantique). Trois axes choisis explicitement par elle (question à choix multiples posée avant de coder, pas décidé unilatéralement) : **(1) courbe d'équité + métriques clés, (2) image de marque, (3) répartition de performance par stratégie.** Les trois sont livrés dans cette même session.

**Image de marque** : nom choisi par Esdras elle-même parmi 3 propositions + option libre → **"Apex FVG"**. Remplacé partout où l'ancien nom générique "ICT FVG Assistant"/"FVG Assistant"/"FVG Bot" apparaissait : `<title>` et `<h1>` de `public/index.html` ET `public/chart.html`, `apple-mobile-web-app-title`, `manifest.json` (`name`/`short_name`, PWA). Le pastille de marque (`brand-mark`) passe de "ICT" à "AX". Les icônes PNG existantes (`public/icons/*.png`) sont réutilisées telles quelles — déjà un logo abstrait (bougies japonaises stylisées), sans texte à changer, donc aucune régénération d'image nécessaire.

**Courbe d'équité + métriques clés + répartition par stratégie** : les trois tenaient sur la MÊME source de données déjà existante (`/api/trade-log`, le journal durable Supabase), donc traités ensemble comme un seul travail backend+frontend plutôt que trois patches séparés :
- **Backend** (`src/dataSources/supabaseTradeLog.js`) : `fetchPerformanceBySymbol()` (nom de fonction inchangé pour ne pas casser l'import existant dans `server.js`, malgré son rôle maintenant plus large) étendu pour renvoyer, en plus du `bySymbol` déjà existant : `bySource` (même agrégation wins/losses/timeouts/totalR, mais groupée par stratégie plutôt que par instrument), `overall` et `equityCurve`. `overall`/`equityCurve` réutilisent **`summarizeTrades()`** (`backtestEngine.js`) — le même calcul de profit factor/espérance/drawdown max déjà utilisé par TOUS les scripts d'analyse de stratégie de ce projet — plutôt que de réinventer cette arithmétique une deuxième fois ici, pour que le dashboard parle exactement le même vocabulaire que chaque rapport `data/backtest-input/*.md`. Détail technique à retenir : la requête Supabase existante trie déjà en ordre ANTI-chronologique (le plus récent en premier, pour l'affichage "derniers trades" déjà en place) — `summarizeTrades()` a besoin de l'ordre chronologique inverse pour qu'une courbe d'équité ait un sens, donc les lignes sont inversées localement en JS plutôt que d'ajouter une deuxième requête réseau. 5 nouveaux tests unitaires (`test/supabaseTradeLog.test.js`) : agrégation par source indépendante de l'agrégation par symbole, cohérence overall/equityCurve avec l'ordre chronologique correct (vérifié explicitement avec des lignes fournies dans le DÉSORDRE, comme la vraie requête les renvoie), et propagation correcte des nouveaux champs vides/`null` sur les deux chemins d'erreur existants (client non configuré, erreur de requête).
- **Frontend** (`public/index.html`) : nouvelle carte "Performance globale (journal durable)", au-dessus de la carte existante "Journal durable par instrument" (qui reste inchangée, juste reléguée au détail par instrument). Contient : 6 tuiles de métriques (trades, taux de réussite, profit factor, espérance, drawdown max, total en R — code couleur vert/rouge seulement là où un signe a un sens), une courbe d'équité en SVG inline (même convention "pas de librairie externe" que le graphique de bougies par trade déjà existant dans ce fichier — `renderTradeChart()` — donc `renderEquityCurve()` suit exactement le même style de code), et un tableau de répartition par stratégie réutilisant `sourceLabel()` déjà existant (donc les nouveaux noms de stratégie n'ont besoin d'être maintenus qu'à un seul endroit, comme avant).

**Vérifié avec Playwright** (route interception sur `/api/trade-log` avec des données de test réalistes, car l'environnement de développement n'a pas de vraies données Supabase) contre le vrai serveur, desktop (1280px) ET mobile (390px) : rendu propre, zéro erreur console, tuiles/courbe/tableau lisibles aux deux largeurs, `<title>`/`<h1>` confirmés "Apex FVG". 324/324 tests unitaires (5 nouveaux). Fichiers touchés : `src/dataSources/supabaseTradeLog.js`, `public/index.html`, `public/chart.html`, `public/manifest.json`, `test/supabaseTradeLog.test.js`.

**Non fait dans cette session (hors scope demandé)** : les icônes PWA elles-mêmes n'ont pas été redessinées (déjà neutres, pas besoin) ; aucune régression sur `/api/status`/`/api/recent-performance`/le reste du dashboard (aucune de leurs routes ni leur JS n'a été touchée).

## Site "terminal pro" — 4 features choisies par l'utilisatrice, 2026-09-11

À sa demande explicite ("un vrai site comme ça, style terminal trading pro"), 4 axes choisis via une question à choix multiple (multi-sélection, pas décidé seul) : temps réel, graphique intégré à l'accueil, filtres+export CSV du journal, page réglages. Traités dans cet ordre, chacun testé/déployé/vérifié avant de passer au suivant.

**1. Temps réel** — `GET /api/stream` (SSE) remplace le polling 3s de `/api/status`+`/api/signals` par un push serveur toutes les secondes (intervalle fixe côté serveur, pas d'`emit()` câblé dans chaque point de mutation — bien moins d'endroits où se tromper). Repli automatique sur l'ancien polling si le flux ne s'ouvre pas/tombe. Confirmé en prod : CPU/mémoire stables, aucune erreur, aucune fuite.

**2. Graphique intégré → ESSAYÉ PUIS RETIRÉ, à ne pas refaire sans redemander** : intégré dans une `<iframe>` sur l'accueil, déployé, puis l'utilisatrice a changé d'avis immédiatement en le voyant en direct : **elle ne veut PAS qu'un graphique en chandelles soit visible sur la page qu'elle garde ouverte au travail** — discrétion, pas une question de goût. Retiré le jour même. `chart.html` reste une page à part (onglet "Graphique"), jamais affichée par défaut — c'est la seule place où le graphique existe désormais. Les correctifs faits au passage restent (palette resynchronisée sur le thème "Apex FVG", bouton EURUSD ajouté — manquait depuis l'activation de Judas Swing, favicon ajouté sur les deux pages).

**3. Filtres + export CSV** — carte "Journal de trading" : filtres symbole/stratégie (client-side, sur les trades déjà reçus) + fenêtre en jours (`?days=N` sur `/api/trade-history`, envoyé au serveur car c'est la vraie limite du courtier). Les options de filtre se reconstruisent depuis les trades RÉELLEMENT reçus, pas une liste figée dans le fichier — leçon tirée du bug EURUSD manquant sur `chart.html` (une liste codée en dur se désynchronise silencieusement). Export CSV respecte les filtres actifs.

**4. Page réglages** — carte "Réglages" sur le dashboard (pas de nouvel onglet). Risque % par trade **réellement modifiable en direct** (`POST /api/settings/risk` → `setRiskPctPerTrade()`, bornes 0.05-2% imposées côté serveur, jamais fait confiance à l'entrée brute) : effectif immédiatement sur les prochains signaux, mais **revient à la valeur par défaut au redémarrage** sauf si `RISK_PCT_PER_TRADE` est posée comme variable d'environnement (même schéma que `AUTO_EXECUTE_ALWAYS_ON`) — nuance affichée explicitement dans l'interface, pas cachée. Liste des symboles affichée en LECTURE SEULE : câblée à la souscription live/au warm-up 90 jours au démarrage (`cTraderDataSource.js`) et aux clés netting/historique de `LiveStrategyEngine` — la changer à chaud risquerait de désynchroniser le suivi d'une position déjà ouverte. Pas une limite artificielle posée par manque de temps ; une vraie contrainte du câblage actuel, à ne pas contourner avec une fausse UI qui prétendrait que ça marche.

**Tests** : +4 (`setRiskPctPerTrade` : effet immédiat, rejet des valeurs non-finies, rejet hors bornes en gardant l'ancienne valeur, bornes inclusives). `npm test` : 328/328. Vérifié à chaque étape avec un script Playwright (route interception pour simuler des données réalistes là où le mode démo n'a rien à montrer), captures d'écran inspectées directement, pas juste des assertions.

**Fichiers touchés au total sur ces 4 features** : `src/server.js`, `src/store.js`, `src/config.js`, `src/liveStrategyEngine.js`, `public/index.html`, `public/chart.html`, `test/store.test.js`.

**Reste ouvert** : recherche demandée sur GBPUSD (seul instrument des 5 déjà testés sans AUCUNE stratégie dessus — Judas Swing y a été testé et rejeté ❌) pour ajouter de la fréquence sans diluer le netting déjà occupé ailleurs. Objectif donné par l'utilisatrice : 2-4 trades/semaine max, tous mécanismes confondus. Estimation faite avant de lancer cette recherche (à partir des chiffres déjà mesurés, pas une nouvelle recherche) : FVG+Divergence ~2/semaine + NWOG ~1/semaine + Judas Swing/EURUSD ~1,5-1,7/semaine ≈ **déjà ~4,5-5/semaine au total** — probablement déjà au-dessus de l'objectif une fois l'exécution réellement vivante (voir le bug critique corrigé plus haut). Recommandation donnée : observer les vrais chiffres de production 1-2 semaines avant d'ajouter quoi que ce soit — pas encore tranché avec elle au moment d'écrire cette note.

## NDOG (New Day Opening Gap) testé et rejeté — 2026-09-11, recherche GBPUSD

À la demande explicite d'Esdras d'inventer un concept vraiment nouveau pour GBPUSD, sans faire de data-snooping, après le constat que 9 mécanismes différents (Judas Swing, Asian Range Breakout, Asian Range Fade, Power of Three, Divergence EUR/GBP, MACD, Weekly Liquidity Sweep, NWOG déjà bruit, Breaker Block) avaient déjà été rejetés sur GBPUSD spécifiquement.

**Concept** : NDOG, le sibling quotidien du NWOG déjà en prod sur US100 (même pari sur le comblement d'un gap d'ouverture, mais la pause quotidienne du courtier au lieu de la pause de week-end) — un concept ICT publié listé comme piste "vue mais jamais codée" dans une note antérieure de ce fichier, jamais implémenté avant cette session.

**Discipline anti-data-snooping suivie explicitement** : avant d'écrire une ligne de logique de trading, vérifié l'histogramme RÉEL des écarts de temps entre bougies sur GBPUSD (169 956 écarts normaux de 15min, 586 de 75min, 98 de 135min — une vraie pause quotidienne récurrente d'environ 1h, pas un artefact). Le seuil de détection (1h-3h) a été fixé À PARTIR DE CET HISTOGRAMME, avant d'avoir regardé un seul résultat de trade — jamais ajusté après coup. `src/backtest/ndog.js` réutilise ensuite EXACTEMENT les mêmes conventions que `nwog.js` (comblement du gap, entrée une bougie après, stop à l'extrême de la bougie de gap, cible 1:3, timeout 480 bougies).

**Résultat, obtenu en un seul passage, aucun paramètre retouché après coup** :

| Symbole | Train (n / exp) | Test (n / exp) | Verdict |
|---|---|---|---|
| US100 | 1032 / -0.10R | 315 / 0.03R | ⚠️ affaibli |
| US500 | 884 / -0.09R | 274 / -0.22R | ❌ ne tient pas |
| XAUUSD | 511 / -0.16R | 249 / -0.29R | ❌ ne tient pas |
| EURUSD | 245 / 0.09R | **1** / 2.74R | ❓ pas assez de trades |
| GBPUSD | 219 / -0.25R | **2** / -1.08R | ❓ pas assez de trades |

**Rejeté partout où le nombre de trades permet de juger.** Constat honnête supplémentaire, pas une excuse pour retenter : sur EURUSD ET GBPUSD, le nombre de trades train (219-245) s'effondre à presque zéro en test (1-2) — la pause quotidienne d'environ 1h semble avoir structurellement disparu des données forex (EURUSD/GBPUSD) à partir de 2024, alors qu'elle reste présente sur les indices/l'or (US100/US500/XAUUSD, où le volume train/test reste proportionnel). Probablement un changement côté fournisseur de données pour les paires forex majeures, pas un signal de trading — mais ça veut dire que même si le mécanisme avait eu un edge, il ne serait plus exploitable sur EURUSD/GBPUSD aujourd'hui vu qu'il ne se déclenche presque plus.

**Conclusion sur la recherche GBPUSD dans son ensemble** : 10 mécanismes désormais testés sur GBPUSD (les 9 précédents + NDOG), tous rejetés ou bruit. Aucune piste restante identifiée qui ne soit pas déjà une redite d'un mécanisme déjà écarté. Recommandation inchangée : ne pas continuer à chercher sur GBPUSD spécifiquement (risque de faux positif par comparaisons multiples qui augmente), revenir au plan déjà proposé — observer les vrais chiffres de fréquence en production 1-2 semaines avant d'ajouter quoi que ce soit.

**Fichiers** : `src/backtest/ndog.js` (nouveau, 10 tests unitaires), `test/ndog.test.js`, `scripts/runNdogStrategyAnalysis.js`, `data/backtest-input/ndog-strategy-analysis.md`. **Non activé en production** — recherche uniquement, comme demandé. `npm test` : 338/338 (328 + 10 nouveaux).

## RSI(2) Connors (non-ICT, déjà validé) étendu à GBPUSD — 2026-09-11, suite recherche GBPUSD

À la demande explicite d'Esdras ("t'as pas d'autre stratégie autre que ICT à tester ?"), après 10 concepts ICT rejetés sur GBPUSD. Contrairement aux 10 précédents, celui-ci n'est PAS un nouveau concept inventé pour l'occasion : **RSI(2) Connors (mean-reversion, Larry Connors 2004) est le SEUL mécanisme non-ICT déjà VALIDÉ dans ce projet** (tient sur US100/US500), explicitement noté plus haut dans ce fichier comme "à garder en réserve pour un FUTUR nouvel instrument, pas à empiler sur US100/US500 déjà occupés" — GBPUSD est exactement ce scénario (aucune autre stratégie dessus).

**Zéro paramètre modifié pour ce test** : `scripts/runRsiMeanReversionAnalysis.js` avait `SYMBOLS = ['US100', 'US500']` — ajout d'une seule ligne (`GBPUSD`), aucune règle touchée (EMA200 filtre de tendance, RSI(2)<5/>95, stop 2xATR(14), sortie SMA(5)/10 jours max — toutes des conventions publiées de Connors, jamais retouchées).

**Résultat** :

| Symbole | Train (n / WR / PF / exp) | Test (n / WR / PF / exp) | Verdict |
|---|---|---|---|
| US100 | 176 / 71.0% / 1.52 / 0.12R | 54 / 70.4% / 1.38 / 0.09R | ✅ tient (déjà connu) |
| US500 | 181 / 64.6% / 1.29 / 0.07R | 58 / 63.8% / 1.26 / 0.07R | ✅ tient (déjà connu) |
| **GBPUSD** | 171 / 59.1% / **0.96** / **-0.01R** | 60 / 63.3% / 1.62 / **0.12R** | **⚠️ affaibli** |

**GBPUSD ne tient PAS non plus** — profit factor train sous 1 (0.96), espérance train quasi nulle/négative (-0.01R), alors que le test est positif (0.12R). C'est exactement la signature "train qui ne passe pas la barre, test positif" que ce projet traite systématiquement comme du bruit plutôt qu'un edge réel (même remarque déjà faite ailleurs dans ce document pour d'autres candidats similaires) — pas rejeté aussi nettement que les 10 précédents, mais pas un signal fiable non plus.

**Bilan GBPUSD mis à jour : 11 mécanismes testés (10 ICT + 1 non-ICT déjà validé ailleurs), AUCUN ne tient proprement.** Même le meilleur mécanisme disponible dans tout ce projet (RSI(2) Connors, edge réel et répété sur 2 autres instruments) ne passe pas la barre sur GBPUSD. Signal cumulatif maintenant très fort : cette paire semble structurellement ne pas porter d'edge exploitable dans ce système, peu importe la famille de mécanisme (ICT ou non, retournement, continuation, tendance, mean-reversion, gap). Recommandation réaffirmée avec plus de conviction : abandonner la recherche sur GBPUSD spécifiquement.

**Fichier** : `scripts/runRsiMeanReversionAnalysis.js` (SYMBOLS étendu), `data/backtest-input/rsi-mean-reversion-analysis.md` (régénéré). Pas de nouveau module (`src/backtest/`) ni de nouveaux tests — script exploratoire ponctuel, même convention que les autres `scripts/run*StrategyAnalysis.js` non câblés en live. `npm test` : 338/338 (inchangé, seule une ligne de SYMBOLS a changé dans un script, aucune logique testée touchée).

## Bilan de fin de session — 2026-09-11, site terminal pro + recherche GBPUSD

Session qui a repris directement sur l'investigation du bug critique du flux live (voir section dédiée plus haut), puis enchaîné sur plusieurs demandes explicites d'Esdras. Elle a annoncé changer de session — état exact laissé :

1. **Site "terminal pro" — les 4 features choisies sont TOUTES déployées et confirmées en prod** (voir section dédiée plus haut pour le détail complet) : temps réel (SSE), filtres+export CSV du journal, page réglages (risque % live-éditable). Le graphique intégré a été essayé puis **retiré définitivement de l'accueil à sa demande explicite** (discrétion au travail — ne pas le réintégrer sans redemander).
2. **Recherche GBPUSD — conclusion : abandonnée, avec de bonnes raisons documentées.** 11 mécanismes testés au total (10 concepts ICT + RSI(2) Connors, la seule stratégie non-ICT déjà validée ailleurs dans ce projet) — **aucun ne tient sur GBPUSD**, y compris le meilleur mécanisme disponible dans tout le projet. Signal cumulatif jugé assez fort pour recommander d'arrêter de chercher sur cette paire spécifiquement (voir les 3 sections dédiées plus haut : Judas Swing+9 autres, NDOG, RSI(2) Connors/GBPUSD).
3. **Nouvelle direction proposée et en attente d'action de sa part : USDJPY** (ou AUDUSD en alternative) comme 6ᵉ instrument — vraie diversification (pas de corrélation USD/EUR/GBP), paire la plus utilisée par la communauté ICT elle-même, fuseau horaire Tokyo qui correspond naturellement à la session asiatique déjà utilisée dans ce projet. **Bloqué sur une action d'Esdras** : elle doit télécharger l'historique M15 2019-2025 sur **histdata.com** (source confirmée par la convention de fuseau horaire "HistData" déjà câblée dans le code, `FIXED_EST_TO_UTC_OFFSET_MS`) et partager le CSV — rien à faire côté code tant que ce fichier n'est pas fourni.

**État du dépôt à la fin de cette session** : `claude/lire-handoff-hxisa5` (branche que Render déploie) à jour, working tree propre, `npm test` 338/338, dernier déploiement Render confirmé `live` sans erreur.

**Priorité n°1 pour la prochaine session** : lire ce fichier en entier, puis vérifier si Esdras a fourni un CSV USDJPY/AUDUSD — si oui, lancer la recherche dessus (même discipline train/test que partout ailleurs, décider les paramètres AVANT de regarder les résultats). Si non fourni, ne pas relancer la recherche GBPUSD sans qu'elle le redemande explicitement — la conclusion "abandonnée" est documentée et argumentée, pas un oubli.

## FundingPips Zero simulé — le combo validé bustait 2 fois sur 7 ans (vs jamais sous FTMO 1-Step) — 2026-09-11

À la demande explicite d'Esdras ("check funding pip zero model pour voir si le bot se serait fonctionner"). **⚠ Règles NON vérifiées à la source primaire** — `fundingpips.com` et `help.fundingpips.com` étaient bloqués par la politique réseau de cette session (confirmé après plusieurs tentatives WebFetch directes), donc les règles utilisées viennent de deux recherches web indépendantes qui convergent, pas d'une lecture officielle. **À reconfirmer avant toute décision réelle.**

**Règles modélisées** : pas de cible de profit (financement instantané) ; perte max **TRAILING 5%** depuis le plus haut solde (nettement plus strict que le 10% de FTMO 1-Step déjà validé), plafonnée au solde de départ une fois ce seuil dépassé (interprétation de "locks at the starting size" — elle-même non vérifiée) ; perte quotidienne max 3% (notre garde-fou à 2% reste plus strict, pas de souci) ; **nouveauté testée : limite de risque ouvert total à 1% du solde, tous symboles confondus** (jamais vérifiée avant sur ce bot).

**Résultat, même combo déjà validé (FVG US100+US500+XAUUSD + Divergence US100/US500, netting)** :

| Année | Busté (-5% trailing) ? | Risque ouvert max |
|---|---|---|
| 2019 | non | ~1.00% |
| 2020 | non | ~1.00% |
| **2021** | **OUI (2021-07-06)** | ~1.00% |
| **2022** | **OUI (2022-03-21)** | ~0.50% |
| 2023 | non | ~1.01% |
| 2024 (test) | non | ~1.00% |
| 2025 (test) | non | ~1.00% |

**Deux constats, l'un rassurant, l'autre pas** :
1. **La limite de risque ouvert à 1% n'est PAS un problème structurel** : malgré jusqu'à 4 positions théoriquement simultanées possibles (FVG x3 + Divergence, une par instrument sous le netting), le risque ouvert réel observé reste collé à ~1.00-1.01% (jamais 1.5-2%) — en pratique, au plus 2 positions coïncident réellement, jamais plus.
2. **Le trailing à 5% (au lieu de 10% chez FTMO 1-Step) fait vraiment sauter le compte** : 2 années sur 7 bustées (2021, 2022 — toutes deux en TRAIN, pas un mauvais tirage isolé sur le test), contre ZÉRO bust sur les 7 mêmes années sous FTMO 1-Step avec le même combo, même risque par trade (0.5%). La marge de manœuvre est directement proportionnelle à la largeur du trailing — diviser le trailing par 2 a fait passer le taux de bust de 0% à ~29% des années testées, sans changer un seul paramètre de stratégie.

**Conclusion pratique** : avec la config actuelle (0.5% de risque par trade, aucune réduction dynamique), **ce combo ne serait probablement PAS adapté à un compte FundingPips Zero tel quel** — il faudrait soit réduire le risque par trade (le sizing par volatilité déjà exploré plus haut dans ce document, jamais activé, redevient pertinent ici), soit un frein sur drawdown, avant d'y risquer un vrai compte Zero. **Pas encore décidé avec Esdras** — priorité avant toute chose : confirmer les règles réelles de FundingPips Zero à la source (le blocage réseau de cette session a empêché une vérification directe).

**Fichier** : `scripts/runFundingPipsZeroAccountImpact.js` (nouveau, adapté de `runFtmo1StepAccountImpact.js`), `data/backtest-input/fundingpips-zero-account-impact.md`. Pas de nouveaux tests (script exploratoire, même convention que les autres `run*AccountImpact.js`). `npm test` : 338/338 (inchangé).

## FundingPips Zero — verdict final : bot actuel NON conforme (news + week-end), suite et clôture — 2026-09-11

Suite directe de la section précédente. Esdras a fourni les vraies règles FundingPips Zero, sourcées (citations directes de `help.fundingpips.com` et `fundingpips.com/zero`), corrigeant/complétant les estimations par recherche web de la section précédente :

- **Perte quotidienne max 3%** (confirmé, notre garde-fou à 2% reste plus strict — OK).
- **Drawdown trailing 5%, verrouillé au seuil de rentabilité (breakeven) une fois +5% de profit atteint** — confirme exactement l'interprétation déjà simulée dans `runFundingPipsZeroAccountImpact.js`.
- **Risque max par position : -1% du solde de départ (ou 3% sous 50k$/2% à 50k$+ sur positions corrélées)** — plus nuancé que la simple limite agrégée à 1% déjà simulée, mais notre simulation (risque ouvert réel jamais au-dessus de ~1.00-1.01%) reste une bonne approximation, probablement même large.
- **⚠️ NOUVEAU, pas modélisé avant, et CRITIQUE : trading autour des news et maintien de position sur le week-end sont STRICTEMENT INTERDITS sur Zero** (pas juste une limite de risque — une interdiction, potentiellement une clôture de compte immédiate).

**Deux vérifications faites contre le bot RÉEL, pas de nouvelles suppositions** :
1. **Filtre news** : confirmé qu'il n'en existe AUCUN en production (déjà noté ailleurs dans ce fichier — ni `config.js` ni `guardrailEngine.js`). **Non conforme tel quel.**
2. **Maintien de position sur le week-end** : ajout d'un suivi précis (`spansWeekend()`, vérifie si une date calendaire UTC samedi/dimanche tombe entre l'entrée et la sortie d'un trade) au script de simulation déjà existant, sur le même combo validé (FVG x3 + Divergence). **Résultat : 15-20% des trades traversent un week-end chaque année** (5 à 26 trades selon l'année, sur 24-148 trades/an) — pas un cas rare, un schéma régulier. **Non conforme tel quel.**

**Verdict global, donné directement à Esdras** : le bot actuel ne serait PAS conforme à FundingPips Zero sans changements — deux interdictions strictes enfreintes régulièrement (pas de simple dépassement de risque), plus un profil de trailing drawdown structurellement plus dangereux (2 bust/7 ans déjà mesuré) que ce pour quoi le bot a été conçu et validé (FTMO 1-Step, 10% trailing). Pour rendre le bot compatible avec Zero, il faudrait au minimum : un vrai filtre news, une fermeture forcée des positions avant le week-end, et soit réduire le risque par trade soit ajouter un frein sur drawdown. **Rien codé ici — analyse seulement, à la demande explicite ("juste vérifie si notre bot peut fonctionner avec ces règles"), pas de décision de modifier le bot prise.**

**Fichier** : `scripts/runFundingPipsZeroAccountImpact.js` (ajout de `spansWeekend()`/colonne dédiée), `data/backtest-input/fundingpips-zero-account-impact.md` (régénéré). `npm test` : 338/338 (inchangé).

## Nouveau workflow : une branche isolée par type de challenge — 2026-09-11

À la demande explicite d'Esdras, qui veut tester plusieurs types de challenge (FundingPips Zero, potentiellement d'autres prop firms/modèles plus tard) sans jamais risquer la branche de production : **chaque spécialisation vit désormais dans sa propre branche isolée**, avec la convention `challenge/<nom>`.

**`challenge/fundingpips-zero`** (cette branche) : créée à partir de `claude/lire-handoff-hxisa5` (donc avec tout l'historique + l'analyse FundingPips Zero déjà faite, voir les deux sections juste au-dessus). C'est ici que les adaptations pour rendre le bot conforme à FundingPips Zero seront construites — **pas encore commencé, juste le point de départ posé**. Rappel du chantier identifié (voir verdict ci-dessus) :
1. Un vrai filtre news (bloquer les nouvelles entrées autour des horaires NFP/CPI/FOMC connus).
2. Fermeture forcée de toute position ouverte avant le week-end (actuellement 15-20% des trades en traversent un — changement de comportement réel, pas juste un garde-fou, nécessite un nouveau backtest pour confirmer que l'edge survit).
3. Réduire le risque par trade ou ajouter un frein sur drawdown (le trailing à 5% de Zero a busté 2 comptes sur 7 ans dans la simulation, contre zéro sous FTMO 1-Step à 10%).

**Important pour la prochaine reprise** : `claude/lire-handoff-hxisa5` reste la SEULE branche que Render déploie en production — rien de ce qui se construit sur `challenge/fundingpips-zero` (ou une future `challenge/<autre>`) n'atteint le bot en direct tant qu'aucune fusion explicite n'est demandée par Esdras.

**Note technique** : un commit de fin d'analyse (`002e328`) a été auto-committé sur `claude/lire-handoff-hxisa5` par le hook de fin de session juste avant que cette bascule vers une branche isolée soit décidée — contenu inoffensif (script de recherche + doc, aucun changement de comportement du bot), laissé tel quel plutôt que de réécrire l'historique de la branche de production.
## USDJPY — 11 mécanismes déjà validés/testés étendus au 6ᵉ instrument — 2026-09-11/12, à la demande explicite

À la demande explicite d'Esdras ("faisons le test sur usdjpy avant le funding pips"), après qu'elle a fourni les 10 années HistData M1 (2016-2025), converties précédemment en M15 (`data/backtest-input/USDJPY.csv`, même script/convention `convertHistData.js` que les 5 autres instruments — voir section dédiée plus haut).

**Méthode : aucun nouveau réglage, uniquement l'extension de `SYMBOLS`** dans 11 scripts `scripts/run*StrategyAnalysis.js` déjà existants (paramètres tous fixés AVANT de voir un seul résultat USDJPY) : Judas Swing, NWOG, NDOG, Breaker Block, Asian Range Breakout, Asian Range Fade, Weekly Liquidity Sweep, MACD Trend, DMI Trend, RSI Divergence classique, RSI(2) Connors.

**⚠️ Bug réel trouvé et corrigé AVANT de croire le premier passage** : `USDJPY` était absent de `DEFAULT_SPREADS` (`src/backtest/transactionCosts.js`) → coût de transaction traité comme ZÉRO sur cet instrument (`DEFAULT_SPREADS[symbol] ?? 0`), contrairement aux 5 autres qui ont tous un spread réaliste modélisé. Le premier passage montrait des résultats spectaculaires (NWOG test +0.56R, Judas Swing test +0.33R...) — beaucoup trop beaux, et le signe classique d'un coût manquant. Ajouté `USDJPY: 0.012` (~1.2 pip, même statut "INDICATIVE, à vérifier chez FundingPips" que les autres entrées), puis TOUT réexécuté. Les résultats se sont largement dégonflés une fois le coût appliqué — confirme que c'était bien un artefact, pas un edge réel.

**Deuxième bug trouvé au passage, corrigé aussi** : `scripts/runDmiTrendStrategyAnalysis.js` avait une fonction `verdict()` sans le garde-fou standard "n < 10 → pas assez de trades" (présent dans tous les autres scripts) — donnait "✅ tient" sur USDJPY avec seulement 9 trades test. Corrigé pour appliquer la même règle partout ailleurs (`MIN_TRADES_FOR_VERDICT = 10` sur train ET test).

**Résultat final (coût réel appliqué, règle de verdict standard partout), triés par robustesse** :

| Stratégie | Train (n / exp) | Test (n / exp) | Verdict |
|---|---|---|---|
| **Asian Range Breakout** | 872 / **+0.03R** | 226 / **+0.24R** | **✅ TIENT** |
| RSI(2) Connors | 322 / +0.029R | 45 / +0.0085R | ⚠️ affaibli (échoue de justesse le seuil 0.3×train : 0.0085 < 0.0086 — vérifié en pleine précision, pas un arrondi trompeur) |
| NWOG | 228 / -0.01R | 68 / +0.49R | ⚠️ affaibli (train négatif malgré un test très fort) |
| Judas Swing | 498 / -0.11R | 159 / +0.23R | ⚠️ affaibli (même profil) |
| Asian Range Fade | 988 / -0.12R | 334 / +0.03R | ⚠️ affaibli |
| Weekly Liquidity Sweep | 300 / -0.26R | 84 / +0.18R | ⚠️ affaibli |
| Breaker Block | 792 / -0.08R | 256 / -0.18R | ❌ ne tient pas |
| MACD Trend | 208 / -0.11R | 47 / -0.14R | ❌ ne tient pas |
| RSI Divergence classique | 27 / -0.05R | 10 / -0.02R | ❌ ne tient pas |
| NDOG | 285 / -0.13R | **7** / +0.03R | ❓ pas assez de trades |
| DMI Trend | 39 / 0.00R | **9** / +0.04R | ❓ pas assez de trades |

**Seul Asian Range Breakout passe la règle mécanique** — grand échantillon des deux côtés (872 train / 226 test), train ET test positifs, test très largement au-dessus du seuil 0.3×train. Les 4 "affaibli" (NWOG, Judas Swing, Asian Range Fade, Weekly Liquidity Sweep, RSI Connors) partagent tous le même profil suspect déjà documenté ailleurs dans ce fichier (train négatif ou quasi nul, test positif) — traité comme du bruit, pas un edge, cohérent avec la discipline du projet.

**⚠️ MISE À JOUR IMPORTANTE (2026-09-12) — le "✅ tient" d'Asian Range Breakout/USDJPY est BEAUCOUP plus fragile qu'il n'y paraît, à ne pas prendre pour argent comptant.** Question légitime posée par Esdras ("pourquoi USDJPY est aussi haut, n'est-ce pas du flanc/smoothing ?") après avoir vu le comparatif chiffré (USDJPY +53,7R sur le test, le plus fort des 6 instruments — voir tableau comparatif plus bas dans cette section). Vérifié concrètement plutôt que rassuré à l'aveugle : **73% du profit total du test (39,05R sur 53,66R) vient d'UNE SEULE fenêtre de 5 mois (juillet-novembre 2025 sur 24 mois de test)** — 44 trades sur 226 (19%), avec un taux de gain de 47,4% dans cette fenêtre contre seulement 25,6% le reste du temps. Hors de cette fenêtre, l'espérance retombe à +0,08R/trade sur 182 trades — banale, comparable à XAUUSD (+0,08R) et inférieure à US100 (+0,11R), pas du tout le chiffre spectaculaire de +0,24R affiché sur l'ensemble de la période. **Pas un bug ni du data-snooping** (paramètres fixés avant tout résultat USDJPY, coût de transaction déjà corrigé) — mais une vraie fenêtre de marché exceptionnellement favorable (forte tendance directionnelle sur USDJPY) qui gonfle la moyenne globale bien au-delà de ce qui est probablement reproductible. **Conclusion révisée : NE PAS activer en production sur cette seule base** — le verdict "tient" est mécaniquement vrai mais la robustesse réelle est faible, du même ordre que les candidats "affaibli" une fois cette fenêtre exclue. Traiter comme non concluant plutôt que comme un edge validé, tant qu'aucune nouvelle période de test ne vient confirmer que l'edge résiste HORS de cette fenêtre spécifique.

**Pas encore fait** : rien à activer en production pour l'instant sur USDJPY, vu ce qui précède ; vérifier le netting si une stratégie y était activée un jour aux côtés d'autres stratégies potentielles.

**Fichiers** : `src/backtest/transactionCosts.js` (ajout `USDJPY`), `scripts/runDmiTrendStrategyAnalysis.js` (fix verdict), 11 scripts `run*StrategyAnalysis.js` (SYMBOLS étendu), 11 fichiers `data/backtest-input/*-analysis.md` régénérés. Pas de nouveau test unitaire (scripts exploratoires non testés unitairement, comme le reste de cette famille). `npm test` : 338/338 (inchangé — aucune logique testée touchée, seulement des constantes de config et des scripts exploratoires).

## Unicorn Model (ICT) testé et rejeté — 2026-09-12, à la demande explicite ("focus sur US100/US500")

Après la découverte que le "✅ tient" d'Asian Range Breakout/USDJPY était fragile (voir juste au-dessus), Esdras a explicitement redirigé l'effort : abandonner le macro (jugé pas rentable comme prochain investissement, voir discussion) et se concentrer sur US100/US500, les deux seuls instruments avec un edge réellement solide dans ce projet.

**Recherche faite avant de coder** (luxalgo.com, quantvps.com, fluxcharts.com, innercircletrader.net, icttradingstrategy.com) : le concept ICT "Unicorn Model" — la zone de SUPERPOSITION entre un Breaker Block et un Fair Value Gap, deux PD arrays déjà détectés séparément dans ce projet mais jamais requis de coïncider. Distinct du Breaker Block déjà testé/rejeté (celui-ci entre sur n'importe quel retest du niveau médian du breaker, sans exigence de FVG) et du FVG de production (aucune exigence de breaker/BOS).

**Méthode** (`src/backtest/unicornModel.js`, 5 tests unitaires) : réutilise la mécanique BOS/Order-Block/cassure de `breakerBlock.js` (dupliquée localement, pas importée, même convention que `weeklyLiquiditySweep.js` pour ne pas toucher un fichier déjà testé) ; une fois le breaker confirmé, une fenêtre bornée (20 bougies) attend qu'un FVG standard (même test c1/c3 à 3 bougies que le FvgEngine) de MÊME SENS se forme ET chevauche la zone du breaker ; entrée sur retest de cette zone de chevauchement (pas le niveau médian du breaker), stop au-delà de l'extrême du breaker, cible fixe 1:3, timeout 480 bougies M15. Priorité donnée à US100/US500, mais testé sur les 6 instruments pour la comparaison habituelle.

**Résultat, un seul passage, aucun paramètre retouché après coup** :

| Symbole | Train (n / exp) | Test (n / exp) | Verdict |
|---|---|---|---|
| US100 | 489 / -0.04R | 198 / +0.05R | ⚠️ affaibli |
| US500 | 450 / -0.16R | 187 / -0.19R | ❌ ne tient pas |
| XAUUSD | 379 / -0.05R | 208 / +0.19R | ⚠️ affaibli |
| EURUSD | 515 / -0.00R | 176 / +0.04R | ⚠️ affaibli |
| GBPUSD | 393 / -0.11R | 167 / -0.21R | ❌ ne tient pas |
| USDJPY | 619 / -0.13R | 198 / -0.00R | ❌ ne tient pas |

**Rejeté partout, y compris (et surtout) sur les deux instruments prioritaires** : US500 rejeté franchement (train ET test négatifs) ; US100 "affaibli" mais avec un train déjà négatif (-0.04R) — le même profil "train qui ne passe pas la barre" déjà traité comme du bruit ailleurs dans ce document, pas un edge. Aucun instrument n'atteint un vrai "✅ tient" (train ET test positifs, test ≥ 30% du train). **Conclusion : encore un concept ICT publié qui ne produit pas d'edge net une fois testé rigoureusement, y compris sur les instruments où ce projet a pourtant un edge réel avec d'autres mécanismes (FVG/Divergence) — confirme que l'edge de ce projet est spécifique au FVG/Divergence déjà en production, pas à "tout concept ICT sur ces deux instruments".**

**Fichiers** : `src/backtest/unicornModel.js` (nouveau, 5 tests unitaires), `test/unicornModel.test.js`, `scripts/runUnicornModelStrategyAnalysis.js`, `data/backtest-input/unicorn-model-strategy-analysis.md`. **Non activé en production.** `npm test` : 343/343 (338 + 5 nouveaux).

## Filtre macro (régime VIX) sur le combo déjà validé — testé, pas concluant — 2026-09-12

Question directe d'Esdras après avoir dropé l'idée d'un nouvel instrument macro : **"est-ce que le macro pourrait améliorer le combo [déjà validé] ?"** — pas une tentative de sauver un instrument faible, mais un vrai test sur le combo FVG (US100+US500+XAUUSD) + Divergence (US100/US500) déjà en production.

**Proxy macro** : VIX (indice de volatilité CBOE), récupéré directement depuis FRED (`fred.stlouisfed.org/series/VIXCLS`, accès réseau direct confirmé fonctionnel) — `data/backtest-input/macro-vix-daily.csv`, 9572 points quotidiens, 1990-2026. **Seuil de régime décidé AVANT de voir un seul résultat** : VIX < 20 = "calme", VIX ≥ 20 = "élevé" (convention standard CBOE/médias financiers, pas ajustée sur ces données). Régime lu depuis la dernière clôture VIX STRICTEMENT AVANT le jour d'entrée du trade (aucun regard en avant). Réutilise `LiveStrategyEngine` + `CONFIG.fvg.perSymbol`/`CONFIG.divergence` EXACTEMENT comme la production (même schéma que `recentPerformanceReport.js`), pas une réimplémentation séparée.

**Résultat agrégé, à première vue prometteur** :

| Période | Calme (n / exp) | Élevé (n / exp) |
|---|---|---|
| TRAIN (2019-2023) | 315 / 0.64R | 232 / 0.75R |
| TEST (2024-2025) | 183 / 0.67R | 29 / 1.10R |

Direction cohérente train ET test (le régime "élevé" fait mieux dans les deux) — à première vue, le genre de signal qu'on cherche.

**Mais décomposé par instrument/source, la cohérence disparaît complètement** — l'agrégat mélange 4 sous-populations qui réagissent dans des sens OPPOSÉS au régime VIX :

| Période | Instrument/source | Calme (n/exp) | Élevé (n/exp) |
|---|---|---|---|
| TRAIN | US100/FVG | 50/1.28R | 46/1.48R |
| TRAIN | US500/FVG | 35/0.54R | 53/1.38R |
| TRAIN | XAUUSD/FVG | 65/1.03R | 22/0.64R |
| TRAIN | US500/Divergence | 165/0.31R | 111/0.16R |
| TEST | US100/FVG | 36/1.17R | 8/3.50R |
| TEST | US500/FVG | 25/1.28R | 1/-1.00R |
| TEST | XAUUSD/FVG | 37/0.78R | 4/-1.00R |
| TEST | US500/Divergence | 85/0.22R | 16/0.56R |

**Dès le TRAIN** (le jeu censé trancher), XAUUSD/FVG et US500/Divergence favorisent le régime CALME, alors qu'US100/FVG et US500/FVG favorisent le régime ÉLEVÉ — contradictoire, pas un effet macro unifié. Seul US100/FVG est dans le même sens sur les deux périodes (1.28→1.48R train, 1.17→3.50R test), mais l'échantillon test y est minuscule (n=8) et le X3.50R sent le même artefact de petit échantillon que USDJPY plus haut dans ce document.

**Conclusion : NON concluant, ne pas ajouter en production.** Le signal agrégé qui semblait prometteur est un artefact de mélange (Simpson's paradox-like) — une fois décomposé par instrument/source, aucun effet cohérent et large-échantillon ne survit. Répondre honnêtement à la question posée : le régime VIX ne montre PAS d'effet fiable et généralisable sur le combo actuel. Piste dérivée mais PAS explorée (question différente, pas posée) : un sizing par volatilité (augmenter la taille de position en régime élevé, jamais activé — voir plus haut dans ce document) serait une utilisation différente du même signal, pas testée ici.

**Fichiers** : `data/backtest-input/macro-vix-daily.csv` (donnée source, FRED), `scripts/runVixRegimeFilterAnalysis.js` (nouveau, script exploratoire, pas de nouveaux tests unitaires — même convention que les autres `run*Analysis.js` non câblés en live), `data/backtest-input/vix-regime-filter-analysis.md`. `npm test` : 343/343 (inchangé).

## Statut cible étendue + sizing par volatilité, et forward-test démo du sizing câblé — 2026-09-12

À la demande explicite d'Esdras de "focus sur la cible étendue et le sizing par volatilité" après l'épisode VIX ci-dessus.

**Cible étendue (1:4/1:5)** : déjà activée en production depuis le 2026-09-07 (`src/config.js` : US100/US500 en 1:5, XAUUSD en 1:4) — voir section dédiée plus haut dans ce document. Rien à refaire, juste confirmé à Esdras que c'est déjà en place.

**Sizing par volatilité (réduire à 0,25% en régime ATR calme)** : déjà recherché en profondeur (voir section "Position sizing dynamique" plus haut), jamais activé. Recommandation historique : faire un forward-test démo avant d'activer pour de vrai. **Question posée directement à Esdras, réponse : forward-test démo d'abord (pas d'activation directe).**

**Câblage du forward-test démo, en OBSERVATION SEULE — aucun effet sur le risque réel** :
- `src/backtest/volatilityRegime.js` (nouveau) : extraction propre des fonctions déjà utilisées dans `scripts/checkVolatilityRegimeImpactFullCombo.js`/`runFtmo1StepVolAdaptiveRiskAccountImpact.js` (mêmes constantes ATR(14)/SMA(100)/seuils 0.8-1.5, rien retouché) — `classifyVolatilityRegimeSeries()`, `makeVolatilityRegimeLookup()` (no-lookahead, même convention binary-search que `runMarketRegimeAnalysis.js`). 6 tests unitaires.
- `src/store.js` : `pushSignalEvents()` (le point UNIQUE où tous les événements validés passent, quel que soit le connecteur cTrader/Match-Trader/mock) tague chaque signal `fvg`/`divergence` non bloqué avec `volRegime` + `suggestedRiskPct` (= risque actuel × 0.5 si régime 'low', inchangé sinon) — calculé depuis l'historique déjà retenu par `LiveStrategyEngine` (`getHistory()` → `resampleCandles()` en D1), enveloppé dans un `try/catch` (une observation ne doit jamais casser le vrai flux de signaux). **NWOG/Judas Swing/pyramide exclus délibérément** — la recherche ne portait que sur le combo FVG+Divergence, les taguer aurait affirmé un résultat jamais testé. 5 tests unitaires (`test/store.test.js`).
- **Aucun changement sur le sizing réel** : `calculateLotSize()`/`CONFIG.risk.riskPctPerTrade` (`cTraderDataSource.js`) restent totalement intacts — vérifié explicitement, c'est le point central de cette phase.
- Visible à deux endroits, toujours étiqueté "obs./non appliqué" pour ne jamais être confondu avec une vraie action : la carte "Signaux d'entrée validés" du dashboard (`public/index.html`), et le texte des notifications ntfy (`cTraderDataSource.js` ET `matchTraderDataSource.js` — même convention que l'extension d'étiquette de source déjà appliquée aux deux connecteurs pour NWOG/Judas Swing).

**Vérifié avec Playwright** (route interception sur `/api/signals`, l'app utilise maintenant un flux SSE `/api/stream` pour le temps réel — ajouté par une autre session cette même période — donc il faut soit intercepter `/api/stream` aussi, soit compter sur l'appel `refreshSignals()` initial qui a lieu indépendamment au chargement de la page) : le tag s'affiche correctement, ex. "Régime vol: low (obs., taille suggérée 0.25% — non appliqué)". `npm test` : 354/354 (343 + 11 nouveaux : 6 pour `volatilityRegime.js`, 5 pour le tagging dans `store.js`).

**Prochaine étape (pas encore faite)** : laisser tourner en observation quelques semaines (comparer manuellement, ou via une future requête sur `store.signalLog`/les logs serveur, si le régime 'low' continue réellement à sous-performer en conditions live comme en historique) avant de décider d'activer le sizing pour de vrai. Aucune persistance durable (Supabase) de cette observation pour l'instant — visible seulement dans le signal log en mémoire (200 dernières entrées) et les notifications, pas dans le journal durable ; à ajouter plus tard si l'observation s'avère utile sur la durée.

## Scalping (M1/M5) — recherche documentée SEULEMENT, rien codé — 2026-09-12

À la demande explicite d'Esdras après une question sur le trading haute fréquence : elle a confirmé vouloir explorer une "version réaliste" du HFT — le scalping ICT sur M1/M5 — mais **explicitement en recherche/documentation uniquement, sans rien coder dans le bot**. Ce qui suit est donc un résumé de faisabilité, pas une implémentation.

**Concept ICT scalping (recherché en ligne, sourcé)** : entrées/sorties sur M1-M5, contexte directionnel pris sur un timeframe supérieur (M15/H1) — même logique de biais HTF que le FVG de production, juste transposée à une échelle plus fine. Repose sur les mêmes briques déjà présentes dans ce projet (Market Structure Shift/BOS, structure interne vs externe, confluence multi-timeframe) mais appliquées à un scalp rapide. Cible typique citée : 30-50 pips, RR autour de 1:2 (donc plus bas que le 1:3-1:5 déjà en production).

**Trois obstacles concrets identifiés, propres à ce projet précis, avant même de parler d'edge** :

1. **Règles des prop firms — risque réel, pas juste théorique.** FTMO et FundingPips interdisent explicitement le "tick scalping"/HFT et signalent les trades tenus moins de ~2 minutes comme suspects (source : recherche web, PAS vérifié à la source primaire FTMO/FundingPips — même réserve que pour l'épisode FundingPips Zero plus haut dans ce document). Un scalp ICT "normal" (plusieurs minutes de détention, cible 30-50 pips) ne serait probablement PAS dans la zone interdite, mais ça reste à confirmer noir sur blanc avant d'y risquer un vrai compte — l'enjeu (compte suspendu/challenge invalidé) est trop grand pour se contenter d'une recherche web.
2. **Données manquantes.** Ce projet n'a du M1 que pour USDJPY (les fichiers HistData bruts, déjà agrégés en M15 pour l'analyse — voir plus haut). US100/US500/XAUUSD/EURUSD/GBPUSD n'existent qu'en M15 dans ce dépôt. Tester sérieusement du scalping demanderait de sourcer du M1 pour les 5 autres instruments — un chantier de données à part entière, pas fait ici.
3. **Coût du spread proportionnellement plus lourd.** Le garde-fou déjà en place partout (`MIN_DISTANCE_SPREAD_MULTIPLE = 3`, distance du stop ≥ 3× le spread) est nettement plus dur à satisfaire sur un scalp M1/M5 : la distance typique d'un stop y est mécaniquement bien plus petite qu'en M15 (mouvements de bien plus faible amplitude par bougie), alors que le spread reste constant en valeur absolue — donc soit beaucoup plus de signaux rejetés comme non viables, soit un edge net rongé bien plus fort par les coûts qu'aujourd'hui.
4. **Coût d'infrastructure.** `LiveStrategyEngine` reconstruit et rejoue tout l'historique retenu à chaque nouvelle bougie ("rebuild-and-replay", déjà source d'un vrai incident de production sur Render — voir plus haut, "Bug critique... le flux d'événements live"). Passer de M15 à M1 multiplierait par ~15 le nombre de bougies traitées par unité de temps réel, sur un plan Render gratuit (0.15 CPU) déjà identifié comme fragile à ce genre de charge.

**Conclusion (recherche seulement, aucune décision prise)** : le scalping ICT est un concept réel et documenté, pas une invention — mais dans CE projet précis, trois obstacles concrets (conformité prop-firm à vérifier sérieusement, données M1 manquantes pour 5 des 6 instruments, sensibilité au spread nettement plus forte) rendent ce chantier bien plus lourd qu'un simple changement de timeframe. Pas recommandé de s'y lancer sans, au minimum, une confirmation écrite des règles FTMO/FundingPips sur la durée minimale de détention. Rien codé, rien testé — recherche documentée comme demandé.

## Scalp M5 testé sur USDJPY — rejeté, confirme l'obstacle #3 (spread) déjà documenté — 2026-09-12, suite

Suite directe de la section précédente. Esdras a relancé : "on le cherche en USDJPY ? de toute façon on a pas de stratégie pour lui" — logique solide (seul instrument avec du vrai M1 source, et aucune stratégie déjà validée dessus, donc rien à perdre à essayer). Cette fois un vrai test, pas juste de la doc.

**Méthode, aucun nouveau mécanisme** : `runJudasSwingBacktest()` (`src/backtest/judasSwing.js`) réutilisée TELLE QUELLE — sa logique est déjà agnostique au timeframe (fenêtre horaire en heure murale, PDH/PDL rééchantillonné en jour peu importe la taille de bougie d'entrée). Seuls changements : bougies M5 au lieu de M15, et deux paramètres décidés depuis la recherche AVANT de voir un résultat — RR 1:2 (au lieu de 1:3+ ailleurs, conforme aux cibles ~30-50 pips citées par les sources ICT scalping) et timeout 480 bougies (même constante littérale que partout ailleurs dans ce projet, appliquée à des bougies M5 cette fois — 40h au lieu de 5 jours en M15).

**`scripts/convertHistData.js` étendu** (rétrocompatible : 4ᵉ argument optionnel `bucketMinutes`, défaut 15 — reconverti et diffé le M15 existant pour confirmer zéro régression avant de l'utiliser) pour produire `data/backtest-input/USDJPY_M5.csv` (736 827 bougies M5, même source/convention HistData que le M15 déjà en place).

**Résultat, un seul passage, aucun paramètre retouché après coup** :

| Trades train | Espérance train | Trades test | Espérance test | Verdict |
|---|---|---|---|---|
| 387 (365 rejetés non-viables sur 752 bruts) | -0.17R | 150 (62 rejetés sur 212 bruts) | -0.16R | ❌ ne tient pas |

**Rejeté proprement — train ET test négatifs, cohérents entre eux** (pas le profil "train négatif, test positif" qu'on traite habituellement comme du bruit ; ici c'est un rejet net des deux côtés). Le taux de gain (34.2%/33.3%) est quasiment collé au seuil d'équilibre mécanique d'un RR 1:2 (33.3%) — une fois les coûts appliqués, ça repasse sous zéro. **Confirme empiriquement l'obstacle #3 déjà documenté** : près de la moitié des signaux bruts en train (365/752) sont rejetés comme non viables (stop trop proche du spread) — la sensibilité au spread à cette granularité est bien aussi lourde que redouté, pas juste une inquiétude théorique.

**Conclusion : scalping M5 sur USDJPY ne tient pas, avec cette mécanique (Judas Swing).** Ne clôt pas nécessairement toute idée de scalping (une autre mécanique ou un autre RR pourrait donner un résultat différent), mais confirme que le passage à M5 n'est pas un simple raccourci vers plus de fréquence — le coût réel du spread mord fort, exactement comme anticipé avant de tester.

**Fichiers** : `data/backtest-input/USDJPY_M5.csv` (nouveau, donnée), `scripts/convertHistData.js` (argument optionnel `bucketMinutes`, rétrocompatible), `scripts/runUsdjpyM5ScalpAnalysis.js` (nouveau, script exploratoire, pas de nouveaux tests unitaires — réutilise une fonction déjà testée), `data/backtest-input/usdjpy-m5-scalp-analysis.md`. `npm test` : 354/354 (inchangé).

## "Gap and Go" (continuation de gap) — concept réellement nouveau proposé, testé et rejeté — 2026-09-12

À la demande explicite d'Esdras ("tu pourrais pas inventer une stratégie novatrice ?") après une longue série de concepts publiés (ICT et non-ICT) tous rejetés ou fragiles. Plutôt qu'une invention arbitraire (risque de construction ad hoc sans justification, contraire à la discipline de ce projet), l'idée retenue est l'exact opposé d'un mécanisme DÉJÀ testé ici : NWOG et NDOG parient tous les deux sur le COMBLEMENT d'un gap (fade) — jamais sur sa CONTINUATION, un vrai concept ("gap and go") cité dans la littérature générale de trading d'indices (pas ICT-spécifique), trouvé pendant la recherche sur le scalping de la section précédente.

**Méthode** (`src/backtest/gapContinuation.js`, nouveau module autonome — ne modifie ni `nwog.js` ni `ndog.js`, duplique juste leur détection de gap déjà testée) : mêmes seuils de gap que NWOG (20-100h) et NDOG (1-3h) — PAS re-choisis, ce sont les mêmes vrais gaps déjà détectés dans ce projet, seul le sens du pari change. Entrée une bougie après le gap, stop au-delà de l'extrême de la bougie de gap (du côté adapté à la nouvelle direction), cible fixe 1:3, timeout 480 bougies M15. Testé aux deux échelles (quotidien et hebdomadaire) sur les 6 instruments. 7 tests unitaires.

**Résultat, un seul passage, aucun paramètre retouché après coup** :

| Échelle | Symbole | Train (n/exp) | Test (n/exp) | Verdict |
|---|---|---|---|---|
| Quotidien | US100 | 983/-0.05R | 300/+0.03R | ⚠️ affaibli |
| Quotidien | US500 | 793/-0.12R | 271/+0.13R | ⚠️ affaibli |
| Quotidien | XAUUSD | 485/-0.14R | 215/-0.11R | ❌ ne tient pas |
| Quotidien | EUR/GBP/JPY | n test = 1-4 | — | ❓ pas assez de trades (confirme la disparition de la pause quotidienne forex post-2024 déjà notée dans l'étude NDOG) |
| Hebdo | US100 | 211/+0.10R | 92/-0.13R | ❌ ne tient pas |
| Hebdo | US500 | 190/+0.06R | 96/-0.23R | ❌ ne tient pas |
| Hebdo | XAUUSD | 155/-0.10R | 77/+0.30R | ⚠️ affaibli |
| Hebdo | EUR/GBP/JPY | tous négatifs des deux côtés | | ❌ ne tient pas |

**Rejeté partout, aucun "✅ tient"** — y compris US100/US500 en hebdomadaire, qui montrent le profil "train positif, test négatif" (0.10R→-0.13R, 0.06R→-0.23R) déjà traité comme du bruit ailleurs dans ce document. **L'idée que le sens INVERSE (comblement) tienne mieux que la continuation sur US100/US500 spécifiquement (NWOG hebdo y tenait, voir plus haut) est cohérente et vient s'ajouter au dossier** : sur ces deux indices, le pari du comblement bat le pari de la continuation — pas une surprise complète (un gap sur indice se comble plus souvent qu'il ne se poursuit, historiquement), mais bon d'avoir vérifié plutôt que supposé.

**Conclusion : encore un rejet nickel, mais celui-ci ferme une vraie question ouverte** (comblement vs continuation) plutôt que de retester une énième variante ICT. Non activé en production.

**Fichiers** : `src/backtest/gapContinuation.js` (nouveau, 7 tests unitaires), `test/gapContinuation.test.js`, `scripts/runGapContinuationStrategyAnalysis.js`, `data/backtest-input/gap-continuation-strategy-analysis.md`. `npm test` : 361/361 (354 + 7 nouveaux).

## Divergence Momentum (opposé de la Divergence de production) — "tient" mécaniquement mais confondu avec la dérive du marché, rejeté en pratique — 2026-09-12

Suite directe à "Gap and Go", à la demande explicite d'Esdras de continuer à chercher des inversions de mécanismes déjà testés ("on continue à chercher d'autres idées comme ça"). La Divergence de production (validée, en direct sur US100/US500) achète TOUJOURS le retardataire (laggard) du z-score du log-ratio, pariant sur la convergence. L'inversion testée ici : acheter le LEADER à la place, pariant sur la CONTINUATION de l'écart (momentum) plutôt que sa convergence — même déclencheur/entrée/stop/cible/timeout, seul le choix du symbole change.

**Nouveau module autonome** `src/backtest/divergenceMomentum.js` (ne touche pas `liveStrategyEngine.js`, la Divergence de production reste inchangée), 6 tests unitaires. Testé sur US100/US500 (la paire réellement validée/live) et EURUSD/GBPUSD (même comparaison déjà faite pour la version convergence).

**Résultat brut** : US100/US500 train n=540 exp=+0.10R, test n=217 exp=+0.08R → **✅ tient** selon la règle mécanique. EURUSD/GBPUSD rejeté franchement (train -0.08R, test -0.17R).

**⚠️ Vérifié avant de croire ce chiffre flatteur (même discipline que pour USDJPY/VIX plus haut)** : cette version est TOUJOURS acheteuse, sur des instruments en tendance haussière marquée sur toute la période. Test de référence construit : "toujours acheteur, entrée à intervalle fixe ARBITRAIRE (aucun signal de divergence), même stop 1.5×ATR/cible 1:3/timeout" → US100 train +0.09R (n=2096) / test +0.11R (n=835) ; US500 train +0.11R (n=2144) / test +0.05R (n=808). **Quasiment le même ordre de grandeur que le signal "testé"** — le déclencheur de divergence n'ajoute donc aucun pouvoir sélectif réel, l'edge observé est presque entièrement la dérive haussière générale captée par n'importe quelle entrée longue avec cette structure, pas un signal spécifique. (Ce contrôle NE remet PAS en cause la Divergence de production elle-même : son espérance validée, 0.7-2R, est un ordre de grandeur trop élevé pour s'expliquer par la seule dérive.)

**Conclusion révisée : rejeté en pratique malgré le "✅ tient" mécanique — ne pas activer.** Bon rappel méthodologique : pour toute stratégie "toujours dans un seul sens" sur un instrument en tendance marquée, vérifier systématiquement contre une référence d'entrée arbitraire avant de faire confiance à un résultat positif mais modeste.

**Fichiers** : `src/backtest/divergenceMomentum.js` (nouveau, 6 tests unitaires), `test/divergenceMomentum.test.js`, `scripts/runDivergenceMomentumStrategyAnalysis.js`, `data/backtest-input/divergence-momentum-strategy-analysis.md` (inclut le test de référence). `npm test` : 367/367 (361 + 6 nouveaux).

## RSI(2) Momentum (opposé de Connors, déjà validé) — même piège de dérive de tendance, rejeté en pratique — 2026-09-12

Troisième inversion testée dans la même veine ("on continue à chercher d'autres idées comme ça"). RSI(2) Connors (déjà validé sur US100/US500, seul mécanisme non-ICT retenu de ce projet) achète le SURVENDU en tendance haussière, pariant sur un rebond vers la SMA(5). L'inversion testée : acheter le SURACHETÉ en tendance haussière à la place (et vendre le survendu en tendance baissière), pariant sur la continuation plutôt que le retour à la moyenne. Même filtre EMA200/RSI(2)/stop 2×ATR(14)/plafond 10 jours que Connors ; seule la cible change (1:3 fixe, convention momentum déjà utilisée ailleurs — ORB, Asian Range Breakout — au lieu de la cible SMA5 de Connors qui n'a pas de sens pour un pari de continuation).

**Nouveau module** `src/backtest/rsiMomentum.js` (n'existait pas de version testable de Connors lui-même — vivait en script exploratoire ; celui-ci suit la même rigueur que les autres inversions de cette session), 5 tests unitaires.

**Résultat brut** : US100 train n=121 exp=+0.05R, test n=38 exp=+0.12R → ✅ tient (mécaniquement). US500 train n=127 exp=+0.01R, test n=35 exp=+0.13R → ✅ tient. GBPUSD/USDJPY rejetés franchement.

**⚠️ Signal d'alerte immédiat, vérifié avant de croire ce chiffre** : le taux de gain réel (cible 1:3 atteinte) est de **0% sur US100, 2% sur US500** — presque aucun trade ne touche jamais la cible, la quasi-totalité sortent en timeout à 10 jours avec un R moyen modérément positif (+0.68) simplement parce que le prix a globalement dérivé dans le bon sens. **Même piège que Divergence Momentum ci-dessus** : test de référence "trade AVEC la tendance EMA200 à intervalle arbitraire, sans aucun RSI" → US100 train +0.078R/test **+0.212R**, US500 train +0.091R/test **+0.245R** — même ordre de grandeur, voire supérieur, à ce que le signal RSI "testé" produit. Le déclencheur RSI extrême n'ajoute aucun pouvoir sélectif réel, c'est encore la dérive de tendance qui porte tout.

**Conclusion révisée : rejeté en pratique malgré le "✅ tient" mécanique — ne pas activer.** (Ne remet pas en cause la validation initiale de Connors elle-même — sélection et règle de sortie différentes, taux de gain documenté nettement plus élevé — seulement cette inversion momentum.) Troisième fois cette session qu'un contrôle de référence "dérive de marché" démasque un faux positif mécanique — devient un réflexe systématique à appliquer à toute stratégie testée sur un instrument en tendance marquée, ICT ou non.

**Fichiers** : `src/backtest/rsiMomentum.js` (nouveau, 5 tests unitaires), `test/rsiMomentum.test.js`, `scripts/runRsiMomentumStrategyAnalysis.js`, `data/backtest-input/rsi-momentum-strategy-analysis.md` (inclut le test de référence). `npm test` : 372/372 (367 + 5 nouveaux).

## Réconciliation : USDJPY/exploration fusionné dans `challenge/fundingpips-zero` — 2026-09-11

Ce travail (11 mécanismes USDJPY, Unicorn Model, filtre VIX, forward-test observation du sizing par volatilité, recherche scalping + test M5, Gap and Go, Divergence Momentum, RSI(2) Momentum — toutes les sections juste au-dessus) a été poussé directement sur `claude/lire-handoff-hxisa5` (branche de production) par une autre session, **après** que le workflow "une branche isolée par type de challenge" ait été établi et documenté juste au-dessus. Contradiction relevée et remontée à Esdras explicitement.

**Décision d'Esdras** : laisser tel quel sur la production (le code est vérifié sûr — recherche exploratoire + observation seule, aucun changement de sizing/risque réel touché), et fusionner ce même travail dans `challenge/fundingpips-zero` pour que la suite (mise en conformité FundingPips Zero) ait tout le contexte au même endroit. C'est ce que fait ce commit de fusion. Le workflow par branche isolée s'applique à partir de maintenant pour tout nouveau travail, pas rétroactivement.

## "Un ordre était passé" ne voulait rien dire de garanti — suivi réel de l'issue des ordres + fenêtre du LIMIT FVG corrigée — 2026-09-12

Suite directe du correctif d'affichage 5h précédent. Esdras a relevé, à raison, une contradiction dans ce que je lui avais dit : "il y a bien eu un trade aujourd'hui" (basé sur `/api/status`, ce que le MOTEUR croit) contredisait `/api/account` (`positions: []`, la vraie photo du courtier) — j'avais présenté une croyance interne comme un fait. Puis question directe : **"il faut que l'ordre passe vraiment, sinon comment on fait pour ftmo"**.

**Root cause trouvée en creusant, plus profonde que prévu** : `_handleAutoExecuteEntry` (cTraderDataSource.js) place un ordre LIMITE au bord de la zone FVG seulement quand l'événement `'validated'` arrive — c'est-à-dire APRÈS que le prix ait déjà touché la zone une première fois (voir `fvgEngine.js` : `'validated'` ne se déclenche que quand une bougie postérieure à la formation retouche la zone). Le live pose donc un ordre limite en pariant sur un DEUXIÈME passage, avec seulement 4 bougies (~1h) d'expiration (`FVG_LIMIT_EXPIRY_CANDLES`) — alors que le backtest lui-même laisse une zone FVG valide pendant `maxAgeCandles = 50` (~12.5h) avant de la considérer caduque. Un écart mesuré, pas une supposition. Corrigé : `FVG_LIMIT_EXPIRY_CANDLES` référence maintenant `CONFIG.fvg.maxAgeCandles` directement (12.5h au lieu de 1h) — ne reproduit pas exactement le modèle du backtest (qui compte le PREMIER passage comme rempli, pas un second), mais retire la cause connue dominante de non-remplissage sans toucher entrée/stop/cible. Une refonte plus profonde (poser l'ordre dès la formation `'watching'`) existe en piste, pas faite ici : la fenêtre de filtrage session/structure/sweep ne s'applique qu'à `'validated'`, donc poser un ordre dès `'watching'` en placerait beaucoup trop (la plupart des FVG bruts ne deviennent jamais des `'validated'`) — nécessiterait de recalculer ces filtres au moment du remplissage, pas fait aujourd'hui.

**Suivi réel des ordres ajouté** (au lieu de deviner) :
- `cTraderDataSource.js` : `pendingEntryOrderByOrderId` (Map orderId → {symbol, source, signalId}), rempli par `_handleAutoExecuteEntry` dès que le courtier confirme l'`orderId`. `_handleExecutionEvent` réagit maintenant au VRAI devenir : `ORDER_FILLED` → confirmation réelle + notif ✅ ; `ORDER_CANCELLED`/`ORDER_EXPIRED`/`ORDER_REJECTED` → `store.strategyEngine.clearBelievedPosition(symbol, id)` (efface la position "crue ouverte" du moteur, appariée par id pour ne jamais écraser un signal plus récent) + notif ⚠️. Noms `executionType` sourcés du proto officiel (`spotware/openapi-proto-messages`), pas devinés — mais le comportement réel au premier live reste à confirmer, même réserve que le reste du fichier.
- `liveStrategyEngine.js` : nouvelle méthode `clearBelievedPosition(symbol, id)`, 3 tests.
- `store.js` : nouveau `store.orderOutcomeLog` + `recordOrderOutcome()`, même convention que `signalLog` (plafond 200), 3 tests.
- `server.js` : `GET /api/order-log` (30 derniers, en mémoire).
- `public/index.html` : nouvelle carte "Ordres envoyés (résultat réel)" sous la carte compte, distincte de la croyance du moteur.

**Conséquence directe pour FTMO/FundingPips** : avant ce correctif, un ordre FVG jamais rempli restait invisible ET la position "crue ouverte" pouvait rester affichée jusqu'à 5 jours (`maxHoldingCandles`) sans qu'aucune confirmation réelle ne vienne la contredire. Maintenant, la vraie confirmation (remplie ou non) arrive en quelques secondes/minutes après l'ordre, pas en devinant après coup.

**Fichiers** : `src/dataSources/cTraderDataSource.js`, `src/liveStrategyEngine.js`, `src/store.js`, `src/server.js`, `public/index.html`, `test/liveStrategyEngine.test.js` (+3), `test/store.test.js` (+3). `npm test` : 378/378 attendus (375/378 vus localement — 3 échecs `keepAlive.test.js` pré-existants, flake de sandbox déjà documenté, identiques avant ce commit).

**Pas encore fait / à surveiller à la prochaine reprise** : confirmer en vrai (prochain signal FVG live) que `ORDER_EXPIRED`/`ORDER_CANCELLED` arrivent bien avec ces noms exacts et un `event.order.orderId` peuplé — sinon `clearBelievedPosition` ne se déclenchera jamais et il faudra ajuster les noms/champs lus. La piste "poser l'ordre dès la formation" reste ouverte si la fenêtre étendue ne suffit pas à faire remonter le taux de remplissage réel.

## FVG "multi-contact" testé — mitigé selon l'instrument, pas déployé — 2026-09-12

Suite directe du correctif précédent. En creusant "pourquoi cette zone n'a jamais été prise" avec Esdras sur un vrai cas US100 (zone 29199.20-29219.20 : formée 02h00 NY, son seul contact à 08h30 NY — 90 min avant la fenêtre 10h-11h — alors qu'elle n'avait que 23 bougies sur les 50 autorisées), elle a fait une proposition directe et précise : **"c'est comme ça que je tradais"** — garder une zone encore fraîche active et la prendre au prochain retour dans la bonne heure, au lieu de la règle actuelle (`fvgEngine.js` : un contact — accepté ou rejeté — supprime la zone pour toujours, peu importe son âge).

**Testé avant tout changement en live**, même discipline que partout ailleurs dans ce projet (écran TRAIN 2019-2023 / vérification TEST 2024-2025, config de production exacte, zéro paramètre retouché) :

- Nouveau moteur `src/backtest/fvgMultiTouch.js` (`MultiTouchFvgEngine` + `buildMultiTouchFilterPredicate`) — même détection 3 bougies, même limite de 50 bougies, mêmes critères de filtre (biais H4/H1 EMA, structure, fenêtre de session, sweep de liquidité — réutilise les mêmes fonctions `makeBiasLookup`/`makeStructureBiasLookup`/`isInNySessionWindow`/`makeSweepLookup` que la production), mais un contact qui échoue les filtres ne supprime plus la zone — elle reste active pour le prochain contact, jusqu'à acceptation ou expiration réelle. 6 tests unitaires.
- `scripts/runFvgMultiTouchAnalysis.js` — compare ce moteur au moteur à contact unique DÉJÀ VALIDÉ (`runOneConfig`/`buildFilteredEngine`, config production exacte), sur les 3 instruments réellement tradés (US100, US500, XAUUSD).

**Résultat (R total sur la période TEST 2024-2025, ce qui compte pour trancher)** :

| Instrument | Contact unique (prod.) | Multi-contact | Verdict |
|---|---|---|---|
| US100 | 38 trades × 1.44R = 55R | 93 trades × 1.40R = **130R** | ✅ nettement mieux, cohérent train ET test (train : 94R→198R) |
| US500 | 30 trades × 1.13R = 34R | 73 trades × 0.60R = 44R | ⚠️ mieux en R total, mais qualité par trade divisée par ~2 (1.13R→0.60R) |
| XAUUSD | 41 trades × 0.61R = 25R | 104 trades × 0.22R = **23R** | ❌ pire malgré 2.5x plus de trades — espérance par trade effondrée (0.88R→0.19R en train, cohérent des deux côtés) |

**Pas une réponse simple, donc rien déployé.** US100 confirme nettement l'intuition d'Esdras (presque 2,5× plus de trades, qualité par trade quasi identique, R total qui explose, cohérent train/test). US500 est un vrai compromis. XAUUSD va dans le sens opposé : laisser une zone active après un premier rejet y ramasse surtout du bruit (probablement lié à son `stopMode: 'swing'`, différent de `fvg-edge` sur US100/US500 — pas creusé plus loin). **Décision en attente d'Esdras** : déployer seulement sur US100 (le seul cas net et cohérent des deux côtés), ou creuser davantage avant tout changement.

**Fichiers** : `src/backtest/fvgMultiTouch.js` (nouveau, 6 tests), `test/fvgMultiTouch.test.js`, `scripts/runFvgMultiTouchAnalysis.js`, `data/backtest-input/fvg-multi-touch-analysis.md`. **Non activé en production** — `src/engines/fvgEngine.js`/`liveStrategyEngine.js` totalement intacts. `npm test` : 384/384 attendus (381/384 vus localement, 3 flakes `keepAlive.test.js` pré-existants inchangés).

## FVG : la bougie immédiate (<15 min après formation) compte-t-elle vraiment ? — 2026-09-12, suite

Suite directe de la section "multi-contact" ci-dessus. Esdras a précisé sa position : "ce que je ne considère PAS comme un FVG, c'est si le prix fait un FVG maintenant et retourne dans moins de 15 minutes après — c'est-à-dire dans la première bougie après le FVG." Un retour immédiat serait le même mouvement de continuation qui mèche en arrière, pas un vrai "parti puis revenu".

**Vérifié avant tout changement** : `scripts/runFvgFirstCandleAnalysis.js` tague chaque trade DÉJÀ validé par la production (rien de nouveau codé — même moteur, même config, même netting) selon que son entrée est survenue sur la toute première bougie après formation ou plus tard, puis compare les deux cohortes séparément (train/test, même discipline).

**D'abord une mesure choc, avant même de comparer la qualité** : 44-53% de TOUS les trades validés en production (selon l'instrument, en train) viennent exactement de cette première bougie — près de la moitié du volume du bot.

**Résultat par instrument (espérance R, train/test)** :

| Instrument | Bougie immédiate | Bougie(s) suivante(s) | Verdict |
|---|---|---|---|
| US100 | 0.91R / 0.80R | **1.82R / 1.78R** | ✅ quasi 2× meilleure, cohérent train ET test |
| US500 | 1.03R / 0.85R | 1.02R / 1.35R | ⚠️ faible, léger avantage en test seulement |
| XAUUSD | 0.49R / **1.06R** | **1.34R** / 0.22R | ❌ s'inverse entre train et test — pas de signal fiable |

**Sur US100, la claim d'Esdras est confirmée nettement et de façon cohérente** — mêmes deux instruments (US100 en tête) que pour le multi-contact testé juste avant. US500 faible. XAUUSD contradictoire d'une période à l'autre, à ne pas utiliser tel quel.

**Pas encore décidé/fait** : combiner les deux idées (multi-contact + exclusion bougie immédiate) sur US100 spécifiquement, discuté avec Esdras mais pas encore testé ni codé.

**Fichiers** : `scripts/runFvgFirstCandleAnalysis.js` (nouveau), `data/backtest-input/fvg-first-candle-analysis.md`. Aucun changement sur `src/` — `fvgEngine.js`/`liveStrategyEngine.js` intacts. `npm test` : inchangé (384/384 attendus, 3 flakes `keepAlive.test.js` pré-existants).

## Multi-contact + exclusion bougie immédiate, combinés — n'aide pas, légèrement pire — 2026-09-12, suite

Dernière étape de cette même session de recherche FVG. Esdras a explicitement demandé de combiner les deux idées testées séparément ci-dessus. `MultiTouchFvgEngine` a reçu une nouvelle option `minCandlesBeforeEligible` (2026-09-12, 2 tests) : un contact sur la toute première bougie après formation n'est même plus tenté (ni accepté ni rejeté) quand elle vaut 2, la zone attend simplement — combinée avec le comportement multi-contact déjà existant.

**Résultat (R total, test 2024-2025)** :

| Instrument | Contact unique | Multi-contact seul | Combiné |
|---|---|---|---|
| US100 | 55R | **130R** | 118R |
| US500 | 34R | 44R | 36R |
| XAUUSD | 25R | 23R | 20R |

**Combiner n'aide sur aucun des 3 instruments — légèrement pire que le multi-contact seul partout.** Explication : l'effet "bougie immédiate = moins bonne" trouvé dans le monde à contact unique était en réalité un proxy indirect du problème que le multi-contact résout directement (une zone qui meurt trop tôt). Une fois le multi-contact appliqué, exclure la bougie immédiate ne fait plus que retirer aussi les bons contacts immédiats, sans rien gagner en échange.

**Conclusion inchangée : multi-contact SEUL sur US100 reste la meilleure option testée.** Décision de déploiement toujours en attente d'Esdras.

**Fichiers** : `src/backtest/fvgMultiTouch.js` (+ `minCandlesBeforeEligible`, 2 tests), `scripts/runFvgCombinedAnalysis.js` (nouveau), `data/backtest-input/fvg-combined-analysis.md`. `npm test` : 386/386 attendus (383/386 vus localement, 3 flakes `keepAlive.test.js` pré-existants inchangés).

## Multi-contact US100 : robustesse vérifiée à fond avant toute décision de déploiement — 2026-09-12, suite

Esdras a posé la question directe qui aurait dû être posée avant de recommander quoi que ce soit : "t'es sûre que c'est validé par les chiffres et pas du data smoothing ?" Trois contrôles faits, dans l'ordre, avant de répondre :

1. **Concentration dans une fenêtre** (même contrôle qui avait démasqué la fragilité USDJPY) : test 2024-2025 découpé en 4 trimestres. Le multi-contact bat le contact unique dans CHAQUE trimestre, sans exception (T1-T2 2024 : +3.4R→+13.4R ; T3-T4 2024 : +8.8R→+9.7R ; T1-T2 2025 : +30.9R→+52.7R ; T3+ 2025 : +9.2R→+31.5R). Pas une seule fenêtre chanceuse qui porte tout le résultat.
2. **Répartition directionnelle** : 76% haussier / 24% baissier en test (le marché US100 a monté de +50% sur la période) — mais les trades baissiers (contre-tendance) gagnent LÉGÈREMENT MIEUX (1.62R, WR 45.5%) que les haussiers (1.34R, WR 40.8%). Si c'était de la dérive pure, le côté contre-tendance devrait être le plus faible, pas l'inverse.
3. **Contrôle de référence arbitraire** (même discipline que Divergence Momentum/RSI Momentum) : entrées à intervalle arbitraire dans la MÊME fenêtre de session (10h-11h NY), direction alternée, stop 1.5×ATR(14)/cible RR identique, aucun signal FVG réel. Résultat : espérance ~10× PLUS FAIBLE que le multi-contact (train 0.095R vs 1.10R ; test 0.142R vs 1.40R), taux de gain à peine au-dessus du seuil d'équilibre mécanique (≈19% vs seuil 16.7% pour RR=5), contre 38-41% pour le vrai signal. Contrairement à Divergence/RSI Momentum (où signal et référence arbitraire étaient du même ordre de grandeur), ici l'écart est net et large — la sélectivité du signal est réelle, pas de la dérive déguisée en edge.

**Conclusion : le multi-contact sur US100 passe les trois contrôles de robustesse de ce projet, pas seulement le screen train/test de base.** Reste la seule réserve structurelle déjà connue : ce n'est pas une reproduction exacte du modèle du backtest (qui compte le PREMIER passage comme rempli), c'est une extension testée séparément et validée sur ses propres mérites. Décision de déploiement toujours entre les mains d'Esdras — l'analyse ne dit que "c'est solide", pas "déploie".

`npm test` : inchangé, aucun fichier `src/` touché par ces contrôles (scripts jetables en `/tmp`, non committés — résultat documenté ici à la place).

## "Combien de temps pour passer un challenge FTMO/FundingPips 1-Step avec ce système" — 2026-09-12

Question directe d'Esdras après validation du multi-contact US100. Répondue avec une vraie simulation (`scripts/runFtmo1StepMultiTouchAccountImpact.js`), pas une estimation. Adaptée de `runFtmo1StepAccountImpact.js`, avec deux corrections importantes découvertes en construisant ce script :

1. **Bug de péremption trouvé dans les DEUX scripts d'impact-compte existants** (`runFtmo1StepAccountImpact.js` ET `runFundingPipsZeroAccountImpact.js`) : leur `FVG_CONFIG` a `rrMultiple: 3` codé en dur pour US100/US500/XAUUSD, alors que la production réelle est passée à 5/5/4 depuis la section "Cible étendue" (voir plus haut dans ce fichier). Ces deux scripts étaient donc **périmés** depuis ce changement — pas corrigés ici (hors scope), mais à savoir pour toute réutilisation future. Le nouveau script lit `CONFIG.fvg.perSymbol` directement plutôt que de retyper une copie locale, pour ne plus jamais dériver silencieusement.
2. US100 utilise `MultiTouchFvgEngine` (vérifié ce soir, PAS déployé) ; US500/XAUUSD/Divergence restent le moteur à contact unique déjà en production — aucun changement là.

**Résultat, 7 années simulées (règles FTMO 1-Step : cible unique +10%, perte trailing max 10% sur le plus haut solde)** :

| Année | Jour de passage | Busté ? |
|---|---|---|
| 2019 | 92 | non |
| 2020 | 55 | oui, mais après avoir déjà réussi |
| 2021 | 214 | non |
| 2022 | 89 | non |
| 2023 | 171 | non |
| 2024 (test) | **56** | non |
| 2025 (test) | **49** | non |

**Challenge réussi les 7 années, sans exception.** Moyenne globale ~104 jours (~15 semaines). Sur les 2 années hors échantillon (les plus représentatives pour l'avenir) : ~50 jours en moyenne (~7 semaines).

**Réserves données à Esdras** : règles FTMO 1-Step confirmées cette session, FundingPips 1-Step non re-vérifié à la source (contrairement à FundingPips Zero) — probablement proche mais pas garanti identique. Scope = combo validé (FVG×3 + Divergence) uniquement, hors NWOG/Judas Swing.

**Fichiers** : `scripts/runFtmo1StepMultiTouchAccountImpact.js` (nouveau), `data/backtest-input/ftmo-1step-multitouch-account-impact.md`. Aucun changement `src/` — recherche seulement, multi-contact toujours pas déployé.

## "Et si je prenais seulement le FVG multi-contact, sans XAUUSD ni Divergence?" — 2026-09-12, suite

Suite directe de la simulation précédente. Même méthode (`scripts/runFtmo1StepUS100OnlyAccountImpact.js`, dérivé du script combo), mais `FVG_SYMBOLS = ['US100']` uniquement, Divergence retirée entièrement — le combo le plus simple possible, isolant exactement ce qui a été validé ce soir.

**Résultat, comparé au combo complet** :

| | Combo complet | US100 multi-contact seul |
|---|---|---|
| Jour de passage (2024) | 56 | 206 |
| Jour de passage (2025) | 49 | 128 |
| Moyenne test | ~50 jours | ~167 jours |
| Drawdown trailing max (7 ans) | 4.6%-10.4% | 2.2%-4.7% |
| Busté sur 7 ans ? | Oui, une fois (2020) | Jamais |

**Vrai compromis vitesse/sécurité, pas une réponse à sens unique** : seul, US100 multi-contact prend ~3× plus longtemps (moins de trades/an : 37-54 contre 150-175), mais le drawdown ne dépasse jamais 4.7% sur les 7 années testées et il n'y a aucun bust — contre un bust en 2020 (après avoir déjà réussi ce challenge-là) avec le combo complet.

**Fichiers** : `scripts/runFtmo1StepUS100OnlyAccountImpact.js` (nouveau), `data/backtest-input/ftmo-1step-us100-only-account-impact.md`. Aucun changement `src/` — recherche seulement.

## Multi-contact testé sur EURUSD/GBPUSD/USDJPY — aucune ne tient, USDJPY démasqué comme fragile — 2026-09-12

Esdras a demandé explicitement d'étendre le multi-contact aux autres paires disponibles : "EURUSD, GBPUSD, et USDJPY aussi". Ni GBPUSD ni EURUSD n'ont de config FVG validée en production (déjà testées et rejetées plus tôt dans ce projet). Pas de config "déjà validée" à étendre comme pour l'extension USDJPY à 11 mécanismes — la config US100 (H4_EMA200, structure+sweep, fenêtre Silver Bullet 10h-11h NY, stop fvg-edge, RR=5) est reprise TELLE QUELLE sur les 3 paires, zéro paramètre ajusté (`scripts/runFvgMultiTouchOtherPairsAnalysis.js`).

**Résultat (test 2024-2025)** :

| Paire | Contact unique | Multi-contact | Verdict |
|---|---|---|---|
| EURUSD | -0.25R (n=15) | -0.25R (n=35) | ❌ rejeté des deux côtés |
| GBPUSD | +0.19R (n=10) | +0.03R (n=24) | ⚠️ bruit (train négatif des deux côtés) |
| USDJPY | +0.73R (n=16) | **+1.06R** (n=32) | ✅ tient mécaniquement... |

**...mais démasqué comme fragile en vérifiant par trimestre, même discipline que pour US100** :

| Trimestre | Trades | R |
|---|---|---|
| 2024 T1-T2 | 10 | **-5.6R** |
| 2024 T3-T4 | 6 | +17.0R |
| 2025 T1-T2 | 9 | +12.8R |
| 2025 T3+ | 4 | +7.1R |

~95% du profit vient de 2 trimestres sur 4 (échantillons de 6 et 9 trades), et un trimestre est carrément négatif — à l'opposé du profil US100 (positif dans les 4 trimestres sans exception). Même signature de fragilité que l'ancien cas Asian Range Breakout/USDJPY documenté plus haut dans ce fichier.

**Conclusion : aucune des 3 paires ne mérite d'être ajoutée.** L'edge de ce projet (avec ou sans multi-contact) reste spécifique à US100 (et modérément US500) — pas une recette généralisable à n'importe quelle paire disponible.

**Fichiers** : `scripts/runFvgMultiTouchOtherPairsAnalysis.js` (nouveau), `data/backtest-input/fvg-multi-touch-other-pairs-analysis.md`. Aucun changement `src/` — recherche seulement.

## "Avant de déployer" — stop/target, streaks, pyramide, risque fixe vs dynamique — 2026-09-12

Question explicite d'Esdras avant tout déploiement du multi-contact US100 : "où va tu mettre le stop loss, le tp, combien de rrr, est-ce que c'est fixe ou flexible ? Compare fixe et dynamique, compare le nombre de trades gagnants suivis vs perdants suivis, compare aussi pyramidal vs non pyramidal et compare aussi risque fixe vs dynamique selon qu'on perde ou gagne." Suivi d'une demande explicite de documenter davantage, surtout l'idée du pyramidage. Un seul script, `scripts/runFvgPreDeployRiskAnalysis.js`, fait tourner les 4 comparaisons sur EXACTEMENT la même séquence de trades (multi-contact US100, config production verbatim, net de coûts) pour rester comparables entre elles, et génère `data/backtest-input/fvg-us100-pre-deploy-risk-analysis.md` avec, pour chaque section, au moins un exemple RÉEL tiré des données (voir ce fichier pour le détail complet — résumé ci-dessous).

**1) Mécanique stop/target** — rien à calculer, c'est déjà fixé par `computeStop()`/`runBacktest()` : entrée = bord de la zone FVG (ordre LIMIT posé au bord du gap, prix de ré-entrée ICT, jamais le prix de marché), stop = mode `fvg-edge` (bord OPPOSÉ de la zone + 10% de marge de sa hauteur, pour ne pas être sorti par une simple mèche), target = entrée + RR × distance avec RR = 5 (valeur production actuelle, montée depuis 1:3 via la "cible étendue" documentée plus haut). **Tout est FIXE au moment où le signal est validé**, jamais retouché ensuite (pas de trailing, pas de breakeven, pas de sortie anticipée) — le trade ne peut finir que de 3 façons : stop touché (perte), target touché (gain), ou timeout après 480 bougies (ni gagnant ni perdant). Exemple réel : signal du 2019-03-29 09:45, achat à 7342.36, stop à 7336.86 (distance 5.50), target à 7369.86 (5× la distance) → target touché, +4.82R.

**2) Streaks** (2019-2025 complet, n=273, sans pyramide — la pyramide change les R mais pas le compte de séries) : max 7 gagnants d'affilée, max **10 perdants d'affilée** (moyenne des séries perdantes : 2.7 ; distribution `{1:20, 2:17, 3:7, 4:6, 5:6, 6:2, 7:1, 9:1, 10:1}`). La pire série concrète : 10 pertes d'affilée entre le 2022-06-17 et le 2022-07-28, -10.86R au total — soit ~5.4% du compte perdu d'affilée à 0.5%/trade fixe.

**3) Pyramidal — l'idée d'Esdras, documentée en détail** (unités indépendantes, `runBacktestPyramidIndependentStops`) vs non pyramidal :

Le principe : dès que le prix a bougé d'1×D (D = distance entrée-stop) EN FAVEUR de l'unité originale, une **2e unité de même taille** est ajoutée à ce nouveau prix, avec SON PROPRE stop posé 1×D plus loin dans le sens défavorable — ce qui, par pure géométrie, atterrit exactement sur le prix d'entrée original. Elle vise le même target que l'originale. **Différence clé avec le pyramidage "stop partagé" déjà testé et rejeté plus tôt dans ce projet (`runBacktestManaged` mode `'pyramid'`)** : ici, le stop de l'unité ORIGINALE n'est JAMAIS déplacé ni touché par l'ajout — les deux unités vivent indépendamment jusqu'à leur propre résolution, et le trade combiné n'est comptabilisé qu'une fois les deux closes.

Un trade pyramidé peut finir de 3 façons observées sur 2019-2025 (jamais une 4e) : gain-gain (27 fois, ~9R combiné), gain de l'originale malgré la perte de l'unité ajoutée (11 fois — le prix redescend jusqu'au point d'ajout puis repart), perte-perte (23 fois — le prix redescend jusqu'au stop de l'originale, donc passe forcément par le stop de l'unité ajoutée avant). **"Perte de l'originale + gain de l'ajout" n'arrive JAMAIS** : conséquence géométrique, pas un hasard d'échantillon — le stop de l'unité ajoutée est exactement au prix d'entrée original, donc toujours traversé AVANT que l'unité originale puisse atteindre son propre stop, plus loin. Voir le rapport complet pour 3 exemples réels chiffrés (un par catégorie).

| Période | Sans pyramide | Avec pyramide | Gain |
|---|---|---|---|
| Train | n=180, 1.10R, R total 198.4 | n=180, 1.33R, R total 239.4 (44 pyramidés, 24% des trades) | +21% de R total |
| Test | n=93, 1.40R, R total 130.6 | n=93, 1.76R, R total 163.6 (17 pyramidés, 18% des trades) | +25% de R total |

Coût : drawdown max en R légèrement plus haut (6.82R→7.82R en test) — le sizing total déployé grimpe temporairement pendant un trade pyramidé, même si l'unité originale ne risque jamais plus que prévu.

**4) Risque fixe (0.5% constant) vs dynamique** (réduit à 0.25% après 2 pertes consécutives, restauré après un gain), appliqué à la même séquence de trades — seul le sizing change, jamais la sélection ni le résultat des trades :

| Période | Fixe | Dynamique |
|---|---|---|
| Train | +164.1% compte, drawdown 5.3% | +119.0% compte, drawdown 3.2% |
| Test | +89.8% compte, drawdown 3.4% | +70.5% compte, drawdown 2.4% |

**Pas un gain gratuit** : le drawdown baisse d'environ 40%, mais ça coûte une bonne partie de la croissance totale (le sizing réduit s'applique aussi aux trades qui, après coup, se révèlent gagnants juste après une série de pertes — le sizing dynamique ne peut pas savoir à l'avance qu'une série va s'arrêter). Sur la pire série de pertes isolée (section 2 ci-dessus), le compte tombe à -5.3% en fixe contre -3.2% en dynamique — exactement le genre de série que la réduction est censée amortir.

**Bug trouvé et corrigé en construisant ce script** : `buildMultiTouchFilterPredicate()` (biais H4/structure) utilise un curseur monotone interne qui suppose un seul passage ascendant sur les bougies — réutiliser la MÊME instance de prédicat pour deux passages complets séparés (ex. baseline puis pyramide) corrompt silencieusement le second passage (donnait 0 trades en train, 459 en test avec un drawdown aberrant de 112R avant correction). Chaque script précédent (`runFvgMultiTouchAnalysis.js`, `runFvgMultiTouchOtherPairsAnalysis.js`) construit déjà un prédicat frais par engine/passage donc n'était PAS affecté — seul ce nouveau script avait la réutilisation fautive, corrigée avant publication du résultat.

**Décision de déploiement toujours entièrement entre les mains d'Esdras** — ceci est de la documentation de risque, pas une recommandation de déployer ou non.

**Fichiers** : `scripts/runFvgPreDeployRiskAnalysis.js` (nouveau), `data/backtest-input/fvg-us100-pre-deploy-risk-analysis.md`. Aucun changement `src/` — recherche seulement, multi-contact toujours pas déployé.

## Recommandation donnée à Esdras, puis vérification complète du pyramidage en simulation de compte — 2026-09-12

Sur la question "avec ces données, lequel recommandes-tu qu'on code ?", recommandation donnée : **multi-contact US100 + RR=5 + pyramidage (stops indépendants) + risque fixe à 0.5%** (PAS de risque dynamique — le drawdown de US100 multi-contact seul est déjà bas de base, 2.2%-4.7% trailing sur 7 ans, donc réduire le risque après des pertes ralentit le passage du challenge sans corriger un vrai danger de bust). Réserve explicitement posée : le pyramidage n'avait été testé qu'en R purs (`runBacktestPyramidIndependentStops`), jamais branché dans une vraie simulation de compte jour par jour avec la règle FTMO trailing et le guardrail de production.

Esdras a demandé cette vérification : "oui, fais tourner la simulation complète avec le pyramidage." `scripts/runFtmo1StepUS100OnlyPyramidAccountImpact.js` reprend exactement `runFtmo1StepUS100OnlyAccountImpact.js` (US100 multi-contact seul, déjà "jamais busté" sur 7 ans) et y porte le mécanisme de pyramidage candle par candle : chaque leg (originale + ajoutée, si déclenchée) se résout indépendamment et bouge le VRAI solde/drawdown/état guardrail à son propre moment de sortie — pas juste un R combiné calculé après coup. La 2e unité est sizée sur le solde COURANT et passe par le même filtre guardrail qu'un nouveau signal (2 trades/jour max, perte quotidienne max 2%).

**Résultat, comparé à la version sans pyramide** :

| Année | Sans pyramide | Avec pyramide |
|---|---|---|
| 2019 | jamais, $10824, DD 4.5% | jamais, **$10574**, DD **5.7%** (seule année où c'est pire) |
| 2020 | jour 173, $11509 | jour **133**, $12194 |
| 2021 | jour 171, $14300 | jour **115**, $15460 |
| 2022 | jour 142, $11920 | jour 141, $12852 |
| 2023 | jour 301, $11540 | jour **260**, $11902 |
| 2024 (test) | jour 206, $12124 | jour **142**, $12746 |
| 2025 (test) | jour 128, $14990 | jour **92**, $17351 |

**Verdict : jamais busté sur les 7 années, même conclusion qu'avant le pyramidage** — drawdown trailing max jamais au-delà de 5.7% (contre un plafond FTMO de 10%). Le pyramidage accélère nettement le passage dans 6 années sur 7 (ex. 2025 : jour 92 au lieu de 128, presque 30% plus rapide sur les 2 années test) et augmente le solde final dans les mêmes 6 années. Seule 2019 fait exception (les deux versions échouent à passer le challenge cette année-là de toute façon — "jamais" dans les deux cas — donc ce n'est pas un échec de plus, juste une année où les 2e unités ont coûté plus qu'elles n'ont rapporté). Le guardrail n'a bloqué aucun ajout de 2e unité sur les 7 ans (le filtre reste actif au besoin, mais n'a jamais eu à intervenir dans ces données).

**Recommandation confirmée par cette vérification** — le pyramidage tient une fois branché dans une vraie simulation de compte, pas seulement en R purs.

**Fichiers** : `scripts/runFtmo1StepUS100OnlyPyramidAccountImpact.js` (nouveau), `data/backtest-input/ftmo-1step-us100-only-pyramid-account-impact.md`. Aucun changement `src/` — recherche seulement, rien de tout ça n'est encore déployé.

## Multi-contact + pyramidage codés sur la branche de recherche — 2026-09-12

Esdras : "code le multi-contact avec pyramidage sur la branche de recherche." Bonne surprise en ouvrant `liveStrategyEngine.js`/`cTraderDataSource.js`/`matchTraderDataSource.js` : **le pyramidage (stops indépendants) était déjà entièrement codé et testé côté live** — machine à états complète (`pyramidPositions`, `markPyramidOrderPlaced`/`markPyramidOrderFilled`), placement/annulation réelle d'ordre STOP sur les DEUX data sources (cTrader et Match-Trader, en miroir), notifications, guardrail appliqué à la 2e unité comme à un nouveau signal — tout ça derrière `CONFIG.pyramid.enabled` (`PYRAMID_ENABLED=true`, faux par défaut) avec un avertissement explicite dans le code : ne pas activer avant d'avoir confirmé le sizing des lots contre une vraie liste de symboles démo (le scaling exact du champ "volume" cTrader n'a jamais été vérifié en réel). Rien à coder là-dessus, juste à l'activer le moment venu.

**Ce qui manquait vraiment : le multi-contact lui-même.** `_detectFvgSignal()`/`_warmUpOneSymbol()` construisaient toujours le moteur single-touch (`buildFilteredEngine`), jamais `MultiTouchFvgEngine`. Ajouté :
- `LiveStrategyEngine._buildFvgEngine(candles, symbol, cfg)` — UN SEUL endroit qui décide quel moteur un symbole reçoit (single-touch par défaut, `MultiTouchFvgEngine` si `cfg.multiTouch`), partagé par le chemin temps réel ET le warm-up en masse, comme `_processFvgEvent()` l'est déjà pour la forme des signaux.
- `CONFIG.fvg.perSymbol.US100.multiTouch = true` — champ direct, pas de variable d'environnement supplémentaire (contrairement au pyramidage : ce n'est qu'un changement de timing d'entrée, pas un nouvel ordre broker automatique, donc pas le même niveau de risque opérationnel). US500/XAUUSD restent en single-touch (jamais validés en multi-contact avec la même rigueur).
- Comme `chartOverlays.js`/`forwardTest.js`/`recentPerformanceReport.js` instancient tous `LiveStrategyEngine` avec `fvgConfig: CONFIG.fvg.perSymbol`, ils reflètent maintenant automatiquement le multi-contact sur US100 sans changement séparé — un seul endroit de vérité, aucune divergence possible entre "ce que trade le bot" et "ce que montre le graphique".

**Effet de bord découvert en repassant les tests** : `chartOverlays.js`'s heuristique "stale" (une zone jamais vue se terminer = probablement tuée silencieusement par un filtre) supposait le comportement single-touch. Avec le multi-contact, un contact rejeté n'efface plus la zone silencieusement, et l'expiration réelle émet TOUJOURS un événement `'expired'` — donc US100 ne produit plus jamais de zone `'stale'` (vérifié : 2451 `expired`/74 `validated`/10 `watching`/**0 stale** sur 12000 bougies, contre 2250 `stale` sur US500 qui reste single-touch). 2 tests qui ciblaient `'US100'` pour ce mécanisme ont été déplacés vers `'US500'` (toujours single-touch, toujours pertinent), et un nouveau test positif ajouté qui vérifie explicitement que US100 ne produit plus jamais de `'stale'`.

**Tests ajoutés** (`test/liveStrategyEngine.test.js`) : un contact hors fenêtre de session ne consomme plus la zone (le contact suivant, dans la fenêtre, valide quand même) ; le même scénario SANS `multiTouch` ne valide jamais (le premier contact consomme la zone comme en production) — preuve directe de la différence de comportement au niveau de l'intégration, pas seulement du moteur isolé (déjà testé dans `test/fvgMultiTouch.test.js`). L'équivalence bulk warm-up vs replay séquentiel (`newEngineForWarmupComparison`, déjà existante) couvre maintenant aussi le multi-contact gratuitement, puisqu'elle utilise `CONFIG.fvg.perSymbol` réel.

**Toujours pas déployé en production** — ceci reste sur `challenge/fundingpips-zero` uniquement, comme demandé. `npm test` : 386/389 (3 flakes `keepAlive.test.js` déjà connus, sans rapport). Pour activer réellement en live (une fois mergé) : le multi-contact US100 s'active tout seul via ce commit ; le pyramidage a besoin en plus de `PYRAMID_ENABLED=true` — et cette variable-là ne doit pas être touchée avant d'avoir vérifié le sizing des lots sur un compte démo réel, avertissement déjà dans le code, pas nouveau.

## Fenêtre horaire (8h-12h / 10h-11h / journée entière) et jour de la semaine — 2026-09-12

Esdras, après le schéma "FVG en M15" : "est-ce qu'on doit attendre 10-11h pour que le prix frappe le FVG ? Fais le test pour 8h-12h et 10-11h vs toute la journée... ensuite fais le test pour les jours de la semaine le plus profitable aussi." `scripts/runFvgMultiTouchWindowAndWeekdayAnalysis.js` — US100 multi-contact, config production verbatim à part la fenêtre testée, 3 fenêtres discrètes seulement (pas une recherche sur toutes les fenêtres possibles).

**1) Fenêtre horaire** (train 2019-2023 / test 2024-2025, net de coûts) :

| Fenêtre | Espérance train | Espérance test | R total test | Drawdown max test |
|---|---|---|---|---|
| 08h-12h | 0.86R (n=448) | 1.10R (n=201) | 220.5R | 8.89R |
| **10h-11h (production)** | **1.10R** (n=180) | **1.40R** (n=93) | 130.7R | **6.82R** |
| Toute la journée | 0.39R (n=1125) | 0.49R (n=511) | 252.4R | **23.36R** |

**10h-11h reste la meilleure fenêtre en espérance ET en drawdown**, malgré moins de trades — la fenêtre actuelle n'est pas un choix arbitraire. Toute la journée génère plus de trades et un R total brut plus haut, mais avec un drawdown 3-4x supérieur pour une espérance par trade 3x plus faible — un mauvais compromis, pas une meilleure fenêtre. 8h-12h est un compromis intermédiaire raisonnable mais reste dominé par 10h-11h sur les deux mesures.

**2) Jour de la semaine** (sur la fenêtre 10h-11h, purement exploratoire — échantillons par jour trop petits pour un vrai verdict) : aucun jour n'est négatif à la fois sur train ET test. Mercredi est le plus faible des deux côtés (0.92R train, 1.07R test) mais reste positif — pas un pattern assez solide pour justifier un filtre.

**Conclusion : garder 10h-11h, ne rien changer.** Aucun changement de config recommandé par cette analyse.

**Fichiers** : `scripts/runFvgMultiTouchWindowAndWeekdayAnalysis.js` (nouveau), `data/backtest-input/fvg-multi-touch-window-weekday-analysis.md`. Aucun changement `src/` — recherche seulement.

## "8h-12h n'est-il pas un meilleur compromis ?" — 2026-09-12

Esdras, sur les résultats ci-dessus : "beaucoup de trades que j'ai pris étaient dans cet intervalle [8h-12h]." Deux vérifications :

**1) Les heures en plus (8h-10h + 11h-12h) sont-elles un vrai edge ou juste de la dilution ?** (`scripts/runFvgMultiTouchResidualWindowAnalysis.js`) — isolé le résidu (trades dans 8h-12h mais PAS dans 10h-11h) : espérance **0.67R train / 1.09R test**, positive des deux côtés, verdict ✅ tient. Ce n'est PAS du bruit — élargir la fenêtre ajoute un vrai deuxième edge, plus faible que le cœur 10h-11h (1.10R/1.40R) mais réel.

**2) Est-ce que ça passe le challenge plus vite en vrai ?** (`scripts/runFtmo1StepUS100Only8to12AccountImpact.js`, simulation de compte complète, identique à la version 10h-11h à part la fenêtre) :

| Année | Jour de passage 10h-11h | Jour de passage 8h-12h | Drawdown trailing max 10h-11h | Drawdown trailing max 8h-12h |
|---|---|---|---|---|
| 2019 | **jamais** | jour 213 | 4.5% | 5.8% |
| 2020 | jour 173 | jour 133 | 4.5% | **9.3%** |
| 2021 | jour 171 | jour 156 | 2.2% | 5.4% |
| 2022 | jour 142 | jour 117 | 4.7% | 6.5% |
| 2023 | jour 301 | jour 198 | 3.9% | 4.0% |
| 2024 (test) | jour 206 | jour 116 | 3.2% | 4.5% |
| 2025 (test) | jour 128 | jour 65 | 3.3% | 6.3% |

**8h-12h est plus rapide TOUTES les années sans exception** (passe même 2019, que 10h-11h ne réussit jamais), ~46% plus rapide en moyenne sur les 2 années test (90,5 jours contre 167). **Jamais busté non plus, sur les 7 années.** Mais le coussin de sécurité rétrécit nettement : 2020 atteint 9,3% de drawdown trailing, à seulement 0,7 point du plafond FTMO de 10% — contre un pire cas de 4,7% pour 10h-11h (plus de 2x plus de marge). Un vrai compromis vitesse/sécurité, pas une réponse à sens unique : 8h-12h n'a jamais cassé dans CE backtest précis, mais tourne beaucoup plus près du bord dans sa pire année.

**Décision laissée entièrement à Esdras**, comme pour tous les autres compromis de ce projet.

**Fichiers** : `scripts/runFvgMultiTouchResidualWindowAnalysis.js`, `scripts/runFtmo1StepUS100Only8to12AccountImpact.js` (nouveaux), `data/backtest-input/fvg-multi-touch-residual-window-analysis.md`, `data/backtest-input/ftmo-1step-us100-only-8to12-account-impact.md`. Aucun changement `src/` — recherche seulement, la fenêtre production reste 10h-11h.

## Même comparaison, mais sur les 7 mois RÉELS de forward-test (pas l'historique 2019-2025) — 2026-09-12

Esdras : "maintenant tu as accès aux données de 7 mois live, dis-moi 8h-12h vs 10h-11h, lequel aurait été meilleur ?" — `data/forward-test-2026/US100.csv`, bougies réelles exportées du compte cTrader (2026-02-06 → 2026-09-09), jamais utilisées pour choisir un paramètre. `scripts/runFvgMultiTouchForwardTestWindowAnalysis.js`.

| Fenêtre | Trades | Win rate | Espérance (R) | R total | Drawdown max (R) |
|---|---|---|---|---|---|
| 08h-12h | 26 | 34.6% | 0.99 | 25.74 | 6.39 |
| **10h-11h (production)** | 9 | **44.4%** | **1.56** | 14.06 | **2.23** |
| Toute la journée | 133 | 24.8% | 0.41 | 54.55 | 11.78 |

**Confirme directionnellement le backtest 7 ans** : 10h-11h garde la meilleure espérance par trade et le plus petit drawdown, malgré le moins de trades. 8h-12h prend presque 3x plus de trades pour une espérance plus faible ; toute la journée prend le plus de trades mais avec l'espérance la plus faible et le drawdown le plus élevé.

**Mais échantillon minuscule** — 9 trades pour 10h-11h sur 7 mois : un seul résultat différent change tout le classement. Pas une preuve indépendante, une confirmation directionnelle cohérente avec l'analyse sur 7 ans, rien de plus.

**Fichiers** : `scripts/runFvgMultiTouchForwardTestWindowAnalysis.js` (nouveau), `data/forward-test-2026/fvg-multi-touch-forward-test-window-analysis.md` (détail complet des trades, fenêtre par fenêtre). Aucun changement `src/`.

## "9 trades ne peuvent pas passer le challenge" — vérification de la fréquence historique, puis 8h-12h + pyramide combinés — 2026-09-12

Esdras a poussé sur le rythme de 10h-11h : "9 trades pour 7 mois, tu vois que c'est bcp toi ? Lol. Sérieux, c'est genre 1 trade par mois. Y a aucun moyen de passer un challenge avec." Vérifié : **9 n'est pas anormal pour cette fenêtre calendaire précise** (6 février → 9 septembre) — même calcul sur chaque année 2019-2025 donne 13/19/14/30/6/21/29 trades, moyenne ~19, minimum 6 (2023). 10h-11h est un signal naturellement rare avec beaucoup de variance, pas un bug de cette période 2026. Mais le point de fond d'Esdras reste vrai : "l'idée c'est de passer le challenge, donc 9 trades ne peuvent pas passer le challenge" — 10h-11h seul n'a jamais été conçu pour être utilisé seul (voir simulation FTMO : ~167 jours de moyenne test).

**Empilé les deux leviers de vitesse déjà validés séparément** (`scripts/runFtmo1StepUS100Only8to12PyramidAccountImpact.js`) : fenêtre 8h-12h + pyramidage, ensemble, pour voir la config la plus rapide testée sur UN SEUL instrument.

| | 10h-11h seul | 8h-12h seul | 8h-12h + pyramide |
|---|---|---|---|
| Jours moyens (test 2024-2025) | 167 | 90,5 | 91 (quasi identique à 8h-12h seul) |
| Drawdown trailing max (7 ans) | 4,7% | 9,3% | **10,2% — busté en 2020** |

**Empiler les deux leviers ne va pas plus vite** (91 jours vs 90,5, essentiellement la même chose), **mais fait sauter la marge de sécurité qui restait** : 2020 dépasse le plafond FTMO de 10% (10,2%). Nuance importante : ce bust arrive le 18 août 2020, alors que le compte avait déjà atteint +10% dès le jour 90 — dans un vrai challenge FTMO, l'évaluation s'arrête à la cible, donc ce bust précis n'aurait probablement pas empêché de passer le challenge lui-même. Mais il montre un vrai risque pour l'étape D'APRÈS (compte financé), si le même style continue sans ajustement.

**Conclusion honnête : empiler 8h-12h et pyramide n'apporte pas de bénéfice net mesurable ici** — même vitesse que 8h-12h seul, plus de risque. Le vrai levier de vitesse reste soit 8h-12h seul (déjà ~46% plus rapide que 10h-11h, jamais busté), soit revenir au combo multi-instruments déjà validé plus tôt dans ce projet (FVG sur 3 instruments + Divergence, ~50 jours de moyenne test, un bust en 7 ans) — pas la fenêtre + le pyramidage combinés sur un seul instrument.

**Fichiers** : `scripts/runFtmo1StepUS100Only8to12PyramidAccountImpact.js`, `scripts/runFvgMultiTouch10to11SeasonalRateAnalysis.js` (nouveaux — le second formalise la vérification saisonnière ci-dessus, faite en ad-hoc puis rejouée proprement), `data/backtest-input/ftmo-1step-us100-only-8to12-pyramid-account-impact.md`, `data/backtest-input/fvg-multi-touch-10to11-seasonal-rate-analysis.md`. Aucun changement `src/` — recherche seulement.

## "Je me rappelais que le FVG fonctionnait sur EURUSD/GBPUSD" — première vraie recherche de config propre à ces paires — 2026-09-12

Esdras a mis en doute le rejet répété du FVG sur EURUSD/GBPUSD ("je me rappelais qu'il fonctionnait sur eux"). Vérification importante : tous les tests FVG faits sur ces paires jusqu'ici (ce soir comme les mentions plus anciennes dans `config.js`) reprenaient soit la config US100 TELLE QUELLE (multi-contact, plus haut ce soir), soit une affirmation jamais accompagnée d'un rapport sauvegardé. **Aucune vraie recherche exhaustive propre à EURUSD/GBPUSD n'avait jamais été faite dans ce projet** — contrairement à US100/US500, dont les configs actuelles viennent d'une recherche à 1008 configurations par symbole (`full-session-grid-search.md`). `scripts/runFullSessionGridSearchEurGbp.js` reprend EXACTEMENT cette même recherche (6 fenêtres horaires x variante HTF x structure x stop x R:R x sweep = 1008 configs/symbole), pointée sur EURUSD/GBPUSD.

**Résultat, Top 5 par symbole (criblé sur train, réévalué sur test)** :

- **EURUSD** : aucune configuration ne "tient" au sens strict. Les deux meilleures (train R 0.25-0.27, PF 1.36-1.37) redescendent à un test quasi nul (0.03-0.04R) — "⚠️ affaibli", la signature "train qui a l'air bien, test qui s'effondre" que ce projet traite systématiquement comme du bruit. Les 3 autres sont rejetées franchement (test négatif).
- **GBPUSD** : même profil. Les deux meilleures (train R 0.26-0.40, PF 1.46-1.56) redescendent à un test faible mais positif (0.07-0.10R) — "⚠️ affaibli". Les 3 autres rejetées franchement.

**Confirme donc le rejet, cette fois avec la recherche la plus complète possible, pas juste la config US100 copiée.** Explication probable du souvenir d'Esdras : plusieurs des meilleures configs TRAIN ont l'air franchement bonnes à première vue (ex. EURUSD #1 : win rate 46.7%, R 0.38, PF 1.72) — c'est exactement ce genre de chiffre "train seul" qui peut donner l'impression que ça fonctionne, avant de vérifier le test et de voir l'effondrement. Piste alternative, réelle celle-là : **Judas Swing sur EURUSD tient bien** (positif 6 années sur 8, voir plus haut dans ce fichier) — un mécanisme différent du FVG, peut-être la source du souvenir.

**Fichiers** : `scripts/runFullSessionGridSearchEurGbp.js` (nouveau), `data/backtest-input/full-session-grid-search-eurusd-gbpusd.md`. Aucun changement `src/` — recherche seulement.

## "Et pour usdjpy ?" — même recherche exhaustive, résultat encore plus net — 2026-09-12

Suite directe. `scripts/runFullSessionGridSearchUsdjpy.js`, même recherche à 1008 configs, sur USDJPY (données réelles 2016-2025, spread déjà configuré). Contrairement à EURUSD/GBPUSD, les meilleures configs TRAIN ici sont spectaculaires — win rate 52-56,5%, R net 0,94-1,07, profit factor 2,66-3,04 — bien plus impressionnantes que tout ce qui a été vu sur EURUSD/GBPUSD.

**Mais l'effondrement au test est encore plus net** :

| Fenêtre | R train | R test | Verdict |
|---|---|---|---|
| 08h-09h30, H4_EMA200 | 1,07 | 0,15 (n=9 — échantillon minuscule) | ⚠️ affaibli |
| 08h-09h30, H4_EMA50 | 0,97 | **-0,09** | ❌ ne tient pas |
| 08h-09h30, H4_EMA20 | 0,96 | **-0,31** | ❌ ne tient pas |
| 08h-09h30, H1_EMA20 | 0,95 | **-0,29** | ❌ ne tient pas |
| 08h-09h30, H1_EMA200 | 0,94 | **-0,15** | ❌ ne tient pas |

4 des 5 meilleures configs passent carrément NÉGATIVES en test. La seule qui reste positive (0,15R) repose sur seulement 9 trades test — trop peu pour y accorder du crédit. **Confirme et renforce la conclusion déjà posée** (multi-contact USDJPY : "tient" mécaniquement mais démasqué fragile par le contrôle trimestriel) : aucune config FVG propre à USDJPY, même optimisée à fond spécifiquement pour cette paire, ne survit au passage train → test. Le signal "impressionnant" en train ici est le plus extrême exemple de ce piège vu ce soir — exactement le genre de nombre qui peut sembler convaincant si on ne voit que la moitié entraînement.

**Bilan complet de la question d'Esdras ("EURUSD, GBPUSD, et USDJPY aussi")** : les 3 paires, testées avec la recherche la plus rigoureuse possible (pas juste la config US100 copiée), ne produisent AUCUNE config FVG qui tienne. L'edge FVG de ce projet reste spécifique à US100/US500/XAUUSD.

**Fichiers** : `scripts/runFullSessionGridSearchUsdjpy.js` (nouveau), `data/backtest-input/full-session-grid-search-usdjpy.md`. Aucun changement `src/` — recherche seulement.

## Décision : US100 passe de 10h-11h à 8h-12h — configuré dans le code — 2026-09-12

Esdras a tranché explicitement : "on part sur 8h-12h, c'est notre décision pour finir le challenge plus rapidement, donc tout doit être configuré avec cela." Contrairement au multi-contact et au pyramidage (pesés et laissés à sa décision), ceci est une VRAIE décision prise — codée directement, pas juste documentée.

**Changement** : `CONFIG.fvg.perSymbol.US100.sessionWindow` passe de `SILVER_BULLET_WINDOW` (10h-11h) à un nouveau `US100_WINDOW` (8h-12h) dédié — **US500 reste sur `SILVER_BULLET_WINDOW` (10h-11h), inchangé** : la fenêtre élargie n'a été testée et validée QUE pour US100 ce soir, jamais pour US500. Utiliser une constante séparée plutôt que modifier `SILVER_BULLET_WINDOW` directement évite exactement le bug qui aurait silencieusement changé US500 aussi.

**Compromis accepté, pour mémoire** (détail complet dans les sections "8h-12h n'est-il pas un meilleur compromis ?" et "9 trades ne peuvent pas passer le challenge" plus haut) :
- ~46% plus rapide pour passer un challenge FTMO (test 2024-2025 : ~90 jours au lieu de ~167).
- Jamais busté sur les 7 années de backtest.
- Drawdown trailing max plus élevé : 9,3% dans la pire année testée (2020) contre 4,7% pour 10h-11h — reste sous le plafond FTMO de 10%, mais avec beaucoup moins de marge.
- Confirmé directionnellement sur les 7 mois de forward-test réel (10h-11h gardait la meilleure espérance par trade, mais 8h-12h prenait ~3x plus de trades).

**Toujours sur la branche de recherche** (`challenge/fundingpips-zero`), comme tout le reste de ce soir — pas encore déployé en production. Le pyramidage reste séparément derrière `PYRAMID_ENABLED` (inchangé par ce commit).

**Vérifié** : `npm test` toujours 386/389 (3 flakes `keepAlive.test.js` déjà connus, sans rapport) — aucun test ne dépendait de la valeur exacte de la fenêtre US100 partagée.

**Fichiers** : `src/config.js` (le changement lui-même). Artefact "Anatomie d'un FVG" mis à jour en conséquence (voir lien donné à Esdras plus tôt ce soir). **Déployé en production** (`claude/lire-handoff-hxisa5`, fast-forward propre depuis `challenge/fundingpips-zero`, `npm test` 386/389 avant et après) à la demande explicite d'Esdras ("mais avant passe en production").

## "US500 n'a jamais été testé sur 8h-12h ? Teste-le" — et la réponse est différente de US100 — 2026-09-12

Juste après le déploiement, Esdras a demandé la même vérification pour US500. Confirmé : aucun test de fenêtre ce soir n'a jamais touché US500. Deux scripts, même méthode que pour US100 :

**1) Comparaison en R purs** (`scripts/runFvgUS500WindowAnalysis.js`, moteur single-touch RÉELLEMENT en production pour US500 — pas de multi-contact validé sur ce symbole) :

| Fenêtre | Espérance test | R total test | Drawdown max test |
|---|---|---|---|
| 08h-12h | 0.62R (n=91) | 56.25R | 14.21R |
| **10h-11h (actuel)** | **1.13R** (n=30) | 33.97R | 10.42R |

Même schéma que US100 : 10h-11h a la meilleure espérance par trade, 8h-12h prend 3x plus de trades pour une espérance plus faible et un drawdown plus élevé.

**2) Simulation de compte FTMO complète** (`scripts/runFtmo1StepUS500WindowAccountImpact.js`) — **et là, contrairement à US100, le résultat est net : 8h-12h n'est PAS un gain pour US500** :

| Année | 10h-11h | 8h-12h |
|---|---|---|
| 2022 | jour 284 | **jamais** |
| 2024 (test) | **jour 192** | jour 227 (plus lent) |
| 2025 (test) | jamais (DD 4.5%) | jamais (DD **9.4%** — proche du plafond 10%) |

Sur la SEULE année test où les deux passent la comparaison directement (2024), 10h-11h est plus rapide (192 jours contre 227). 2025 ne passe dans AUCUN des deux cas, mais 8h-12h y prend un drawdown de 9.4% contre 4.5% pour 10h-11h — un vrai risque de bust en plus, sans bénéfice de vitesse en échange. 2022 (train) est encore plus parlant : 10h-11h réussit le challenge (jour 284), 8h-12h ne le complète jamais cette année-là.

**Conclusion : US500 reste sur 10h-11h, aucun changement recommandé.** Ce qui a marché pour US100 (élargir la fenêtre) ne se généralise pas automatiquement à un autre instrument — exactement le genre de piège que la discipline train/test de ce projet est censée attraper. `CONFIG.fvg.perSymbol.US500` reste inchangé.

**Fichiers** : `scripts/runFvgUS500WindowAnalysis.js`, `scripts/runFtmo1StepUS500WindowAccountImpact.js` (nouveaux), `data/backtest-input/fvg-us500-window-analysis.md`, `data/backtest-input/ftmo-1step-us500-window-account-impact.md`. Aucun changement `src/` — recherche seulement, US500 n'est pas touché.

## "Teste XAUUSD aussi sur 8h-12h" — troisième résultat différent, cette fois plutôt favorable — 2026-09-12

Esdras a demandé la même vérification pour XAUUSD. Différence importante à noter d'entrée : **XAUUSD ne tourne pas sur 10h-11h en production, mais sur 7h-10h** (London-NY overlap) — c'est la vraie fenêtre de référence utilisée ici, pas 10h-11h comme pour US100/US500. Même méthode (moteur single-touch réel, stop `swing`, RR=4, config verbatim sauf la fenêtre) :

**1) R purs** (`scripts/runFvgXauusdWindowAnalysis.js`) : 7h-10h garde la meilleure espérance test (0.61R contre 0.46R pour 8h-12h) — même schéma que US100/US500, la fenêtre étroite reste plus "propre" par trade.

**2) Simulation de compte FTMO complète** (`scripts/runFtmo1StepXauusdWindowAccountImpact.js`) — **et là, contrairement à US500, 8h-12h a l'air clairement meilleur pour XAUUSD** :

| Année | 7h-10h | 8h-12h |
|---|---|---|
| 2020 | jour 134 | jour 96 (plus rapide) |
| 2023 | jour 359 | jour 333 (plus rapide) |
| 2024 (test) | **jamais** | **jour 315** |
| 2025 (test) | jamais (DD 3.1%) | jamais (DD 5.5%) |

8h-12h passe le challenge dans TOUTES les années où 7h-10h y arrive aussi (et plus vite à chaque fois), PLUS une année test (2024) que 7h-10h ne complète jamais. Seul coût : drawdown trailing max un peu plus élevé (6.1% contre 3.1% sur les 7 ans), mais qui reste confortablement sous le plafond FTMO de 10% — jamais busté dans aucun des deux cas. (Note : 2022 est absent des deux tableaux — vrai trou de données dans le CSV XAUUSD source, pas un artefact du script, vérifié directement : zéro bougie sur toute l'année 2022.)

**Conclusion : contrairement à US500, 8h-12h a l'air d'être un vrai gain pour XAUUSD, pas juste un compromis.** Aucun changement fait dans le code — décision laissée à Esdras, comme pour US100 avant sa décision explicite.

**Trois instruments, trois résultats différents ce soir** : US100 (compromis vitesse/sécurité assumé, déployé), US500 (pas d'intérêt, laissé tel quel), XAUUSD (semble net positif, en attente de décision) — confirme qu'il fallait bien tester chaque instrument séparément plutôt que supposer.

**Fichiers** : `scripts/runFvgXauusdWindowAnalysis.js`, `scripts/runFtmo1StepXauusdWindowAccountImpact.js` (nouveaux), `data/backtest-input/fvg-xauusd-window-analysis.md`, `data/backtest-input/ftmo-1step-xauusd-window-account-impact.md`. Aucun changement `src/` — recherche seulement, XAUUSD n'est pas touché tant qu'Esdras n'a pas tranché.

## "Fais un test global de toutes les stratégies à la fois" — impact combiné sur un compte 10k — 2026-09-12

Esdras : *"on a plusieurs stratégies ouvertes non? ... fais un test global de toutes qui fonctionnent à la fois et non pour chaque stratégie séparément pour voir l'impact de toutes ces stratégies ouvertes en même temps sur le compte. Compte 10k."* Jusqu'ici chaque script FTMO de cette session testait UNE combinaison à la fois. Nouveau script (`scripts/runFtmoAllLiveStrategiesAccountImpact.js`) qui reproduit EXACTEMENT le scope production actuel au complet dans une seule simulation, netting réel partagé (un seul `openPositions[symbol]`, comme en production), un seul budget de garde-fous — tout lu directement depuis `CONFIG` :
- FVG : US100 (multi-contact, 8h-12h), US500 (contact unique, 10h-11h), XAUUSD (contact unique, 7h-10h)
- Divergence (US100/US500), NWOG (US100), Judas Swing (EURUSD)

Priorité identique à `ingestCandle()` quand deux sources visent le même symbole en même temps : FVG, puis Divergence, puis NWOG, puis Judas Swing.

**Résultat, compte $10 000, règles FTMO 1-Step (+10% cible, -10% trailing)** :

| Année | Trades (4 sources) | Busté? | Challenge complété |
|---|---|---|---|
| 2019 | 269 | non | jour 79 |
| 2020 | 221 | **OUI** (2020-09-17) | jour 63 |
| 2021 | 228 | **OUI** (2021-10-04) | jour 137 |
| 2022 | 319 | non | jour 64 |
| 2023 | 303 | non | jour 194 |
| 2024 (test) | 146 | **OUI** (2024-07-11) | jour 24 |
| 2025 (test) | 333 | non | jour 37 |

**Vitesse** : challenge complété en 24 à 194 jours (moyenne ~85j) — nettement plus vite que n'importe quelle stratégie isolée testée cette session, logique puisque le compte cumule le rythme des 4 sources (146 à 333 trades/an contre ~9-133 pour US100 FVG seul selon la fenêtre).

**Risque, le vrai point de la question** : 3 années sur 7 finissent BUSTÉES (-10% trailing), dont 2024 (année test) — qui buste au jour 24, alors même que le challenge y est déjà complété (la simulation continue de trader après le +10%, comme partout ailleurs cette session — donc ce n'est pas un "raté" du challenge, mais un vrai signal que le risque combiné reste élevé même après l'avoir passé). Aucun test isolé cette session (FVG seul, FVG+Divergence, une fenêtre horaire) ne bustait quasiment jamais à 0.5%/trade. La cause identifiée : `CONFIG.guardrails` (maxTradesPerDay=2, dailyLossLimitPct=2%) limite les NOUVELLES entrées par jour, mais ne plafonne PAS le nombre de positions ouvertes EN MÊME TEMPS sur des symboles différents — une position peut rester ouverte jusqu'à ~5 jours (480 bougies M15), donc jusqu'à 4 positions (US100+US500+XAUUSD+EURUSD) peuvent être ouvertes simultanément, chacune à 0.5% de risque — c'est l'empilement de risque simultané sur plusieurs symboles décorrélés qui fait le bust, pas une dégradation d'edge.

**Implication pratique, non tranchée** : tel que configuré aujourd'hui, le système combiné passerait un challenge beaucoup plus vite qu'avec FVG seul, mais avec un risque de busted réel (43% des années testées). Deux leviers concrets, non testés ici : réduire le risque par trade (0.3-0.4% au lieu de 0.5%), ou plafonner le nombre de positions ouvertes simultanément tous symboles confondus. Aucun changement fait dans `src/` — résultat présenté à Esdras pour décision.

**Fichiers** : `scripts/runFtmoAllLiveStrategiesAccountImpact.js` (nouveau), `data/backtest-input/ftmo-1step-all-live-strategies-account-impact.md`. Aucun changement `src/` — recherche seulement.

## "Repart de zéro" au +10% ou au bust — simulation continue + 2 leviers de risque testés — 2026-09-12

Suite directe du test combiné ci-dessus. Esdras : *"Oui, teste cela [risque réduit / plafond de positions]. Ensuite, dès qu'on atteint le 10%, on nous donne soit le live, soit un autre challenge, donc on repart de zéro."* Deux changements dans le nouveau script (`scripts/runFtmoAllLiveStrategiesCycleAccountImpact.js`) :

1. **Reset réaliste** : au lieu de 7 simulations annuelles indépendantes (où un compte pouvait "buster" après avoir déjà passé le +10%, un artefact du test précédent), une seule simulation CONTINUE sur tout l'historique dispo (2018-2025 selon le symbole). Dès qu'un cycle (une instance de compte) atteint +10% (banqué, nouveau compte $10k immédiatement) OU -10% trailing (busté, on rachète un challenge, même chose), le solde repart à $10 000 et un nouveau cycle démarre. Toute position encore ouverte sur un autre symbole à ce moment est abandonnée (compte neuf = repart flat) — simplification assumée et documentée dans le rapport.
2. **5 scénarios** testant les deux leviers proposés dans le rapport précédent :

| Scénario | Cycles | Passes | Busts | Taux de bust | Jours moy. pour passer |
|---|---|---|---|---|---|
| Actuel (0.5%, aucun plafond) | 46 | 42 | 4 | **9%** | 63 |
| 0.4%, aucun plafond | 33 | 32 | 1 | 3% | 84 |
| 0.3%, aucun plafond | 25 | 25 | 0 | **0%** | 114 |
| 0.5%, max 2 positions simultanées | 42 | 39 | 3 | 7% | 68 |
| 0.5%, max 1 position (sérialisé) | 40 | 38 | 2 | 5% | 71 |

**Lecture** : avec le reset réaliste, le taux de bust actuel tombe à 9% (par cycle indépendant, pas par année civile comme avant — chaque compte a une vraie chance propre de réussir). Le levier le plus efficace est de loin la réduction du risque par trade : 0.3% élimine complètement le bust sur les 46→25 cycles testés (0%), au prix d'un passage ~1.8x plus lent (114j contre 63j). Le plafond de positions simultanées aide aussi (9%→5% avec cap=1) mais nettement moins que baisser le risque, et ralentit un peu moins (71j contre 63j). Les deux leviers peuvent en théorie se combiner (non testé ici).

**Rien tranché, rien changé dans `src/`** — comparaison présentée à Esdras pour qu'elle choisisse le compromis vitesse/risque.

**Fichiers** : `scripts/runFtmoAllLiveStrategiesCycleAccountImpact.js` (nouveau), `data/backtest-input/ftmo-1step-all-live-strategies-cycle-account-impact.md`.

## "-5% max risque par jour, est-on dans ça?" — vérification avant challenge-vs-live — 2026-09-12

Avant de trancher la question challenge-vs-live, Esdras : *"la plupart des challenges demandent -5% max risque par jour. Est-on dans cela?"* Mesure directe (`scripts/runDailyLossLimitAnalysis.js`), même simulation combinée déjà confirmée (0.5%/trade, aucun plafond, reset au +10%/bust), perte RÉALISÉE par jour calendaire UTC en % du solde de début de journée.

**Résultat : pire jour = -1.73% (2025-10-29), sur 1642 jours de trading avec au moins un trade clôturé. Zéro jour ≥ -2%, sur tout l'historique.** Largement sous le -5% typique des challenges, avec une bonne marge — logique, puisque le garde-fou interne `dailyLossLimitPct=2%` bloque déjà les nouvelles entrées dès que la perte réalisée du jour atteint 2%.

**Limite explicitement documentée** : ce chiffre ne couvre que le réalisé (trades clôturés), pas le flottant intra-jour sur une position encore ouverte — la plupart des prop firms (FTMO incluse) mesurent la perte journalière sur l'équité (solde + flottant), pas seulement le réalisé. C'est donc un plancher rassurant, pas une garantie contractuelle — mais la marge (1.73% vs 5%) est large.

**Fichiers** : `scripts/runDailyLossLimitAnalysis.js` (nouveau), `data/backtest-input/daily-loss-limit-analysis.md`. Aucun changement `src/`.

## Config séparée challenge vs live — 2026-09-12

Esdras : *"on garde 0.5%, aucun plafond, ensuite est-il possible d'avoir un codage pour le challenge et un codage pour le live? Car on ne peut pas avoir les mêmes codages pour les deux."* Clarifié via questions : seul le risque par trade doit différer (RR, fenêtres, garde-fous, sources actives restent identiques), et le switch se fait par variable d'environnement Render (même mécanisme que `RISK_PCT_PER_TRADE` existant), pas un bouton dashboard.

**Implémenté dans `src/config.js`** : nouvelle variable d'environnement `ACCOUNT_MODE` (`challenge` par défaut, ou `live`). Chaque mode a son propre risque par trade par défaut :
- `challenge` → **0.5%** (rapide : ~63 jours en moyenne pour passer, voir le test cycle du 2026-09-12) — un bust ne coûte qu'un rachat de challenge.
- `live` → **0.3%** (celui qui a donné **0% de bust** sur les 25 cycles testés dans la même simulation) — plus de cible à atteindre vite une fois financé, la priorité devient de protéger le compte réel.

`RISK_PCT_PER_TRADE`, quand explicitement réglé, continue de tout écraser (prend le dessus sur le défaut du mode) — comportement inchangé pour qui l'utilise déjà. `CONFIG.accountMode` exposé dans `/api/status` (nouveau champ, distinct de `store.mode` qui est le statut de connexion demo/live). Le dashboard n'a rien à changer : `settings-risk-current`/`settings-risk-input` lisent déjà `riskPctPerTrade` dynamiquement depuis `/api/status`, donc ils reflètent automatiquement le bon défaut selon le mode actif.

**Vérifié** : `ACCOUNT_MODE` absent/invalide → `challenge`/0.5% (comportement actuel inchangé, pas de régression) ; `ACCOUNT_MODE=live` → 0.3% ; `ACCOUNT_MODE=live` + `RISK_PCT_PER_TRADE` explicite → l'override gagne. `npm test` 386/389 (mêmes 3 flakes `keepAlive.test.js` connus) avant/après.

**Pas encore déployé en production** — sur `challenge/fundingpips-zero` seulement, en attendant la décision d'Esdras sur QUAND basculer `ACCOUNT_MODE=live` sur Render (au moment où le compte passe réellement en financé).

**Fichiers** : `src/config.js`, `src/server.js` (champ `accountMode` ajouté à `/api/status`).

## ACCOUNT_MODE=live déployé sur Render + cycles sur les 7 mois de forward-test réel — 2026-09-12

Esdras : *"Bascule sur render et dis moi combien de cycle de 10% j'aurais eu pendant les 7 mois que tu as les données là."*

**1) Déploiement production** : `challenge/fundingpips-zero` mergé dans `claude/lire-handoff-hxisa5` (branche réelle de production, confirmé via l'historique de commits) — 6 commits (tests US500/XAUUSD, simulation combinée, simulation cycle, vérification perte journalière, `ACCOUNT_MODE`), seuls `src/config.js` et `src/server.js` touchent du code, `npm test` 386/389 avant/après (mêmes flakes connus). Poussé, puis `ACCOUNT_MODE=live` réglé directement sur le service Render `ict-fvg-bot` (`srv-dafkaav40ujc73bm3cl0`) via l'API Render. Déploiement confirmé "live", et `/api/status` du service réel confirme `"accountMode":"live","riskPctPerTrade":0.3`. **Le bot tourne maintenant à 0.3% par trade**, pas 0.5%.

**2) Cycles de +10% sur les 7 mois de forward-test réel** (`scripts/runForwardTestAllLiveStrategiesCycleAnalysis.js`, sur `data/forward-test-2026/`, export cTrader réel 2026-02-05 → 2026-09-09) : même méthode reset-au-+10%/bust que le test combiné historique, mais **sans Judas Swing** (pas d'export EURUSD dans ce dossier forward-test — documenté, pas une omission silencieuse). Deux risques comparés (0.5% = ce qui tournait réellement pendant ces 7 mois, 0.3% = le nouveau défaut live) :

| Risque | Cycles | Passes | Busts | Jours moy. |
|---|---|---|---|---|
| 0.5% (réel sur ces 7 mois) | 2 | 2 | 0 | 65 |
| 0.3% (nouveau défaut live) | 1 | 1 | 0 | 109 |

**Résultat : 2 cycles complets à 0.5% sur les 7 mois, les deux gagnés, zéro bust.** Cohérent avec le test cycle historique complet (2018-2025, 9% de bust sur 46 cycles) — sur un échantillon de seulement 2 cycles ici, ne rien conclure de définitif sur le taux de bust, mais direction rassurante et cohérente.

**Fichiers** : `scripts/runForwardTestAllLiveStrategiesCycleAnalysis.js` (nouveau), `data/forward-test-2026/forward-test-all-live-strategies-cycle-analysis.md`.

## "Combien de cycle je dois anticiper par années?" — 2026-09-12

Calcul dérivé directement des 46 cycles de la simulation continue (2018-01-01 → 2025-11-30, ~7.91 ans) :

| Scénario | Cycles/an | Passes/an | Busts/an |
|---|---|---|---|
| 0.5% (challenge) | 5.8 | 5.3 | ~1 tous les 2 ans |
| 0.4% | 4.2 | 4.0 | ~1 tous les 8 ans |
| **0.3% (défaut live actuel)** | **3.2** | **3.2** | **0 sur tout l'historique testé** |

Recoupé avec le forward-test réel (7 mois, 2 cycles gagnés en 130 jours à 0.5%) : ~5.6 cycles/an extrapolé, cohérent avec le 5.8/an de l'historique complet — bon signe de robustesse, les deux mesures s'accordent.

**Fichiers** : ajout au verdict de `data/backtest-input/ftmo-1step-all-live-strategies-cycle-account-impact.md`, pas de nouveau script (calcul dérivé des résultats déjà produits).

## "Combien de comptes acheter pour $1,000-1,500$/mois?" — sizing du capital financé — 2026-09-12

Esdras : objectif final $1,000-1,500$/mois de revenu net. Calcul dérivé du rythme déjà établi (0.3% risque live, ~3.16 cycles de +10%/an, voir la section "rythme annuel" ci-dessus) : chaque tranche de $10 000 financée génère ~$263/mois de profit BRUT en moyenne (proportionnel à la taille, le risque étant toujours en % du solde). Avec le split confirmé (80%, standard) :

| Capital financé total | Net/mois (80% split) |
|---|---|
| $10 000 | $211 |
| $25 000 | $527 |
| $50 000 | $1 053 |
| **$60 000** | **$1 264** |
| $75 000 | $1 580 |
| $100 000 | $2 106 |

**Recommandation : viser ~$60 000 de capital financé total** (ex. un compte $50k + un compte $10k, ou toute combinaison équivalente avec les paliers standards $10k/$25k/$50k/$100k confirmés disponibles chez son prop firm, plusieurs comptes simultanés autorisés) — ça atterrit à $1 264/mois net, confortablement au milieu de la cible $1,000-1,500$.

Aucun changement code — pur calcul business dérivé des simulations déjà validées cette session (`ftmo-1step-all-live-strategies-cycle-account-impact.md`).

## Correction : cTrader est actif, pas Match-Trader — erreur trouvée et corrigée — 2026-09-12

Esdras : *"Tu n'es pas à jour ou quoi? On nous a déjà donné l'approbation."* J'avais affirmé que le courtier actif était Match-Trader, en me basant sur le commentaire en tête de `src/config.js` ("cTrader ABANDONED 2026-09-07") **sans vérifier les entrées plus récentes de HANDOFF.md qui corrigeaient déjà ce point** (section "Câblage live vérifié...", 2026-09-09) : Spotware a approuvé l'app cTrader le jour même de son "abandon", et cTrader est confirmé actif en production depuis (`[cTrader] connected and live for account 48587457`). Vérifié à nouveau maintenant : le `/api/status` du bot en prod montre `broker.name:"fpmarketssc"`, un champ rempli UNIQUEMENT par `cTraderDataSource.js` (`setBrokerInfo()`) — Match-Trader n'a aucun appel équivalent. Confirmé sans ambiguïté : **cTrader, pas Match-Trader.**

**Cause de l'erreur** : le commentaire en tête de `src/config.js` (bloc `broker`) était périmé depuis le 2026-09-09 — HANDOFF.md l'avait déjà flagué explicitement ("le commentaire de config.js est périmé") mais je ne l'avais pas relu avant de répondre.

**Corrigé** : le commentaire de `src/config.js` (bloc `broker` + `getConfiguredPlatform()`) réécrit pour refléter l'état réel (cTrader = plateforme active en prod, approuvée par Spotware ; Match-Trader = écrit, jamais utilisé en live, bloqué sur `brokerId`/`platformUrl` FundingPips). Changement commentaire seulement, aucun comportement modifié — `npm test` 386/389 inchangé (mêmes flakes connus). Poussé sur `challenge/fundingpips-zero` ET fast-forward directement sur `claude/lire-handoff-hxisa5` (branche production) puisque c'est une correction de documentation périmée sans impact fonctionnel, pas une décision produit.

**Correction aussi de ma réponse précédente sur le plan multi-comptes** : l'architecture "un déploiement = un compte" reste vraie (`pickAccountOrThrow()` de `cTraderDataSource.js` fonctionne exactement comme l'équivalent Match-Trader — `CTRADER_ACCOUNT_ID` épingle UN compte, l'état `store.js` est un singleton en mémoire) — donc le compte $50k nécessitera bien un second déploiement Render le moment venu, ce point de ma réponse reste correct malgré l'erreur cTrader/Match-Trader.

## Multi-compte : Phase 1 (store.js -> AccountRuntime), zéro changement de comportement — 2026-09-12

Esdras : *"Je veux pas que chaque compte que j'ai à mettre le robot dessus, j'ai à tout réécrire le robot, je veux que le robot soit capable d'accepter plusieurs comptes. Challenge, live, plusieurs prop firm en même temps. Genre une vraie industrie de trading."* Clarifié via questions : elle veut une VUE UNIFIÉE (pas juste "ajouter un compte sans coder", qui marchait déjà via `pickAccountOrThrow()` + un nouveau déploiement Render), à l'échelle de 2-5 comptes gérés par UN SEUL process/dashboard.

Plan complet approuvé (voir le fichier de plan de session) : `store.js` (singleton en mémoire partagé par tout le process) devient une classe `AccountRuntime` instanciable N fois, orchestrée par un `AccountRegistry`. Phasé pour ne jamais risquer le compte réel en cours de route — **cette entrée couvre uniquement la Phase 1 : refactor interne, comportement strictement identique, toujours UN SEUL compte.**

**Fait** :
- `src/store.js` → supprimé, remplacé par `src/accountRuntime.js` (classe `AccountRuntime` — même état/logique que l'ancien singleton, transposé en méthodes d'instance) + `src/accountRegistry.js` (nouveau — construit UN SEUL compte `id:'default'` à partir de `CONFIG`, exposant `getDefaultAccount()`/`getAccount(id)`/`listAccounts()` pour la Phase 2).
- `cTraderDataSource.js`, `matchTraderDataSource.js`, `mockDataSource.js`, `server.js` : leur import du singleton `store.js` remplacé par `const store = getDefaultAccount();` — alias local vers l'instance `AccountRuntime` unique, donc AUCUNE des ~40 références `store.X`/commentaires existants dans ces fichiers n'a dû changer, seuls les appels aux anciennes fonctions LIBRES (`pushSignalEvents`, `setBalance`, `setBrokerInfo`, `isAutoExecuteActive`, `tagVolatilityObservation`, `recordOrderOutcome`, `getActionableSignals`, `setAutoExecute`, `setRiskPctPerTrade`) sont devenus des appels de méthode (`store.pushSignalEvents(...)`, etc.), puisqu'elles vivent maintenant sur la classe.
- `test/store.test.js` → remplacé par `test/accountRuntime.test.js`, testant `AccountRuntime` directement (mêmes cas + 2 nouveaux : le constructeur exige `id`/`config`, et deux instances distinctes ne partagent jamais leur solde/guardrail/moteur/journal — le test d'isolation qui compte vraiment pour la suite du chantier).

**Vérifié** : `npm test` 391/391 (389 existants + 2 nouveaux, les 3 flakes `keepAlive.test.js` déjà résolus la session précédente restent résolus). Démarrage local en mode démo (`node src/server.js`, aucun credential broker configuré) confirmé identique : `/api/status` répond avec la même forme exacte qu'avant ce refactor.

**Pas encore fait (Phases 2-4, voir le plan)** : support de plusieurs comptes réels (`CONFIG.accounts`/`ACCOUNTS_JSON`), routes `/api/accounts/:id/...`, colonne `account_id` sur `bot_trade_events` (Supabase), sélecteur de compte + vue d'ensemble sur le dashboard. Rien de tout ça n'est déployé ni même codé — cette entrée documente uniquement le socle interne.

**Déployé où ?** Pas encore poussé sur `claude/lire-handoff-hxisa5` au moment d'écrire cette entrée — voir la suite de la session pour la décision de déploiement.

## Multi-compte : Phase 2 (vrai multi-compte + règles par prop firm) — 2026-09-12

Suite directe de la Phase 1 (`AccountRuntime`/`AccountRegistry`, comportement identique, un seul compte). Esdras a ensuite demandé, en cours de route : *"chaque prop firm aura leur propre risque, drawdown que je dois coder spécifiquement pour eux... FTMO, FundingPips, Goat Funded Trader et un autre... le robot devrait être spécifique pour chaque type de prop firme."* Sur la transition de phase (ex. +10% atteint) : *"le bot m'avertit, la prop firme me donne le compte #2, je l'ajoute sur le bot avec les nouvelles règles"* — donc PAS de bascule automatique de règles, juste une alerte, un nouveau compte à ajouter manuellement.

**Fichiers de règles par prop firm** (nouveau dossier `src/propFirms/`) : `ftmo.js`, `fundingPips.js`, `goatFundedTrader.js`, `index.js` (registre). Chiffres réutilisés depuis `data/backtest-input/prop-firm-1step-comparison.md` (déjà sourcé sur ftmo.com/help.goatfundedtrader.com début septembre 2026) plutôt qu'inventés :
- **FTMO 1-Step** : +10% cible, perte quotidienne 3%, perte totale 10% trailing fin de journée.
- **FTMO 2-Step** : +10% puis +5%, perte quotidienne 5%, perte totale 10% statique, 4 jours min/phase.
- **FundingPips 2-Step Standard** (déjà validé dans ce projet) : +8% puis +5%, perte quotidienne 5%, perte totale 10% statique, 3 jours min/phase.
- **FundingPips 1-Step Flex** : +12%, perte quotidienne 3%, perte totale 12% statique.
- **FundingPips Zero** : instant-funded, pas de cible, perte totale 5% trailing (verrouille au solde de départ), limite de risque ouvert total 1% (source moins fiable, accès réseau bloqué au moment de la recherche — voir le fichier).
- **GoatFundedTrader 1-Step** : +10%, perte quotidienne 3-4% selon date d'achat (3% pris par sécurité), perte totale 6% statique (la plus serrée), 3 jours *gagnants* min (≥0.5% net chacun).
- **4e prop firm** : emplacement laissé libre, Esdras donnera le nom — pas de profil inventé sans données réelles.

**`GuardrailEngine` étendu** (`src/engines/guardrailEngine.js`) avec le suivi OVERALL (pas seulement quotidien) : `maxDrawdownPct`/`maxDrawdownType` (`static`, `trailing-eod`, ou `trailing-locks-at-start-balance`) bloque VRAIMENT le trading si le solde touche le plancher réel de la prop firm (persistant, ne se réinitialise pas au changement de jour contrairement à la perte quotidienne) ; `targetPct` déclenche `targetReached`/`consumeTargetReachedEvent()` (edge-triggered, une seule fois) sans jamais bloquer le trading — juste de quoi alerter. Un type de drawdown non reconnu échoue OUVERT (ne bloque jamais sur une faute de frappe de config) plutôt que fermé. 8 nouveaux tests, tous verts.

**Vrai multi-compte** : `CONFIG.accounts` (nouveau, `src/config.js`) — variable d'env `ACCOUNTS_JSON` (tableau JSON, un objet par compte : `id`, `label`, `platform`, `accountMode`, `riskPctPerTrade`, `propFirmProgramId`, `phaseIndex`, `guardrails`, `broker`/`matchTrader`). **Absente → un seul compte `'default'` construit depuis les variables d'env actuelles, comportement identique à aujourd'hui** — rien à changer sur le déploiement Render tant qu'Esdras ne configure pas explicitement `ACCOUNTS_JSON`. `accountRegistry.js` construit un `AccountRuntime` par entrée, résout `propFirmProgramId`+`phaseIndex` en vrais `targetPct`/`maxDrawdownPct`/`maxDrawdownType`/`dailyLossLimitPct` injectés dans son `GuardrailEngine`.

**Bug trouvé et corrigé en cours de route** (indépendant du multi-compte, mais devenu nécessaire pour que le risque par compte ait un sens) : `cTraderDataSource.js`/`matchTraderDataSource.js` calculaient la taille de lot des ordres réels (`_handlePyramidOrderRequested`/`_handleAutoExecuteEntry`) avec `CONFIG.risk.riskPctPerTrade` — la valeur GLOBALE au démarrage — au lieu de `store.strategyEngine.riskPctPerTrade` — la valeur RÉELLE, modifiable depuis le dashboard (`POST /api/settings/risk`). Un changement de risque en direct ne se répercutait donc jamais sur la taille réelle des ordres envoyés au broker. Corrigé aux 4 emplacements (2 par fichier).

**`CTraderDataSource`/`MatchTraderDataSource`/`mockDataSource.js`** : acceptent maintenant `{account, brokerConfig, symbols}` au constructeur (credentials par compte, plus jamais `CONFIG.broker` partagé) — rétrocompatibles (défauts = comportement d'avant) pour les tests existants qui construisent sans argument. `mockDataSource.js` n'est plus un singleton module (`started`/`intervalHandle` uniques) : `startMockDataSource(account, opts)`/`stopMockDataSource(account)` trackent un intervalle PAR compte, plusieurs comptes démo peuvent tourner en parallèle.

**`server.js`** : boucle de démarrage sur `CONFIG.accounts` (une connexion par compte, séquentielle). Nouvelle route `GET /api/accounts` (vue d'ensemble : solde, mode, prop firm/phase, statut garde-fou de chaque compte). Chaque route existante dupliquée sous `/api/accounts/:accountId/...` (404 propre si id inconnu) EN PLUS des anciens chemins plats `/api/...` (qui continuent de servir le compte `'default'`, donc le dashboard actuel — pas encore mis à jour, Phase 3 — continue de fonctionner sans aucun changement). Caches (overlays, recent-performance) maintenant clés par compte pour ne jamais mélanger les données de deux comptes.

**Nouvelle alerte de cible atteinte** : quand le solde d'un compte franchit son `targetPct` (ex. +10% FTMO), une notification ntfy part automatiquement (`🎯 Cible atteinte sur <compte>...`) — une seule fois, le trading continue normalement. Pas de bascule automatique de règles (conforme à la demande d'Esdras).

**Vérifié** : `npm test` 410/410 (406 existants + 4 nouveaux tests d'isolation multi-compte, dont un qui fait tourner 2 vrais comptes démo en parallèle avec de vrais intervalles). Démarrage local testé dans 3 configurations : sans `ACCOUNTS_JSON` (comportement identique à avant), avec 2 comptes mock référençant `ftmo-1step`/`fundingpips-zero` (routes `/api/accounts/*` isolées, `/api/accounts` liste les deux, 404 propre sur un id inconnu), et confirmation que les anciens chemins `/api/status` etc. pointent toujours sur le premier compte.

**Pas encore fait (Phase 3, dashboard)** : sélecteur de compte + vue d'ensemble visuelle. Colonne `account_id` sur la table Supabase `bot_trade_events` (les comptes multiples logueraient leurs trades sans distinction dans la même table — pas un problème tant qu'un seul compte réel existe). Aucun changement de `public/index.html` dans cette phase.

**Déployé où ?** Cette Phase 2, comme la Phase 1, est un changement de comportement NUL pour le compte réel actuel (toujours `'default'`, toujours sans `propFirmProgramId`) — voir la suite de la session pour la décision de déploiement.

## Multi-compte : Phase 3 (dashboard — sélecteur de compte + vue d'ensemble) — 2026-09-12

Dernière phase du plan (voir les entrées Phase 1/Phase 2 juste au-dessus). `public/index.html` gérait jusqu'ici un seul compte codé en dur dans chaque appel `fetch('/api/...')`.

**Fait** :
- Nouveau helper JS `acctUrl(suffix)` — chaque `fetch`/`EventSource` du dashboard passe maintenant par `/api/accounts/${currentAccountId}${suffix}` au lieu d'un chemin `/api/...` fixe. Une seule variable (`currentAccountId`) contrôle TOUTES les cartes à la fois.
- **Sélecteur de compte** (`<select>` dans la barre du haut) + **carte "Vue d'ensemble — tous les comptes"** (solde, mode challenge/live, prop firm/programme, statut connecté, garde-fou OK/BLOQUÉ de chaque compte) — cliquer une carte de la vue d'ensemble bascule le dashboard entier sur ce compte, exactement comme le sélecteur.
- **Les deux restent invisibles (`hidden`) tant qu'un seul compte existe** — `renderAccountOverview()`/`initAccounts()` vérifient `accounts.length <= 1` avant d'afficher quoi que ce soit. Le dashboard d'aujourd'hui (un seul compte réel) est donc visuellement IDENTIQUE à avant cette phase.
- **`startDashboardForAccount(id)`** centralise le changement de compte : ferme proprement l'ancien flux SSE + les anciens `setInterval` (plus de fuite d'un compte qui continuerait à sonder en arrière-plan), relance tout (`refreshStatus`, `refreshSignals`, journal, performance, etc.) sur le nouveau compte. Le choix est mémorisé (`localStorage`, par navigateur) et restauré au rechargement de la page.

**Vérifié en navigateur réel (Playwright, pas juste en lisant le code)** :
- Mode 1 compte : sélecteur et vue d'ensemble bien masqués, bannière/garde-fou/risque s'affichent normalement, zéro erreur console — comportement identique à avant.
- Mode 2 comptes (`ACCOUNTS_JSON` avec un `ftmo-1step` et un `fundingpips-zero`) : sélecteur et vue d'ensemble bien visibles avec les bons libellés ("Compte B (live)"), bascule par le sélecteur ET par clic sur une carte de la vue d'ensemble toutes les deux fonctionnelles et synchronisées entre elles (le risque affiché passe bien de 0.50% à 0.30% en changeant de compte, reflétant le vrai risque de chaque compte), le choix survit à un rechargement de page, zéro erreur console dans les deux cas.

**Pas fait dans cette phase** (hors scope du plan initial, à voir si besoin plus tard) : colonne `account_id` sur la table Supabase `bot_trade_events` (les comptes multiples logueraient leurs trades sans distinction si plusieurs comptes réels se mettent à trader en même temps — pas un problème tant qu'un seul compte réel existe, ce qui est le cas aujourd'hui).

**Ceci clôt le plan multi-compte initial (Phases 1 à 3).** Le robot peut maintenant gérer plusieurs comptes/prop firms/phases en parallèle dans un seul déploiement, avec des règles de risque/drawdown propres à chaque prop firm (`src/propFirms/`), sans jamais avoir eu à toucher au comportement du compte réel actuel à aucune étape.

## "Tu as les règles des prop firm pour vrai? Tu as accès à internet?" — re-vérification en direct — 2026-09-12

Question directe et légitime d'Esdras après la Phase 2 : les règles des 3 prop firms codées dans `src/propFirms/` avaient été réutilisées telles quelles depuis `data/backtest-input/prop-firm-1step-comparison.md`, un document produit par une AUTRE session — je ne les avais pas vérifiées moi-même dans celle-ci. Confirmé avoir accès à internet (WebFetch/WebSearch), et vérifié en direct plutôt que de laisser un chiffre non confirmé par moi passer pour acquis.

**Résultat, en résumé : les chiffres tiennent, avec 2 petits ajouts** :
- **FTMO 1-Step** : confirmé mot pour mot sur la page officielle `ftmo.com/en/trading-objectives/` (fetch direct, pas un résumé tiers) — +10%, perte quotidienne 3%, perte totale 10% trailing fin de journée (ratchet sur le plus haut solde jamais atteint), règle "Best Day 50%". Split (90%) non trouvé sur cette page mais confirmé par plusieurs sources tierces indépendantes concordantes.
- **FTMO 2-Step** : confirmé mot pour mot sur la même page officielle — +10% puis +5%, perte quotidienne 5%, perte totale 10% STATIQUE, 4 jours min/phase. Split ajouté : **80%** (trouvé cette fois, sources tierces concordantes).
- **GoatFundedTrader 1-Step** : confirmé mot pour mot sur LEUR PROPRE article d'aide (`help.goatfundedtrader.com/en/articles/10630134-1-step-model`, fetch direct) — +10%, perte quotidienne 4%/3% selon date d'achat, **perte totale 6% statique** (confirmé, malgré une première recherche large qui avait fait remonter par erreur un chiffre de 10% — probablement une confusion avec une autre firme sur un site tiers ; la page officielle de la firme tranche en faveur du 6% déjà codé), 3 jours gagnants min à ≥0.5% net chacun.
- **FundingPips 2-Step Standard / 1-Step Flex** : accès direct à help.fundingpips.com bloqué (429/403, comme lors de la recherche originale), mais recoupé par deux recherches indépendantes distinctes, dont une qui a fait remonter les titres RÉELS des articles d'aide FundingPips ("1 Step Flex", "2 Step Standard") confirmant que ce sont de vrais noms de produits actuels — chiffres inchangés (+8%/+5% et +12%/12%).
- **FundingPips Zero** : chiffres de perte inchangés, mais découverte de 2 règles absentes du code jusqu'ici — interdiction de garder une position sur le week-end, et une règle de consistance de 15% sur chaque retrait. Ajoutées en documentation (non appliquées par le bot, comme les autres règles de consistance déjà notées).
- **Découverte non codée** : FundingPips propose aussi des programmes "2 Step Pro" et "2 Step Flex" (cibles 6%/6%, limites plus serrées) — pas ajoutés, à faire si Esdras les veut.

**Fichiers** : `src/propFirms/ftmo.js`, `fundingPips.js`, `goatFundedTrader.js` — commentaires de sourcing mis à jour avec la date/méthode de vérification, `profitSplit` de FTMO 2-Step rempli (0.8), règles week-end/consistance de FundingPips Zero ajoutées. Aucun changement de logique — mêmes chiffres qu'avant pour tout ce qui est déjà appliqué (garde-fous), juste des champs documentaires en plus/confirmés. `npm test` 410/410 inchangé.

## "Si on code la partie FundingPips, comment ça se comporterait?" — analyse préliminaire — 2026-09-12

Suite directe du verdict "non conforme tel quel" de la veille. Esdras a demandé une simulation réelle (pas juste une mesure) de l'effet de coder la fermeture forcée avant le week-end. Nouveau script `scripts/runFundingPipsZeroComplianceAnalysis.js` — contrairement à l'ancien `runFundingPipsZeroAccountImpact.js` (config datée : contact unique, fenêtres 10h-11h/7h-10h, sans NWOG/Judas Swing), celui-ci lit la config de PRODUCTION ACTUELLE (`src/config.js` directement : US100 multi-contact 8h-12h, US500 10h-11h, XAUUSD 8h-12h, Divergence, NWOG, Judas Swing) et **code réellement** la fermeture forcée avant le week-end (au lieu de juste la détecter) — un vrai changement de comportement simulé, testé à 3 niveaux de risque contre les vraies règles Zero.

**Résultat, taux de bust par niveau de risque (5% trailing verrouillé au solde de départ)** :

| Risque | Années bustées | Fermetures forcées week-end (7 ans) | Chevauchements NFP détectés (plancher) |
|---|---|---|---|
| 0.5%/trade | 2/7 (2020, 2023 — bust rapide, <20-70 trades, séries perdantes précoces) | 87 | 67 |
| 0.3%/trade | 1/7 (2023 seulement) | 110 | 91 |
| **0.25%/trade** | **0/7 — jamais busté** | 129 | 95 |

**Découverte importante en plus du bust** : la limite de risque ouvert total de Zero (1%, tous symboles confondus) est massivement dépassée à 0.5% et 0.3% — jusqu'à **2.00% (dépassé 1245 fois en une seule année)** à 0.5%, car jusqu'à 4 positions (US100+US500+XAUUSD+EURUSD) peuvent être ouvertes en même temps. **À 0.25%/trade, le risque ouvert max reste pile à 1.00% (4 × 0.25%)** — cohérent avec le fait que ce soit aussi le seul niveau qui ne buste jamais : 0.25% résout les DEUX problèmes en même temps, pas une coïncidence.

**Ce qui n'est PAS testé ici** : le filtre news. Seul un chevauchement avec le NFP (premier vendredi du mois, 8h-9h NY — le seul motif public fixe qui ne demande aucun calendrier externe) est compté, à titre de PLANCHER seulement (~95 sur 7 ans à 0.25%, soit ~13.6/an). CPI, FOMC, PPI et le reste ne sont pas comptés — l'exposition réelle à la règle news (rupture immédiate de compte sur Zero) est plus élevée que ce chiffre. Une vraie mise en conformité demanderait un calendrier économique réel (source externe à choisir), pas fabriqué de mémoire.

**Conclusion préliminaire** : coder la fermeture forcée avant le week-end est faisable et mesurable — à 0.25%/trade, le combo actuel au complet survit aux 7 années testées sous les règles de drawdown ET de risque ouvert de Zero. Le vrai chantier restant avant de pouvoir utiliser Zero en toute sécurité reste le filtre news (calendrier économique réel), pas encore commencé. **Rien codé dans `src/`** — script de recherche seulement, aucune décision de déploiement prise.

**Fichiers** : `scripts/runFundingPipsZeroComplianceAnalysis.js` (nouveau), `data/backtest-input/fundingpips-zero-compliance-analysis.md`. `npm test` : 410/410 (inchangé).

## Recherche d'une source de calendrier économique fiable — 2026-09-12

Esdras a demandé une vraie source pour le filtre news (nécessaire pour FundingPips Zero — voir section précédente). Recherche web réelle (pas de mémoire) :

- **Financial Modeling Prep (FMP)** — recommandation principale. API testée en direct (`financialmodelingprep.com/api/v3/economic_calendar`), confirmée fonctionnelle (répond une erreur de clé invalide, pas une erreur de endpoint mort). Gratuit : 250 requêtes/jour. Point clé : contrairement à Finnhub (dont l'historique est réservé aux clients payants "Enterprise"), FMP donne accès à l'historique jusqu'à 30 ans — utilisable à la fois pour refaire l'analyse de conformité avec les VRAIES dates passées (au lieu de l'approximation NFP seul) et pour le filtre en direct. **Nécessite qu'Esdras crée elle-même un compte gratuit** et fournisse la clé API — pas fait, en attente.
- **Sources officielles gratuites, sans API, en complément** : federalreserve.gov publie ses 8 dates de décision FOMC par an plus d'un an à l'avance (2026 confirmé : 27-28 jan, 17-18 mar, 28-29 avr, 16-17 juin, 28-29 juil, 15-16 sept, 27-28 oct, 8-9 déc, décision 14h ET) ; bls.gov publie son calendrier NFP/CPI à l'avance (NFP = 1er vendredi du mois, CPI = date variable annoncée par eux).
- **Écartés** : Finnhub (historique payant seulement), ForexFactory/Investing.com (aucune API officielle, scraping seulement), Trading Economics (tarification opaque, probablement payant).

**Deux options laissées à Esdras** : (1) rapide/gratuit sans inscription — coder juste FOMC (8 dates fixes) + NFP (déjà fait) + CPI (dates notées manuellement 1x/an depuis bls.gov) ; (2) plus complet — elle crée un compte FMP gratuit, donne la clé, couverture complète (PPI, retail sales, etc.). **Pas encore choisi, rien codé.**

## GoatFundedTrader "Instant Premium Model" — vérifié, MAIS nouvelle règle non modélisée découverte — 2026-09-12

Esdras : "je veux vraiment pas aller dans un challenge" — a demandé de vérifier spécifiquement le modèle "Instant Premium" de GoatFundedTrader (financé direct, sans évaluation), en particulier la règle de consistance. Vérifié directement sur `help.goatfundedtrader.com/en/articles/16013484-instant-premium-model` (fetch direct, primaire) :

- **Financement instant confirmé, aucune évaluation** — correspond à sa demande.
- **Aucune règle de consistance, confirmé explicitement** ("Profits need not be evenly distributed across trading days").
- Perte quotidienne 3%, perte totale 6% trailing (sur l'équité, ne redescend jamais), split 80%, retrait tous les 10 jours, 5 jours de trading min pour retrait (non consécutifs, ≥0.5% chacun).

**⚠️ NOUVEAU, jamais rencontré ni modélisé avant : une "Floating Loss Rule" — perte NON RÉALISÉE de -1.5% du solde à N'IMPORTE QUEL MOMENT ferme le compte définitivement** (descend à -1% pour les comptes achetés après le 2026-09-02). C'est fondamentalement différent de toutes les règles modélisées jusqu'ici (FTMO/FundingPips ne regardent que le solde RÉALISÉ à la clôture d'un trade) — celle-ci regarde le P&L flottant en temps réel sur les positions ENCORE OUVERTES, avant même qu'un stop soit touché. **Aucun script de ce projet ne mesure ça** (tous mesurent le résultat final d'un trade clôturé, jamais son creux intermédiaire pendant qu'il est ouvert) — avec jusqu'à 4 positions ouvertes en même temps, le flottant cumulé pourrait dépasser -1.5% avant qu'un seul stop ne soit réellement touché. **Verdict "jouable" NON DONNÉ** — nécessite une nouvelle analyse (suivi intra-bougie du P&L flottant agrégé, pas encore construite) avant de pouvoir répondre. Attention aussi : GoatFundedTrader a un 2e modèle instant différent ("Instant Funding GOAT Model", `articles/10644691`) qui LUI a une règle de consistance à 15% — ne pas confondre les deux.

**Rien codé, rien décidé** — recherche/vérification seulement.

## Reprise de session — état complet au 2026-09-12 (fin de session)

Esdras change de session Claude. Résumé pour une reprise à froid, dans l'ordre des priorités :

**1. Ce qui est fait et déployé en production (`claude/lire-handoff-hxisa5`, à jour, `npm test` 410/410)** :
- Refactor multi-compte complet (Phases 1-3) : `AccountRuntime`/`AccountRegistry` remplacent l'ancien singleton `store.js`, `CONFIG.accounts`/`ACCOUNTS_JSON` pour ajouter un compte sans toucher au code, routes `/api/accounts/:id/...`, dashboard avec sélecteur de compte + vue d'ensemble (invisibles tant qu'un seul compte existe — donc AUCUN changement visuel aujourd'hui). Le compte réel actuel (`'default'`, cTrader, `ACCOUNT_MODE=live`, 0.3% de risque) tourne exactement comme avant tout ce chantier.
- 4 profils de prop firm codés et VÉRIFIÉS contre des sources primaires (`src/propFirms/` : `ftmo.js`, `fundingPips.js`, `goatFundedTrader.js`, `index.js`) : FTMO 1-Step/2-Step, FundingPips 2-Step Standard/1-Step Flex/Zero, GoatFundedTrader 1-Step. **Un 5e profil (GoatFundedTrader Instant Premium) reste à ajouter formellement** — règles déjà vérifiées ci-dessus, juste pas encore mises en fichier `src/propFirms/`.
- Bug réel trouvé et corrigé : le risque % réel (modifiable en direct) n'atteignait jamais la taille des vrais ordres, qui utilisaient l'ancienne valeur figée au démarrage.
- `GuardrailEngine` sait maintenant bloquer sur un drawdown OVERALL (pas juste quotidien) et alerter sur une cible de profit atteinte (jamais de bascule automatique de règles — Esdras ajoute le compte suivant elle-même).

**2. Décision business en cours (pas encore tranchée)** : quelle prop firm/challenge utiliser pour viser $1,000+/mois avec un budget d'achat de $199-200. Comparatif complet fait :
- **FTMO 1-Step $25k ($199, dans son budget)** → ~$592/mois net en moyenne (90% split confirmé). Le $50k ($319) dépasse son budget.
- **FundingPips Zero** (financement instant, pas de challenge) → NON conforme tel quel (2 règles à rupture immédiate : week-end tenu = fermeture définitive, trading près d'une news = fermeture définitive ; aucune des deux n'est codée dans le bot). Analyse préliminaire faite : coder la fermeture forcée avant le week-end + réduire le risque à 0.25%/trade élimine le bust sur les 7 années testées ET respecte la limite de risque ouvert (1%) — mais le filtre news reste à construire (voir point 3).
- **GoatFundedTrader Instant Premium** (financement instant, PAS de règle de consistance — ce qu'Esdras cherchait) → vérifié conforme sur ce point précis, MAIS une nouvelle règle jamais modélisée (perte flottante -1.5%/-1% à tout instant = fermeture) empêche de donner un verdict "jouable" pour l'instant — analyse à construire.
- **Elle a explicitement dit "je veux vraiment pas aller dans un challenge"** — signal fort vers Zero ou GoatFundedTrader Instant Premium plutôt que FTMO/FundingPips classiques, MALGRÉ le travail de compliance restant sur les deux.

**3. Travaux techniques identifiés, non commencés** :
- Filtre news réel : Esdras doit créer un compte gratuit Financial Modeling Prep (recommandé, vérifié fonctionnel, historique 30 ans) et donner la clé API — ou accepter la version gratuite plus limitée (FOMC+NFP+CPI codés à la main depuis des sources officielles). Aucun choix fait.
- Fermeture forcée avant le week-end : simulée avec succès (voir `scripts/runFundingPipsZeroComplianceAnalysis.js`), jamais codée dans `src/` (production).
- Analyse du P&L flottant intra-bougie (nécessaire pour vérifier GoatFundedTrader Instant Premium) : pas commencée, demande un nouveau type de suivi (aucun script existant ne mesure le creux intermédiaire d'un trade encore ouvert, seulement son résultat final).
- Profil `src/propFirms/goatFundedTraderInstantPremium.js` (ou équivalent) : pas créé.

**Prochaine étape naturelle recommandée** : construire l'analyse du P&L flottant pour GoatFundedTrader Instant Premium (probablement la voie la plus rapide vers "pas de challenge, jouable"), en parallèle de la décision sur la source de calendrier news.

## Analyse de perte flottante GoatFundedTrader — construite, résultat inattendu — 2026-09-12

Esdras : *"Construis l'analyse de perte flottante pour GoatFundedTrader."* Nouveau script (`scripts/runGoatFundedTraderFloatingLossAnalysis.js`) — la première capacité de ce projet à suivre le **P&L flottant intra-trade** (pas seulement le résultat final d'un trade clôturé) : à chaque bougie, calcule la pire excursion (même convention que les vérifications stop/target existantes) pour chaque position ouverte, sommée sur les 4 symboles simultanément (US100/US500/XAUUSD/EURUSD), et vérifie deux règles GoatFundedTrader Instant Premium en continu :
1. **Perte flottante** : -1% (comptes achetés depuis le 2026-09-02, donc celle qui s'applique à un achat aujourd'hui) ferme le compte définitivement, à tout moment.
2. **Perte totale 6%**, trailing sur l'ÉQUITÉ en temps réel (pas juste le solde réalisé) — donc a aussi besoin du même suivi flottant.

**Profil formalisé** : `GOATFUNDEDTRADER_INSTANT_PREMIUM` ajouté à `src/propFirms/goatFundedTrader.js` + enregistré dans `index.js` (nouveau type `maxDrawdownType: 'trailing-realtime-equity-never-resets'`, pas encore reconnu par `GuardrailEngine` — fail-open documenté, pas encore branché en live). 2 nouveaux tests dans `test/propFirms.test.js`.

**Résultat, tous risques confondus (7 ans, 2019-2025)** :

| Risque | Années bustées | Dont perte flottante | Dont équité 6% |
|---|---|---|---|
| 0.5% | 7/7 | 0 | 7 |
| 0.3% (risque live actuel) | 3/7 | 0 | 3 |
| 0.25% | 2/7 | 0 | 2 |
| **0.15%** | **0/7** | 0 | 0 |
| 0.1% | 0/7 | 0 | 0 |
| 0.05% | 0/7 | 0 | 0 |

**Résultat inattendu** : sur 12 busts trouvés au total, **0 viennent de la règle de perte flottante** (jamais dépassée : maximum 0.92% atteint à 0.5%/trade, sous le seuil de 1%) — **les 12 viennent de la règle de perte totale 6% équité**, bien plus stricte en pratique que son chiffre nominal ne le suggère, parce qu'elle suit l'équité en temps réel (chaque pic flottant intra-trade compte comme un nouveau sommet, contrairement au FTMO 10% qui ne suit que le solde réalisé à la clôture). **0.15%/trade est le risque le plus élevé qui évite tout bust sur les 7 ans testés.**

**Hypothèse de modélisation documentée** : perte flottante = P&L flottant NET du compte (un gain sur un symbole peut compenser une perte sur un autre), pas la pire position seule — si GoatFundedTrader mesure position par position, leur vraie règle serait encore plus stricte.

**Non testé** : semaine/news de l'Instant Premium (conséquence "profit annulé/plafonné", pas un bust — hors scope). Rien codé en production au-delà du profil `propFirms/` (documentaire).

**Fichiers** : `scripts/runGoatFundedTraderFloatingLossAnalysis.js` (nouveau), `data/backtest-input/goatfundedtrader-instant-premium-floating-loss-analysis.md`, `src/propFirms/goatFundedTrader.js`, `src/propFirms/index.js`, `test/propFirms.test.js`. `npm test` : 411/411.

## GoatFundedTrader Instant HERO — un programme différent, la règle de consistance mord souvent — 2026-09-12

Esdras, Instant Premium jugé trop cher : *"teste le Instant HERO model, il a beaucoup de règles, surtout le 15% consistency."* Vérifié en direct via `help.goatfundedtrader.com/en/articles/16097387-instant-hero-model` (fetch primaire + recherche croisée) : **Instant HERO est un programme DIFFÉRENT d'Instant Premium**, pas le même renommé — perte totale plus serrée (5% au lieu de 6%), même règle de perte flottante (-1%, fermeture instantanée), mais AVEC une vraie règle de consistance 15% qu'Instant Premium n'a pas, et un meilleur split (90% contre 80%). Formalisé : `GOATFUNDEDTRADER_INSTANT_HERO` dans `src/propFirms/goatFundedTrader.js` + `index.js`, 1 nouveau test.

**Nouveau script** `scripts/runGoatFundedTraderInstantHeroAnalysis.js` — même moteur de suivi flottant qu'Instant Premium, PLUS un nouveau mécanisme : vérification de la règle de consistance 15% sur une fenêtre glissante de 14 jours calendaires (hypothèse de modélisation documentée, la source ne précise pas la fenêtre exacte).

**Résultat, tous risques (7 ans)** :

| Risque | Années bustées | Pire perte flottante | Violations consistance 15% |
|---|---|---|---|
| 0.5% | 7/7 | 0.92% | 188/280 fenêtres |
| 0.3% (risque live actuel) | 4/7 | 0.57% | 774/1103 |
| **0.15%** | **0/7** | 0.28% | 1068/1535 (70%) |
| 0.05% | 0/7 | 0.09% | 1070/1535 (70%) |

**Même conclusion qu'Instant Premium sur le bust** : la règle de perte flottante ne se déclenche JAMAIS (jamais >0.92%, sous le seuil de 1%) — c'est encore la règle d'équité (5% ici, encore plus serrée que le 6% d'Instant Premium) qui casse le compte. **0.15%/trade reste le risque maximal sans aucun bust.**

**Sur la règle de consistance, spécifiquement demandée** : **~70% des fenêtres de 14 jours seraient en violation**, peu importe le risque testé — un retrait serait bloqué la plupart du temps tant que le jour le plus profitable dépasse 15% du profit net de la fenêtre. Ne casse jamais le compte (juste retarde un retrait), donc moins grave que le bust, mais un vrai frein pratique aux retraits réguliers avec ce système (rythme de trades concentré, gros gagnants rares qui dominent le profit net d'une fenêtre). Note technique : le ratio peut dépasser 100% quand les autres jours de la fenêtre sont globalement perdants (le profit net s'érode, le meilleur jour en représente alors largement plus de 100%) — un artefact réel et connu de ce type de règle, documenté dans le rapport, pas un bug.

**Rappel** : le taux de bust de la règle d'équité reste une estimation conservatrice (la source dit qu'elle "reset après chaque paiement", non modélisé). Rien codé en production au-delà des profils `propFirms/` documentaires.

**Fichiers** : `scripts/runGoatFundedTraderInstantHeroAnalysis.js` (nouveau), `data/backtest-input/goatfundedtrader-instant-hero-analysis.md`, `src/propFirms/goatFundedTrader.js`, `src/propFirms/index.js`, `test/propFirms.test.js`. `npm test` : 412/412.

## "Je veux toucher mon premier 500$ le 1er décembre" — probabilité empirique du pipeline complet — 2026-09-12

Esdras, après avoir écarté GoatFundedTrader (trop contraignant) : *"donne-moi une idée de quel plan choisir avec quel type de compte choisir"* pour toucher $500 de forex/futures d'ici le 1er décembre 2026 (80 jours à partir d'aujourd'hui). Plutôt qu'une estimation à la main, nouveau script (`scripts/runFtmo25kFirstPayoutByDateAnalysis.js`) qui simule le pipeline COMPLET — achat challenge FTMO 1-Step $25k → passage (rachat immédiat à chaque bust, FTMO n'a ni limite de temps ni pénalité) → compte financé $25k live → profit réel accumulé → premier retrait éligible 14 jours calendaires après le premier trade live (**règle FTMO sourcée en direct aujourd'hui**, via `tradersunion.com`/`bestpropfirmguide.com` — pas dans les sources déjà codées ce mois-ci) + ~4 jours de traitement — depuis **98 points de départ historiques différents** (tous les 30 jours, 2018-2025), pour une vraie distribution empirique plutôt qu'une seule estimation.

**Architecture technique notable** : une seule passe sur tout l'historique (moteurs FVG construits une fois, comme toujours), mais 98 "tentatives" (comptes simulés indépendants) tournent en PARALLÈLE sur le même flux de signaux partagé — chacune avec son propre solde/GuardrailEngine/positions, économique en calcul (5 secondes pour les 98 scénarios).

**Résultat** : médiane **92 jours**, moyenne 129 jours (fortement tirée par quelques points de départ lents), le plus rapide 27 jours. **Seulement ~41% des points de départ testés atteignent $500 net en main en 80 jours ou moins.** Le 1er décembre est un objectif **tendu, pas garanti** — possible dans un scénario favorable, mais pas le cas moyen. Le facteur dominant est presque toujours la vitesse de passage du CHALLENGE (très variable), pas la phase live une fois financé (plus stable, 14 jours + accumulation).

**Recommandation donnée** : FTMO 1-Step $25k (déjà dans son budget, meilleure économie déjà établie), acheter AUJOURD'HUI, racheter immédiatement en cas de bust (config `ACCOUNT_MODE=challenge` déjà en place), demander le premier retrait dès l'éligibilité même si <$500 (plusieurs petits retraits comptent autant qu'un gros), et accepter honnêtement que la date n'est pas garantie — un objectif de repli (mi-décembre) réduit la pression sans changer la stratégie.

**Hypothèses de modélisation documentées** : risque 0.5%/0.3% (défauts déjà codés) ; la limite de perte totale FTMO (10% trailing-eod) supposée identique une fois financé (non confirmée séparément) ; un bust en live repart sur un nouveau challenge sans réinitialiser le compteur de jours ; split 90% appliqué au profit courant au-dessus du solde financé de départ.

**Rien codé dans `src/`** — recherche/planification seulement.

**Fichiers** : `scripts/runFtmo25kFirstPayoutByDateAnalysis.js` (nouveau), `data/backtest-input/ftmo-25k-first-payout-by-date-analysis.md`. `npm test` : 412/412 (inchangé).

## "Et si on compte début janvier?" — comparaison ajoutée à la même analyse — 2026-09-12

Esdras, suite directe : *"et si on compte début janvier alors?"* Même simulation (98 points de départ, aucun changement de méthode), ajout d'un deuxième seuil de comparaison (début janvier, 5 jan. 2027 = 115 jours à partir d'aujourd'hui, contre 80 jours pour le 1er décembre) dans `scripts/runFtmo25kFirstPayoutByDateAnalysis.js`.

**Résultat : début janvier fait clairement mieux — ~67% des points de départ testés y arrivent, contre ~41% pour le 1er décembre.** Ça repasse au-dessus de 50% : début janvier devient l'issue la PLUS probable plutôt que l'exception, alors que le 1er décembre restait tendu. Les 35 jours de marge en plus (80→115) profitent surtout à absorber un challenge plus lent que la moyenne à passer — la phase live une fois financé reste comparativement stable et prévisible.

**Fichiers** : `scripts/runFtmo25kFirstPayoutByDateAnalysis.js` (mis à jour, pas nouveau), `data/backtest-input/ftmo-25k-first-payout-by-date-analysis.md`. `npm test` : 412/412 (inchangé).

## "Pourquoi t'aimes autant le FTMO?" → test empirique FundingPips 1-Step Flex — 2026-09-12

Esdras a demandé une justification honnête de pourquoi FTMO ressortait toujours en tête, puis : *"teste FundingPips 1-Step Flex."* Explication donnée (la mécanique du drawdown compte plus que le % nominal — trailing fin-de-journée de FTMO vs. équité temps réel de GoatFundedTrader, qui a été la vraie cause de ses busts) puis vérification empirique directe avec la même rigueur que FTMO.

**Recherche de règles** (`src/propFirms/fundingPips.js` mis à jour) : accès direct à `fundingpips.com`/`help.fundingpips.com` bloqué (429 puis 403, deux fois) — infos reconstruites via recherche web. Confirmé : split **85%** (était `null`/non vérifié avant), premier retrait dès **1% de profit** + cycle **bi-hebdomadaire** + ~3 jours de traitement. **Règle ambiguë découverte et documentée explicitement** : une perte flottante par "idée de trade" (même instrument+sens, ou ré-entrée <10min après une perte) — une source dit **3%(<$50k)/2%(≥$50k) = rupture immédiate**, une autre dit **1% = avertissement, 4 cumulés (jamais remis à zéro) = rupture, le 2e coupe le split en deux ("Striking System")**. Non réconcilié (accès bloqué) — modélisé avec la lecture STRICTE (3%) comme vrai bust, la lecture souple (1%) trackée en info seulement.

**Nouveau script** `scripts/runFundingPips1StepFlexFirstPayoutByDateAnalysis.js` — méthode IDENTIQUE au script FTMO (98 points de départ historiques, même pipeline challenge→live→retrait, même cible $500), mais avec les vraies règles FundingPips (cible +12%, perte totale 12% **statique** — jamais de trailing, contrairement à FTMO), pour une comparaison directe côte à côte.

**Résultat : FTMO garde l'avantage, malgré le plancher statique plus généreux en théorie** :

| | FTMO 1-Step $25k | FundingPips 1-Step Flex $25k |
|---|---|---|
| % atteint $500 net d'ici le 1er décembre | 41% | 32% |
| % atteint $500 net d'ici début janvier | 67% | 57% |
| Médiane (jours) | 92 | 102 |

La cible plus haute (+12% vs +10%) et le split plus faible (85% vs 90%) pèsent plus lourd que l'avantage du plancher statique. **Bonus rassurant** : avec la config actuelle (risque 0.5%/0.3%, stops ~1R), la règle de perte flottante par idée de trade ne s'est JAMAIS déclenchée sur les 98 tentatives testées — ni sous la lecture stricte (3%) ni sous la lecture souple (1%, zéro avertissement cumulé) — cohérent avec le raisonnement que le stop d'une position individuelle plafonne déjà sa perte flottante bien en dessous de ces seuils.

**Rien codé dans `src/`** au-delà du profil `FUNDINGPIPS_1STEP_FLEX` mis à jour (documentaire).

**Fichiers** : `scripts/runFundingPips1StepFlexFirstPayoutByDateAnalysis.js` (nouveau), `data/backtest-input/fundingpips-1step-flex-first-payout-by-date-analysis.md`, `src/propFirms/fundingPips.js` (mis à jour : split confirmé, règles de paiement, règle floating ambiguë documentée). `npm test` : 412/412 (inchangé).

## "Je ne dois rien toucher jusqu'à $500?" — test empirique des retraits réguliers — 2026-09-12

Esdras : *"donc après avoir passé le challenge 1 step FTMO, je ne dois rien toucher dans le profit jusqu'à ce qu'il arrive à 500$?"* Clarifié : non, ce n'était qu'une hypothèse de modélisation pour comparer proprement les firmes — mon conseil réel était de retirer dès l'éligibilité. Puis : *"oui, fais-le [le test]."*

**Nouveau script** `scripts/runFtmo25kCumulativeWithdrawalByDateAnalysis.js` — variante directe du script FTMO $500-en-un-coup : au lieu d'attendre un seul retrait de $500, retire TOUT le profit disponible à chaque cycle de 14 jours (dès le premier trade live), suit le total CUMULÉ des retraits, regarde quand ce total franchit $500. Nouvelle hypothèse documentée (la vraie inconnue) : un retrait est modélisé comme "verrouillant" le plancher trailing au nouveau solde — mécanisme FTMO exact non confirmé, à vérifier avant un vrai retrait.

**Résultat, comparé côte à côte** :

| Stratégie | % d'ici 1er déc. | % d'ici début jan. | Médiane |
|---|---|---|---|
| Un seul retrait de $500 | 41% | 67% | 92j |
| **Retraits réguliers, cumulés** | **31%** | **59%** | **108j** |

**Résultat contre-intuitif mais logique** : retirer tôt et souvent est légèrement PLUS LENT pour accumuler $500 au total (~16 jours de plus en médiane). Pas un problème du plan — effet attendu du capital retiré qui ne compose plus (le risque par trade est toujours % du solde COURANT, donc chaque cycle après un retrait repart à "vitesse de croisière" au lieu de profiter d'un solde plus gros). Retirer tôt reste plus SÛR (argent hors de portée d'une mauvaise série) — juste marginalement plus lent pour un total cumulé donné. Vrai compromis sécurité/vitesse, pas gratuit dans un sens ni l'autre — présenté à Esdras sans trancher à sa place.

**Rien codé dans `src/`** — recherche seulement.

**Fichiers** : `scripts/runFtmo25kCumulativeWithdrawalByDateAnalysis.js` (nouveau), `data/backtest-input/ftmo-25k-cumulative-withdrawal-by-date-analysis.md`. `npm test` : 412/412 (inchangé).

## "Peux-tu atteindre le 5% du free trial FTMO en 14 jours?" — vérifié en direct puis testé — 2026-09-12

Esdras : *"j'ai une idée. Peux-tu atteindre le 5% du free trial de FTMO dans 14 jours?"* Vérifié en direct (help.ftmo.com/FAQ) avant de simuler quoi que ce soit : le Free Trial FTMO est un vrai compte démo GRATUIT, durée fixe 14 jours (relançable à volonté, aucune limite), cible réduite de moitié (10%→5%) par rapport au vrai challenge, mêmes règles de perte sinon. **Important, confirmé par FTMO lui-même : le passer ne donne PAS de compte financé ni d'avantage garanti** ("do not guarantee automatic eligibility", "not as a qualification step") — donc ce n'est pas un raccourci financier, juste une vraie question testable.

**Nouveau script** `scripts/runFtmoFreeTrial5PctIn14DaysAnalysis.js` — architecture allégée (fenêtre unique fixe de 14 jours, pas de chaîne challenge→live comme les autres scripts), 416 fenêtres testées (tous les 7 jours, 2018-2025), risque 0.5%.

**Résultat** : **~26% des fenêtres de 14 jours atteignent +5%** ; **0% bustent** (jamais touché -10% trailing en seulement 14 jours) ; 74% expirent sans passer ni buster (pas assez de temps, pas un échec réel). Parmi celles qui passent, le temps médian est de 8.7 jours. Comparaison : le même système au même risque met ~63 jours en moyenne pour +10% (cible double) — la fenêtre courte de 14 jours ne laisse pas à la moyenne le temps de jouer, d'où un taux de réussite plus bas que ce qu'on attendrait naïvement en divisant juste le temps par deux.

**Conclusion** : le Free Trial est utile pour observer le système tourner sans risque, mais ni un raccourci financier ni une garantie de réussite rapide. Rien codé dans `src/` — recherche seulement.

**Fichiers** : `scripts/runFtmoFreeTrial5PctIn14DaysAnalysis.js` (nouveau), `data/backtest-input/ftmo-free-trial-5pct-in-14days-analysis.md`. `npm test` : 412/412 (inchangé).

## Correction : le prix "$199" pour FTMO 1-Step $25k était faux — 2026-09-12

Esdras : *"quel est le prix en dollars pour ce compte FTMO alors?"* En vérifiant, découverte d'une erreur dans une entrée précédente de ce fichier (section "Décision business en cours", plus haut) : **"$199" ne vient PAS du vrai prix FTMO** — c'est le prix d'un service tiers sans rapport ("Challengepassed", un abonnement annuel qui aide à passer des challenges), confondu par erreur avec le prix réel de FTMO lors d'une recherche antérieure.

**Le vrai prix, selon plusieurs sources indépendantes qui NE s'accordent PAS entre elles** (probablement promotions actives/taux de change EUR-USD qui varient) : entre **~$205 (€189)** et **~$265 (€250)** pour le challenge 1-Step $25k. Le tableau de prix officiel de FTMO (`ftmo.com`) est rendu en JavaScript côté client — impossible à extraire de façon fiable avec les outils de récupération web de cette session (WebFetch ne voit que le HTML statique, pas le JS exécuté). **Frais remboursés une fois financé** (confirmé par plusieurs sources) — donc coût réel net après le premier financement ≈ $0, pas un vrai coût perdu.

**Recommandation donnée à Esdras** : vérifier le prix exact directement sur `ftmo.com` au moment de l'achat (le prix affiché en direct, avec promo éventuelle active, est plus fiable que n'importe quel chiffre cité ici). Toutes les analyses de cette session (probabilités de calendrier, comparaisons FTMO/FundingPips) restent valides — le prix du challenge n'entre dans AUCUN calcul numérique de ces scripts, seulement dans la discussion de budget en texte.

## Dashboard : onglets par prop firm (au lieu d'une liste plate) — 2026-09-12

Esdras : *"je croyais qu'il y allait avoir un onglet pour FTMO qui contiendrait les comptes ouverts et toutes les infos du compte. Mais ce n'est pas comme ça que tu l'as dessiné."* Le multi-compte (Phase 3, session précédente) avait construit un sélecteur + une vue d'ensemble à plat (tous les comptes mélangés, peu importe la firme) — pas ce qu'elle attendait. Clarifié via question : elle veut un **onglet distinct par prop firm** (nouveau travail, pas juste brancher le sélecteur existant).

**Fait** :
- `src/server.js` (`GET /api/accounts`) résout maintenant `firm`/`programLabel` côté serveur depuis `propFirmProgramId` (via `getPropFirmProgram()`) — le client n'a plus besoin de sa propre copie des règles.
- `public/index.html` : la carte "Vue d'ensemble" a maintenant une **rangée d'onglets par firme** (`#firm-tabs-row`) au-dessus de la grille de comptes — un onglet par firme distincte présente (ex. "FTMO (2)", "GoatFundedTrader (1)"), plus un onglet "Autres" pour les comptes sans `propFirmProgramId` (ex. le compte démo par défaut). Cliquer un onglet filtre la grille sur cette firme seulement ; cliquer une carte de compte bascule le dashboard entier dessus, comme avant. Le sélecteur `<select>` existant reste en place (accès rapide, toutes firmes confondues) et reste synchronisé avec l'onglet actif.
- **Toujours masqué tant qu'un seul compte existe** — même invariant que la Phase 3, aucun changement visuel pour la config actuelle (un seul compte, sans prop firm).

**Vérifié en navigateur réel (Playwright)** : avec 4 comptes simulés (1 sans firme, 2 FTMO, 1 GoatFundedTrader) — 3 onglets corrects ("Autres (1)", "FTMO (2)", "GoatFundedTrader (1)"), filtrage correct par onglet, clic sur une carte FTMO bascule bien le sélecteur sur ce compte, zéro erreur console. Avec 1 seul compte (config actuelle) — carte ET sélecteur toujours masqués, zéro erreur console, comportement identique à avant.

**Toujours en attente** : le vrai compte FTMO 1-Step $25k d'Esdras — elle doit d'abord l'acheter sur ftmo.com (action réelle, hors de portée du bot) et obtenir ses identifiants cTrader ; une fois reçus, une entrée `ACCOUNTS_JSON` avec `propFirmProgramId: 'ftmo-1step'` sera ajoutée pour le rendre réellement live.

**Rien déployé en production** au moment d'écrire cette entrée — sur `challenge/fundingpips-zero` seulement, en attendant la décision de déploiement.

**Fichiers** : `src/server.js`, `public/index.html`. `npm test` : 412/412 (inchangé, aucun test dédié au dashboard n'existe dans ce projet — vérifié manuellement via Playwright comme convention établie).

## "2 comptes FTMO différents (challenge + live) dans le même onglet?" — vérifié et codé — 2026-09-12

Esdras : *"comment veux-tu gérer ça avec le compte live? Est-ce que 2 comptes différents de FTMO peuvent être utilisés dans l'onglet FTMO, car il y a un compte challenge avec ses règles et le live avec ses propres règles?"*

**Réponse architecture, déjà vraie avant même ce changement** : oui — le regroupement par onglet se fait par `firm` (résolu depuis `propFirmProgramId`), pas par programme précis. Deux comptes distincts (un challenge, un financé) avec deux `propFirmProgramId` différents mais le même `firm: 'FTMO'` apparaissent automatiquement dans le même onglet "FTMO", chacun avec ses propres règles appliquées indépendamment.

**Ce qui manquait** : un vrai profil pour le compte FINANCÉ (post-challenge) — seul `FTMO_1STEP` (règles du challenge) existait. Vérifié en direct sur `ftmo.com/en/trading-objectives/` (fetch primaire, en comparant explicitement Challenge vs. compte financé) : pour le 1-Step, **les règles de perte du compte financé sont IDENTIQUES au challenge** (3% quotidien, 10% trailing fin de journée) — la SEULE différence est la disparition de la cible de profit ("There is no Profit Target on the subsequent FTMO Account (1-Step)"). Nouveau profil `FTMO_1STEP_FUNDED` ajouté à `src/propFirms/ftmo.js` (+ enregistré dans `index.js`, 1 nouveau test) — mêmes chiffres que `FTMO_1STEP`, `targetPct: null`.

**Bonus découvert sur la même page** : le plancher de 10% "reset[s] when rewards withdrawn and new account provided" — corrobore (sans la confirmer à 100%) l'hypothèse déjà utilisée dans `runFtmo25kCumulativeWithdrawalByDateAnalysis.js` (un retrait verrouille le plancher au nouveau solde plutôt que de continuer à poursuivre l'ancien sommet).

**Pratique** : quand Esdras aura son compte financé, il suffira d'ajouter une entrée `ACCOUNTS_JSON` avec `propFirmProgramId: 'ftmo-1step-funded'` (au lieu de `'ftmo-1step'`) — il apparaîtra automatiquement dans le même onglet FTMO que le compte challenge, avec les bonnes règles (pas de cible, mêmes limites de perte).

**Fichiers** : `src/propFirms/ftmo.js`, `src/propFirms/index.js`, `test/propFirms.test.js`. `npm test` : 413/413.

## City Traders Imperium (CTI) 1-Step — recherche + simulation du drawdown 5% — 2026-09-12

Esdras, après avoir demandé les règles du free trial FundingPips ("c'est mt5") puis d'un free trial sur Match-Trader (déjà codé dans le bot, jamais activé) : recherche a mené à **City Traders Imperium (CTI)**, qui offre un free trial 14 jours sur Match-Trader ET un vrai challenge payant sur la même plateforme. Puis, après avoir vu le prix : *"Il est probable qu'on le prenne plutôt que FTMO à cause de l'argent."*

**Règles CTI 1-Step** (sourcées en direct sur citytradersimperium.com, 2026-09-12) :
- Target **+8%** (FTMO : +10%)
- Drawdown max **5% trailing sur le plus haut solde atteint** (FTMO : 10% trailing fin-de-journée) — **deux fois plus serré**
- **Aucune** limite de perte journalière (FTMO : 3%)
- Jours de trading min : ambigu entre les sources (une page dit "aucun", une autre + un agrégateur tiers disent "3 jours profitables ≥0.5% chacun") — non réconcilié
- Split : **80%** au départ, monte à 90%/100% via paliers VIP non détaillés (FTMO : 90% fixe)
- Prix compte $25k : **$159** confirmé (vs ~$205-265 estimé chez FTMO)
- Plateforme : **Match-Trader** ou MT5 — Match-Trader est déjà câblé dans le bot (contrairement à MT5, zéro code existant)

**Simulation lancée** (`scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js`, fork du script FTMO à reset continu, même architecture — historique complet 2018-2025) pour vérifier si le plancher 5% change le calibrage de risque déjà établi :

| Risque/trade | Cycles | Busts | Taux de bust | Jours moy. pour passer |
|---|---|---|---|---|
| 0.5% (réglage challenge actuel) | 83 | 28 | **34%** | 32j |
| 0.4% | 58 | 15 | 26% | 50j |
| 0.3% (réglage live actuel) | 38 | 7 | **18%** | 73j |
| 0.2% | 23 | 2 | **9%** | 126j |

**Comparaison directe avec FTMO (même méthode, plancher 10%)** : à 0.5%, FTMO busте 9% des cycles — CTI en busте **34%**, presque 4x plus. Le réglage `live` actuel (0.3%) qui donnait 0% de bust chez FTMO busте encore 18% chez CTI. Il faut descendre à **0.2%** chez CTI pour retrouver un taux de bust comparable à celui de FTMO à 0.5% (9% vs 9%) — mais le passage devient alors 4x plus lent (126j vs 32j).

**Conséquence sur le revenu mensuel projeté** : à un niveau de risque comparable en sécurité, CTI génère ~2.9 cycles/an de +8% (≈23%/an brut) contre ~3.16 cycles/an de +10% chez FTMO à 0.3% (≈31.6%/an brut) — **CTI reste plus lent en croissance composée**, même avec un split final potentiellement meilleur (100% via VIP, non confirmé).

**Verdict présenté à Esdras (pas encore tranché)** : CTI coûte $46-106 de moins à l'achat ($159 vs ~$205-265), mais son plancher 5% oblige à réduire le risque bien en dessous du réglage FTMO pour rester aussi sûr, ce qui ralentit significativement l'atteinte des objectifs de revenu mensuel déjà calculés ($500-1500/mois). L'économie à l'achat est ponctuelle ; le ralentissement de croissance est récurrent chaque mois. Avantage réel de CTI : Match-Trader est déjà câblé dans le bot (FTMO tourne sur cTrader, aussi déjà câblé et actif — donc pas un avantage décisif côté intégration).

**Fichiers** : `scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js` (nouveau), `data/backtest-input/cti-1step-all-live-strategies-cycle-account-impact.md`. Aucun changement dans `src/` — recherche seulement.

## 3 candidats supplémentaires testés (FundedNext, The5ers, Alpha Capital Group) — 2 disqualifiés pour bot autonome — 2026-09-12

Esdras : "On prend les 3" (après la simulation CTI). Recherche des règles avant toute simulation de drawdown — a révélé un critère qui n'avait jamais été vérifié explicitement jusqu'ici : **le bot exécute les trades de façon totalement autonome, sans supervision humaine par trade**, et deux des trois firmes l'interdisent :

- **FundedNext** : cTrader et Match-Trader sont **"manual-only"** chez eux — EA/bots explicitement interdits sur ces deux plateformes, quelle que soit la taille du compte. Les EA ne sont permis que sur MT4/MT5 (comptes <$50k, frais supplémentaire) — plateformes qu'on n'a pas codées. **Disqualifié.**
- **Alpha Capital Group** (Alpha One, 1-Step) : EA permis **seulement comme outils d'assistance** (calcul de lot, gestion SL/TP, break-even) — "Automated EAs that execute trades independently, without human oversight, are strictly prohibited and will not be approved under any circumstances." Notre bot fait exactement ça. **Disqualifié.** (Règles sinon : target 10%, drawdown 6% trailing + 4% daily, cTrader disponible, ~$197 pour $25k, min trading days ambigu entre sources 0-3j.)
- **The5ers** (Hyper Growth, 1-Step) : EA **permis**, tant que c'est "your own trading strategy" (pas de copie/partage) — passe le filtre. MAIS prix confirmé **$765-850 pour un compte $20k** (+ $50 d'activation), pas même de palier $25k — **4-5x plus cher** que FTMO (~$205-265) ou CTI ($159), l'inverse de l'objectif "à cause de l'argent". Économiquement hors-sujet malgré le feu vert réglementaire — aucune simulation de drawdown lancée (pas la peine de tester un compte qu'on ne prendrait pas à ce prix). Règles sinon : target 10%, drawdown 6% statique sur le solde initial (pas trailing comme FTMO/CTI), aucune limite de jours de trading, split jusqu'à 100%.

**Bonus vérifié en passant (jamais confirmé explicitement avant)** : FTMO autorise bien les EA/bots totalement autonomes, y compris tiers, sans restriction particulière au-delà de l'interdiction HFT/latency-arbitrage standard — confirmé sur leur page officielle "Forbidden Trading Practices". Rien ne change côté FTMO, juste enfin vérifié.

**Conclusion** : le choix reste entre **FTMO et CTI**, les deux seuls candidats qui passent à la fois le filtre "bot autonome autorisé" et "prix raisonnable" parmi les 5 firmes étudiées cette session (FTMO, FundingPips, GoatFundedTrader, CTI, + ces 3). Décision finale toujours à trancher par Esdras.

**Fichiers** : aucun changement de code, recherche pure — pas de nouveau script (la disqualification réglementaire/prix a rendu la simulation inutile pour 2 des 3).

## 4e prop firm testée : Ment Funding — plancher statique 6% aussi sûr que FTMO — 2026-09-12

Esdras, après la disqualification de FundedNext/Alpha Capital Group et le prix trop élevé de The5ers : *"Autre platforme sérieuse?"*

**Ment Funding** passe les deux filtres qui ont éliminé les 3 candidats précédents :
- EA/cBots **explicitement permis sans restriction** ("EAs, hedging, scalping, any strategy - all permitted", sourcé en direct sur mentfunding.com) — pas de clause "assist-only" comme Alpha Capital Group
- **cTrader supporté** (via leur broker ThinkMarkets) — déjà câblé dans le bot
- Prix $25k confirmé : **$250** (dans la fourchette FTMO ~$205-265, pas celle de CTI $159 ni celle de The5ers $765-850)
- Réputation : 4.9/5 Trustpilot mais seulement ~227 avis (vs 8000+ à 4.6 chez FTMO) — solide mais échantillon mince, à garder en tête

**Règles** : target +10% (comme FTMO), drawdown max **6% STATIQUE** (fixé sous le solde de DÉPART, ne bouge jamais avec les gains — contrairement au trailing de FTMO/CTI), perte journalière 5% du solde de la veille (plus souple que FTMO 3%), aucun minimum de jours de trading, split 75% (défaut) / 90% (add-on payant).

**Simulation lancée** (`scripts/runMentFundingAllLiveStrategiesCycleAccountImpact.js`, même architecture de reset continu, adaptée pour un plancher STATIQUE au lieu de trailing) :

| Risque/trade | Cycles | Busts | Taux de bust | Jours moy. pour passer |
|---|---|---|---|---|
| 0.5% (réglage challenge actuel) | 45 | 3 | **7%** | 65j |
| 0.4% | 39 | 4 | 10% | 76j |
| 0.3% (réglage live actuel) | 25 | 1 | **4%** | 113j |
| 0.2% | 16 | 0 | **0%** | 178j |

**Résultat marquant** : malgré un plancher nominalement plus serré (6%) que FTMO (10%), Ment Funding fait AUSSI BIEN voire légèrement MIEUX (7% de bust à 0.5% contre 9% chez FTMO) grâce au mécanisme statique — le plancher ne poursuit jamais le solde vers le haut, donc une fois le cycle bien avancé, le risque de bust redevient quasi nul. C'est l'effet inverse de CTI (5% trailing, 34% de bust) : ce n'est pas le pourcentage brut qui compte, c'est le mécanisme (statique vs trailing).

**Comparatif final des 3 candidats viables (bot autonome autorisé + prix raisonnable)** :

| | FTMO | CTI | Ment Funding |
|---|---|---|---|
| Prix $25k | ~$205-265 | $159 | $250 |
| Target | 10% | 8% | 10% |
| Drawdown | 10% trailing EOD | 5% trailing | 6% statique |
| Bust @ 0.5% | 9% | 34% | 7% |
| Bust @ 0.3% | 0% | 18% | 4% |
| Jours moy. @ 0.5% | ~63j | 32j | 65j |
| Split | 90% fixe | 80%→90-100% | 75%→90% |
| Réputation | 8000+ avis, 4.6★ | Moins établi (post-2023) | 227 avis, 4.9★ |

**Conclusion présentée à Esdras (pas tranchée)** : FTMO et Ment Funding sont quasi équivalents en sécurité/vitesse — FTMO gagne sur la réputation (bien plus d'historique/avis) et le split fixe à 90% sans palier à débloquer, Ment Funding est légèrement moins cher et tout aussi sûr. CTI reste le moins cher à l'achat mais structurellement plus risqué (déjà établi). Décision finale toujours ouverte.

**Fichiers** : `scripts/runMentFundingAllLiveStrategiesCycleAccountImpact.js` (nouveau), `data/backtest-input/ment-funding-1step-all-live-strategies-cycle-account-impact.md`. Aucun changement dans `src/` — recherche seulement.

## 5e prop firm testée : FundingPips + GoatFundedTrader passaient déjà le filtre EA — comparatif final des 5 candidats — 2026-09-12

Esdras : *"Verifie une autre platforme, on doit avoir au moins 5 pour trancher."* Plutôt que de chercher une 6e firme, revérification de la politique EA de **FundingPips** et **GoatFundedTrader** (toutes deux étudiées plus tôt dans la session, avant que le filtre "bot autonome permis" soit découvert) :

- **FundingPips** : EA tiers limités à l'assistance, MAIS **"full automation is permitted on your own EA"** avec preuve de propriété (code source, historique git) — ce bot qualifie (c'est notre propre code, pas un EA acheté). Passe.
- **GoatFundedTrader** (programme ÉVALUATION 1-Step, pas les programmes Instant déjà testés) : EA pleinement automatisés permis "tant que c'est ta propre stratégie" — pas de restriction assist-only comme Alpha Capital Group. Passe.

Les deux passent sans avoir besoin d'une 6e firme. Simulations lancées avec la même architecture (reset continu, plancher statique pour ces deux comme Ment Funding) :

| Risque/trade | FundingPips (target 12%, DD 12% statique) | GoatFundedTrader (target 10%, DD 6% statique) |
|---|---|---|
| 0.5% | **0%** bust, 88j moy. | 7% bust, 65j moy. |
| 0.3% | **0%** bust, 142j moy. | 4% bust, 113j moy. |

**Comparatif final des 5 candidats viables (bot autonome autorisé + prix raisonnable)** :

| | FTMO | CTI | Ment Funding | FundingPips Flex | GoatFundedTrader |
|---|---|---|---|---|---|
| Prix $25k | ~$205-265 | $159 | $250 | ~$185-211 | non confirmé (~$60-100 estimé) |
| Target | 10% | 8% | 10% | 12% | 10% |
| Drawdown | 10% trailing EOD | 5% trailing | 6% statique | 12% statique | 6% statique |
| Bust @ 0.5% | 9% | 34% | 7% | **0%** | 7% |
| Bust @ 0.3% | 0% | 18% | 4% | **0%** | 4% |
| Jours moy. @ 0.5% | ~63j | 32j | 65j | 88j | 65j |
| Split | 90% fixe | 80%→90-100% | 75%→90% | 85% fixe | 80%→100% (add-on) |
| Réputation | 8000+ avis, 4.6★ | Moins établi | 227 avis, 4.9★ | Établie, split confirmé récemment | Post-2023, moins de recul |

**Constat marquant** : **FundingPips Flex a le taux de bust le plus bas des 5 (0% à tous les risques testés jusqu'à 0.5%)**, grâce à son plancher statique de 12% (le plus large ET non-trailing des 5) — mais c'est aussi le plus lent à passer (88j contre 32-65j pour les autres) à cause de sa cible plus haute (12% contre 8-10%). Confirme encore une fois : le mécanisme (statique vs trailing) et la largeur du plancher comptent plus que la réputation ou le prix seuls.

**Note d'incertitude** : le prix $25k de GoatFundedTrader n'a pas pu être confirmé avec certitude (calculateur de prix interactif non scrapable) — à vérifier directement sur leur site avant toute décision le concernant.

**Fichiers** : `scripts/runFundingPips1StepFlexAllLiveStrategiesCycleAccountImpact.js`, `scripts/runGoatFundedTrader1StepAllLiveStrategiesCycleAccountImpact.js` (nouveaux), rapports `.md` correspondants dans `data/backtest-input/`. Aucun changement dans `src/` — recherche seulement.

## "CTI, ça c'est pour le challenge mais on peut modifier au live?" — vérification + risque live dédié — 2026-09-12

Esdras a demandé si le réglage 0.5%/0.3% (challenge/live) testé pour CTI s'applique une fois le compte financé, ou si ça doit être ajusté.

**Vérifié en direct sur citytradersimperium.com** : le compte financé CTI garde **EXACTEMENT le même plancher 5% trailing** que le challenge — seule la limite de perte journalière (déjà absente en challenge, donc rien ne change) et la cible de profit disparaissent une fois financé. Contrairement à ce qu'on pourrait espérer, **rien ne se relâche** côté risque de bust.

**Conséquence** : le raisonnement qui a fait choisir 0.3% comme risque "live" pour FTMO (0% de bust une fois financé, plus besoin de vitesse) ne donne PAS le même résultat chez CTI, puisque son plancher reste deux fois plus serré. Deux scénarios ajoutés à la simulation CTI (`scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js`, maintenant 8 scénarios) pour trouver le niveau qui approche le 0% de bust de FTMO :

| Risque/trade | Taux de bust CTI |
|---|---|
| 0.3% (générique "live" du bot) | 18% |
| 0.2% | 9% |
| **0.15% (candidat live CTI)** | **0%** (0/15 cycles) |
| 0.1% | 0% (0/10 cycles, échantillon plus mince) |

**Conclusion** : si un compte CTI est un jour financé, il faudrait un réglage de risque **spécifique à CTI (~0.15%)**, distinct du 0.3% générique utilisé pour FTMO — le système `ACCOUNTS_JSON` le permet déjà (`riskPctPerTrade` est un champ PAR COMPTE, pas seulement dérivé de `ACCOUNT_MODE`), donc architecturalement rien à construire, juste à configurer différemment le jour où un vrai compte CTI existe. Confirme une fois de plus que le mécanisme du plancher (statique vs trailing, et son ampleur) compte plus que l'étiquette "challenge" ou "live".

**Fichiers** : `scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js` (2 scénarios ajoutés), rapport `.md` mis à jour. Aucun changement dans `src/` — le mécanisme de risque par compte existait déjà, recherche seulement.

## Test de connexion cTrader "ouvrir + fermer une position réelle" — incident + état en cours — 2026-09-12

Esdras : *"Je veux tester ma platform pour la connection"* puis *"vérifie qu'une position peut s'ouvrir et fermer"*. Comme c'est un samedi (marchés forex/indices/métaux fermés), elle a proposé de tester une paire ouverte le week-end.

**Ce qui a été construit** (tout en production, branche `claude/lire-handoff-hxisa5`) :
- `GET /api/admin/list-symbols` (gated `ADMIN_EXPORT_TOKEN`) — expose la liste COMPLÈTE des ~1002 symboles offerts par ce broker (pas juste les 4 symboles de stratégie), déjà chargée dans `CTraderDataSource.symbolIdByName`. A confirmé la présence de BTCUSD (id 101), ETHUSD, SOLUSD — tradeables le week-end contrairement aux 4 symboles de stratégie.
- `POST /api/admin/test-order-cycle?symbol=BTCUSD` (même gate) — contourne complètement le moteur de stratégie, parle directement au broker : récupère le `minVolume` RÉEL du symbole via `ProtoOASymbolByIdReq` (jamais deviné), soumet un ordre `MARKET BUY` minimal via `ProtoOANewOrderReq`, attend la confirmation réelle `ORDER_FILLED`, puis ferme via `ProtoOAClosePositionReq` (PAS un ordre inverse — un ordre inverse ne fermerait pas vraiment sur un compte en mode hedging, seulement en netting).
- `sendCommandWithTimeout` exporté de `cTraderDataSource.js` pour réutilisation.

**⚠️ INCIDENT réel en production** (1er essai, commit `3d83d4b`) : le code utilisait `connection.off(...)` pour désabonner un écouteur d'événement, en supposant une EventEmitter Node standard. La librairie `@reiryoku/ctrader-layer` utilise en réalité un émetteur MAISON (`CTraderLayerEmitter`) sans `.off()` — `.on()` retourne un uuid, le retrait se fait via `removeEventListener(uuid)`. L'erreur `TypeError: ds.connection.off is not a function`, levée dans un callback `setTimeout` brut (hors de la chaîne de promesses que le try/catch de la route pouvait intercepter), **est remontée non interceptée et a fait planter tout le processus du bot en production — deux fois** (une fois par tentative). Render a redémarré automatiquement en quelques secondes à chaque fois, reconnexion cTrader propre confirmée dans les logs, aucune position réelle affectée (compte demo) — mais un vrai incident, documenté honnêtement à Esdras plutôt que minimisé.

**Corrigé** (commit `60e24b0`, déployé et confirmé stable) : la vraie API (`on()` → uuid, `removeEventListener(uuid)`) ; CHAQUE chemin de callback (timeout, event handler, predicate) est maintenant protégé par try/catch — plus rien dans cette fonction ne peut atteindre le processus de façon non interceptée. Ajout de la détection explicite `ORDER_REJECTED`/`CANCELLED`/`EXPIRED` (échec rapide avec raison claire au lieu d'épuiser silencieusement les 15s) et de logs `console.error` à chaque étape.

**État actuel — PAS ENCORE RÉSOLU, prochaine étape pour la session suivante** : 2e essai (après le correctif, celui-ci n'a PAS fait planter le process — le fix a tenu) a renvoyé :
```json
{"symbol":"BTCUSD","symbolId":101,"volume":1,"openOrderId":null,"error":"timed out after 15000ms waiting for a matching execution event"}
```
Deux points suspects à investiguer avant un 3e essai :
1. `volume: 1` — le `minVolume` renvoyé par `ProtoOASymbolByIdReq` pour BTCUSD est **1** (soit 0.01 unité en convention "cents" cTrader) — anormalement petit, potentiellement en-dessous du minimum réel praticable du broker, ce qui pourrait expliquer un rejet silencieux.
2. `openOrderId: null` — la réponse de `ProtoOANewOrderReq` n'a fourni ni `order.orderId` ni `orderId` — soit la forme de réponse réelle diffère de ce qui est deviné dans `_submitOrder`/ce nouvel endpoint (jamais vérifiée contre une vraie réponse, voir les commentaires "VERIFY response shape" déjà présents dans `cTraderDataSource.js` avant cette session), soit l'ordre a été refusé d'une façon qui ne remplit pas ce champ. Avec `openOrderId: null`, le predicate de `waitForExecution` ne pouvait de toute façon jamais matcher un vrai événement (aucun event réel n'aura `orderId === null`) — donc le timeout de 15s était garanti, indépendamment de ce qui s'est réellement passé côté broker.

**Prochaine étape concrète** : avant tout nouvel ordre réel, ajouter les réponses BRUTES (`specRes`, `openRes`) au rapport JSON retourné (pas juste `console.error`, pour éviter d'avoir à fouiller les logs Render) — permettra de voir la vraie forme de `ProtoOANewOrderReq`'s response sans consommer un nouvel essai d'ordre en aveugle. Une fois la vraie forme connue, corriger l'extraction de `openOrderId` en conséquence.

**Le token `ADMIN_EXPORT_TOKEN` a été régénéré** cette session (l'ancien n'était pas connu de cette session) — tout lien admin sauvegardé avant le 2026-09-12 ~21h UTC ne fonctionne plus. Nouvelle valeur connue de cette session seulement, pas notée ici (secret) — la régénérer à nouveau via l'API Render si besoin plutôt que de la chercher.

**Fichiers** : `src/server.js` (2 nouveaux endpoints admin), `src/dataSources/cTraderDataSource.js` (`sendCommandWithTimeout` exporté). `npm test` 413/413 à chaque étape. Tout est déjà sur `claude/lire-handoff-hxisa5` (production) — PAS encore reporté sur `challenge/fundingpips-zero` (branche de recherche), à synchroniser.

## Reprise de session — nuit du 2026-09-13, Esdras change de session en urgence

Contexte : diagnostic du timeout `test-order-cycle` corrigé (rawSpecRes/rawOpenRes ajoutés au rapport, commit `e55e827`, déployé), puis Esdras a demandé de coder une vraie stratégie crypto **ce soir** pour voir le bot exécuter un ordre réel pendant le week-end (forex/indices/métaux fermés). Chemin suivi, dans l'ordre :

1. **Refusé** : exécuter moi-même un ordre via curl (garde-fou "Real-World Transactions"), une page artefact avec le token intégré (garde-fou "Credential Leakage"), et assouplir CORS pour lire la réponse à distance (garde-fou "Security Weaken"). Discussion complète avec Esdras sur POURQUOI le bot peut trader seul mais pas moi en direct — voir les échanges de cette session si besoin de les rejouer.
2. **Fait, déployé, testé** (commit `a4f42da`) : `/api/admin/export-candles` accepte maintenant n'importe quel symbole connu du courtier, pas seulement les 4 symboles de production — nécessaire pour tirer un vrai historique BTCUSD avant de coder quoi que ce soit.
3. **Vraie donnée récupérée** : 14 000 bougies M15 BTCUSD réelles (20 fév. → 11 sept. 2026, ~7 mois) via cet endpoint.
4. **Backtest honnête AVANT tout déploiement** (script jetable, pas commité) : FVG baseline, aucun filtre (aucun concept HTF/session n'a de sens sur un marché 24/7), décidé avant de regarder les résultats. RR 1:2/1:3/1:5 testés : edge net positif mais **fin** (profit factor ~1.07-1.08 partout, PAS la robustesse des 4 autres symboles), sur une seule fenêtre non découpée train/test, spread ($25) estimé et NON vérifié chez le courtier.
5. **Problème réel trouvé avant de déployer** : `GuardrailEngine.maxTradesPerDay` est un compteur PARTAGÉ pour tout le compte (pas par symbole) — BTCUSD (~110 signaux/mois estimés) risquait de consommer les 2 seuls slots du jour et de bloquer un vrai signal EURUSD/XAUUSD/US100/US500. Présenté à Esdras, elle a choisi : monter le plafond à 3 plutôt que d'isoler BTCUSD sur un compte séparé ("on va supprimer BTC juste après").
6. **Déployé** (commit `ae6b8ea`, sur `claude/lire-handoff-hxisa5`) :
   - `config.js` : `BTCUSD` ajouté à `symbols`, entrée `fvg.perSymbol.BTCUSD` (baseline, `stopMode:'fvg-edge'`, `rrMultiple:3`, aucun filtre), `guardrails.maxTradesPerDay` 2→3 — **tout commenté "TEMPORARY", à retirer avec BTCUSD**.
   - `transactionCosts.js` : `DEFAULT_SPREADS.BTCUSD = 25` (indicatif, non vérifié).
   - `lotCalculator.js` : nouvelle entrée `BTCUSD` avec `min=step=max=1` + `rawVolume: true` — **le risque %/solde NE dimensionne PAS BTCUSD ce soir**, il trade toujours le minimum absolu du courtier (1, la même valeur brute confirmée en direct plus tôt via `/admin/test-order-cycle`), délibérément, pour éviter d'empiler une deuxième couche de constantes inventées sur la conversion `lots*lotSize*100` déjà non vérifiée de `_submitOrder`.
   - `cTraderDataSource.js` : `_submitOrder` respecte maintenant `symbolSpec.rawVolume` (envoie le volume brut directement au lieu de la formule `lots*lotSize*100`) — no-op pour les 4 autres symboles.
   - `npm test` : 413/413 à chaque étape.

**🚨 BUG RÉEL DÉCOUVERT JUSTE AVANT LA COUPURE, NON CORRIGÉ** : après déploiement de `ae6b8ea`, `/api/accounts` affiche toujours `"maxTradesPerDay":2`, PAS 3. Cause trouvée : `config.js` a DEUX définitions de garde-fous par défaut indépendantes —
- `CONFIG.guardrails` (ligne ~87, celle que j'ai modifiée à 3) — apparemment PAS ce qui alimente le compte `'default'` réel.
- `function defaultGuardrails()` (ligne ~388, `{ maxTradesPerDay: 2, ... }`, hardcodé séparément) — utilisée par `resolveAccounts()` (ligne ~454 : `guardrails: { ...defaultGuardrails(), ...(raw.guardrails || {}) }`) pour construire le compte `'default'` quand `ACCOUNTS_JSON` est absent (le cas réel en prod aujourd'hui).

Autrement dit : **le compte réel utilise `defaultGuardrails()`, pas `CONFIG.guardrails`** — ma modification du plafond à 3 est actuellement du code mort pour le compte en production. Le plafond réel est TOUJOURS 2, partagé entre BTCUSD et les 4 symboles habituels — exactement le risque que je pensais avoir neutralisé avec Esdras n'est PAS neutralisé.

**Prochaine étape immédiate pour la session suivante** :
1. Corriger `defaultGuardrails()` (ligne 388-389) pour qu'il retourne `maxTradesPerDay: 3` aussi (ou mieux : faire que `CONFIG.guardrails` et `defaultGuardrails()` soient la MÊME source, pas deux constantes dupliquées qui peuvent diverger — c'est la vraie cause racine, pas juste ce symptôme).
2. Redéployer, puis **revérifier en direct** via `curl https://ict-fvg-bot.onrender.com/api/accounts` que `guardrail.maxTradesPerDay` affiche bien `3` avant de considérer BTCUSD comme sûr à laisser tourner.
3. Une fois vérifié : le reste de l'implémentation (perSymbol config, spread, lot spec `rawVolume`) a été relu et raisonné avec soin, mais N'A PAS ENCORE produit de signal/ordre réel — rien à analyser côté résultat pour l'instant, juste à surveiller (notification ntfy si un ordre part, comme pour les autres symboles).
4. Ne pas oublier le nettoyage complet promis à Esdras une fois le test terminé : retirer `BTCUSD` de `symbols`, l'entrée `fvg.perSymbol.BTCUSD`, remettre `maxTradesPerDay` à 2 (dans les DEUX endroits maintenant qu'on sait qu'il y en a deux), retirer `DEFAULT_SPREADS.BTCUSD`, retirer l'entrée `BTCUSD` de `lotCalculator.js`, et le branchement `rawVolume` dans `_submitOrder` peut rester (il est inerte pour tous les autres symboles) ou être retiré aussi par propreté.

**Fichiers** : `src/config.js`, `src/backtest/transactionCosts.js`, `src/engines/lotCalculator.js`, `src/dataSources/cTraderDataSource.js`, `src/server.js` (export-candles loosening). Commits `a4f42da`, `ae6b8ea`, tous deux poussés et déployés sur `claude/lire-handoff-hxisa5`. `npm test` 413/413 à chaque étape — mais le comportement RÉEL en production (le plafond de 3) n'est PAS encore celui voulu, voir bug ci-dessus.

## Comptes ajoutables via le dashboard, sans redéployer — 2026-09-13

Esdras, après avoir reçu ses identifiants CTI Free Trial (Match-Trader) et réalisé qu'ajouter un `brokerId` obligerait un redéploiement à chaque fois : *"Est-il possible de faire le site une façon de juste mettre ces codes dans le site à la main, sans redéployer?"*

**Construit** : une nouvelle page dashboard **`/accounts.html`** ("Comptes") où on colle les identifiants d'un compte (cTrader ou Match-Trader), sauvegardés dans **Supabase** (déjà branché sur ce bot pour le journal des trades) au lieu d'`ACCOUNTS_JSON` — donc plus jamais besoin de toucher au code pour ajouter un compte.

**Architecture** :
- Nouvelle table Supabase `bot_accounts` (projet `Chfproject`, RLS activé, aucune policy anon/authenticated — accessible uniquement via la clé `service_role` déjà utilisée côté serveur, jamais exposée au navigateur) — même convention que `bot_trade_events`.
- `src/dataSources/supabaseAccountStore.js` (nouveau) : `fetchDynamicAccounts()` (lecture brute pour le boot), `saveDynamicAccount()`/`deleteDynamicAccount()` (écriture), `listDynamicAccountsRedacted()` (lecture pour le dashboard — ne renvoie JAMAIS les vrais mots de passe/tokens, juste des booléens "identifiants présents").
- `config.js` : `normalizeAccountEntry()` **exportée** (au lieu de privée) — les comptes Supabase passent par EXACTEMENT la même normalisation que les entrées `ACCOUNTS_JSON`, aucune deuxième logique qui pourrait diverger.
- `accountRegistry.js` : nouvelle fonction `registerAccount()` pour ajouter un compte au registre APRÈS le chargement du module (les comptes Supabase ne sont connus qu'au boot, contrairement à `CONFIG.accounts` résolu à l'import).
- `server.js` : le boot séquentiel appelle maintenant `fetchDynamicAccounts()` avant la boucle de connexion, normalise + enregistre chaque compte trouvé, puis les boot exactement comme les comptes statiques. Un raté Supabase ne bloque jamais les comptes statiques (retourne `[]`, ne lance jamais).
- 3 nouvelles routes admin (même gate `ADMIN_EXPORT_TOKEN`) : `GET/POST /api/admin/accounts`, `DELETE /api/admin/accounts/:id`.
- **`POST /api/admin/restart`** : PAS un redéploiement (aucun rebuild, aucun push) — juste `process.exit(0)`, et la politique de redémarrage de Render relance le processus en ~10-20s (le même mécanisme qui a déjà ramené le bot après le crash `connection.off()` plus tôt cette session — utilisé ici délibérément plutôt qu'accidentellement). C'est ce redémarrage (pas un redéploiement) qui reste nécessaire après avoir sauvegardé un nouveau compte — clairement expliqué sur la page.

**Bug réel trouvé et corrigé en cours de route** : CTI n'a "aucune limite de perte journalière" — mais `GuardrailEngine` n'a **aucune convention "null désactive cette vérification"** pour `dailyLossLimitPct` (contrairement à `maxDrawdownPct`) : son check est une comparaison brute `dailyLossPct >= this.dailyLossLimitPct`, et `null` se convertit en `0` en JS, ce qui aurait **bloqué le trading presque immédiatement**. Trouvé en vérifiant AVANT de committer, pas après un incident. Corrigé dans `accountRegistry.js` : quand la règle de la prop firm est `null`, on retombe sur le réglage générique du compte (2% par défaut) au lieu de transmettre `null` — la protection journalière du bot reste active peu importe la firme, même philosophie que partout ailleurs cette session. Nouveau fichier `test/accountRegistry.test.js` (3 tests) qui couvre spécifiquement ce cas.

**Nouveau fichier `src/propFirms/cti.js`** : `CTI_1STEP` (target 8%, drawdown 5%, aucune limite journalière, split 80%) enregistré dans le registre — le compte Free Trial actuel n'a volontairement AUCUN `propFirmProgramId` assigné (le trial n'a "aucune cible, aucune pression" per CTI eux-mêmes, inventer des chiffres de garde-fou serait pire que de ne pas en avoir) ; à assigner `cti-1step` une fois un vrai challenge payant acheté. Le mécanisme de plancher de CTI (trailing mis à jour à CHAQUE clôture de trade, pas seulement en fin de journée comme `trailing-eod` de FTMO) ne correspond à AUCUN des types déjà reconnus par `GuardrailEngine` — nouveau type `trailing-on-every-close`, volontairement NON reconnu (fail-open, jamais appliqué en direct), même précédent que le type `trailing-realtime-equity-never-resets` de GoatFundedTrader.

**`npm test` : 417/417** (413 + 3 nouveaux tests `accountRegistry.test.js` + 1 nouveau test `cti.js` dans `propFirms.test.js`).

**Reste à faire** : déployer, puis test de bout en bout réel contre le vrai Supabase en production (ajouter un compte factice via la page, vérifier qu'il apparaît, le supprimer).

**Fichiers** : `src/dataSources/supabaseAccountStore.js`, `src/propFirms/cti.js` (nouveaux) ; `src/config.js`, `src/accountRegistry.js`, `src/server.js`, `public/index.html`, `public/chart.html`, `src/propFirms/index.js` (modifiés) ; `public/accounts.html` (nouveau) ; `test/accountRegistry.test.js` (nouveau), `test/propFirms.test.js` (modifié).

## Corrigé : les 2 sources de garde-fous dupliquées (maxTradesPerDay réel enfin à 3) — 2026-09-13

Repris exactement là où la session précédente s'est arrêtée (voir son entrée juste au-dessus, "🚨 BUG RÉEL DÉCOUVERT JUSTE AVANT LA COUPURE"). Root cause confirmée et corrigée : `defaultGuardrails()` (`src/config.js`) avait sa PROPRE copie hardcodée `{maxTradesPerDay: 2, ...}`, complètement indépendante de `CONFIG.guardrails` (celle bumpée à 3 pour le test BTCUSD) — et c'est `defaultGuardrails()` qui alimente le vrai compte `'default'` en production.

**Fix** : `defaultGuardrails()` retourne maintenant `{ ...CONFIG.guardrails }` au lieu d'un littéral séparé — une seule source de vérité, plus de risque de divergence future. Vérifié directement (`node -e` avec un import réel du module) : `CONFIG.accounts[0].guardrails.maxTradesPerDay` vaut bien **3** maintenant, pas 2. `npm test` 417/417.

Fusionné avec le travail "Comptes via dashboard" de cette même session (branches synchronisées, conflit sur HANDOFF.md seulement, résolu en gardant les deux sections).

**Prochaine étape** : déployer, revérifier en direct via `curl .../api/accounts` que `maxTradesPerDay:3` s'affiche vraiment, puis surveiller BTCUSD normalement. Ne pas oublier le nettoyage complet promis (retirer BTCUSD de partout) une fois le test terminé — la liste exacte des 5 endroits à toucher est déjà dans l'entrée précédente.

## Observabilité de l'exécution réelle + honnêteté de l'affichage "position ouverte" — 2026-09-13

Suite à l'échange où Esdras a corrigé *"Tu dis que le bot a un trade. Mais ce n'est pas vrai car le trade n'est pas ouvert, donc dis plutôt un ordre en attente"*, puis *"Vérifie les 2"* (l'hypothèse d'un vrai ordre jamais confirmé vs. un artefact de redémarrage) et *"Corrige ça"*, suivi de *"Fais en sorte que le trade s'exécute réellement"* (réponse à la clarification : **les deux** — prouver que ça marche maintenant ET corriger le pipeline pour les vrais signaux futurs).

**Investigation (les 2 hypothèses)** : `warmUp()` (rejeu historique au boot) et le chemin live (`ProtoOASpotEvent` → `ingestCandle` → `_handleAutoExecuteEntry`) sont structurellement séparés dans `cTraderDataSource.js` — `warmUp()` ne peut JAMAIS soumettre un ordre réel. Donc les positions "crues ouvertes" sur US100/XAUUSD ne sont PAS des artefacts de redémarrage (reconstruction déterministe du warm-up). Mais impossible de confirmer depuis les logs si un vrai ordre a un jour été soumis en direct : **aucun `console.log` n'existe** dans `_handleAutoExecuteEntry` (soumission) ni `_handleExecutionEvent` (confirmation réelle) — seul `_notifyText` (push ntfy uniquement, jamais loggé côté console) existe, et Render ne garde pas l'historique des push ntfy. Un vrai trou d'observabilité, pas une supposition.

**Fix 1 (observabilité, `cTraderDataSource.js`)** : ajout de `console.log` à 3 endroits du chemin d'exécution réel, en plus des notifications ntfy existantes (jamais à leur place) :
1. À la réception de chaque signal auto-exécutable (`_handleAutoExecuteEntry`, symbole/source/direction/id).
2. Juste après la résolution de `_submitOrder` (le `brokerOrderId`, y compris quand il est `null` — un échec silencieux sans exception levée serait autrement invisible).
3. Dans `_handleExecutionEvent` : une ligne pour CHAQUE événement d'exécution reçu (type/orderId/positionId, avant tout filtrage), puis une ligne dédiée pour la confirmation REMPLI et une pour NON REMPLI.

Résultat : `render logs` seul permet désormais de répondre "un ordre a-t-il seulement été tenté, et qu'a répondu le courtier" — sans dépendre de ntfy.

**Fix 2 (honnêteté de l'affichage, `server.js` + `index.html` + `chart.html`)** : `buildStatusPayload`'s `openPosition` par symbole ne représentait QUE la croyance optimiste du moteur (posée au moment de la validation du signal, pour FVG/Divergence/NWOG/Judas Swing indifféremment), jamais recoupée contre un vrai fill. `withRealTimePosition()` calcule maintenant un champ `confirmed` (booléen) en comparant contre `orderOutcomeLog` (rempli UNIQUEMENT par de vrais `ProtoOAExecutionEvent`, jamais par la croyance du moteur) — `true` seulement si un `outcome:'filled'` existe pour ce symbole+id de signal exact, `false` sinon (couvre à la fois "encore en attente de confirmation" ET "aucun ordre n'a jamais été envoyé" — l'auto-exécution était peut-être désactivée au moment de la validation ; ces deux cas restent indiscernables depuis ce seul log, volontairement pas présenté comme plus précis que ça).

Dashboard (`index.html`) : badge ticker désormais `●POSITION` (bleu) seulement si confirmé, sinon `●signal (non confirmé)` (ambre) — remplace le badge "●POSITION" unique qui ne distinguait jamais les deux cas. Chart (`chart.html`) : note sous le graphe dit maintenant explicitement "Position réellement ouverte chez le courtier (confirmée)" vs "Signal validé par le bot, PAS ENCORE CONFIRMÉ chez le courtier".

`npm test` : 417/417 à chaque étape (aucun test existant ne couvrait `server.js` directement — pas de régression introduite, vérifié aussi via `node --check` sur les deux fichiers modifiés et un test manuel du calcul `confirmed` en isolation).

**Reste à faire (prochaine étape immédiate)** : la partie "prouver que ça marche maintenant" de la demande d'Esdras — relancer `/api/admin/test-order-cycle` (son dernier état connu était un timeout suspect avec `volume:1`/`openOrderId: null`, potentiellement déjà corrigé par le commit `e55e827` d'une session parallèle, pas encore revérifié personnellement) — puis déployer ces changements et confirmer en direct que les nouveaux logs apparaissent bien dans `render logs` au prochain signal réel.

**Fichiers** : `src/dataSources/cTraderDataSource.js`, `src/server.js`, `public/index.html`, `public/chart.html`.

## 🎯 Root cause trouvé et corrigé : le pipeline de confirmation d'ordre réel était mort depuis le début — 2026-09-13

Suite directe de l'entrée précédente ("Observabilité de l'exécution réelle..."). Dès le premier ajout de `console.log`, une relance réelle de `/admin/test-order-cycle` (BTCUSD) a révélé, en cascade, **trois bugs réels et jusque-là invisibles** :

1. **`ProtoOANewOrderReq` répond `{}` (objet vide) sur ce courtier** — aucun `order.orderId` dans la réponse synchrone. `test-order-cycle` (et surtout **`_submitOrder` en production**) extrayaient `brokerOrderId` de cette réponse — donc **`brokerOrderId` valait `null` sur CHAQUE ordre réel jamais envoyé en direct depuis le déploiement de ce bot**. Confirmé indépendamment : le courtier a bien rempli l'ordre (`ORDER_ACCEPTED` puis `ORDER_FILLED`, ~600ms après envoi, orderId et positionId réels — visibles uniquement grâce aux nouveaux `console.log`).
2. **Conséquence directe** : `_handleAutoExecuteEntry`/`_handlePyramidOrderRequested` conditionnent tout le suivi réel sur `if (brokerOrderId != null)` — donc `pendingEntryOrderByOrderId` n'a **jamais** été peuplé par un vrai ordre, et `_handleExecutionEvent` n'a **jamais** pu confirmer un remplissage/rejet réel. C'est le mécanisme exact derrière la correction d'Esdras *"ce n'est pas un trade, c'est une croyance"* — la boucle de confirmation était silencieusement morte depuis toujours, pas juste manquante de logs.
3. **Bug de comparaison de type (2 endroits)** : `positionId`/`symbolId` venant du protobuf sont sérialisés en **string**, comparés avec `!==` contre des `Number` JS — ne matche jamais. A cassé `/admin/close-position` en direct (une vraie position BTCUSD laissée ouverte par le timeout du bug #1 a mis du temps à se fermer à cause de ce second bug, diagnostiqué et corrigé dans la foulée) et aurait cassé la même logique dans `test-order-cycle`.

**Fix** : `_submitOrder` résout maintenant le vrai `orderId` depuis le `ProtoOAExecutionEvent` qui suit l'envoi (écouteur armé AVANT `sendCommand`, matché par `symbolId` normalisé en `Number` des deux côtés) au lieu de faire confiance à la réponse synchrone — exactement la même technique que le fix de `test-order-cycle`, appliquée là où ça compte vraiment pour le trading réel. Analyse de la seule course possible (l'événement de confirmation arrive et est traité par `_handleExecutionEvent` avant que `_submitOrder` ne retourne) : sans risque en pratique, car le courtier envoie toujours `ORDER_ACCEPTED` (porteur du orderId) strictement avant `ORDER_FILLED`/rejet — ~300ms d'écart observés en réel, largement suffisant pour que `pendingEntryOrderByOrderId.set()` s'exécute avant l'événement terminal.

**Vérifié en direct, de bout en bout** : position BTCUSD réelle laissée ouverte par le bug #1 (positionId `41540705`) confirmée via `/api/account` (`status:"real-only"`) puis fermée avec succès via le nouvel endpoint `/api/admin/close-position` une fois le bug #3 corrigé.

**Nouveau** : `POST /api/admin/close-position` (même garde `ADMIN_EXPORT_TOKEN`) pour fermer manuellement n'importe quelle position réelle sans dépendre d'un futur correctif de code.

`npm test` : 417/417 à chaque étape.

**Reste à faire** : provoquer un vrai signal auto-exécuté en direct (attendre le prochain signal réel, ou en simuler un via le pipeline complet) pour confirmer que `pendingEntryOrderByOrderId` se peuple bien maintenant et que `_handleExecutionEvent` confirme réellement le remplissage - `test-order-cycle` prouve que le mécanisme SOUS-JACENT fonctionne (même code `_submitOrder`), mais n'a pas encore été observé sur un VRAI signal FVG/Divergence/NWOG/Judas Swing depuis ce fix.

**Fichiers** : `src/dataSources/cTraderDataSource.js`, `src/server.js`.

## Preuve complète, de bout en bout : le cycle réel ouverture+fermeture fonctionne — 2026-09-13

Suite immédiate de l'entrée précédente. Deux bugs supplémentaires trouvés en re-testant juste après le fix du root cause :

1. **`symbolId` mal placé dans le guess de repli** : `d.order?.symbolId` n'existe pas du tout sur ce courtier — confirmé via un dump JSON brut temporaire de l'événement réel. Le vrai champ est `order.tradeData.symbolId`. Corrigé (chaîne de repli réordonnée, le chemin confirmé en premier), dump temporaire retiré une fois son rôle rempli.
2. **`closePositionDetail.grossProfit` est une chaîne** (`"-19"`), pas un nombre — le garde `typeof === 'number'` échouait toujours et affichait `closePnl: null` même sur une fermeture réussie. Corrigé avec `Number(...)`.

**Preuve finale obtenue** : un appel `POST /api/admin/test-order-cycle?symbol=BTCUSD` a réussi intégralement en un seul appel — `openOrderId`, `positionId`, ET `closed:true` tous renseignés correctement, sur le compte demo réel (`fpmarketssc`). C'est la preuve concrète demandée par Esdras (*"fais en sorte que le trade s'exécute réellement"*, réponse "les deux" à la clarification) : le mécanisme sous-jacent (`_submitOrder`, partagé avec le vrai chemin `_handleAutoExecuteEntry`/`_handlePyramidOrderRequested`) fonctionne maintenant de bout en bout, pas seulement en théorie.

**Nettoyage effectué en cours de route** : deux positions BTCUSD réelles laissées ouvertes par les timeouts des tests précédents (`41540705`, `41540812`) ont été fermées manuellement via le nouvel `/api/admin/close-position` une fois ses propres bugs corrigés. Compte confirmé à plat (`/api/account` : `positions:[]`) avant le test final propre.

`npm test` : 417/417 à chaque étape (6 commits au total pour cette chaîne de découvertes, tous poussés sur `claude/lire-handoff-hxisa5` et déployés/vérifiés en direct un par un).

**Toujours vrai, pas encore observé** : un VRAI signal FVG/Divergence/NWOG/Judas Swing auto-exécuté n'a pas encore été capturé depuis ces fixes (le test-order-cycle bypasse volontairement le moteur de stratégie). Le mécanisme est identique (même `_submitOrder`), donc il n'y a pas de raison de douter qu'il fonctionnera pareil, mais ça reste à confirmer avec un signal réel le jour où un fire.

**Fichiers** : `src/dataSources/cTraderDataSource.js`, `src/server.js`.

## Bug réel trouvé par Esdras dans le journal (Invalid Date, faux "100% de réussite") — corrigé — 2026-09-13

Esdras a remarqué que le journal de trading affichait "Invalid Date" et un taux de réussite de 100% (3/3) avec un P&L net figé à +0.00 pour les 3 trades de test (BTCUSD, mes propres cycles ouverture+fermeture de ce soir). Investigation → **deux bugs réels de la même famille que ceux corrigés plus tôt ce soir** (le courtier sérialise les entiers 64-bit — timestamps, ids, volumes — en STRINGS JSON, confirmé via un vrai dump tonight) :

1. **`dealPairing.js`** : `sum + (d.closePositionDetail.grossProfit || 0)` utilisait `+` sur une string (`grossProfit`) — en JS, `+` avec un opérande string fait de la CONCATÉNATION, pas une addition (`0 + "-19"` → `"0-19"`, pas `-19`). Résultat divisé par 100 → `NaN`, qui devient silencieusement `null` en JSON. Côté client, `null >= 0` vaut **`true`** en JS — donc CHAQUE trade s'affichait comme une victoire, peu importe le vrai résultat, et la somme (`sum + null`) restait toujours exactement `0`. `entryTime`/`exitTime` stockés comme strings brutes cassaient aussi `new Date(...)` côté dashboard ("Invalid Date" — `new Date("1789...")` n'est PAS traité comme un epoch numérique par le constructeur `Date`, contrairement aux opérateurs arithmétiques).
2. **`cTraderDataSource.js`/`_loadClosedDeals`** (bug plus grave, jamais observé en direct mais réel) : la même string `executionTimestamp` était passée telle quelle à `GuardrailEngine.recordTrade({time})`, qui calcule `lastTrade.time + cooldownMinutesAfterLoss*60000` avec un `+` — même piège. **Conséquence potentielle** : après un redémarrage (le bot redémarre souvent) où le dernier trade des dernières 24h était une perte, le calcul du cooldown produirait un nombre astronomique (des années), bloquant silencieusement TOUT le trading (`blocked:true, cooldown_active`) jusqu'au prochain redémarrage. Corrigé à la fois à l'endroit d'appel ET dans `GuardrailEngine.recordTrade` lui-même (`Number(time)`, défense en profondeur) pour qu'aucun futur appelant ne puisse réintroduire ce bug.

**Fix** : `Number(...)` partout où `executionTimestamp`/`grossProfit` entrent dans un calcul ou un `new Date(...)`. Nouveaux tests de régression avec des fixtures STRING (la vraie forme du courtier, pas des nombres comme avant) dans `test/dealPairing.test.js` et `test/guardrailEngine.test.js` — ces tests auraient échoué sans le fix.

Troisième symptôme signalé ("Pas de données de graphique pour ce trade") : limitation pré-existante, pas une régression — le fetch des bougies pour le mini-graphe échoue silencieusement pour ces 3 trades de test (log `err.message: undefined`, probablement une réponse d'erreur du courtier sans champ `.message`). Amélioré le log pour être diagnosticable la prochaine fois (`err.message || JSON.stringify(err)`), mais pas creusé plus loin ce soir — n'affecte que l'affichage du mini-graphe, jamais le trading réel.

`npm test` : 419/419 (417 + 2 nouveaux tests de régression).

**Fichiers** : `src/dataSources/dealPairing.js`, `src/dataSources/cTraderDataSource.js`, `src/engines/guardrailEngine.js`, `test/dealPairing.test.js`, `test/guardrailEngine.test.js`.

## Spread BTCUSD : de la valeur devinée (25) à la valeur mesurée (18) — 2026-09-13

Esdras a remarqué qu'aucun trade BTCUSD ne s'était encore déclenché malgré le M1 (qui génère un signal presque à chaque minute) : *"comment ca se fait qu'on a une strategy 1 min btc aussi facile"* puis *"ajuste le spread filter pour voir un vrai trade automatic"*.

**Diagnostic** : les 13 derniers signaux validés sur BTCUSD (654 formations FVG en 17 minutes) avaient TOUS `blockedReason: "spread-too-tight"`. Le filtre exige une distance stop ≥ 3x le spread supposé. Le spread BTCUSD était une pure supposition (25$, jamais vérifiée) → seuil de 75$. Les distances stop réelles en M1 (naturellement petites) allaient de 6.60$ à 71.5$ — aucune n'atteignait 75$.

**Deuxième bug trouvé en voulant vérifier le vrai spread** : `/admin/spread-check` retournait 0 échantillon depuis toujours, sur TOUS les symboles, malgré des heures de fonctionnement. Cause : `typeof event.bid === 'number'` échouait silencieusement chaque fois que ce courtier envoie `bid`/`ask` en string — même famille de bug que ceux trouvés plus tôt ce soir (le prix affiché au dashboard n'était pas affecté, car il vient de `trendbar.close`, un chemin différent). Corrigé avec `Number(event.bid)`/`Number(event.ask)` au lieu du garde `typeof`.

**Résultat** : une fois déployé, 34 vrais ticks BTCUSD capturés en une minute — spread réel : min 17, max 18, moyenne 17.03. La supposition de 25 était ~47% trop haute. `DEFAULT_SPREADS.BTCUSD` mis à jour à **18** (le maximum observé, choix prudent plutôt que la moyenne) — un nombre MESURÉ, pas deviné. Nouveau seuil : 54$ au lieu de 75$ — une partie des signaux (ceux avec une distance stop entre 54 et 75) peuvent maintenant passer.

`npm test` : 419/419.

**Prochaine étape** : moniteur actif en arrière-plan pour confirmer qu'un vrai signal passe le filtre et qu'un ordre réel se déclenche ce soir.

**Fichiers** : `src/dataSources/cTraderDataSource.js`, `src/backtest/transactionCosts.js`.

## 🎯 Premier trade automatique réel confirmé — 2026-09-14 00:09 UTC

Suite directe des 3 entrées précédentes de ce soir. Après avoir corrigé le spread (25→18, mesuré en direct) et ajouté un moyen de vider une croyance non confirmée (bloquée par le netting du warm-up), un **vrai signal FVG en direct** (`BTCUSD-644`) a passé tous les filtres et s'est exécuté automatiquement :

- Ordre LIMIT BUY envoyé à 00:09:01.210 UTC
- `ORDER_ACCEPTED` par le courtier 228ms plus tard
- `ORDER_FILLED` confirmé ~11.4s après (prix a touché le niveau limite)
- **Position réelle ouverte** : entrée 76954.5, stop 76818, cible 77368, positionId `41542224`
- `/api/account` confirme : `"status": "match"` — la croyance du bot ET la position réelle chez le courtier concordent, pour la première fois cette session sur n'importe quel symbole

**Un signal LIMIT antérieur ce soir (`BTCUSD-640`) n'avait reçu AUCUN `ProtoOAExecutionEvent` en 10 secondes** (contrairement à tous les ordres MARKET testés plus tôt, confirmés en ~300ms) — un dump temporaire payload/réponse brute a été ajouté pour diagnostiquer, puis retiré une fois ce second signal prouvant que ce n'était pas un problème structurel (juste un raté ponctuel, réseau ou timing). Le log reste en version permanente allégée (`[_submitOrder] ... rawRes=...`), pas spammy (une fois par tentative réelle d'ordre), puisque c'est exactement le genre de trou d'observabilité que cette session cherchait à combler depuis le début.

**Ce qui reste "temporaire"** : BTCUSD lui-même reste un test de connectivité, pas une stratégie validée (voir entrées précédentes) — mais le mécanisme d'exécution automatique (le même `_submitOrder`/`_handleAutoExecuteEntry` utilisé par TOUS les symboles réels) est maintenant prouvé fonctionner de bout en bout avec un vrai signal de stratégie, pas seulement via `/admin/test-order-cycle`.

`npm test` : 419/419.

**Fichiers** : `src/dataSources/cTraderDataSource.js` (log permanent allégé).

## Bug réel trouvé par Esdras : "Écart bot/courtier ⚠ statut inconnu" sur des symboles au repos — 2026-09-14

Suite directe de l'entrée précédente ("Auto-clear stale warm-up beliefs"). Esdras a envoyé un screenshot montrant 3 cartes "Écart bot/courtier ⚠ statut inconnu" alors que rien n'était censé se passer.

**Cause** : `refreshAccount()` (public/index.html) filtrait les "écarts" avec `r.status !== 'match'` — ce qui laisse passer `'none'` (aucun des deux côtés ne croit avoir quelque chose d'ouvert, l'état NORMAL) comme si c'était un écart. `reconciliationExplanation()` n'avait aucune branche pour `'none'`, donc ça retombait sur le message générique "statut inconnu".

**Pourquoi ça n'était jamais apparu avant** : avant le fix précédent (nettoyage automatique des croyances périmées), un symbole restait presque toujours coincé en `believed-only` après chaque redémarrage — `'none'` n'apparaissait quasiment jamais en pratique. En corrigeant CE bug-là, les symboles retombent légitimement à `'none'` bien plus souvent entre deux signaux réels — ce qui a rendu ce second bug (préexistant, pas introduit ce soir) enfin visible.

**Fix** : exclure `'none'` du filtre d'écarts (seuls `real-only`/`believed-only` sont de vrais écarts), plus une branche défensive pour `'none'` dans `reconciliationExplanation()`.

`npm test` : 425/425 (changement front-end uniquement, `public/index.html`).

**Fichiers** : `public/index.html`.

## 🚨 Bug de sécurité réel trouvé en surveillant le bot : le garde-fou se réinitialisait silencieusement ~5h par jour — 2026-09-14

Esdras a demandé une surveillance continue ("prend des notes pour detecter tt problem"). En observant le cooldown après perte en direct, j'ai remarqué quelque chose d'impossible : un cooldown de 30 minutes après une perte réelle (-0.99$ sur BTCUSD) a disparu complètement après seulement ~3 minutes, sans redémarrage du processus.

**Cause racine trouvée** : `cTraderDataSource.js` (et `matchTraderDataSource.js`) transmettent à `LiveStrategyEngine.ingestCandle()` une bougie dont le `.time` est décalé de -5h (`_toEngineCandle`, convention "fixed EST as UTC" nécessaire pour que les filtres de session/biais HTF correspondent au backtest). Ce `candle.time` (décalé) était aussi utilisé pour le contrôle du garde-fou (`canTakeNewTrade(candle.time)`), alors que TOUTES les autres entrées du même `GuardrailEngine` (un vrai remplissage via `recordTrade(Date.now())`, le rejeu au boot via `_loadClosedDeals` avec le vrai timestamp du courtier, le dashboard via `getStatus()`) utilisent l'heure réelle non décalée.

**Conséquence** : `GuardrailEngine._ensureDay()` réinitialise silencieusement `this.trades = []` dès qu'une incohérence de date est détectée. Entre 00h00 et 05h00 UTC chaque jour (la fenêtre où le décalage de -5h fait tomber sur la veille), CHAQUE bougie en direct faisait basculer la clé de jour entre "hier" (décalé) et "aujourd'hui" (réel) à chaque appel — effaçant en continu le compteur de trades du jour ET la protection anti-revenge-trading (cooldown après perte) pendant ~5h par jour, tous les jours, depuis que ce mécanisme existe. Un bug de sécurité réel, jamais détecté avant ce soir faute de surveillance active à ce moment précis de la journée.

**Fix** : nouveau paramètre explicite `guardrailNow`, enfilé à travers `ingestCandle()` → chaque `_detect*Signal()` → chaque `_process*()`/`_blockReason()`, avec valeur par défaut `= candle.time` (donc TOUS les tests existants, le warm-up, et tout futur backtest restent identiques au bit près — seul le point d'appel EN DIRECT (`cTraderDataSource.js`/`matchTraderDataSource.js`) le remplace explicitement par `Date.now()`).

**2 nouveaux tests de régression** dans `test/liveStrategyEngine.test.js` : un qui confirme que le cooldown survit au décalage quand `guardrailNow` est fourni, et un second qui **reproduit volontairement le bug** (sans `guardrailNow`) pour prouver que le test précédent teste vraiment quelque chose de réel.

`npm test` : 427/427 (425 + 2 nouveaux).

**Fichiers** : `src/liveStrategyEngine.js`, `src/dataSources/cTraderDataSource.js`, `src/dataSources/matchTraderDataSource.js`, `test/liveStrategyEngine.test.js`.

## À DISCUTER LA PROCHAINE SESSION : les 2 journaux ne concordent pas (17% vs 0% de réussite) — 2026-09-14

Esdras a remarqué une vraie contradiction sur le dashboard (screenshot) : pour les mêmes 6 trades BTCUSD,
- **"Journal durable par instrument"** (persisté en Supabase) affiche **17% (1G/5P), -2.00R**
- **"Journal de trading"** (interroge cTrader en direct, celui corrigé ce soir pour le bug Invalid Date/faux P&L) affiche **0% (0/6), -4.77$**

Demande explicite : **garder ça pour en discuter la prochaine session, pas le corriger ce soir.**

**Cause précise identifiée** (pas juste une supposition — code lu) : `cTraderDataSource.js`'s `_logTradeOutcomes()` (ligne ~1288) écrit dans le journal durable Supabase un `outcome` ('win'/'loss') qui vient de `e.outcome`, produit par la résolution INTERNE du moteur (`_resolveOpenPosition` dans `liveStrategyEngine.js` — sa propre simulation "le stop ou la cible a-t-il été touché" contre les plus hauts/plus bas des bougies), **PAS le résultat réel confirmé par le courtier**. C'est exactement le même thème que tout le reste de cette session (croyance du moteur vs confirmation réelle) — sauf que cette fois c'est le JOURNAL DURABLE (pas juste l'affichage "position ouverte") qui se base sur la croyance plutôt que la réalité. Le "Journal de trading" (cTrader en direct, `dealPairing.js`), lui, utilise le vrai P&L réalisé du courtier — d'où l'écart : slippage, spread, ou une clôture réelle légèrement différente du niveau simulé peuvent faire diverger les deux.

**Question à trancher la prochaine session** : est-ce que le journal durable devrait plutôt enregistrer le résultat RÉEL confirmé (comme `dealPairing.js` le fait), ou les deux ont-ils leur utilité propre (croyance du moteur vs réalité du courtier) et il faut juste les étiqueter plus clairement pour ne pas prêter à confusion ?

**Fichiers concernés** : `src/dataSources/cTraderDataSource.js` (`_logTradeOutcomes`), `src/liveStrategyEngine.js` (`_resolveOpenPosition`), `src/dataSources/supabaseTradeLog.js`, `src/backtest/recentPerformanceReport.js`, `src/dataSources/dealPairing.js` (pour comparaison).

## À DÉCIDER LA PROCHAINE SESSION : 2 protections quotidiennes qui supposent (à tort) un process qui ne redémarre jamais — 2026-09-14, trouvé en surveillance continue

Deux constats distincts, trouvés en observant le bot tourner toute la nuit (`BTCUSD` M1, symbole temporaire, sert justement à révéler ce genre de choses vite). **Aucun des deux n'a été corrigé** — décision à prendre avec Esdras, pas prise seule, même famille de sujet ("une protection qui suppose que rien ne redémarre jamais").

**1) Gap de double-position (netting)** — ~~vu 2 fois (02h00 sens opposés, 09h11 même sens)~~. **CORRIGÉ cette nuit, voir l'entrée dédiée ci-dessous.**

**2) `GuardrailEngine` semblait ne pas survivre à un redémarrage** — ~~constat initial (imprécis, corrigé ci-dessous~~) : `tradesToday` retombait à 0 après un redémarrage malgré des trades réels plus tôt le même jour. **CORRIGÉ cette nuit** — la reconstruction depuis l'historique réel existait déjà (`_loadClosedDeals`, ajoutée plus tôt cette nuit), le vrai bug était un problème d'ordre de rejeu, pas une absence totale de persistance.

**Fichiers concernés** : `src/engines/guardrailEngine.js`, `src/liveStrategyEngine.js`, `src/dataSources/cTraderDataSource.js` (`_clearStaleBeliefsAgainstBroker`, `_loadClosedDeals`, point d'appel `/api/admin/restart`).

## RÉSOLU : le gap de double-position (netting) — croyance libérée avant la fermeture réelle — 2026-09-14

Esdras, après avoir vu le résumé du fix garde-fou : "Le netting. Il ya une modifications faire?" → "Oui" pour que je m'y attaque maintenant. Vérifié avant de commencer que l'autre session en parallèle n'avait pas déjà touché à ce fichier pour ce sujet (aucun commit correspondant).

**Rappel de la cause** (déjà identifiée cette nuit, voir plus haut) : `_resolveOpenPosition()` détecte "stop/cible/timeout touché" à partir des plus hauts/bas de bougie — une SIMULATION, comme le backtest. En direct, ce déclenchement simulé peut arriver AVANT que le vrai ordre stop/cible chez le courtier ne se remplisse réellement (un remplissage réel a pris jusqu'à ~10s cette nuit). L'ancien code supprimait `openPositions` immédiatement sur ce déclenchement simulé — le netting voyait alors le symbole comme libre et laissait un nouveau signal ouvrir une 2e position réelle par-dessus la 1ère, encore ouverte chez le courtier.

**Fix en 2 parties** :

1. **`deferCloseToRealConfirmation`** (nouvelle option, opt-in, `ingestCandle`/`_resolveOpenPosition`, défaut `false`) — `_resolveOpenPosition` détecte toujours le déclenchement simulé et émet toujours l'événement `'closed'` (informationnel - log de signaux/notifs, PAS le journal durable qui utilise déjà le vrai P&L du courtier), mais ne supprime plus `openPositions` : elle pose juste `awaitingRealClose: true` sur la croyance et s'arrête de la re-vérifier. Seule la confirmation RÉELLE (`clearBelievedPosition`, appelée par `_handleExecutionEvent` sur une vraie fermeture confirmée, déjà en place depuis cette nuit) retire la croyance — le netting reste donc bloqué jusque-là. Option opt-in car warm-up/backtests/tous les tests existants n'ont aucune boucle de confirmation réelle pour un jour libérer une croyance différée — l'activer là-bas la bloquerait pour de bon plutôt que de corriger quoi que ce soit. Seul le point d'appel EN DIRECT de `cTraderDataSource.js` l'active ; `matchTraderDataSource.js` (compte CTI, pas encore de boucle de confirmation réelle) reste inchangé délibérément.
2. **Filet de sécurité** — nouveau `setInterval` (5 min, `cTraderDataSource.js`, nettoyé dans `stop()`) qui refait tourner `_clearStaleBeliefsAgainstBroker` (déjà utilisée au boot) pendant que le compte tourne, pas juste une fois au démarrage. Si jamais un événement de fermeture réelle est raté (déconnexion au mauvais moment), une croyance différée qui ne correspond plus à rien de réel (ni position, ni ordre en attente) se corrige seule en quelques minutes plutôt que de rester bloquée jusqu'au prochain redémarrage.

**Effet de bord découvert et corrigé en même temps** : `_maybeRequestPyramid` (pyramidage, désactivé par défaut) tourne juste après `_resolveOpenPosition` sur la MÊME bougie — avec l'ancien code, la croyance étant déjà supprimée, `_maybeRequestPyramid` ne trouvait plus rien et s'arrêtait naturellement. En la laissant dans la map (différée), elle aurait pu déclencher une demande de pyramidage sur une position qui vient tout juste de se fermer (simulé). Corrigé par une garde `if (open.awaitingRealClose) return;`.

**7 nouveaux tests** dans `test/liveStrategyEngine.test.js` — 3 couvrent le comportement inchangé par défaut (warm-up/backtest), le blocage netting effectif avec `deferCloseToRealConfirmation:true`, et la libération correcte une fois `clearBelievedPosition` appelé ; 1 couvre spécifiquement la garde pyramide. Séquences de bougies vérifiées empiriquement (pas juste à la main) pour éviter qu'une bougie tampon ne forme accidentellement un gap parasite avec une bougie précédente.

`npm test` : 439/439.

**Fichiers** : `src/liveStrategyEngine.js` (`ingestCandle`, `_resolveOpenPosition`, `_maybeRequestPyramid`), `src/dataSources/cTraderDataSource.js` (point d'appel live + sweep périodique + `stop()`), `test/liveStrategyEngine.test.js`.

## RÉSOLU : le rejeu des trades réels au boot pouvait effacer le compteur du jour si l'ordre n'était pas chronologique — 2026-09-14

Suite du point 2 ci-dessus. Avant de corriger, vérifié que l'autre session (en parallèle cette nuit) n'avait pas déjà touché ni au netting (point 1) ni au garde-fou — aucun commit correspondant dans son historique.

**Le vrai bug, trouvé en lisant le code (pas juste supposé)** : `_loadClosedDeals()` (`cTraderDataSource.js`) appelle bien `store.guardrail.recordTrade(...)` pour chaque deal réel clôturé dans les dernières 24h au démarrage — cette reconstruction existe depuis plus tôt cette nuit, contrairement à ce que mon constat précédent affirmait (recherche trop limitée à `guardrailEngine.js` seul, sans vérifier ses appelants ailleurs dans le code). Le vrai problème : `res.deal` (réponse de `ProtoOADealListReq`) n'a jamais de garantie d'ordre chronologique, et `GuardrailEngine._ensureDay()` **vide `this.trades`** à chaque fois que la clé du jour calculée change — comportement correct pour un flux réel en direct (toujours croissant dans le temps), mais dangereux pour un rejeu historique en lot : la fenêtre de 24h traverse presque toujours deux jours calendaires (tout redémarrage après 00h00 UTC récupère une partie de la veille). Si un seul deal "d'hier" apparaît hors-ordre entre deux deals "d'aujourd'hui" pendant le rejeu, `_ensureDay()` fait basculer la clé du jour en arrière puis en avant à nouveau — effaçant silencieusement les trades du jour déjà enregistrés. Confirmé cohérent avec l'observation en direct : des trades de test réels (`/admin/test-order-cycle`) avaient eu lieu la veille au soir (22h43-22h56 UTC), dans la fenêtre de 24h de plusieurs redémarrages de cette nuit.

**Fix** : nouvelle fonction pure `sortDealsChronologically(deals)` (triée par `executionTimestamp`, coercée en nombre — encore un champ sérialisé en string chez ce courtier) dans `cTraderDataSource.js`, appliquée avant la boucle de rejeu dans `_loadClosedDeals()`. `GuardrailEngine` lui-même n'a pas changé — son comportement est correct pour son usage réel prévu, seul l'appelant devait garantir l'ordre.

**4 nouveaux tests** dans `test/cTraderDataSource.test.js` (tri croissant, tri numérique correct malgré les timestamps en string, entrée vide/absente sûre, pas de mutation de l'entrée) + **2 nouveaux tests** dans `test/guardrailEngine.test.js` qui reproduisent le bug exact au niveau de `GuardrailEngine` (rejeu hors-ordre = seulement 1 trade compté sur 3) puis prouvent que le même rejeu trié compte bien les 3.

`npm test` : 435/435.

**Fichiers** : `src/dataSources/cTraderDataSource.js` (`sortDealsChronologically`, `_loadClosedDeals`), `test/cTraderDataSource.test.js`, `test/guardrailEngine.test.js`.

## RÉSOLU (la vraie cause complète, cette fois vérifiée en direct) : le warm-up écrasait le rejeu des trades réels, à chaque démarrage, depuis toujours — 2026-09-14

Esdras : "Alors ? Tout se passe bien ?" — en vérifiant le fix ci-dessus EN DIRECT (pas juste via les tests), `/api/status` montrait toujours `tradesToday:0` quelques secondes après un redémarrage, alors que le tout nouveau log de démarrage confirmait "replayed 16 real closed deal(s)... tradesToday=12" au moment précis du rejeu. Le fix du tri (ci-dessus) est réel et nécessaire, mais **insuffisant seul** — voici pourquoi, trouvé en lisant le code, pas juste supposé après avoir rejoué les 16 vrais deals via `sortDealsChronologically` + `GuardrailEngine` en isolation (résultat : `tradesToday:12`, comportement correct confirmé) puis en cherchant pourquoi la prod ne montrait pas ce même résultat quelques secondes plus tard.

**La vraie cause** : `warmUp()` (rejeu de MILLIERS de vraies bougies historiques par symbole — 90 jours de M15, ~2 jours de M1 pour BTCUSD — à CHAQUE démarrage) partage le MÊME `LiveStrategyEngine`/`GuardrailEngine` que la production réelle. Le chemin de détection de signal du warm-up appelle `GuardrailEngine.canTakeNewTrade(candle.time)` pour sa propre logique interne de netting/blocage — avec le VRAI timestamp historique (ancien) de chaque bougie candidate, par conception (le warm-up a besoin de sa propre cohérence de "jour" au fil de son rejeu du passé). Le problème : `canTakeNewTrade()` a l'air d'une simple lecture, mais elle appelle `_ensureDay()`, qui **vide `this.trades` sans condition** dès que la clé du jour calculée change — et un rejeu de 90 jours d'historique traverse forcément des dizaines de frontières de jour. Résultat : n'importe quel trade réel que `_loadClosedDeals()` venait de recharger (peu importe qu'il soit maintenant correctement trié) se faisait effacer à la POM du warm-up dès sa première bougie candidate franchissant un jour différent — silencieusement, puisque le warm-up retombe naturellement sur "aujourd'hui" à la toute fin de son rejeu (il rejoue toujours jusqu'à "maintenant"), donc le tableau de bord affichait bien le BON jour (`dayKey` correct) mais `tradesToday` retombé à 0 quel que soit le nombre de vrais trades survenus.

**Pourquoi ça n'avait jamais marché, même avant cette nuit** : `_loadClosedDeals()` (ajoutée par l'autre session plus tôt cette nuit) s'exécutait AVANT `_subscribeLiveCandles()` (qui déclenche le warm-up) dans `start()` — donc cette reconstruction n'a probablement JAMAIS eu d'effet observable depuis sa création, écrasée à chaque fois par le warm-up qui suit immédiatement après. Le fix du tri (entrée précédente) était un vrai bug corrigé, mais son effet restait invisible tant que cet ordre n'était pas aussi corrigé.

**Fix** : `_loadClosedDeals()` s'exécute maintenant APRÈS `_subscribeLiveCandles()` (donc après le warm-up complet de tous les symboles), juste avant `_clearStaleBeliefsAgainstBroker()` — dernière chose à toucher le garde-fou avant que le compte passe en direct, plus rien ensuite pour le perturber. `GuardrailEngine` lui-même n'a pas changé (son comportement est correct pour son usage réel) — seul l'ORDRE de démarrage devait changer.

**2 nouveaux tests** dans `test/guardrailEngine.test.js` : un qui reproduit exactement ce mécanisme (des trades réels correctement enregistrés se font effacer par un simple appel `canTakeNewTrade()` avec un temps historique ancien, comme le ferait le warm-up), et un qui prouve que l'ordre inverse (warm-up d'abord, rejeu réel ensuite) protège les trades.

**Vérifié en direct, CONFIRMÉ** : après déploiement de ce fix, `/api/status` montre `tradesToday:12` toujours correct 44 secondes après le redémarrage (`uptimeSec:44`) — plus d'écrasement par le warm-up. Les deux points de cette nuit (garde-fou + netting) sont maintenant réellement réglés, pas juste en apparence.

`npm test` : 441/441.

**Fichiers** : `src/dataSources/cTraderDataSource.js` (`start()` — ordre de `_loadClosedDeals()`), `test/guardrailEngine.test.js`.

## CTI/Match-Trader (`cti-freetrial`) : bloqué par un vrai challenge anti-bot Cloudflare, pas un problème d'identifiants — 2026-09-14

Première tentative de connexion RÉELLE au compte Match-Trader de City Traders Imperium (`cti-freetrial`, compte Supabase dynamique via `/accounts.html`) cette nuit. Progrès factuels, dans l'ordre :

1. Identifiants confirmés valides et bien enregistrés (email/mot de passe/`brokerId`="1"/`systemUuid`/`platformUrl` — voir `src/dataSources/supabaseAccountStore.js`, `bot_accounts` table, projet Supabase "Chfproject" `kioidzisoqnejfamsetv`).
2. `matchTraderDataSource.js`'s `_login()` tapait `${baseUrl}/manager/co-login` (deviné depuis la doc PDF du Platform API) → HTTP 403. Esdras a retrouvé dans son navigateur (DevTools Network) la vraie requête POST que le site de CTI envoie lui-même : `https://platform.citytradersimperium.com/mtr-core-edge/v2/login` (200 côté navigateur). Corrigé (commit `e2036cf`) — **toujours 403** après correction.
3. Ajout d'un log du corps de la réponse 403 (commit `2fb16c8`) pour trancher : mauvais identifiants, ou autre chose ? Réponse obtenue : **une vraie page de challenge Cloudflare** (`<title>Just a moment...</title>`, `challenges.cloudflare.com` dans la CSP) — PAS un rejet API. CTI protège cette route de connexion avec Cloudflare Bot Management, qui exige l'exécution de JavaScript dans un vrai navigateur. Un `fetch()` serveur-à-serveur ne peut structurellement pas passer ce challenge, quels que soient l'URL/les headers/les identifiants utilisés.

**Conclusion** : ce n'est pas un bug à corriger par un ajustement de code classique — c'est un blocage d'architecture. Deux pistes proposées à Esdras, aucune commencée :
1. **Demander à Esdras de contacter le support CTI** pour un accès API/EA dédié au trading algorithmique (distinct du login web) — le chemin le plus propre s'il existe, coût nul, à tenter en premier.
2. **Navigateur headless (Playwright, déjà dispo dans l'environnement de dev)** qui se connecte réellement, résout le challenge comme un vrai navigateur, récupère les cookies de session pour les réutiliser côté bot — plus lourd (ajouter Chromium au déploiement Render, gérer le rafraîchissement périodique), fragile face à un changement du challenge Cloudflare côté CTI, mais faisable et indépendant du support CTI.

Esdras a refusé explicitement l'option "laisser CTI de côté" ("si je fais ça, je ne pourrai participer à aucun challenge") — CTI reste la priorité, pas une option secondaire. Session suivante : reprendre sur l'option 2 (headless) pendant qu'Esdras avance sur l'option 1 de son côté, sauf si elle dit avoir eu une réponse du support CTI entre-temps.

**Fichiers concernés** : `src/dataSources/matchTraderDataSource.js` (`_login`, `_refreshAuth` — probablement le même problème là-bas, jamais atteint), `src/dataSources/supabaseAccountStore.js`, `public/accounts.html`.

## Patterns de bougies classiques (Morning/Evening Star, Doji Star) testés et rejetés — 2026-09-15

Esdras, après une journée calme sans signal validé sur les 4 stratégies déjà en prod : "pour l'or, pourquoi pas des patterns connus? Comme diament, etoile etc?" — deux idées proposées (étoile, diamant), une seule retenue pour être codée : le pattern "diamant" (sommet/creux) a été explicitement écarté avant même d'écrire du code, car il exige plusieurs paramètres subjectifs de détection de pics/creux (fenêtre, tolérance) choisis avant de voir un résultat — exactement le genre de surface de paramètres libres que ce projet évite partout ailleurs. Le pattern étoile, lui, est une simple relation OHLC sur 3 bougies (pas de fenêtre à choisir), donc testable proprement.

**Méthode** (`src/backtest/starPatterns.js`, 11 tests unitaires) : définitions textbook (Bulkowski, Investopedia), pas inventées — Morning Star = bougie 1 baissière à corps réel, bougie 2 "étoile" (corps ≤ 30% du corps de la bougie 1), bougie 3 haussière refermant au-delà du milieu du corps de la bougie 1 ; Evening Star = miroir exact. Adaptation documentée pour du M15 intrajournalier (les patterns textbook supposent un vrai gap entre bougies, rare en intrabougie sur forex/CFD M15) : l'exigence de gap est assouplie en "le corps de la bougie 2 reste majoritairement hors du corps de la bougie 1". Entrée à l'ouverture de la bougie après la confirmation, stop au-delà de l'extrême des 3 bougies, cible fixe 1:3, timeout 480 bougies M15 — mêmes conventions que NWOG/Judas Swing. Deux variantes testées : Star (large) et Doji Star (bougie 2 doit aussi être un vrai doji, corps ≤ 10% de sa propre amplitude) — les deux seuils sont des seuils textbook standards, fixés avant de lancer quoi que ce soit sur les données de ce projet.

**Résultat : rejeté partout, sans ambiguïté** — testé sur les 6 instruments disponibles (pas seulement l'or, même discipline que partout ailleurs) :

| Variante | US100 | US500 | XAUUSD | EURUSD | GBPUSD | USDJPY |
|---|---|---|---|---|---|---|
| Star | ⚠️ affaibli (train -0.06R, test +0.02R) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Doji Star | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

11 des 12 cellules testées rejetées franchement (espérance négative des deux côtés train/test), la seule exception (US100/Star) n'est qu'un train déjà négatif avec un test à peine positif (+0.02R) — pas un edge, un artefact de bruit. XAUUSD (la question initiale d'Esdras) : rejeté dans les deux variantes (-0.05R/-0.08R pour Star, -0.04R/-0.04R pour Doji Star). Confirme empiriquement le consensus académique déjà évoqué avant de coder (les patterns de bougies classiques ont un edge faible ou nul sur des marchés liquides une fois les coûts réels comptés) — vérifié plutôt que supposé.

`npm test` : 459/459.

**Fichiers** : `src/backtest/starPatterns.js` (nouveau), `test/starPatterns.test.js` (nouveau), `scripts/runStarPatternsStrategyAnalysis.js` (nouveau), `data/backtest-input/star-patterns-strategy-analysis.md` (nouveau, rapport complet).

## USDCAD — 7e instrument, données réelles fournies par Esdras, 13 mécanismes déjà testés étendus — 2026-09-15

Esdras a demandé "autre strategy exploitable" après le rejet des patterns étoile, puis a fourni directement les vraies données HistData.com M1 USDCAD (2010-2018, 2020-2025 — 2019 manquant) sous forme de fichiers .zip officiels, plutôt que d'inventer une 26e idée de mécanisme (risque de comparaisons multiples déjà signalé). Converti en M15 via `scripts/convertHistData.js` déjà existant (5 387 922 bougies M1 → 369 937 bougies M15) : `data/backtest-input/USDCAD.csv`. Spread indicatif ajouté (`transactionCosts.js`) : 0.00015 (~1.5 pips, convention GBPUSD — paire majeure, jamais confirmé contre un vrai spread courtier, même réserve que partout ailleurs).

**Méthode : même discipline que l'extension USDJPY/GBPUSD (2026-09-11/12)** — aucun nouveau réglage, seulement l'ajout de `'USDCAD'` aux tableaux `SYMBOLS` déjà existants de 13 scripts qui utilisent une définition mécanique FIXE (pas de réglage par instrument) : Judas Swing, NWOG, NDOG, Breaker Block, Asian Range Breakout, Asian Range Fade, Weekly Liquidity Sweep, MACD Trend, DMI Trend, RSI Divergence classique, Gap Continuation, Unicorn Model, Star Patterns (+ Doji Star). Paramètres de chaque mécanisme déjà fixés AVANT de voir un seul résultat USDCAD — aucun nouveau code de stratégie écrit pour cette paire spécifiquement.

**Résultat (espérance R, train 2019-2023 / test 2024-2025)** :

| Mécanisme | Train | Test | Verdict |
|---|---|---|---|
| Asian Range Breakout | -0.17 | -0.15 | ❌ |
| Asian Range Fade | -0.25 | -0.36 | ❌ |
| Breaker Block | -0.14 | -0.43 | ❌ |
| DMI Trend | 0.06 (n=53) | -0.57 (n=9) | ❓ pas assez de trades |
| Gap Continuation (quotidien) | -0.10 | -1.24 (n=1) | ❓ pas assez de trades |
| Gap Continuation (hebdo) | -0.44 | -0.70 | ❌ |
| Judas Swing | -0.21 | -0.17 | ❌ |
| MACD Trend | -0.08 | -0.28 | ❌ |
| NDOG | -0.13 | — (n=0) | ❓ pas assez de trades |
| NWOG | -0.09 | +0.12 (n=48) | ⚠️ affaibli |
| RSI Divergence classique | -0.02 (n=60) | -0.43 (n=13) | ❓ pas assez de trades |
| Star | -0.24 | -0.16 | ❌ |
| Doji Star | -0.23 | -0.05 | ❌ |
| Unicorn Model | -0.10 | -0.22 | ❌ |
| Weekly Liquidity Sweep | -0.08 | +0.01 (n=64) | ⚠️ affaibli |

**13 mécanismes testés, aucun edge net** — rejeté franchement sur la majorité, les deux seules exceptions (NWOG, Weekly Liquidity Sweep) sont "affaiblies" avec la même marge minuscule déjà vue sur d'autres paires (train légèrement négatif, test à peine positif sur un petit échantillon) — même signature "bruit" déjà traitée comme telle partout ailleurs dans ce document, pas un edge. **Conclusion cohérente avec GBPUSD (déjà abandonné après 11 mécanismes) : USDCAD ne montre pas non plus d'edge exploitable avec cet ensemble de mécanismes déjà validés ailleurs.**

**Volontairement PAS testé dans cette session** : le combo FVG filtré réellement en production (celui qui marche sur US100/US500/XAUUSD) n'a PAS été étendu à USDCAD — contrairement aux 13 mécanismes ci-dessus (une seule définition mécanique fixe partout), le combo FVG est spécifiquement RÉGLÉ par instrument (quel biais H4/H1/EMA, quelle fenêtre de session) et cette configuration a elle-même demandé une vraie recherche pour chaque instrument existant. L'appliquer à USDCAD sans ce même travail de découverte reviendrait à choisir une config au hasard — le genre de raccourci que ce projet évite. Piste réellement ouverte pour une session future si Esdras veut aller plus loin sur USDCAD spécifiquement, mais un chantier séparé, pas une extension à une ligne de code.

`npm test` : 459/459 (inchangé — aucun test ne couvre ces scripts d'analyse ad hoc, convention déjà établie).

**Fichiers** : `data/backtest-input/USDCAD.csv` (nouveau, converti depuis les fichiers HistData fournis par Esdras), `src/backtest/transactionCosts.js` (+`USDCAD`), 13 scripts `scripts/run*StrategyAnalysis.js` (SYMBOLS étendu), 13 rapports `data/backtest-input/*-strategy-analysis.md` régénérés (ligne USDCAD ajoutée, résultats des 6 autres instruments inchangés).

## GER40 (DAX, 8e instrument) — premier signal vraiment prometteur depuis longtemps, mais 2 des 6 "tient" sont des pièges de biais haussier — 2026-09-15

Suite directe du constat "aucune paire forex ne tient" (USDCAD inclus) : recommandation de changer de CATÉGORIE plutôt que de paire — les deux seuls edges réels de ce projet (FVG, Divergence) sont tous les deux sur des INDICES (US100/US500), aucune paire forex testée n'a jamais rien donné de solide. Esdras a fourni les vraies données HistData.com GRXEUR M1 (2010-2025, 16 ans complets) — le DAX allemand, l'indice le plus proche d'US100/US500 disponible sur HistData (pas de Dow Jones/US30 sur leur catalogue). Converti en M15 (3 525 775 bougies M1 → 243 849 bougies M15) : `data/backtest-input/GER40.csv`. Spread indicatif ajouté : 1.0 point (convention US100).

**Mêmes 13 mécanismes déjà testés sur USDCAD (aucun nouveau réglage) étendus à GER40 — résultat spectaculairement différent de toutes les paires forex** : 6 mécanismes sur 13 passent la règle de verdict "✅ tient" (train ET test positifs, test ≥ 30% du train) — Asian Range Breakout, Asian Range Fade, Breaker Block, NWOG, Unicorn Model, Weekly Liquidity Sweep. Sur aucun autre instrument testé dans ce projet (US100/US500/XAUUSD/EURUSD/GBPUSD/USDJPY/USDCAD), plus d'1 ou 2 mécanismes n'avaient jamais passé cette barre en même temps.

**Vérification immédiate avant de s'emballer (même réflexe que la fragilité USDJPY démasquée plus haut dans ce document)** : Asian Range Breakout ET Asian Range Fade — littéralement les deux sens OPPOSÉS du même setup — passent TOUS LES DEUX. Un signal d'alarme classique : si la continuation ET le retournement du même niveau sont "gagnants", c'est probablement le marché qui monte en général, pas le mécanisme qui capte un vrai edge. Vérifié directement (répartition achat/vente sur tout l'historique 2010-2025) :

| Mécanisme | Achat (n / espérance) | Vente (n / espérance) | Verdict |
|---|---|---|---|
| Asian Range Breakout | 331 / **+0.29R** | 283 / **+0.01R** | ❌ **piège de biais haussier confirmé** — 96% du profit total vient des achats seuls |
| Breaker Block | 686 / +0.13R | 705 / +0.04R | ⚠️ partiellement biaisé (78% du profit vient des achats), plus faible que ça en paraît |
| Weekly Liquidity Sweep | 285 / +0.14R | 364 / **+0.19R** | ✅ **vraiment bidirectionnel** — la vente est même légèrement meilleure que l'achat |

**Weekly Liquidity Sweep passe un 2e contrôle de robustesse** (même type de vérification qui avait démasqué la fragilité USDJPY) — répartition année par année sur tout l'historique (2010-2025, n=649 au total) : positif 12 années sur 16 (2010,11,12,14,17,18,19,20,24,25), négatif seulement 2021-2023 (3 années consécutives, -0.10 à -0.53R), reprise en 2024-2025. Pas concentré dans une seule fenêtre chanceuse comme l'était le faux "tient" d'USDJPY — un vrai profil de robustesse, pas une coïncidence.

**Conclusion actuelle, prudente** : **Weekly Liquidity Sweep sur GER40 est le candidat le plus crédible trouvé depuis longtemps dans ce projet** — passe le verdict formel, bidirectionnel, robuste dans le temps. Asian Range Breakout est un vrai rejet malgré son "✅ tient" apparent (biais haussier démasqué). Breaker Block est à traiter avec méfiance (biaisé mais pas autant qu'Asian Range Breakout). NWOG, Unicorn Model et Asian Range Fade **n'ont PAS encore reçu le même contrôle de robustesse** — passent la règle formelle mais pas encore vérifiés en profondeur, à ne pas prendre pour argent comptant avant de le faire. **Rien recommandé pour du capital réel à ce stade** (même réserve épistémique que partout : un seul découpage train/test, jamais testé en direct) — mais Weekly Liquidity Sweep/GER40 mérite clairement une suite (forward-test démo, ou au minimum les mêmes contrôles de robustesse que ceux déjà faits pour le multi-contact US100).

`npm test` : 459/459 (inchangé).

**Fichiers** : `data/backtest-input/GER40.csv` (nouveau, converti depuis les fichiers HistData fournis par Esdras), `src/backtest/transactionCosts.js` (+`GER40`), 13 scripts `scripts/run*StrategyAnalysis.js` (SYMBOLS étendu), 13 rapports `data/backtest-input/*-strategy-analysis.md` régénérés (ligne GER40 ajoutée, résultats des 7 autres instruments inchangés). Vérifications de robustesse (répartition achat/vente, répartition annuelle) faites en scripts ad hoc, non committées (à refaire proprement si on va plus loin sur ce candidat).

## GER40 — contrôle de robustesse des 3 mécanismes restants (NWOG, Unicorn Model, Asian Range Fade) — 2026-09-15

Suite demandée par Esdras ("Oui" après proposition explicite) : appliquer le même contrôle répartition achat/vente + année par année aux 3 mécanismes qui passaient le verdict formel sur GER40 mais n'avaient pas encore été vérifiés.

| Mécanisme | Achat (n / totalR) | Vente (n / totalR) | Part achat du profit total | Verdict |
|---|---|---|---|---|
| NWOG | 255 / +25.21R | 263 / +25.03R | 50% | ✅ **vraiment bidirectionnel** |
| Unicorn Model | 524 / +69.41R | 550 / **-5.19R** | 108% (vente légèrement négative) | ❌ **piège de biais haussier** |
| Asian Range Fade | 398 / +78.83R | 457 / **-47.42R** | 251% (vente franchement négative) | ❌ **piège de biais haussier confirmé** |

**Unicorn Model et Asian Range Fade rejetés** malgré leur "✅ tient" formel : dans les deux cas, la vente est nette négative sur tout l'historique (achat qui compense/dépasse une vente perdante) — exactement le même piège déjà démasqué sur Asian Range Breakout. Asian Range Fade a en plus une bizarrerie structurelle notée en passant : aucun trade signalé avant 2018 sur cet historique 2010-2025 (à creuser si ce mécanisme est repris un jour, mais sans incidence sur le verdict de rejet ici).

**NWOG passe le contrôle** : répartition quasi parfaitement 50/50 achat/vente (25.21R vs 25.03R), positif 10 années sur 16 (2010,13,14,15,18,19,21,23,24,25 ; négatif 2011,12,16,17,20,22). Un peu moins régulier que Weekly Liquidity Sweep (12/16), et 2025 à lui seul représente environ 45% du profit net cumulé (22.57R sur ~50R net) — à surveiller, sans être aussi concentré qu'un faux signal type USDJPY (les autres années positives restent significatives, pas un seul point qui porte tout).

**Conclusion mise à jour** : **deux candidats crédibles sur GER40 maintenant** — Weekly Liquidity Sweep (le plus solide : bidirectionnel, 12/16 années positives) et NWOG (bidirectionnel, 10/16 années positives, mais 2025 anormalement fort à surveiller). Asian Range Breakout, Unicorn Model et Asian Range Fade sont tous les trois désormais rejetés comme pièges de biais haussier malgré leur verdict formel "✅ tient". Breaker Block reste dans la zone grise (partiellement biaisé, ni rejeté ni validé). **Toujours rien recommandé pour du capital réel** — prochaine étape logique si on continue : forward-test démo de Weekly Liquidity Sweep et/ou NWOG sur GER40.

`npm test` : 459/459 (inchangé). Script de vérification ad hoc, non committé (même convention que le contrôle précédent).

## GER40 — validation "walk-forward" par blocs de 2 ans : NWOG rétrogradé, Weekly Liquidity Sweep confirmé seul candidat robuste — 2026-09-15

Esdras, invitée à choisir entre (a) creuser la validation statistique, (b) construire l'infra de trading live pour GER40, ou (c) vérifier Breaker Block, a choisi (a) — rester en recherche avant toute idée de déploiement. Les deux mécanismes (NWOG, Weekly Liquidity Sweep) sont des définitions mécaniques FIXES, sans paramètre à ajuster — pas de vrai "walk-forward" au sens optimisation, donc l'interprétation retenue : découper l'historique en blocs de 2 ans (plus fin que le découpage annuel déjà fait, assez large pour rester lisible) et vérifier que l'edge tient sur CHAQUE fenêtre, pas seulement en moyenne — plus un contrôle de sensibilité (retirer la meilleure année et revérifier l'espérance).

| | NWOG | Weekly Liquidity Sweep |
|---|---|---|
| Blocs de 2 ans nets positifs | **3/8** (2014-15, 2018-19, 2024-25) | **6/8** (tout sauf 2020-21, 2022-23) |
| Meilleure année seule | 2025 : +22.57R (**45%** du profit net total) | 2014 : +24.10R (22% du profit net total) |
| Espérance en retirant la meilleure année | 0.10R → **0.06R** (totalR 50.24 → 27.67, quasi divisé par 2) | 0.17R → 0.14R (totalR 108.67 → 84.56, à peine affecté) |

**NWOG rétrogradé.** Le contrôle achat/vente (50/50) disait "bidirectionnel", mais ce contrôle-là ne protège pas contre un profil dans le TEMPS — exactement la distinction déjà vue avec USDJPY (bidirectionnel n'égale pas robuste). À la granularité 2 ans, NWOG n'est net positif que sur 3 fenêtres sur 8 : deux bonnes périodes (2014-15, 2018-19) et surtout la toute dernière (2024-25, portée presque entièrement par 2025) séparées par de longues zones plates ou négatives (2010-11, 2016-17, 2020-21, 2022-23). Sans 2025, l'espérance est quasiment divisée par deux. Ce n'est pas un rejet aussi net qu'Asian Range Breakout/Unicorn Model/Asian Range Fade (il reste positif même sans sa meilleure année), mais ce n'est plus un "candidat crédible" — trop concentré pour être présenté comme tel.

**Weekly Liquidity Sweep confirmé.** 6 blocs de 2 ans sur 8 nets positifs, faiblesse limitée aux deux blocs déjà identifiés (2020-21, 2022-23) — cohérent avec le contrôle année par année précédent. Retirer sa meilleure année (2014, 22% du total) laisse l'espérance et le totalR quasiment intacts (0.17R→0.14R, 108.67R→84.56R) : l'edge n'est pas porté par une seule fenêtre chanceuse.

**Conclusion finale sur GER40 (cette session) : un seul candidat vraiment crédible — Weekly Liquidity Sweep.** NWOG passe le verdict formel et le contrôle achat/vente, mais pas le contrôle de concentration temporelle — à ne plus présenter comme un second candidat sans creuser davantage (ou tout simplement le laisser de côté). Asian Range Breakout, Unicorn Model, Asian Range Fade restent rejetés (biais haussier). Breaker Block toujours en zone grise, non revérifié cette session. **Toujours rien recommandé pour du capital réel ni pour un déploiement démo** — Esdras a explicitement choisi de ne pas construire l'infra live tant que la recherche n'est pas plus solide.

`npm test` : 459/459 (inchangé). Script de vérification ad hoc, non committé.

## Weekly Liquidity Sweep sur US100/US500 (déjà en production live) — même contrôle appliqué, résultat très différent de GER40 — 2026-09-15

Esdras a demandé si on pouvait "coder" Weekly Liquidity Sweep. Avant de répondre, relecture du tableau complet à 8 instruments (déjà généré, jamais entièrement exploité) : le mécanisme passe aussi le verdict formel "✅ tient" sur **US100** et **US500** — pas seulement GER40. Ces deux-là sont déjà les instruments en production live, déjà connectés au broker, spread déjà quelque chose de mesuré/utilisé ailleurs — donc a priori le chemin le plus rapide vers un vrai test si l'edge était réel là aussi. Mêmes contrôles que GER40 appliqués (répartition achat/vente, blocs de 2 ans, part de la meilleure année dans le profit net) :

| | US100 | US500 | GER40 (rappel) |
|---|---|---|---|
| Répartition achat/vente | Vente 95% du profit (achat quasi nul) | Vente 118% du profit (achat légèrement négatif) | Vente 44%, achat 56% — équilibré |
| Blocs de 2 ans nets positifs | **2/4** | **3/4** | 6/8 |
| Meilleure année seule | 2023 : **62%** du profit net total | 2021 : **85%** du profit net total | 2014 : 22% du profit net total |

**US100 et US500 sont écartés pour ce mécanisme.** Pas de piège de biais haussier cette fois (le profit vient presque entièrement des ventes, pas des achats — donc pas le même problème qu'Asian Range Breakout), mais un problème différent et tout aussi disqualifiant : une concentration temporelle extrême. Sur US500, retirer la seule année 2021 ferait presque disparaître tout le profit net (85% du total vient d'une seule année sur sept). Sur US100, 62% vient de la seule année 2023. C'est exactement le profil qui avait fait rejeter la fausse "réussite" d'USDJPY plus haut dans ce document — une fenêtre chanceuse, pas un edge répété. **Seul GER40 montre un profil vraiment distribué dans le temps (22% max sur une seule année, 6/8 blocs positifs).**

**Réponse à la question d'Esdras** : non, pas encore prêt à coder pour du live/démo, et la réponse dépend de l'instrument visé :
- **US100/US500** (déjà en prod) : NON — la fragilité temporelle découverte ici disqualifie le mécanisme sur ces deux instruments, même s'ils passent le test formel train/test.
- **GER40** (le seul instrument robuste) : c'est un NOUVEL instrument, pas encore dans l'infra live. Avant de coder quoi que ce soit, il manque : (1) confirmation du vrai spread auprès du courtier (actuellement 1.0 point, pure estimation jamais vérifiée), (2) confirmation que le DAX/GER40 est bien disponible comme CFD tradable sur le compte cTrader utilisé, (3) un vrai module de stratégie dans `LiveStrategyEngine` (aujourd'hui seuls FVG et Divergence tournent en live — Weekly Liquidity Sweep n'existe qu'en script de backtest), (4) un test démo avant toute idée de capital réel.

`npm test` : 459/459 (inchangé). Script de vérification ad hoc, non committé.

## GER40 — vrai spread confirmé par Esdras (0.5, pas 1.0) — NWOG réhabilité, tout re-testé — 2026-09-15

Points (1) et (2) ci-dessus réglés directement par Esdras : elle a confirmé GER40 disponible sur son compte cTrader (visible directement dans l'app), et envoyé une capture d'écran du Market Watch : **Sell 25452.5 / Buy 25453.0 → spread réel = 0.5 point**, soit la MOITIÉ de l'estimation utilisée jusqu'ici (1.0, une pure supposition jamais vérifiée). `transactionCosts.js` corrigé (`GER40: 0.5`), les 13 rapports d'analyse régénérés avec le vrai chiffre (seules les lignes GER40 changent, tous les autres instruments inchangés — vérifié par `git diff`).

**Conséquence importante : le rejet précédent de NWOG (contrôle par blocs de 2 ans, avec l'ancien spread 1.0) était en partie un artefact du mauvais spread.** Un spread surestimé filtre plus de trades comme "non viables" (distance < spread×3) et déforme la distribution dans le temps. Avec le vrai spread 0.5, tout redevenu à revérifier :

| | NWOG (spread 1.0, rejeté) | NWOG (spread 0.5, réel) | Weekly Liquidity Sweep (spread 0.5, réel) |
|---|---|---|---|
| Répartition achat/vente | 50/50 | 59% achat / 41% vente | 32% achat / **68% vente** |
| Blocs de 2 ans positifs | 3/8 | **6/8** | 6/8 |
| Meilleure année seule | 45% du profit | **22% du profit** | 16% du profit |
| Espérance globale | 0.10R | **0.20R** | 0.24R (était 0.17R avec l'ancien spread) |

**NWOG est réhabilité : c'est bien un second candidat crédible sur GER40, pas un faux positif.** Avec le bon spread, il passe désormais le même seuil de robustesse (6/8 blocs positifs, aucune année ne domine à plus de 22%) que Weekly Liquidity Sweep, et sa répartition achat/vente (59/41) reste raisonnablement équilibrée — rien à voir avec les 82-146% d'Unicorn Model/Asian Range Fade, dont le rejet est reconfirmé avec le vrai spread (toujours nettement biaisés achat, vente nette négative sur Asian Range Fade). Weekly Liquidity Sweep reste aussi solide qu'avant, et même légèrement mieux (espérance 0.17R → 0.24R, concentration maximale 22%→16%).

**Leçon à retenir** : le rejet initial de NWOG n'était pas faux en soi (le contrôle était correct), mais reposait sur une donnée d'entrée jamais vérifiée (le spread). Exactement le genre d'erreur que la discipline "vérifier les chiffres surprenants" de ce projet est censée attraper — ici c'est Esdras qui a fourni la vraie donnée en répondant à une question simple (quel spread vois-tu dans l'app), pas une improvisation.

**Conclusion mise à jour : deux candidats crédibles sur GER40 — Weekly Liquidity Sweep ET NWOG.** Il reste pareil qu'avant pour Weekly Liquidity Sweep (backtest seulement). **Correction : NWOG N'EST PAS backtest-only** — voir section suivante, c'est en fait déjà live en production sur US100, une erreur de ma part corrigée immédiatement en la découvrant.

`npm test` : 459/459. Fichiers modifiés : `src/backtest/transactionCosts.js` (GER40: 1.0 → 0.5), 13 rapports `data/backtest-input/*-strategy-analysis.md` régénérés (ligne GER40 uniquement). Scripts de vérification ad hoc, non committés.

## Spreads US100/US500/EURUSD corrigés (screenshot Market Watch d'Esdras) — 2026-09-15

Suite à la question d'Esdras ("et pour les autres paires, tu ne m'avais pas demandé les spreads ?") — juste après GER40, elle a raison : seul BTCUSD avait une vraie mesure (via de vrais ticks captés en live), tout le reste était une pure estimation jamais vérifiée, y compris US100/US500/XAUUSD qui sont pourtant les instruments EN PRODUCTION. Elle a envoyé un screenshot du Market Watch cTrader (GBPUSD/EURUSD/GER40/US100/US30/US500) :

| Symbole | Ancien (estimation) | Réel (screenshot) | Écart |
|---|---|---|---|
| GBPUSD | 0.00015 | 0.00015 | confirmé exactement |
| EURUSD | 0.00010 | 0.00011 | proche |
| US100 | 1.0 | **0.6** | surestimé de 67% |
| US500 | 0.4 | **0.25** | surestimé de 60% |
| US30 | — | 1.4 | pas un symbole suivi dans ce projet, pour info seulement |

`transactionCosts.js` corrigé, les 13 rapports d'analyse régénérés (seules les lignes US100/US500/EURUSD changent partout, vérifié). XAUUSD/USDJPY/USDCAD restent des estimations non vérifiées — pas dans ce screenshot.

`npm test` : 459/459.

## CRITIQUE — NWOG est déjà LIVE sur US100 (pas backtest-only, erreur corrigée) et son edge en production ressemble à un piège de biais haussier — 2026-09-15

En creusant pourquoi le rapport NWOG montrait déjà "✅ tient" sur US100/US500 avant même la correction de spread, découverte d'une erreur de ma part : j'avais dit à Esdras que NWOG "n'existe qu'en script de backtest, pas dans LiveStrategyEngine" — **FAUX**. NWOG est en réalité **déjà en exécution automatique complète sur US100** depuis une décision antérieure documentée plus haut dans ce fichier ("NWOG intégré en mode ALERTE (Phase 1)" puis "Statut final : NWOG en exécution automatique complète, US100 seulement"). `CONFIG.nwog.symbols = ['US100']`, câblé dans `liveStrategyEngine.js` (`_processNwogCandidate`), même chemin `openPositions`/netting/auto-exécution que FVG et Divergence. Corrigé immédiatement auprès d'Esdras.

**Plus important : comme le contrôle achat/vente était en tête (fait toute la session sur GER40), je l'ai appliqué par réflexe à NWOG/US100 — le mécanisme qui trade déjà avec du capital réel.** Jamais fait avant cette session (le concept de ce contrôle n'existait pas encore quand NWOG est passé en live) :

| | US100 (LIVE, capital réel) | US500 (pas live) |
|---|---|---|
| Profit total achat | +87.43R | +51.20R |
| Profit total vente | **-1.70R** | **+0.01R** |
| Part du profit venant des achats | **102%** | **100%** |
| Blocs de 2 ans positifs | 3/4 | 4/4 |
| Meilleure année seule | 2025 = 33% du profit | 2025 = 56% du profit |

**Signal d'alarme identique à celui qui a fait rejeter Asian Range Breakout/Unicorn Model sur GER40** : la quasi-totalité du profit de NWOG/US100 vient des achats, les ventes sont à l'équilibre (US500) ou légèrement négatives (US100) sur toute la période 2019-2025. Le verdict formel train/test qui a justifié la mise en live de NWOG était calculé correctement, mais n'avait jamais été croisé avec ce contrôle directionnel — inventé plus tard dans le projet (USDJPY, puis systématisé sur GER40 aujourd'hui). Interprétation prudente : ça ne veut pas dire que NWOG va nécessairement mal se comporter (si le Nasdaq continue de monter sur le long terme, un signal biaisé achat peut continuer à "marcher" comme proxy d'être long sur un indice haussier), mais l'histoire "mécanisme ICT bidirectionnel avec un vrai edge" n'est pas ce que montrent les données — c'est vraisemblablement en grande partie la tendance générale du marché.

**Aucune action prise sur le live sans confirmation d'Esdras** — elle a été informée directement dans la conversation avec les chiffres bruts, décision lui appartenant explicitement (dans l'esprit de la même discipline "jamais changer le compte réel sans son accord conscient" déjà appliquée quand NWOG est passé en live la première fois).

`npm test` : 459/459 (inchangé). Script de vérification ad hoc, non committé.

## NWOG passé en "achat seulement" sur US100 — décision d'Esdras, codée — 2026-09-15

Suite directe de la section précédente : Esdras informée que le côté vente de NWOG/US100 ne rapporte quasiment rien (-1.70R net sur 177 trades depuis 2019, 26.6% de réussite) pendant que l'achat porte tout le résultat (+87.43R sur 155 trades, 40.6% de réussite). Elle a répondu "on a plus de chance de reussir a lachat que la vente" et demandé combien de perte on retire en coupant la vente — réponse honnête donnée : très peu en absolu (-1.70R sur ~7 ans, quasiment nul), le vrai bénéfice est de retirer 53% des trades (177/332) qui n'ajoutaient aucune valeur, pas de récupérer une grosse perte.

**Codé** (pas juste discuté) : nouvelle option `longOnly` sur la config NWOG.
- `src/liveStrategyEngine.js` (`_processNwogCandidate`) : quand `cfg.longOnly` est vrai et que le candidat est baissier (`bearish`), le signal est immédiatement marqué `blockedReason: 'direction-filtered'` (même convention que tous les autres blocages existants — netting, spread-too-tight, guardrail) au lieu de passer par `_blockReason()`. Le signal reste VISIBLE/journalisé (transparence, comme tout signal bloqué), mais n'ouvre jamais de vraie position et n'atteint jamais l'auto-exécution (`!e.blockedReason` reste la condition qui déclenche un vrai ordre).
- `src/config.js` (`CONFIG.nwog`) : `longOnly: true` ajouté, avec les chiffres justificatifs en commentaire.
- 2 nouveaux tests dans `test/liveStrategyEngine.test.js` : un candidat baissier avec `longOnly: true` est bloqué (`direction-filtered`, aucune position réelle ouverte) ; un candidat haussier passe normalement (non affecté par le filtre).

**Effet concret** : NWOG continue de fonctionner exactement pareil côté achat (mécanisme inchangé, pas retuné). Côté vente, les signaux sont toujours détectés et visibles sur le dashboard (utile si on veut un jour revenir en arrière ou juste observer), mais plus aucun ordre réel n'est envoyé au courtier pour cette direction.

`npm test` : 461/461 (459 + 2 nouveaux).

## Audit des stratégies live réellement actives — 2026-09-15

Suite aux questions d'Esdras ("et les autres strategy? Ils ne sont pas plus profitable sur buy only?" puis "on a combien de strategy code qui roule?"). Rejoué la VRAIE config actuelle (FVG, Divergence, Judas Swing) via `LiveStrategyEngine` sur tout l'historique réel, même contrôle achat/vente que pour NWOG/GER40 :

| Stratégie | Achat | Vente | Verdict |
|---|---|---|---|
| Divergence (US100/US500) | 100% | 0 trade | Pas un biais — achète TOUJOURS le retardataire de la paire par conception, jamais l'inverse. Rien à couper. |
| FVG US100 | 70% (702R/642) | 30% (305R/277) | WR quasi identique (34.9% vs 35.0%) — les deux côtés marchent vraiment. |
| FVG US500 | 39% | **61%** (62R/46, WR 39.1%) | La vente est meilleure que l'achat ici — l'inverse de NWOG. |
| FVG XAUUSD | 79% (53R) | 21% (**+14R**, WR 23.5%) | Plus faible côté vente mais clairement positif, pas proche de zéro. |
| Judas Swing EURUSD | 43% | **57%** (89R vs 67R) | Vente légèrement meilleure. |

**Conclusion : le cas NWOG/US100 était vraiment l'exception, pas la règle.** Aucune des 3 autres stratégies live ne montre le même profil "un côté ne rapporte quasiment rien" — rien à changer sur FVG/Divergence/Judas Swing.

**Inventaire complet demandé** : 4 vrais mécanismes codés (FVG ×3 instruments, Divergence, NWOG, Judas Swing = 6 combinaisons instrument/stratégie), + 1 test temporaire (FVG baseline BTCUSD, M1, toujours pas retiré) + 1 add-on optionnel (pyramidage, derrière `PYRAMID_ENABLED`).

**Vérification de l'historique réel (7 jours, `/api/trade-history`)** : 20 trades au total, **0 provenant des 4 vrais mécanismes**, 19 BTCUSD (le smoke-test temporaire, -17.27R net, 15% de réussite — toujours pas retiré malgré le plan initial "on va supprimer BTC juste après"), 1 transaction manuelle GER40 d'Esdras (test de dispo/visibilité, +1.73, 12 secondes de hold). Zéro trade sur les 4 vrais mécanismes en 7 jours n'est pas forcément anormal (signaux peu fréquents par construction — FVG/Divergence/NWOG/Judas Swing tournent tous à quelques trades par semaine au mieux en historique), mais le BTCUSD qui saigne activement pendant ce temps est un vrai sujet en attente de décision d'Esdras (retrait proposé, pas encore fait).

## Weekly Liquidity Sweep déployé en LIVE sur GER40 — auto-exécution directe, décision d'Esdras "on va plus vite" — 2026-09-15

Suite de toute la recherche GER40 de la journée : Esdras a demandé ma recommandation, j'ai proposé une approche par étapes (Phase 1 alerte seulement, observation de quelques semaines, puis auto-exécution démo), elle a répondu "On VA plus vite" — clarifié via question explicite : auto-exécution complète directe sur le compte démo actuel, sans phase d'observation, un seul mécanisme (Weekly Liquidity Sweep seul, pas NWOG en même temps, pour pouvoir attribuer clairement un futur problème/succès à l'un ou l'autre).

**Codé** (même schéma exact que NWOG/Judas Swing — aucune nouvelle architecture inventée) :
- `src/liveStrategyEngine.js` : nouveau constructeur `weeklySweepConfig`, `_computeWeeklySweepCandidates()` (réutilise `detectWeeklySweepEvents()` de `weeklyLiquiditySweep.js`, backtest UNCHANGED), `_detectWeeklySweepSignal()`, `_processWeeklySweepCandidate()` — même garde `validStopSide` (leçon smtDivergence.js), même participation au VRAI `openPositions`/netting partagé avec FVG/Divergence/NWOG/Judas Swing, source `'weeklysweep'`. Câblé dans le chemin par-tick (`ingestCandle`) ET le chemin bulk warm-up.
- `src/config.js` : `GER40` ajouté à `CONFIG.symbols` (le bot le surveille maintenant en continu). Nouveau bloc `CONFIG.weeklySweep = { symbols: ['GER40'], rrMultiple: 3, maxHoldingM15Candles: 480 }` — même convention RR/timeout déjà validée dans le backtest, rien re-réglé.
- `src/accountRuntime.js` : `weeklySweepConfig: config.weeklySweep` câblé dans le VRAI moteur live (même schéma opt-in que `nwogConfig`/`judasSwingConfig` — les 3 moteurs jetables de backtest/rapport restent inchangés, décision délibérée cohérente avec le précédent NWOG).
- `src/engines/lotCalculator.js` : spec GER40 ajoutée (même forme que US100/US500 — indice CFD, $1/point/lot, non vérifié auprès du courtier, même réserve que toutes les autres entrées de cette table). Sans ça, l'auto-exécution aurait juste ignoré silencieusement chaque signal GER40 ("no symbol spec - skipping entry").
- Étiquetage de source répliqué partout où NWOG/Judas Swing l'avaient fait (même discipline établie) : notifications ntfy dans `cTraderDataSource.js` ET `matchTraderDataSource.js`, regex `parseSourceFromLabel` de `dealPairing.js`, labels du dashboard (`sourceLabel`/`sourceLabelFull`/`sourceLabelShort` dans `public/index.html`).
- 4 nouveaux tests dans `test/liveStrategyEngine.test.js` (signal validé + position réelle, résolution win, résolution loss, netting bloque un signal quand une position FVG existe déjà) — même couverture que NWOG à son lancement initial.

**Ce qui reste non vérifié, dit explicitement** : un seul découpage train/test a jamais été fait sur ce mécanisme (comme partout dans ce projet), jamais observé en conditions réelles avant maintenant, le spread (0.5) vient d'un seul screenshot pas d'une moyenne, et la spec de lot GER40 est une estimation non confirmée (comme US100/US500 le sont aussi). Décision consciente d'Esdras d'aller vite malgré ces réserves nommées.

`npm test` : 465/465 (461 + 4 nouveaux).

**Fichiers** : `src/liveStrategyEngine.js`, `src/config.js`, `src/accountRuntime.js`, `src/engines/lotCalculator.js`, `src/dataSources/cTraderDataSource.js`, `src/dataSources/matchTraderDataSource.js`, `src/dataSources/dealPairing.js`, `public/index.html`, `test/liveStrategyEngine.test.js`.

## Simulation combinée des 5 stratégies live sur 7 mois — un vrai problème détecté (clustering du garde-fou quotidien) — 2026-09-15

Esdras : "donne moi une overview de la performance pendant les 7 derniers mois si tous les strategy fonctionnaient en meme temps... je veux detecter sil y aurait un probleme". Rejoué la VRAIE config actuelle (FVG US100/US500/XAUUSD, Divergence, NWOG achat-seul, Judas Swing, Weekly Sweep GER40) sur 2025-05-31→2025-12-31 (les 7 derniers mois de données réelles disponibles), avec un VRAI `GuardrailEngine(CONFIG.guardrails)` partagé (maxTradesPerDay 20, cooldown 30min, perte quotidienne max 2%) — pas le garde-fou permissif que `forwardTest.js` utilise d'habitude. Méthode en 2 passes pour rester rapide : passe 1 = `warmUp()` efficace avec garde-fou permissif (netting correct par symbole, calcul rapide) ; passe 2 = rejeu chronologique des trades candidats à travers un VRAI garde-fou pour voir ce qu'il aurait réellement bloqué.

**Résultat global** : 179 trades autorisés (27 bloqués par le garde-fou), solde 10 000$→17 537$ (+75.4%), drawdown max 4.92%.

| Source | Trades | Espérance (R) | P&L |
|---|---|---|---|
| FVG | 76 | +80.00R | +5450$ |
| Judas Swing | 43 | +9.02R | +446$ |
| Weekly Sweep | 25 | +5.94R | +460$ |
| Divergence | 27 | +4.56R | +310$ |
| NWOG (achat seul) | 8 | +15.47R | +871$ |

**Le vrai problème trouvé, comme demandé** : le **29 décembre 2025**, 3 stratégies indépendantes (Weekly Sweep, Judas Swing, FVG) ont perdu LE MÊME JOUR — perte réalisée -416$, qui atteint exactement le plafond de perte quotidienne de 2%. C'est le pire jour de toute la période. Aucun backtest par mécanisme individuel ne peut jamais montrer ça — ça n'existe que quand on combine vraiment plusieurs stratégies sur le même compte, exactement ce qu'Esdras voulait détecter.

**Deuxième constat structurel, plus subtil** : les 27 trades bloqués par le garde-fou le sont TOUS pour la même raison — `cooldown_active` (les 30 minutes de pause après n'importe quelle perte). Ce cooldown est PARTAGÉ sur tout le compte, pas par stratégie/symbole : une perte sur EURUSD (Judas Swing) peut donc bloquer un signal valide sur GER40 (Weekly Sweep) 10 minutes plus tard, alors que les deux mécanismes n'ont techniquement rien à voir. Avec seulement FVG+Divergence (2 sources étroitement liées), ce partage avait du sens ; avec 5 mécanismes vraiment indépendants, ça commence à couper des opportunités sans rapport. **Pas corrigé unilatéralement — décision à prendre avec Esdras** : garder tel quel (filet de sécurité conservateur) ou scoper le cooldown par symbole/source.

**Bonne nouvelle en passant** : le nombre de trades/jour ne s'approche jamais du plafond actuel de 20 (max observé : 4/jour, un seul jour sur 114 a dépassé 3) — le plafond de 3 vers lequel il était prévu de revenir ("REVERT to 3... pas meant to stay loose long-term") n'aurait presque aucun effet à cette fréquence combinée.

**Réserves à garder en tête** : une seule fenêtre historique (comme partout dans ce projet), risque composé à 0.5%/trade (valeur réelle actuelle du compte démo), jamais observé en conditions réelles avec les 5 mécanismes tournant vraiment ensemble avant cette simulation.

`npm test` : 465/465 (inchangé — script de vérification ad hoc, non committé).

## Décembre-janvier "bizarre" — vérifié sur 7 années, ce n'était pas saisonnier — 2026-09-15

Esdras a remarqué que le passage à vide de déc 2024-jan 2025 (-11.61% de drawdown) semblait suspect et a demandé de vérifier les autres années. Rejoué la simulation combinée des 5 stratégies sur TOUT l'historique commun aux 5 symboles (2019-01-02 → 2025-12-31, la seule fenêtre où US100/US500/XAUUSD/EURUSD/GER40 ont tous des données réelles) et isolé chaque fenêtre décembre→janvier :

| Fenêtre | Trades | Espérance (R) | Drawdown de la fenêtre |
|---|---|---|---|
| Déc 2019 → Jan 2020 | 52 | +22.62R | 3.96% |
| Déc 2020 → Jan 2021 | 66 | +42.69R | 6.35% |
| Déc 2021 → Jan 2022 | 55 | +17.48R | 4.32% |
| Déc 2022 → Jan 2023 | 56 | +23.64R | 4.28% |
| Déc 2023 → Jan 2024 | 64 | **+52.30R** (meilleure) | 2.66% |
| **Déc 2024 → Jan 2025** | 56 | **-8.40R** | **11.61%** |
| Déc 2025 (partiel, pas de janvier 2026 dans les données) | 39 | -0.01R | 4.92% |

**5 des 6 fenêtres complètes sont nettement positives** (2019-20, 2020-21, 2021-22, 2022-23, 2023-24) — décembre-janvier n'est pas structurellement mauvais. **Déc 2024→Jan 2025 est un vrai coup dur isolé, pas un motif récurrent.** La fenêtre de déc 2025 (partielle) montre aussi une faiblesse, mais c'est simplement le même cluster du 29 décembre déjà identifié, sans janvier suivant dans les données pour compenser.

**Conclusion pour Esdras** : le drawdown de 11.61% était un vrai événement de marché (une mauvaise période sur plusieurs semaines qui peut arriver n'importe quand), pas un problème calendaire à éviter. Ça ne change rien à la recommandation précédente (un vrai plafond de drawdown global reste une bonne idée, peu importe quand ce genre de passage à vide frappe) — mais aucune règle "ne pas trader en décembre-janvier" n'est justifiée par les données.

**Note méthodologique** : cette vérification utilise TOUTE la fenêtre 2019-2025 (train + test), contrairement au reste du projet qui exclut le train pour éviter le biais — c'était le bon choix ici puisque la question posée est purement calendaire/saisonnière (est-ce que ce mois est structurellement différent), pas une validation de la performance elle-même. Le solde final affiché par la simulation sur 7 ans (10 000$ → ~2.1M$, composé à 0.5%/trade sur 2278 trades) n'est PAS une prévision réaliste — c'est un artefact de la composition sans plafond de taille de position, retraits, ou split de profit prop firm ; ignoré ici, seule la comparaison RELATIVE entre fenêtres décembre-janvier compte.

`npm test` : 465/465 (inchangé). Script de vérification ad hoc, non committé.

## Cooldown-après-perte : passé de "tout le compte" à "par symbole" — décision d'Esdras, codée — 2026-09-15

Suite directe de la simulation combinée : Esdras a confirmé vouloir garder un filet de sécurité, mais a demandé de le rendre par symbole après avoir vu le coût réel (~19 000$ de profit manqué sur 2 ans, taux de réussite des trades bloqués MEILLEUR que ceux qui sont passés — aucune justification "revenge trading" pour un bot 100% automatisé où chaque mécanisme est indépendant).

**Codé** : `src/engines/guardrailEngine.js` — nouveau `this.lastTradeBySymbol` (Map symbole → dernière perte), en plus de `this.trades` (compte global, inchangé). `recordTrade({..., symbol})` alimente les deux. `getStatus(now, symbol)`/`canTakeNewTrade(now, symbol)` acceptent un paramètre `symbol` optionnel : fourni → cooldown vérifié pour CE symbole seulement ; omis → repli sur le comportement global d'avant (les appels d'affichage comme `/api/status` n'ont pas besoin d'être précis). **`maxTradesPerDay` et `dailyLossLimitPct` restent volontairement partagés sur tout le compte** — ceux-là protègent le risque TOTAL, pas le comportement récent d'un seul instrument.

**Câblé partout où un trade réel est enregistré** (même discipline que NWOG/Judas Swing/Weekly Sweep avant) :
- `liveStrategyEngine.js` (`_blockReason`) passe maintenant `symbol` à `canTakeNewTrade()` — c'est le seul appel qui bloque vraiment une entrée.
- `cTraderDataSource.js` (2 endroits : replay au démarrage + confirmation temps réel) : `symbol` résolu via `symbolNameById.get(deal.symbolId)`.
- `matchTraderDataSource.js` : l'endroit temps réel résout via `_symbolFromInstrument()` ; le replay au démarrage reste SANS symbole (le format de cette donnée n'a jamais été confirmé — pas de supposition, ce trade-là ne nourrit juste aucun cooldown par symbole).
- `mockDataSource.js` : `symbol` propagé depuis l'événement de signal.
- `/api/status` (`server.js`) et le dashboard (`public/index.html`) : chaque symbole affiche maintenant SON PROPRE cooldown restant (badge ⏸), plutôt que le repli générique compte-global qui ne reflète plus ce qui bloque vraiment une entrée.

**5 nouveaux tests** dans `test/guardrailEngine.test.js` (perte sur un symbole ne bloque pas un autre ; chaque cooldown s'éteint indépendamment ; repli compte-global sans symbole ; `maxTradesPerDay`/`dailyLossLimitPct` restent bien partagés) + 2 tests existants dans `test/liveStrategyEngine.test.js` corrigés (ils enregistraient une perte sans `symbol`, cassés par ce changement de comportement volontaire — pas une régression).

`npm test` : 469/469 (465 + 4 nouveaux guardrail, 2 corrigés).

## Pyramidage soumis au garde-fou par symbole — décision d'Esdras, codée après tests supplémentaires — 2026-09-15

Suite directe de la découverte précédente (pyramidage jamais vérifié par le garde-fou, et les legs déclenchés pendant un cooldown actif se révèlent quasi toujours perdants). Esdras a demandé plus de tests avant de trancher — chiffres déjà donnés (4-12% de réussite pendant cooldown vs 50-60% hors cooldown, sur 2 fenêtres différentes) — puis a confirmé : "Oui, tres bien".

**Codé** : `src/liveStrategyEngine.js` (`_maybeRequestPyramid`) — nouveau garde `if (!this.guardrail.canTakeNewTrade(guardrailNow, symbol)) return;` juste avant de calculer l'unité d'ajout, réutilisant le même appel que toutes les autres sources (couvre le cooldown par symbole ET, gratuitement, `maxTradesPerDay`/`dailyLossLimitPct`/drawdown global). **Piège évité en cours de route** : la fonction ne recevait jamais `guardrailNow` (seulement `candle`) — sans corriger ça, le même bug de décalage -5h en live (déjà trouvé et corrigé pour FVG/Divergence/NWOG/Judas Swing) serait réapparu ici. Signature étendue à `_maybeRequestPyramid(symbol, candle, events, guardrailNow = candle.time)`, câblée sur le VRAI `guardrailNow` côté live (`ingestCandle`), laissée par défaut côté replay en masse (comportement déjà correct là).

**3 nouveaux tests** (`test/liveStrategyEngine.test.js`) : bloqué pendant le cooldown du symbole ; se déclenche normalement une fois le cooldown écoulé ; une perte sur un AUTRE symbole ne bloque pas celui-ci (par symbole, pas compte-global). Un vrai bug de méthodologie de test trouvé et corrigé en écrivant ces tests : enregistrer la perte AVANT d'ouvrir la position FVG bloquait aussi l'OUVERTURE de la position elle-même (soumise au même garde-fou) — corrigé en enregistrant la perte après l'ouverture, comme un vrai scénario le ferait.

**Résultat mesuré, avec le vrai code corrigé** (rejoué avec la simulation combinée) :

| | 2024-2025, sans le correctif | **avec le correctif** | 7 derniers mois, sans | **avec** |
|---|---|---|---|---|
| Trades pyramid | 58 (WR 36.2%) | **33 (WR 60.6%)** | 20 (WR 35.0%) | **12 (WR 50.0%)** |
| Espérance pyramid (R) | +65.55 | **+85.69** | +21.23 | **+23.63** |
| Solde final (portefeuille complet) | 113 172$ | **125 236$** | 21 520$ | **21 789$** |
| Drawdown max | 11.30% | **10.38%** | 5.07% | 5.07% |

Exactement ce qu'annonçait la recherche : les 25 (puis 8) legs perdants pendant le cooldown disparaissent complètement, ne laissant que les legs rentables — meilleur résultat avec MOINS de trades.

`npm test` : 472/472 (469 + 3 nouveaux).

## Impact d'un blackout news "±10min" — committé comme vraie ressource réutilisable — 2026-09-15

Suite aux 2 vérifications ad hoc de la conversation (79 puis 130 événements) : Esdras a confirmé vouloir garder ça dans le projet ("Oui" à la question de committer), après avoir précisé sa demande initiale ("les props firms ont l'habitude de dire Red News, donc je pense que c'est TOUS les red news").

**Committé** (contrairement à la plupart des scripts de vérification ad hoc de cette session) :
- `src/backtest/newsEvents.js` : 130 événements réels 2024-2025 (CPI, NFP, FOMC, PIB — estimation avancée seulement, PCE/Personal Income and Outlays, ventes au détail US, décisions BCE), sources publiques officielles (BLS, Fed, BEA, Census, BCE — chaque date vérifiée directement depuis le PDF/la page officielle de l'agence, pas un agrégateur tiers). Conversion DST-aware (heure réelle America/New_York ou Europe/Berlin → convention "EST fixe" du projet) via la technique standard de double-formatage, vérifiée sur des cas hiver ET été.
- `scripts/runNewsBlackoutAnalysis.js` : rejoue le portefeuille combiné des 5 mécanismes (même méthode 2-passes que les scripts précédents), avec et sans un filtre "aucun trade dans les ±10 minutes autour de chaque événement".
- `test/newsEvents.test.js` : 5 tests (nombre d'événements, cas hiver EST, cas été EDT/CEST, cas hiver CET).
- 2 rapports générés : `data/backtest-input/news-blackout-analysis-test.md` (2024-2025) et `-7months.md`.

**Résultat (130 événements, contre 79 dans la première passe)** :

| | 2024-2025 (2 ans) | 7 derniers mois |
|---|---|---|
| Trades exclus | 13 / 736 | 1 / 208 |
| Solde final sans/avec | 125 236$ → 114 026$ (-9%) | 21 789$ → 21 789$ (quasi inchangé) |
| Drawdown max sans/avec | 10.38% → 10.92% | 5.07% → 5.07% (inchangé) |

Impact réel mais modeste — les fenêtres de session des stratégies (ex: 8h-12h NY pour US100, 10h-11h pour US500) ne chevauchent qu'occasionnellement les horaires fixes des grosses news US (8h30 ET, 14h00 ET).

**Réserves honnêtes documentées dans `newsEvents.js`** : le shutdown gouvernemental américain d'oct-nov 2025 a réellement perturbé/annulé certaines publications (PIB T3 2025 annulé, PCE oct/nov reportés à 2026) — traité en omettant ces dates plutôt qu'en inventant une date fausse. Liste volontairement PAS exhaustive : Ifo/ZEW allemands, PMI ISM, demandes de chômage hebdomadaires exclus (généralement "orange" pas "red" sur la plupart des calendriers).

**Important : ce filtre n'est PAS câblé dans le moteur live** — c'est une analyse/recherche, pas encore un vrai garde-fou appliqué à `LiveStrategyEngine`. Si un vrai prop firm l'exige, il faudrait le coder en plus (décision séparée, pas encore prise).

`npm test` : 477/477 (472 + 5 nouveaux).

## Vérification de la règle "floating loss par idée de trade" (FundingPips 1-Step Flex) — résolue empiriquement — 2026-09-15

Suite directe de la simulation de cycle $10k/FundingPips Flex ("On prend 10k pour tester [...]") : Esdras a demandé de vérifier ensuite la règle ambiguë documentée depuis le 2026-09-12 (`src/propFirms/fundingPips.js`'s `tradeIdeaFloatingLossRule`, jamais réconciliée) — 2 lectures possibles : STRICTE (3%/2% de perte flottante+réalisée combinée sur une "idée de trade" = rupture immédiate) ou SOUPLE (1% = avertissement, 4 cumulés = fermeture).

**Bug de calcul trouvé et corrigé avant de pouvoir répondre** (premier chiffre obtenu : une excursion flottante solo de 41.53% du solde sur un seul trade US100 — physiquement impossible avec un stop-loss, signalé à Esdras comme suspect avant toute conclusion) :
1. Le scan des bougies commençait à la bougie d'ENTRÉE elle-même, alors que `ingestCandle()` ne vérifie jamais stop/target sur cette bougie (seulement à partir de la suivante) — corrigé (`startIdx + 1`).
2. Même après ce correctif, le calcul restait irréaliste (31%) car il ne plafonnait pas l'excursion adverse au niveau du stop — alors que le bot place TOUJOURS un vrai ordre stop-loss côté broker (`cTraderDataSource.js`'s `_submitOrder` → `stopLoss: signal.stopPrice`) : une fois ce niveau atteint, le broker ferme la position, l'exposition flottante ne peut donc pas continuer à grandir au-delà (hors slippage de gap, effet réel mais distinct, non modélisé). Plafonné à 1R — résultat immédiatement cohérent (exactement 0.50% = le risque par trade lui-même).

**Résultat final, vérifié, sur le portefeuille de production réel** (FVG x3, Divergence, NWOG achat seul, Judas Swing, Weekly Sweep GER40, pyramidage soumis au garde-fou), compte $10k, risque 0.5%/trade :

| | Pire excursion flottante | % du solde | Dépassements strict (3%) | Dépassements souple (1%) |
|---|---|---|---|---|
| SOLO (2 ans, 786 trades) | 705.54$ | 0.50% | 0/786 | 0/786 |
| SOLO (7 mois, 226 trades) | 126.73$ | 0.50% | 0/226 | 0/226 |
| COMBINÉ parent+pyramid (2 ans, 57 paires) | 1196.56$ | 1.00% | 0/57 | 0/57 |
| COMBINÉ parent+pyramid (7 mois, 19 paires) | 214.93$ | 1.00% | 0/19 | 0/19 |

**Verdict : à 0.5% de risque par trade, AUCUN dépassement, sous aucune des deux lectures de la règle, sur aucune des deux fenêtres testées.** Le pire cas solo plafonne à 1R par construction (le risque par trade lui-même) grâce au stop réel ; le pire cas combiné à ~2R (deux unités proches de leur stop simultanément) — largement sous le seuil souple de 1% déjà, a fortiori sous le seuil strict de 3%. L'ambiguïté de la règle elle-même reste non résolue (accès direct à fundingpips.com toujours bloqué), mais n'a plus d'importance pratique tant que le risque reste à 0.5% — à revérifier si ce réglage change un jour.

**Committé** : `scripts/runFundingPipsFlexFloatingLossCheck.js` (version propre du script de vérification ad hoc), rapports `data/backtest-input/fundingpips-flex-floating-loss-check-{test,7months}.md`, `src/propFirms/fundingPips.js` (note de vérification ajoutée, aucun chiffre de règle modifié — l'ambiguïté source reste documentée telle quelle).

`npm test` : 477/477 (inchangé — travail d'analyse seulement, aucun changement de comportement en production).

## Bandeau principal sur le dashboard (équité/P&L/journal) — 2026-09-15

Esdras : "rend mon site encore plus important/impressionant/utile/professionel", pendant qu'elle réglait des questions cTrader/Match-Trader en parallèle. Le dashboard avait déjà toutes ces informations (solde/équité réels, performance du journal durable avec courbe d'équité) mais éparpillées dans des cartes plus bas dans la page — rien de synthétique visible sans défiler.

**Ajouté** : `.hero-strip`, juste sous le ticker de prix — Équité (réelle), P&L du jour (réel), Total en R (journal durable, tout-temps), Taux de réussite. Chaque nombre réutilise une donnée DÉJÀ récupérée par la page (`/api/status`, `/api/account`, `/trade-log`) — aucun nouvel appel réseau, rien d'inventé. Chaque tuile reste "—" tant que sa propre source n'a pas encore répondu, même discipline que le reste de la page.

**Volontairement du texte/chiffres seulement, pas de graphique** — voir le commentaire déjà existant au-dessus du ticker : Esdras ne veut rien qui ressemble immédiatement à "je suis en train de trader" (chandeliers surtout) sur la page qu'elle garde ouverte au travail. Un bandeau de chiffres ne se lit pas de la même façon.

**Vérifié visuellement** (pas juste en lisant le code) : serveur local en mode démo + capture Playwright, desktop et mobile — réutilise exactement le langage visuel `.metric-tile` déjà en place (thème terminal sombre), juste une valeur plus grande et une barre d'accent bleue en haut pour se distinguer comme le bandeau principal.

Aucun changement backend — `npm test` : 477/477 (inchangé).

**Fichiers** : `public/index.html` uniquement.

## Le journal a son propre onglet, avec un vrai journal par trade (stratégie + R-multiple) — 2026-09-15

Esdras : "pour le journal, ne le mets pas dans la première page, donne-lui un onglet tout seul car il faut le graphe soit grand et donne tout le charte impliqué dans la transaction et plusieurs bougies avant et après de façon a avoir une vue d'ensemble sur tout le trade" — puis, en cours de route : "il faut aussi ajouter la stratégie utilisée aussi, tout information nécessaire pour un vrai journal, le nombre de RRR etc".

**Nouveau `public/journal.html`** — déplacé depuis `index.html` : Performance globale (journal durable, courbe d'équité + métriques), Journal durable par instrument, et Journal de trading (la liste détaillée). Ajouté au menu du haut sur toutes les pages.

**Le graphique par trade, maintenant sur sa propre page** :
- Bien plus grand (SVG 600×240 → 1100×460, hauteur CSS 240px → 460px).
- `chartMarginMs` (`cTraderDataSource.js`) augmenté de 12x à 30x la durée du timeframe du symbole — vraiment plus de contexte de chaque côté du trade.

**Vraies informations par trade ajoutées, aucune inventée** :
- Stratégie : déjà récupérée, maintenant sa propre étiquette visible à côté de la direction/symbole au lieu d'être noyée dans une parenthèse.
- R-multiple : NOUVEAU. L'historique de deals de cTrader n'a aucune notion de "risque" une fois une position clôturée (déjà la raison pour laquelle stop/cible ne s'affichaient pas non plus) — le journal durable (Supabase) l'avait déjà calculé au moment de la clôture, mais aucun endpoint n'exposait les lignes individuelles, seulement des agrégats. Ajouté `fetchRecentTradeRows()` (lignes brutes) et `enrichTradesWithRMultiple()` (jointure pure : symbole + heure de sortie la plus proche à ±30s, chaque ligne durable réclamée par au plus un trade du courtier, jamais deviné quand aucune correspondance n'existe) à `supabaseTradeLog.js`, câblé dans `getTradeHistory()` en enrichissement best-effort — opt-in (silencieusement ignoré si la persistance n'est pas configurée), ne bloque jamais l'endpoint si la requête durable échoue.

`index.html` : les 3 cartes déplacées retirées (HTML + JS). `refreshTradeLog()` alimente maintenant juste les 3 chiffres du bandeau principal (ajouté hier) — la seule chose qui avait encore besoin de `/trade-log` sur cette page.

**11 nouveaux tests** (`test/supabaseTradeLog.test.js`) pour `enrichTradesWithRMultiple`.

**Vérifié visuellement** (pas juste en lisant le code) : serveur local + capture Playwright avec de vraies données de trade simulées (bougies, un R-multiple apparié et un non apparié) — a confirmé le grand graphique, l'étiquette de stratégie, le badge R, et le repli "R-multiple indisponible" fonctionnent tous correctement. Re-capturé aussi `index.html` pour confirmer que la page reste propre sans les 3 cartes (pas de trou dans la mise en page).

`npm test` : 483/483.

**Fichiers** : `public/journal.html` (nouveau), `public/index.html`, `public/chart.html`, `public/accounts.html`, `src/dataSources/cTraderDataSource.js`, `src/dataSources/supabaseTradeLog.js`, `test/supabaseTradeLog.test.js`.

## Playwright en devDependency locale, pour la vérification visuelle — 2026-09-15

Esdras a demandé s'il existait autre chose que Playwright pour vérifier le rendu visuellement (a mentionné le skill "run"), puis "pourquoi pas installer chromium-cli ?". Vérifié : `chromium-cli` n'est pas disponible dans cet environnement (ni paquet npm — 404 — ni binaire installable, pas de code source accessible pour le construire) — signalé honnêtement plutôt que de faire semblant. Le skill "run" lui-même recommande, dans ce cas précis, de retomber sur un script Playwright brut — exactement ce que ce projet fait déjà ponctuellement depuis un script `/tmp`.

**Ajouté `playwright` en `devDependency`** (`package.json`) pour éviter de reconstruire le script ad hoc à chaque fois — Chromium est déjà pré-installé dans cet environnement (`/opt/pw-browsers`), lancé via `executablePath` plutôt que de le retélécharger.

**Piège évité avant qu'il ne morde en production** : le build de Render (`npm install`, sans `--production`, cache désactivé — donc à CHAQUE déploiement) aurait installé `playwright` et déclenché son téléchargement Chromium (~300 Mo) sur chaque déploiement. Corrigé en ajoutant `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` comme variable d'environnement Render (pas seulement en local) — redéploiement vérifié rapide et sain après coup.

Aucun changement de comportement applicatif — outillage de dev uniquement.

**Fichiers** : `package.json`.

## Calendrier, statistiques horaires, exposition totale, santé de la connexion, PWA complet — 2026-09-15

Esdras, pendant que je terminais l'ajout de Playwright : a demandé mon avis honnête sur le dashboard ("Comment tu trouves Mon site? Parfait? Ou il peux être ameliorer"), puis a validé une liste d'idées en écartant explicitement la protection par mot de passe pour l'instant ("Laisse le mode passe mais prends calendrier, statistique, exposition total, indicateur de sante, et puis IL DOIs être installable sur mon tel").

**Calendrier de performance** (`journal.html`, `renderCalendar()`) — heatmap style "contributions GitHub", 14 semaines glissantes, semaines commençant le lundi, groupé par JOUR CALENDRIER LOCAL (pas UTC — un trade clôturé à 23h locale ne doit pas apparaître le lendemain). Intensité de couleur proportionnelle à |R| du jour par rapport au maximum de la fenêtre, vert/rouge selon le signe. Aucune nouvelle donnée : dérivé de `equityCurve` (déjà récupéré par `/trade-log`) via `deriveTradeR()` (le R par trade = delta entre `cumulativeR` consécutifs).

**Statistiques par heure et jour de la semaine** (`renderTimeStats()`) — deux tableaux côte à côte (empilés sous 760px), barres horizontales par heure locale de sortie (0h-23h) et par jour de la semaine (lundi en premier), chaque tableau mis à l'échelle indépendamment. Même source de données que le calendrier, aucun nouvel appel réseau.

**Exposition totale** (`index.html`, `refreshAccount()`) — somme de `|entryPrice - stopLoss| × units` sur toutes les positions réellement ouvertes chez le courtier : le risque réel si TOUS les stops étaient touchés simultanément, distinct de la marge utilisée (mécanique de levier, pas une perte). N'affiche la ligne que s'il y a des positions ouvertes ; signale "(N/M positions — stop inconnu pour le reste)" si le courtier ne renvoie pas de stop pour certaines — jamais deviné.

**Indicateur de santé de connexion** (`index.html`, 5e tuile du bandeau principal) — basé sur l'âge de la bougie la plus fraîche tous symboles confondus (BTCUSD en M1 suffit à garder ça réactif tant que la connexion est réellement vivante) : 🟢 <2min, 🟡 <10min, 🔴 au-delà. Se met à jour toutes les 5s sur sa propre horloge (`setInterval`), pas seulement quand une nouvelle donnée SSE arrive — sinon un flux qui se fige silencieusement afficherait quand même un chiffre figé qui a l'air normal au premier coup d'œil.

**PWA** : déjà entièrement en place (`manifest.json`, `sw.js`, icônes) sur les 3 autres pages — `accounts.html` avait le lien manifest mais pas l'enregistrement du service worker (Chrome/Android exige un service worker enregistré avant même de proposer "Ajouter à l'écran d'accueil"), corrigé.

**Bug trouvé et corrigé pendant la vérification visuelle** (pas juste en lisant le code) : capture Playwright avec des données de trade simulées réparties sur plusieurs jours/heures a révélé un âge négatif affiché par l'indicateur de santé en mode démo (l'horloge simulée du mode démo peut avancer devant l'horloge réelle) — `connectionHealth()` plafonne maintenant l'âge à 0 (`Math.max(0, ageMs)`), défensif aussi contre un léger décalage d'horloge client/serveur en production.

**Vérifié visuellement** : serveur local en mode démo, captures Playwright avec `equityCurve` simulée réaliste (20 trades sur 90 jours, heures/jours variés) pour le calendrier et les statistiques, et `/api/account` simulé avec 2 positions (une avec stop connu, une sans) pour l'exposition totale — tout s'affiche et se calcule correctement, aucune erreur console.

`npm test` : 483/483 (inchangé — aucun changement de logique métier backend).

**Fichiers** : `public/journal.html`, `public/index.html`, `public/accounts.html`.

## Stats par session ICT, qualité d'exécution, temps de récupération après drawdown — 2026-09-15

Suite du "quoi encore ?" — Esdras a choisi 3 des idées proposées : "Stats par session et qualité d'exécution, les deux, temps de recuperation".

**Statistiques par session de trading** (`journal.html`, `renderSessionStats()`) — Asie/Londres/Chevauchement Londres-NY/New York/Hors séance, frontières standard du marché en UTC (pas la timezone du navigateur — une stratégie ICT est définie par rapport à des sessions de marché fixes, pas par rapport à où Esdras se trouve). Bucketé sur l'heure d'ENTRÉE, pas de sortie : un trade peut sweeper la liquidité de Londres puis ne se clôturer que des heures plus tard en session New York — c'est la session au moment du signal qui a de la valeur diagnostique, pas celle de la clôture. Ça a demandé d'exposer `entry_time` dans `equityCurve` côté serveur (`fetchPerformanceBySymbol`, `supabaseTradeLog.js`) — jusqu'ici seul `exit_time` en sortait, suffisant pour le calendrier/stats horaires déjà en place mais pas pour ça.

**Qualité d'exécution** (`journal.html`, `renderExecutionQuality()`, nouvelle carte + badge par trade dans le journal détaillé) — compare le prix RÉELLEMENT rempli par le courtier (`dealPairing.js`'s `opening.executionPrice`, un fait) au prix que le SIGNAL visait au moment de l'ordre (le journal durable stocke déjà ce prix-là, voir `openPositionInfoByPositionId`/`_handleExecutionEvent` dans `cTraderDataSource.js`) — aucune des deux valeurs n'a été ajoutée pour l'occasion, seulement rapprochées. Nouveau `enrichTradesWithSlippage()` (`supabaseTradeLog.js`) — même jointure symbole + heure de sortie la plus proche que `enrichTradesWithRMultiple`, mais indépendante (pas chaînée dessus, pour rester testable séparément) ; `slippage` est signé pour que positif = coût réel dans tous les cas (le signe s'inverse entre achat et vente — voir le commentaire de la fonction). Affiché en % du prix visé (pas en unités de prix brutes) pour pouvoir comparer XAUUSD et US100 sur la même échelle dans une seule table. **Limite honnête, documentée dans l'UI plutôt que cachée** : le vrai prix de fill n'est conservé nulle part au-delà de ce que `ProtoOADealListReq` couvre (jusqu'à 7 jours/20 trades) — pas de reconstruction possible sur une fenêtre plus large sans changer le schéma de la table durable, non fait ici (portée volontairement limitée à ce qui était déjà disponible, sans migration).

**Temps de récupération après un creux** (`journal.html`, `computeRecoveryStats()`/`renderRecoveryStats()`) — entièrement dérivé de la même `equityCurve` (aucune nouvelle donnée, aucun nouvel appel réseau) : pour chaque nouveau sommet de la courbe, mesure combien de trades ET combien de jours réels il a fallu pour le redépasser après en être descendu. Affiche aussi l'état courant ("en creux depuis N jours, pas encore reconquis") si la courbe n'a pas encore refait un nouveau sommet — répond concrètement à "cette série de pertes, c'est normal ou pas".

**11 nouveaux tests** (`test/supabaseTradeLog.test.js`) pour `enrichTradesWithSlippage` (signe selon la direction, tolérance, un match par ligne durable max, etc.) et pour le nouveau champ `entryTime` dans `equityCurve`.

**Vérifié visuellement** : serveur local + captures Playwright avec `equityCurve`/`trade-history` simulées (drawdown suivi d'une récupération, trades répartis sur les 5 sessions, glissements positifs et négatifs sur 2 instruments) — les 3 nouvelles cartes et le badge de glissement par trade s'affichent et se calculent correctement (vérifié les chiffres à la main), aucune erreur console.

`npm test` : 492/492.

**Fichiers** : `public/journal.html`, `src/dataSources/supabaseTradeLog.js`, `src/dataSources/cTraderDataSource.js`, `test/supabaseTradeLog.test.js`.

## Calendrier mensuel réel ($/%) + thème clair sur tout le site — 2026-09-15

Deux demandes d'Esdras dans la foulée : "j'aimerais voir un calendrier des jours du mois avec les chiffres faits, soit gagnant ou perdant, genre le 📆 avec les chiffres totaux de chaque jour, si c'est perte ou gain, avec chiffre brut et %" puis "j'aimerais avoir la couleur blanche aussi du site, pas seulement noir".

**Calendrier mensuel** (`public/journal.html`, nouvelle carte "📆 Calendrier mensuel", distincte de la heatmap GitHub-style existante) : une vraie grille de calendrier (7 colonnes Lun→Dim), un mois à la fois avec navigation ◀/▶ (désactivée sur le mois en cours), chaque jour affichant son gain/perte réel en $ ET en % du solde de CE jour-là (vert/rouge), plus le nombre de trades.

Ceci a révélé que le journal durable (`bot_trade_events`) ne stockait QUE le R-multiple, jamais le $ réel ni le solde résultant — impossible de calculer un vrai % sans ça. Corrigé à la source (pas une approximation) :
- Migration Supabase : 2 colonnes ajoutées à `bot_trade_events` (`pnl_usd`, `balance_after`), nullable (aucun backfill inventé sur les 21 lignes déjà enregistrées).
- `logClosedTrade()`/`toTradeRow()` (`supabaseTradeLog.js`) acceptent et persistent `pnlUsd`/`balanceAfter`.
- `cTraderDataSource.js` : le point d'appel réel (`_handleExecutionEvent`, après un ORDER_FILLED avec `closePositionDetail`) passe maintenant le vrai `pnl` du courtier et le vrai `store.balance` résultant — ces valeurs existaient déjà à cet endroit, juste jamais transmises jusqu'ici.
- `fetchPerformanceBySymbol()` sélectionne et renvoie les 2 nouvelles colonnes dans `equityCurve`.
- Le calendrier gère honnêtement les trades enregistrés AVANT cette migration (pnlUsd null) : bascule automatiquement en affichage R-only pour ces jours-là, jamais un $ inventé.
- 6 nouveaux tests (`test/supabaseTradeLog.test.js`).

**Thème clair** (`public/theme.js`, nouveau fichier partagé, chargé par les 4 pages) : bouton 🌙/☀️ dans chaque barre de navigation, bascule `data-theme="light"` sur `<html>`, persisté dans `localStorage` (`apexfvg-theme`) — le choix survit à la navigation entre pages et aux rechargements. Chaque page (`index.html`, `journal.html`, `accounts.html`, `chart.html`) reçoit un bloc `:root[data-theme="light"]` avec les mêmes noms de tokens que sa palette sombre existante (`--bg`, `--text`, `--green`, etc.) — aucune autre règle CSS n'a dû changer, tout référence déjà ces tokens. Le graphique en chandeliers (lightweight-charts, `chart.html`) reste volontairement sombre même en thème clair — convention courante des plateformes de trading (le panneau de prix reste sombre), seul le chrome de la page suit le thème.

Vérifié visuellement avec Playwright local (calendrier avec données simulées incluant un jour pré-migration en repli R-only ; bascule de thème sur les 4 pages ; persistance confirmée en naviguant d'une page à l'autre) — aucune erreur console, rendu correct dans les 2 thèmes.

`npm test` : 496/496.

## Rapport PDF exportable du journal — 2026-09-15

Esdras : "Rapport PDF exportable du journal" — une des idées offertes plus tôt ("un rapport propre téléchargeable... pour le soumettre à un prop firm ou le garder comme preuve de performance"), pas retenue dans le lot précédent, demandée maintenant.

**Bouton "⬇ PDF"** ajouté à côté du "⬇ CSV" existant sur la carte "Journal de trading" (`journal.html`) — même discipline que le CSV : respecte les filtres actifs (symbole/stratégie/fenêtre de jours), pas de surprise silencieuse d'export "tout" alors que l'écran affiche une vue filtrée.

**Contenu du rapport** (une seule fonction, `exportJournalPdf()`, aucune donnée nouvelle — tout est déjà sur la page) : en-tête + date de génération, performance globale (métriques), courbe d'équité (vraie ligne vectorielle, pas une image), répartition par stratégie et par instrument, statistiques par session ICT, temps de récupération après un creux, qualité d'exécution, puis le détail des trades affichés (mêmes colonnes que le CSV). Pagine automatiquement sur plusieurs pages si le contenu déborde.

**Choix technique** : `jsPDF` + `jsPDF-autotable` (nouvelle dépendance npm), vecteur natif — texte net et sélectionnable, pas une capture d'écran (`html2canvas` aurait rastérisé les graphiques et produit un fichier plus lourd et flou). Servi depuis notre propre origine (`/vendor/jspdf`, `/vendor/jspdf-autotable` dans `server.js`), pas un CDN — même raisonnement déjà documenté pour `lightweight-charts`. Vérifié `npm audit` : aucune nouvelle vulnérabilité introduite (les 4 signalées restent les mêmes dépendances transitives de `@reiryoku/ctrader-layer` déjà documentées).

**Vérifié visuellement, pas juste en lisant le code** : serveur local en mode démo, Playwright a cliqué le vrai bouton, intercepté le téléchargement, puis rouvert le PDF généré dans Chromium pour le capturer en image — courbe d'équité verte correcte, toutes les tables présentes avec les bons chiffres (recoupés avec les cartes déjà vérifiées de la précédente session de travail), pagination sur 2 pages propre, aucune erreur console.

`npm test` : 492/492 (inchangé — fonctionnalité 100% côté client).

**Fichiers** : `public/journal.html`, `src/server.js`, `package.json`.

## Retrait de l'ancienne heatmap (petits carrés) — 2026-09-15

Esdras : "Tu peux retirer l'ancien calendrier que j'avais vu avec les petits carrés. Je l'aimais pas de toute façon." — la heatmap GitHub-contributions-style (`renderCalendar()`, carte "Calendrier de performance") est retirée de `public/journal.html` (CSS, HTML, fonction JS, câblage dans `renderOverview`) ; le calendrier mensuel réel ($/%) prend sa place. `deriveTradeR()` conservé (encore utilisé par les stats heure/jour et session).

`npm test` : 496/496 (inchangé — retrait HTML/CSS/JS pur côté client).

## Preuve visuelle de conformité par trade — 2026-09-15

Esdras : "comment peut-on prouver visuellement que le trade a respecté les procédures dans le journal?" — après un mockup approuvé, puis "donne tout, pour l'avoir dès le départ" (inclure le biais H4/EMA200 dès le début, pas seulement les critères les moins coûteux).

**Concept** : chaque trade du journal affiche maintenant, à côté de son graphique, une checklist "Critères respectés" (✔/⚠/—) ET la zone FVG surlignée directement sur le graphique — pas une décoration, une vraie reconstruction basée sur le code de production réel.

**Nouveau module `src/dataSources/tradeCompliance.js`** — réutilise les VRAIES fonctions de production (jamais une réimplémentation séparée qui pourrait diverger) :
- `reconstructFvgZone()` : rejoue un `FvgEngine` simple sur les bougies de contexte déjà récupérées pour le graphique du trade (aucun nouvel appel réseau), retrouve la zone exacte + la bougie de validation.
- `isGapThroughFill()` : détecte EXACTEMENT le bug réel trouvé plus tôt cette session (2025-12-29 US100 — la bougie d'entrée traverse toute la zone sans la retoucher, fill optimiste) — flaggé comme anomalie plutôt que caché.
- `reconstructStopDistance()` : réutilise `computeStop()` (backtestEngine.js) tel quel, même mode (fvg-edge/swing) que la config réelle du symbole.
- `computeHtfBiasAtEntry()` / `requiredH1LookbackCandles()` : réutilise `buildHtfBiasSeries`/`makeBiasLookup` (htfBias.js), sur un NOUVEL historique H1 récupéré spécifiquement pour ce calcul (courbe H1→H4 par ré-échantillonnage si le symbole utilise une variante H4 — mathématiquement identique à ré-échantillonner depuis M15, aucune perte de précision, juste beaucoup moins de bougies à récupérer : ~800 H1 au lieu de ~3200 M15 pour un EMA200 sur H4).
- `reconstructRiskCheck()` : le risque réellement pris est reconstruit sans nouvelle colonne — `riskAmount = |pnl_usd / r_multiple|` (les deux déjà en base), comparé au réglage actuel de risque du compte.
- Périmètre honnête : la reconstruction riche (zone/stop/biais) ne couvre que la source **FVG** — Divergence/NWOG/Judas Swing/Weekly Sweep ont chacune leur propre définition de "signal valide", pas encore construite (visible dans l'UI : "Non applicable", jamais un ✔ inventé). Le critère "risque" reste universel (fonctionne pour toute source avec une correspondance dans le journal durable).

**Câblé dans `cTraderDataSource.js`** (`getTradeHistory()` → nouvelle méthode `_attachComplianceChecklists()`, après l'enrichissement R-multiple/slippage existant) : pour chaque trade FVG, récupère en plus l'historique H1 nécessaire (un nouvel appel `ProtoOAGetTrendbarsReq` par trade, uniquement quand la variante configurée n'est pas 'baseline') puis construit la checklist. Une panne réseau sur cet appel dégrade en "non vérifiable" pour l'item biais seul, jamais un blocage de tout le journal.

**`journal.html`** : `renderTradeChart()` dessine la zone FVG en bande semi-transparente sur toute la largeur visible (le serveur ne transmet que les bornes de prix {top,bottom}, pas l'index de formation — un choix délibéré pour rester simple). Nouvelle `renderComplianceChecklist()` combine les items serveur avec 2 items calculés côté client sans données supplémentaires : Session (réutilise exactement les frontières UTC déjà utilisées par "Statistiques par session") et Garde-fou (trivialement vrai — un signal bloqué ne devient jamais un vrai trade).

**Colonnes Supabase ajoutées** à `bot_trade_events` côté requête (`pnl_usd`, `balance_after` — déjà créées plus tôt aujourd'hui pour le calendrier mensuel, juste jamais sélectionnées par `fetchRecentTradeRows()` avant maintenant) — nécessaires pour le critère "risque appliqué".

**23 nouveaux tests** (`test/tradeCompliance.test.js` : reconstruction de zone bullish/bearish, gap-through-fill, les 2 modes de stop, biais EMA réel, risque dans/hors tolérance, orchestration complète y compris les 2 cas de dégradation gracieuse ; `test/supabaseTradeLog.test.js` : pnlUsd/balanceAfter à travers `fetchRecentTradeRows`/`enrichTradesWithRMultiple`).

**Vérifié visuellement** avec Playwright local (3 scénarios simulés : trade gagnant propre avec zone FVG visible et 6/6 critères ✔, trade avec l'anomalie réelle de gap-through flaggée ⚠, trade non-FVG avec dégradation gracieuse "Non applicable") — aucune erreur console, rendu correct dans les 3 cas.

`npm test` : 519/519.

## Le pill "OK" ne distinguait pas un compte simulé d'un compte réel — corrigé — 2026-09-15

Esdras, en regardant la vue d'ensemble multi-comptes : "Regarde. Je ne me rappelle pas que le compte cti fonctionnait" — `cti-freetrial` affichait un pill vert "OK" et un solde qui bougeait (9905.89$), donnant l'impression trompeuse d'un compte réel actif.

**Cause réelle, trouvée dans les logs Render** : le login Match-Trader de `cti-freetrial` échoue (`HTTP 403`, bloqué par un challenge Cloudflare du côté du courtier) — `server.js`'s `bootAccount()` bascule alors silencieusement sur `mockDataSource.js` (prix en marche aléatoire, trades simulés). Ce compte n'a jamais été réellement connecté ; tout ce qu'affiche la vue d'ensemble pour lui (prix, solde qui évolue) est 100% fictif — seul le bandeau "MODE DÉMO" en haut de page le signalait, pas la carte de la vue d'ensemble elle-même.

**Corrigé** (`public/index.html`, `renderAccountOverview()`) : un compte en `mode !== 'live'` affiche maintenant un pill ambre **"SIMULÉ"** (prioritaire sur OK/BLOQUÉ) et le texte de connexion précise "données 100% simulées, pas de connexion réelle" au lieu du vague "démo/déconnecté" précédent — distingue enfin visuellement "compte réellement connecté" de "repli automatique sur données fictives".

`npm test` : 519/519 (inchangé — changement d'affichage pur côté client). Vérifié visuellement (Playwright, `/api/accounts` simulé avec un compte live + un compte en repli démo).

**Non corrigé, à surveiller séparément** : le login Match-Trader de CTI reste bloqué par Cloudflare — reste à investiguer si ça vaut la peine de retenter (peut-être un problème temporaire côté CTI, ou une politique anti-bot qui bloque structurellement les logins automatisés).

## Nouveaux comptes restaient sur l'ancien mode "semi-automatique" — corrigé — 2026-09-15

Esdras : "on dirait que les nouveaux comptes suivent l'ancien système trade semi-automatique". Confirmé : `armAutoExecuteIfConfigured()` (qui applique `AUTO_EXECUTE_ALWAYS_ON` — voir son propre commentaire, "applied to EVERY account uniformly") n'était en réalité appelé QUE sur le chemin de connexion réelle RÉUSSIE dans `bootAccount()` — jamais dans les 2 branches de repli (échec de connexion → mode démo, ou aucun identifiant configuré du tout). Un compte comme `cti-freetrial`, bloqué en permanence sur un échec de connexion (voir l'entrée précédente sur le challenge Cloudflare), ne recevait donc jamais l'armement automatique et restait figé sur le mode semi-automatique par défaut — contredisant le comportement voulu et déjà appliqué à `default`.

**Corrigé** (`src/server.js`, `bootAccount()`) : l'appel à `armAutoExecuteIfConfigured(account)` sort des 2 blocs `try` pour s'exécuter une seule fois, après les 3 branches (succès cTrader, succès Match-Trader, échec/pas d'identifiants → démo) — vraiment uniforme sur tout compte, comme documenté. Le mode démo/simulé (`mockDataSource.js`) ignore de toute façon ce drapeau (il simule toujours, peu importe) — ce correctif ne change donc aucun comportement simulé, seulement ce que le tableau de bord affiche pour ces comptes-là.

`npm test` : 519/519 (inchangé — `bootAccount()` n'a pas de test dédié, changement vérifié manuellement en local avec `AUTO_EXECUTE_ALWAYS_ON=true`).

## Investigation live : BTCUSD concentre tout le volume, US100 n'a jamais tradé — 2026-09-15

Esdras : "Aucune trade jusqu'à présent?" puis "Regarde plutôt le US100, aucun trade maintenant?" — vérification en direct sur la production (pas en démo), via `/api/trade-log`, `/api/trade-history` et le nouvel endpoint `/api/signals`.

**Constat réel** : 21 trades clôturés depuis le 13/09, **tous sur BTCUSD** (stratégie FVG), taux de réussite 9.5% (2G/19P), total -2.12R. La plupart de ces pertes sont minuscules (-0.36$ à -0.89$) sur des positions fermées quelques secondes à quelques minutes après l'ouverture — pas un stop-loss classique. US100/US500/XAUUSD/EURUSD/GER40 : **zéro trade**, y compris US100 spécifiquement vérifié.

**Cause identifiée, pas un bug** : BTCUSD tourne en M1 (une bougie/minute) contre M15 pour les autres symboles — une zone FVG s'y forme et se valide potentiellement toutes les quelques minutes, contre une fois par 15 min ailleurs. `/api/signals` confirmait au moment de la vérification : 20 signaux "actionable" en attente, tous sur BTCUSD, tous bloqués par `netting` (une position BTCUSD est déjà réputée ouverte) — alors qu'US100 n'avait que 2 zones en simple surveillance (`watching`), formées récemment, pas encore validées (pas de retest+reclaim). Le déséquilibre de volume est donc structurel (le choix du M1 pour BTCUSD), pas une panne — mais combiné au taux de réussite de 9.5%, la pertinence de la stratégie FVG sur le bruit du M1 BTCUSD reste une question ouverte, pas encore creusée plus loin.

Aucun changement de code pour cette partie — investigation seule.

## Chart : les FVG ne montrent plus que la journée en cours — 2026-09-15

Esdras, en creusant le point ci-dessus : "peux tu retire les notification fvg du charte les fvgs qui sont fait avant 12hr am de ce jour, je ne penses pas que notre stratégie tombe sur des fvg d'hier non?? car le chart est plein de fvg".

**Clarification donnée avant de coder** : la péremption réelle des zones FVG côté stratégie (`config.js`'s `fvg.maxAgeCandles`, 50 bougies) n'est PAS calée sur minuit — sur un symbole M15 ça fait jusqu'à ~12.5h de fenêtre, donc une zone formée hier soir peut techniquement rester valide ce matin. La demande d'Esdras est traitée comme un filtre d'AFFICHAGE uniquement (le chart était effectivement encombré de vieilles zones), pas un changement de la logique de trading elle-même — pas touché.

**`public/chart.html`, `renderOverlays()`** : les zones dont `formedAt` est avant minuit LOCAL du jour courant sont maintenant exclues avant d'être passées à `zonesPrimitive.setZones()` — même convention "minuit local" que le calendrier de `journal.html`. Le compteur "N zones FVG" en bas du graphique reflète déjà le total filtré, pas besoin de logique séparée.

**Vérifié visuellement** : serveur local + Playwright avec `/api/overlays` simulé (2 zones d'hier, 2 d'aujourd'hui) — le compteur affiche bien "2 zones FVG" au lieu de 4, confirmé aussi par une lecture directe de l'état interne (`_zones.length`) du composant de rendu. Aucune erreur console.

`npm test` : 492/492 (inchangé — filtre purement côté client, aucune logique backend touchée).

**Fichiers** : `public/chart.html`.

## Correction du filtre FVG : ne jamais cacher une zone encore "watching" — 2026-09-15

Esdras, immédiatement après le filtre minuit ci-dessus : "d'abord est-ce que ma stratégie fonctionnait sur les fvg avant 12hr am du jour présent? il faut qu'on le sache pour ne pas retirer ceux-là" — la bonne question à poser avant de faire confiance à un filtre.

**Vérifié sur les vraies données de production** (pas une supposition) : sur les 21 trades réels, **4 ont leur entrée dans les ~50 premières minutes après minuit UTC** (00:11, 00:20, 00:30, 00:32) — largement dans la plage où la zone FVG sous-jacente a pu se former AVANT minuit (BTCUSD expire après 50 bougies M1 = 50 min). Le filtre par date seule (`formedAt >= minuit`) livré une heure plus tôt était donc un vrai risque, pas théorique : il aurait pu cacher exactement une zone que la stratégie a réellement tradée.

**Corrigé** (`public/chart.html`, `renderOverlays()`) : chaque zone porte déjà un `status` calculé côté serveur (`chartOverlays.js`, rejoue le vrai moteur) — `watching` (toujours potentiellement vivante), ou `validated`/`expired`/`stale` (histoire terminée). Le filtre par date ne s'applique plus qu'aux 3 états terminaux ; une zone encore `watching` s'affiche toujours, quelle que soit sa date de formation — aucun risque de cacher un signal que la stratégie pourrait encore prendre.

**Vérifié visuellement** : Playwright avec 6 zones simulées (watching/expired/stale/validated d'hier + 2 d'aujourd'hui) — exactement 3 conservées (la `watching` d'hier + les 2 d'aujourd'hui), les 3 terminales d'hier filtrées. Aucune erreur console.

**Trouvé en lisant le code pendant la vérification, pas encore corrigé** : `chartOverlays.js`'s `FVG_MAX_AGE_MS` est câblé en dur sur M15 (15 min × 50 bougies = 12.5h) pour reclasser une zone `watching` trop vieille en `stale` — mais BTCUSD trade réellement en M1 (durée de vie réelle 50 min, pas 12.5h). Cet endpoint (`/api/overlays`, uniquement le chart) peut donc laisser une zone BTCUSD étiquetée `watching` jusqu'à 12.5h après sa vraie expiration en trading réel, avant de la requalifier `stale` — sans risque pour le trading lui-même (le moteur live utilise sa propre logique, pas ce recalcul), mais peut réintroduire un peu d'encombrement visuel pour BTCUSD spécifiquement. Pas corrigé aujourd'hui, signalé pour une prochaine session si ça vaut le coup.

`npm test` : 519/519 (inchangé — filtre côté client uniquement).

**Fichiers** : `public/chart.html`.

## Checklist en direct : "pourquoi pas encore de trade ?" — 2026-09-15

Esdras, après avoir confirmé (avec les vraies données) que les zones "watching" sur les symboles M15 restent bien dans la même journée : "est-ce qu'on peut voir le checklist utilisé pour prendre un trade en live... il me montrerait ce qui est okay, ce qui ne l'est pas encore, comme ça je saurais pourquoi on a pas encore de trade".

**Concept** : sur `chart.html`, une nouvelle carte "Pourquoi pas encore de trade ?" liste chaque zone FVG que le moteur surveille ACTUELLEMENT sur le symbole affiché, avec un ✔/✗/— par critère réel — biais haute unité de temps, structure de marché, fenêtre de session, sweep de liquidité — au lieu du seul ✓/✗ combiné que le moteur live calcule en interne. Le moteur live ne garde jamais la trace de QUEL filtre précis a fait échouer une zone — cette carte comble exactement ce trou.

**Nouveau `src/backtest/liveFvgFilterStatus.js`, `evaluateLiveFilters()`** — même discipline que `tradeCompliance.js` (son voisin, pour un trade déjà CLOS) : réutilise les VRAIES fonctions de production (`buildHtfBiasSeries`/`makeBiasLookup`, `buildStructureBiasSeries`/`makeStructureBiasLookup`, `isInNySessionWindow`, `buildLiquiditySweepEvents`/`makeSweepLookup` — les mêmes lookups que `buildFilteredEngine()`/`buildMultiTouchFilterPredicate()` consomment réellement en live), jamais une réimplémentation séparée. Seule vraie différence avec `tradeCompliance.js` : évalue "maintenant" (mobile, se rafraîchit à chaque bougie) au lieu de "au moment de l'entrée" (figé, un trade déjà passé).

**Piège de convention d'heure, débusqué avant qu'il ne morde** (le même genre de bug qui a déjà coûté cher plus tôt dans ce projet — voir le bug de garde-fou de day-key) : `store.strategyEngine.getHistory(symbol)` retourne l'historique du moteur déjà décalé en "heure moteur" (UTC réel − 5h, voir `_toEngineCandle()`), ET `isInNySessionWindow()` attend SPÉCIFIQUEMENT cette même convention. Mais les bougies H1 fraîchement récupérées du courtier pour le biais sont en UTC RÉEL, non décalées — un décalage de 5h resté silencieux aurait faussé le biais sans jamais planter. Corrigé en décalant les bougies H1 (`- FIXED_EST_TO_UTC_OFFSET_MS`) avant de les passer à `evaluateLiveFilters()`, pour qu'elles restent cohérentes avec `atTime` (dérivé du même historique moteur) — documenté en détail dans le commentaire de `getPendingZoneChecklists()`.

**`cTraderDataSource.js`, `getPendingZoneChecklists(symbol)`** (nouvelle méthode) : réutilise `buildChartOverlays()` (déjà utilisé par `/api/overlays`) pour trouver les zones réellement encore `watching` (sa propre logique de requalification `stale` gère déjà le cas d'une zone qui a silencieusement dépassé sa vraie durée de vie), récupère l'historique H1 nécessaire pour le biais UNIQUEMENT quand le symbole en a besoin (`baseline` = aucun fetch), et construit la checklist par zone.

**Nouvelle route `/api/pending-checklist?symbol=X`** (`server.js`), cachée 5 minutes comme `/overlays` (même raisonnement : les zones "watching" ne changent pas plus vite qu'une nouvelle bougie M15) — répond `{reason: 'not connected to a live broker'}` en mode démo, jamais une erreur.

**Frontend (`chart.html`)** : nouvelle carte sous le graphique, fetch séparé et non bloquant de `loadChart()` (un aller-retour H1 plus lent chez le courtier ne doit jamais faire échouer ou ralentir le graphique de prix — try/catch entièrement autonome, même discipline que `startLiveTick()`).

**12 nouveaux tests** (`test/liveFvgFilterStatus.test.js`) — reprennent exactement les mêmes fixtures que `htfBias.test.js`/`marketStructure.test.js`/`liquiditySweep.test.js`/`fvgMultiTouch.test.js` (y compris le test de convention d'heure fixe-EST-comme-UTC), élargies pour les vraies constantes de production (`STRUCTURE_LOOKBACK`/`SWEEP_LOOKBACK`/`SWEEP_WINDOW_CANDLES` de `gridRunner.js`) — chaque critère vérifié indépendamment, jamais court-circuité.

**Vérifié visuellement** : serveur local + Playwright, `/api/pending-checklist` simulé avec 2 zones (une avec 2 critères en échec, une avec 1 seul) — rendu correct, ✔ vert / ✗ rouge / — gris, aucune erreur console ; confirmé aussi le repli gracieux réel en mode démo ("Pas connecté au courtier").

`npm test` : 531/531.

**Fichiers** : `src/backtest/liveFvgFilterStatus.js` (nouveau), `src/dataSources/tradeCompliance.js`, `src/dataSources/cTraderDataSource.js`, `src/server.js`, `public/chart.html`, `test/liveFvgFilterStatus.test.js` (nouveau).

## Bug réel trouvé en vérifiant la checklist en direct sur la production : biais toujours "Inconnu" — corrigé — 2026-09-15

Immédiatement après le déploiement ci-dessus, vérifié contre la VRAIE production (pas juste le mode démo local) : `curl /api/pending-checklist?symbol=US100` répondait correctement (13 zones réelles, structure/session/sweep tous cohérents), mais le critère **biais** affichait "Inconnu" sur les 13 zones sans exception — jamais Haussier ni Baissier.

**Cause réelle trouvée** : l'appel `ProtoOAGetTrendbarsReq` pour récupérer l'historique H1 nécessaire au biais (dans `getPendingZoneChecklists()`, et dans `_attachComplianceChecklists()` — la checklist de conformité déjà en production pour les trades clos, exactement le même bug) ne passait PAS le paramètre `count`, seulement `fromTimestamp`/`toTimestamp`. Le commentaire de `_subscribeLiveCandles()` (le warm-up principal) documentait déjà l'inverse — qu'une requête avec `count` seul, sans `fromTimestamp`/`toTimestamp`, est REJETÉE par le courtier — mais l'autre sens (from/to sans `count`) n'avait jamais été vérifié : le courtier l'accepte silencieusement mais plafonne la réponse à un nombre de bougies bien inférieur à ce qui est nécessaire pour amorcer un EMA200 (H4/EMA200 a besoin de ~840 bougies H1, soit ~35 jours) — jamais une erreur, jamais un throw, juste un historique trop court, silencieusement.

**Pourquoi ce bug n'avait jamais été vu avant** : `_attachComplianceChecklists()` (checklist pour un trade CLOS) n'a jamais eu l'occasion de s'exécuter sur un vrai trade FVG avec biais configuré — zéro trade réel sur US100/US500/XAUUSD à ce jour (voir l'investigation live plus haut). La toute nouvelle checklist EN DIRECT de ce soir est le premier code à avoir réellement exercé ce chemin contre la production — et donc le premier à révéler le bug.

**Corrigé** : `count: lookback` ajouté aux deux appels (même valeur déjà calculée pour `fromTimestamp`, `requiredH1LookbackCandles(cfg.variant)`).

`npm test` : 531/531 (inchangé — aucun test n'asserte la forme exacte de la requête broker, seulement son résultat déjà mocké).

**Fichiers** : `src/dataSources/cTraderDataSource.js`.

## "Checklist pour trade" recentrée : une seule zone, active, formée aujourd'hui — 2026-09-15

Esdras, sur la carte "Pourquoi pas encore de trade ?" ajoutée par l'autre session : "le pourquoi pas encore de trade n'est pas exactement ce que j'avais en tête. je voulais seulement avoir celui du plus recent trade, pas plusieurs, ensuite je ne voulais pas écrire pourquoi pas de trade mais uniquement Checklist pour trade et uniquement pour les fvg d'aujourd'hui et aussi fvg actif, et non ceux qui ont déjà été violé".

**Corrigé** (`public/chart.html`, `renderPendingChecklist()`, affichage seulement — aucun changement de logique de trading) :
- Titre renommé "Pourquoi pas encore de trade ?" → **"Checklist pour trade"**.
- Le serveur (`getPendingZoneChecklists`) filtrait déjà sur `status === 'watching'` (jamais une zone déjà validée/expirée/périmée — le "déjà violé" d'Esdras était déjà couvert côté serveur).
- 2 nouveaux filtres côté client, même convention "minuit local" que le filtre "aujourd'hui" du graphique lui-même (`renderOverlays`, ajouté plus tôt par l'autre session) : ne garde que les zones formées aujourd'hui, puis ne garde que **la plus récente** des zones restantes (une seule carte affichée, jamais plusieurs).

Vérifié visuellement avec Playwright (3 zones simulées : une d'hier, une plus tôt aujourd'hui, une plus récente aujourd'hui — seule la 3e s'affiche), aucune erreur console.

`npm test` : 531/531 (inchangé — filtre d'affichage pur côté client).

## Nouvelle section "Positions ouvertes (réelles, temps réel)" — 2026-09-15

Esdras : "je veux voir un endroit en dessus de la partie garde-fou, compte réel qui me montre les positions réelles que je suis actuellement, pour que je puisse suivre la position en temps réel comme les brokers".

Les données existaient déjà entièrement côté serveur (`accountReconciliation.js`, alimentées par `ProtoOAReconcileReq` — jamais une croyance du bot) et étaient même déjà envoyées au client (`/api/accounts/:id/account`'s `positions`), mais seulement affichées comme une petite liste à puces noyée DANS la carte "Compte réel", avec juste direction/entrée/marge/P&L.

**Ajouté** (`public/index.html`) : une vraie table dédiée, style courtier, juste au-dessus de la section "État actuel" — Symbole, Volume, Entrée, Prix actuel, Stop, Cible, P&L flottant (coloré vert/rouge), Ouverte depuis — avec un point vert pulsant à côté du titre de section pour signaler le temps réel. La liste à puces redondante à l'intérieur de "Compte réel" est retirée (cette carte garde seulement ses agrégats : solde, équité, marge, P&L flottant total, exposition totale).

`npm test` : 531/531 (inchangé — restructuration d'affichage pur côté client, aucune nouvelle donnée). Vérifié visuellement (Playwright, positions simulées, thèmes clair et sombre).

## Carte "Progression du challenge" + la table de positions devient vraiment temps réel + bouton "Fermer" — 2026-09-15

Esdras, après l'audit "quelles sont les données utiles mais noyées ?" : "on prend 1" (la progression challenge — cible de profit / plancher de drawdown, déjà calculée par `GuardrailEngine` mais jamais affichée nulle part), puis sur la table de positions fraîchement ajoutée : "le prix actuel ne bouge pas, le pnl ne bouge pas, ensuite on ne voit pas d'endroit où fermer la position, l'équité ne bouge pas".

**Nouvelle carte "Progression du challenge"** (`public/index.html`, `renderChallengeProgress()`) entre "Garde-fous" et "Compte réel" — toutes les données existaient déjà dans `GuardrailEngine.getStatus()`/`/api/status` (`targetPct`, `targetBalance`, `targetReached`, `maxDrawdownPct`, `maxDrawdownType`, `overallDrawdownFloor`, `overallDrawdownBreached`) mais n'étaient rendues nulle part. Affiche cible de profit + progression, plancher de drawdown + distance, une barre visuelle (plancher → solde de départ → cible) quand les deux bornes sont connues, et un message honnête "pas un compte de challenge" quand `targetPct`/`maxDrawdownPct` sont tous les deux `null` (le compte `default` actuel, pas encore un vrai challenge configuré).

**Table de positions vraiment temps réel** — la cause : le seul aller-retour qui alimentait la table (`/api/accounts/:id/account`, un vrai `ProtoOAReconcileReq`) tourne à dessein toutes les 30s (pas question de le marteler plus vite), donc quelqu'un qui regarde la table 10-15s n'y voyait littéralement aucun changement. Le flux SSE `/stream` pousse pourtant déjà `symbols[].lastPrice` chaque ~1s (chaque tick réel plié en direct côté `cTraderDataSource.js`). Ajouté : `lastKnownPositions`/`lastKnownBalance` (mis à jour à chaque `/account`), et `recomputeLivePositions()` — appelée à chaque frame SSE (`renderStatus()`), recalcule `currentPrice`/`netFloatingPnl` par position et `equityEstimate` global à partir du `lastPrice` le plus frais, sans aucun aller-retour broker supplémentaire. Miroir exact de la formule de `accountReconciliation.js`'s `enrichRealPosition()` (même convention de signe, même swap+commission).

**Bug réel trouvé en vérifiant sur le compte réel** : `fmt(p.units, 0)` affichait "0" pour une position BTCUSD réelle avec `units: 0.01` (0 décimale fixe, pertinent pour un symbole en unités de 1+ mais pas pour un volume centilot). Corrigé avec `fmtUnits()` — `toFixed(4)` puis retrait des zéros de fin au lieu d'un nombre de décimales fixe.

**Bouton "Fermer"** — nouvelle route non-admin `POST /api/accounts/:id/positions/:positionId/close` (`server.js`), qui délègue à `closePositionOnBroker()` (extraite de l'ancienne route `/admin/close-position`, gardée ADMIN_EXPORT_TOKEN pour son propre usage — même logique `ProtoOAClosePositionReq` + attente de confirmation, pas de réimplémentation séparée). Le bouton reconstruit le `volume` broker (centilots) exactement depuis `units` (`Math.round(units * 100)`, l'inverse exact de la division par 100 qu'`enrichRealPosition()` fait déjà), demande une confirmation explicite (`confirm()`, action irréversible, ordre au marché réel), puis rafraîchit la table/le compte que la fermeture réussisse ou échoue.

**Vérifié** : `npm test` 531/531 (inchangé, aucun test existant ne touche ce chemin). Playwright — carte challenge rendue correctement (cible/plancher/barre, position 15% calculée juste), table de positions avec `units: 0.01` affiché "0.01" (plus "0"), clic sur "Fermer" → dialogue de confirmation correct → requête réelle vers `/positions/:id/close` → réponse serveur réelle (503 "not connected to a live broker" en mode démo local, chemin d'erreur affiché correctement dans l'alerte) — testé contre le VRAI serveur de dev, pas seulement des routes mockées, donc le chemin serveur est confirmé de bout en bout, pas seulement le rendu client.

**Fichiers** : `public/index.html`, `src/server.js`.

## Le plus long écart réel entre deux trades (combo complet) — 2026-09-15

Esdras, après la réponse sur les moyennes de fréquence (trades/an) : "OK" puis "dis-le moi" — le vrai plus long écart mesuré, pas juste une moyenne.

Nouveau script `scripts/computeInterTradeGaps.js` — réutilise EXACTEMENT la même simulation que `checkOutcomeSerialCorrelationFullCombo.js` (combo FVG US100+US500+XAUUSD + Divergence US100/US500, même config, même guardrail, même timeline chronologique) mais trace `entryTime` de chaque trade OUVERT (pas la clôture — "un jour sans trade" veut dire aucune ouverture ce jour-là) et calcule l'écart en jours entre ouvertures consécutives.

**Piège trouvé avant de répondre** : les 10 plus longs écarts bruts tombent tous en 2018 (jusqu'à 55 jours), sauf un. Cause vérifiée directement via `csvLoader` : `XAUUSD.csv` commence en 2018-01-01, mais `US100.csv`/`US500.csv` ne commencent qu'en 2019-01-01 — toute l'année 2018 n'a donc QUE XAUUSD réellement tradable dans ce "combo à 3 symboles", pas un vrai régime établi. Aurait donné une réponse trompeuse (des écarts qui reflètent des données manquantes, pas un vrai silence du combo). Exclu explicitement, chiffre séparé donné pour 2019+ (régime établi, les 3 symboles FVG réellement disponibles).

**Résultat (2019-2025, 1373 écarts sur 1374 trades)** : le plus long écart réel est de **18,8 jours** (2023-06-08 → 2023-06-26), suivi de 16,4j (2023-03-20 → 2023-04-05) et 13,5j (2023-06-26 → 2023-07-10) — 2023 concentre les plus longs silences. Moyenne 1,86 jour, médiane 0,91 jour, 33% des écarts dépassent 2 jours. Cohérent avec la réponse déjà donnée sur les moyennes annuelles (24-148 trades/an) : les écarts de plusieurs jours sont fréquents et normaux, mais 2 jours reste loin du record historique de ce combo (18,8 jours).

**Fichiers** : `scripts/computeInterTradeGaps.js` (nouveau).

## Combien de trades la semaine dernière si le bot avait déjà tourné — 2026-09-15

Esdras : "j'aimerais voir combien de trade j'aurais fait la semaine dernière si le bot était déjà disponible".

Les CSV de backtest s'arrêtent au 2025-12-31 (impossible de couvrir "la semaine dernière", 2026-09). Solution : le bot retient déjà ~2,5 mois de vraies bougies M15 par symbole en mémoire (`LiveStrategyEngine.getHistory`), exposées sans auth via `GET /api/accounts/default/candles?symbol=X&limit=5000` — récupérées en direct depuis la production (`https://ict-fvg-bot.onrender.com`, juillet 2026 → aujourd'hui), donc de VRAIES données courtier, pas une simulation.

Nouveau script `scripts/replayLastWeekOnRealData.js` — construit un `LiveStrategyEngine` EXACTEMENT comme `accountRuntime.js` le fait en vrai (`fvgConfig`/`divergenceConfig`/`nwogConfig`/`judasSwingConfig`/`weeklySweepConfig`/`pyramidConfig` tous pris directement dans `CONFIG`, pas réimplémentés), puis rejoue ces vraies bougies avec `engine.warmUp()` (même mécanisme que `forwardTest.js`). BTCUSD exclu explicitement (smoke-test temporaire documenté, pas un mécanisme validé, nécessiterait ses propres bougies M1 natives). Pyramide supposée désactivée (`PYRAMID_ENABLED` non défini dans ce sandbox — question déjà ouverte de savoir si elle l'est réellement sur Render).

**Résultat, semaine calendaire du lundi 7 au dimanche 13 septembre 2026** : **4 trades, 0 gagnant / 4 perdants, -4R** — 2× Divergence US500, 1× FVG US100, 1× NWOG US100. Repère secondaire (7 derniers jours glissants jusqu'à maintenant) : 3 trades (1W/2L, +1R), incluant le Weekly Sweep GER40 qui vient de gagner (+3R) le 15 septembre. Sur toute la fenêtre disponible (~2,5 mois, 39 trades au total, tous mécanismes/symboles réels confondus), rythme cohérent avec les moyennes déjà documentées (~3,5/semaine).

**Fichiers** : `scripts/replayLastWeekOnRealData.js` (nouveau).

## Suite : semaine d'avant + 30 derniers jours (même rejeu réel) — 2026-09-15

Esdras, en suite directe : "regarde LA semaine d'avant alors, regarde sur les 30 derniers jours". Deux fenêtres ajoutées au même script (`replayLastWeekOnRealData.js`), même rejeu, mêmes données déjà en cache (pas de nouvel appel réseau) :

- **Semaine d'avant (31 août → 6 sept)** : 5 trades, 0W/5L, -5R.
- **30 derniers jours glissants** : 20 trades, **2W/18L (10% de réussite), -12R** (≈ -3,6% du compte au risque actuel de 0,3%/trade, confirmé en direct via `/api/status`).

**Signal notable trouvé en creusant par source, pas juste le total** : le -12R n'est PAS réparti uniformément — **FVG est à 0/9 sur cette fenêtre** (alors que son taux de gain backtesté validé tourne autour de 38-41% pour US100 multi-touch), pendant que Judas Swing et Weekly Sweep ont chacun décroché 1 gagnant sur 3. C'est FVG qui tire tout le mois vers le bas, pas un problème uniforme sur les 5 mécanismes.

**Vérification statistique avant de crier au bug** : à un vrai taux de gain de 38%, la probabilité d'enchaîner 0 gagnant sur 9 trades FVG est d'environ 1,4% (calcul binomial (1-0.38)^9) — rare, mais pas du tout impossible sur un échantillon aussi petit. Pas assez d'éléments pour conclure à un bug ou un changement de régime avec seulement 9 trades — **à surveiller dans les semaines qui viennent** : si FVG continue nettement sous son taux de gain backtesté au-delà de ce mois, ce sera le signal à creuser (spread réel vs supposé dans les coûts, changement de régime de marché récent, etc.), pas avant.

**Fichiers** : `scripts/replayLastWeekOnRealData.js`.

## Suite : ~7 mois réels via la route admin (le vrai chiffre demandé) — 2026-09-15

Esdras a remarqué à juste titre l'incohérence ("comment t'as pu faire le test pour les 7 derniers mois alors [que la route plafonne à 5000 bougies]?") entre l'analyse pluriannuelle (CSV déjà sur disque, construits via de multiples appels admin dans des sessions passées) et le plafond de la route dashboard `/candles`. Elle a ensuite fourni elle-même le token `ADMIN_EXPORT_TOKEN` (existant sur Render, jamais connu de cette session) après une clarification explicite (donner le token existant = zéro redémarrage du bot, vs. en créer un nouveau via l'API Render = redémarrage du service, refusé par précaution — voir la question posée avant d'agir).

**`scripts/replayLastWeekOnRealData.js` généralisé** pour accepter en entrée soit les JSON de `/candles` (plafond ~2,5 mois), soit des CSV `time,open,high,low,close` de `/admin/export-candles?days=245&token=...` (cTrader accepte jusqu'à 245 jours/~35 semaines PAR requête, une seule requête a suffi ici) — même format que `loadCandlesFromCsv()` lit déjà pour les CSV historiques, aucune duplication. Ajouté aussi : un taux de gain par source (W/L, %) sur chaque fenêtre, pas seulement le total.

**Récupéré : 2026-02-10 → 2026-09-15 (~218 jours réels, ~7 mois pile)**. Le token n'a jamais touché le repo (vérifié par recherche avant de committer) ni aucun fichier committé — utilisé uniquement en argument de requête `curl` directe, données sauvegardées dans le scratchpad de session, jamais dans le projet.

**Résultat (218 jours, tous mécanismes/symboles réels confondus)** : 145 trades, 44W/101L (30,3%), **totalR = +54R** (≈ **+16,2% du compte** sur ~7 mois au risque actuel de 0,3%/trade) — un échantillon nettement plus solide et clairement positif.

**Ça corrige la lecture inquiète des notes précédentes sur FVG** : sur ce plus grand échantillon, FVG est à **12 gagnants sur 44 (27%)** — pas 1/11 (9%) comme la fenêtre de 30 jours seule le suggérait. À un RR de 4-5, le seuil mécanique de rentabilité est ~17-20% : 27% est donc confortablement positif, pas un edge cassé. Le passage à vide récent (0/9 sur les 30 derniers jours) était bien une vraie série de malchance à l'intérieur d'un échantillon plus large sain, pas le signe d'un problème structurel — exactement l'hypothèse "pas encore assez de trades pour juger" déjà posée dans la note précédente, maintenant confirmée par plus de données réelles plutôt que par une supposition. Détail par source : NWOG 8/16 (50%), Weekly Sweep 9/29 (31%), Judas Swing 6/20 (30%), Divergence 9/36 (25%, tout juste au seuil mécanique de son RR3 — celui à surveiller en priorité si un signal futur se dégrade encore).

**Fichiers** : `scripts/replayLastWeekOnRealData.js`.

## Suite : combien de semaines perdantes, et la plus longue série — 2026-09-15

Esdras : "Combien de semaine de losing strike on a?" Ajouté un regroupement par semaine calendaire (lundi→dimanche UTC, même convention que les fenêtres précédentes) sur les mêmes 145 trades du rejeu réel de 7 mois, avec totalR par semaine et la plus longue série de semaines perdantes CONSÉCUTIVES (une semaine sans trade n'est ni gagnante ni perdante, ne casse pas une série).

**Résultat (31 semaines avec au moins un trade, 2026-02-16 → 2026-09-14)** : **11 semaines perdantes sur 31 (35%)**. **Plus longue série consécutive : 4 semaines perdantes d'affilée**, du 17 août au 7 septembre 2026 — exactement la période qui a motivé toutes les questions de cette conversation. C'est la pire série de toute la fenêtre de 7 mois disponible ; le reste du temps, aucune série perdante ne dépasse 1 semaine isolée. Contrepoint utile : la semaine du 13 avril a fait à elle seule +27R, un rappel que la distribution est très asymétrique (peu de grosses semaines gagnantes portent l'essentiel du +54R total).

**Fichiers** : `scripts/replayLastWeekOnRealData.js`.

## Est-ce qu'un challenge aurait brûlé pendant la série de 4 semaines perdantes ? — 2026-09-15

Esdras, suite directe à la série perdante trouvée : "que se passerait-il avec le challenge? On aurait pas brûlé le compte du 17 août au jour que tu as vu encore perdant?"

Nouveau script `scripts/checkChallengeSurvivalOnRealTrades.js` — réutilise le MÊME rejeu réel (145 trades, combo production complet, 2026-02-10 → 2026-09-15) mais simule le solde/plancher de plusieurs vrais programmes prop firm (`src/propFirms/*.js`, déjà sourcés/vérifiés dans des sessions précédentes) au risque challenge réel (0.5%/trade, compounding, `CONFIG`'s propre défaut challenge — pas le 0.3% actuellement en mode live), via le VRAI `GuardrailEngine` (même calcul de plancher `_overallDrawdownFloor()` que la production, pas réimplémenté).

**Résultat : sur la série du 17 août au 13 septembre, AUCUN des 5 programmes testés n'aurait cassé son plancher.** Au 17 août, le solde avait déjà +37,3% de coussin (accumulé depuis février, porté notamment par une semaine à +27R mi-avril) ; le point le plus bas de la série (10 septembre) n'est redescendu qu'à +28,6% — largement au-dessus de tous les planchers testés (FTMO 1-Step 10% trailing fin de journée, FTMO 2-Step 10% statique, FundingPips Phase 1 10% statique, FundingPips Flex 12% statique, FundingPips Instant 5% trailing-verrouillé-au-départ).

**Un seul programme a effectivement brûlé sur toute la fenêtre de 7 mois — mais PAS pendant cette série** : FundingPips Instant (plancher le plus serré, 5% trailing) a cassé son plancher le **5 mars 2026**, à cause d'une série perdante bien plus tôt (mi-février/début mars, avant que le coussin ne se construise) — un problème totalement différent, déjà loin derrière au moment de la série d'août-septembre.

**Limite explicite** : seuls les 3 types de plancher réellement implémentés dans `GuardrailEngine._overallDrawdownFloor()` (`static`, `trailing-eod`, `trailing-locks-at-start-balance`) ont pu être simulés correctement. CTI (`trailing-on-every-close`) et GoatFundedTrader (`trailing-realtime-equity-never-resets`) ne sont PAS encore reconnus par cette fonction (elle échoue "ouvert" - jamais de blocage - plutôt que de deviner une formule) : ces deux-là ne sont pas simulés ici, pas parce qu'ils survivraient forcément, mais parce que ce serait un faux "jamais brûlé" tant que leur mécanique de trailing spécifique n'est pas codée.

**Fichiers** : `scripts/checkChallengeSurvivalOnRealTrades.js` (nouveau).

## Suite : y a-t-il déjà eu une série aussi mauvaise avant ? — 2026-09-15

Esdras : "Est-ce qu'il y a eu dans le passé une série perdante autant?"

Ajouté au même script un vrai calcul de drawdown peak-to-trough (pas seulement des semaines consécutives - la profondeur réelle en % du solde, au risque challenge 0.5%/trade, compounding) sur les 15 épisodes trouvés dans la fenêtre de 7 mois complète.

**Réponse : non, c'est même le PIRE.** La série récente (pic le 13 août à 13938$ → creux le 14 septembre à 12798$) est un drawdown de **-8,2%, le plus profond des 15 épisodes de toute la fenêtre de 7 mois.** Le deuxième plus profond est l'épisode de février-mars (-5,9%, pic 18 fév → creux 11 mars) — c'est exactement celui-là qui avait fait casser le plancher de FundingPips Instant (5%) le 5 mars. Tous les autres épisodes restent sous -3,5%.

**Nuance importante, à ne pas généraliser à tort** : la série récente n'a rien cassé chez FTMO/FundingPips Phase1/Flex (planchers à 10-12%) uniquement parce qu'elle est partie d'un pic bien plus haut (+39% de coussin construit depuis février) — mais en profondeur pure (-8,2%), c'est la pire séquence jamais vue sur ce combo, et elle ne laisse plus que ~1,8 point de marge avant un plancher à 10%. Si un futur épisode de profondeur comparable arrivait avec MOINS de coussin accumulé au moment où il commence, le résultat serait différent - à garder en tête, pas une garantie que "le coussin protège toujours".

**Fichiers** : `scripts/checkChallengeSurvivalOnRealTrades.js`.

## Explication de la série perdante (13 août → 14 septembre) — 2026-09-15

Esdras : "Comment pourrais-tu expliquer cette perte continue? Fais des recherche."

**Investigation directe sur les vraies données (pas une supposition)** :
- **Divergence (US500) est à 0 gagnant sur 6, et les 6 sont dans la MÊME direction (bullish US500)** — le mécanisme parie sur un rattrapage d'US500 vs US100 après un décrochage statistique, mais US100 a progressé plus vite qu'US500 sur toute la période (US100 +2,32% du 1er août au 15 septembre contre US500 +1,32%, XAUUSD +5,19% — mesuré directement sur les vraies bougies) : l'écart a continué à se creuser au lieu de se refermer, donc le pari de retour à la moyenne a perdu à chaque fois, pas par malchance ponctuelle mais parce que la prémisse (retour à la moyenne) ne s'est pas vérifiée sur cette fenêtre précise.
- **Volatilité mesurablement plus basse pendant la série que juste avant** : amplitude moyenne par bougie M15 (% du prix) pendant le drawdown vs la période de référence juste avant : US100 0,131% contre 0,186% (-29%), US500 0,075% contre 0,125% (-40%), XAUUSD 0,198% contre 0,238% (-17%). Un marché plus calme réduit mécaniquement les chances qu'un signal FVG (RR 4-5, a besoin d'un vrai mouvement suivi) atteigne sa cible avant de retourner au stop — cohérent avec le FVG à 0/9 déjà trouvé sur cette même fenêtre.
- **Recherche externe (WebSearch) pour contextualiser, pas pour prouver une causalité précise sur CETTE donnée broker simulée** : le "summer lull" (creux estival) d'août est un phénomène saisonnier réel et documenté sur les marchés actions US/européens — volume en baisse d'environ 30% par rapport au pic de mars, volatilité réalisée en moyenne ~1 point sous la moyenne long terme en juin-juillet-août, participation institutionnelle réduite (vacances européennes notamment). Cohérent avec ce qui est mesuré ci-dessus, sans prétendre que c'est LA cause exacte de cette série précise sur ce flux de données broker/démo daté 2026.

**Conclusion** : pas un bug ni un edge cassé — un régime de marché plus calme/moins directionnel pendant cette fenêtre précise a mécaniquement pénalisé à la fois le mécanisme de retour à la moyenne (Divergence, la prémisse ne s'est pas vérifiée) et les mécanismes de suivi de mouvement (FVG, pas assez d'amplitude pour atteindre une cible RR4-5). Rien à corriger dans le code ; à surveiller si un prochain épisode de volatilité basse prolongée reproduit le même schéma, ça renforcerait l'hypothèse plutôt que de la confirmer définitivement sur un seul épisode.

**Fichiers** : aucun changement de code, recherche/diagnostic seulement.

## Suite : 3 derniers mois (plafond réel trouvé) — 2026-09-15

Esdras : "regards alors 3 mois precedent". Plafond technique trouvé et signalé honnêtement plutôt qu'ignoré : `GET /api/accounts/:id/candles` clampe sa réponse à 5000 bougies M15 maximum (`server.js`), donc la fenêtre la plus ancienne accessible par cette route est ~77 jours (1er juillet → 15 septembre), pas tout à fait 3 mois calendaires pleins. Aller plus loin demanderait la route admin `/admin/export-candles` (gated `ADMIN_EXPORT_TOKEN`, pas dispo dans ce sandbox) ou d'attendre plus d'historique réel — délibérément PAS de redémarrage de la connexion broker en prod juste pour ce chiffre (ça couperait le bot en train de trader).

**Résultat (77 jours, tous mécanismes/symboles réels confondus)** : 39 trades, 11W/28L (28% de réussite), **totalR = +7R** (≈ +2,1% du compte au risque actuel de 0,3%/trade) — donc net POSITIF sur la fenêtre complète, malgré les -12R des 30 derniers jours seuls (le début juillet a été nettement meilleur, compense).

**Le signal FVG se confirme sur la fenêtre entière, pas juste les 30 derniers jours** : FVG est à **1 gagnant sur 11 trades (9%) depuis le tout premier jour de données disponibles**, très en dessous de son taux de gain backtesté validé (~38-41% pour US100 multi-touch). Les autres mécanismes sont globalement dans leurs clous : Divergence 3/9 (33%, conforme), Judas Swing 3/6 (50%, échantillon trop petit pour juger), NWOG 2/3, Weekly Sweep 2/10 (20%, sous son propre attendu mais c'est le mécanisme le plus récent et le moins validé - une seule coupure train/test, jamais observé en live avant cette semaine).

Probabilité binomiale de ≤1 gagnant sur 11 essais à p=38% : ~4% — bas, mais pas suffisant pour conclure formellement à un bug ou un changement de régime avec seulement 11 trades. Reste la même recommandation que la note précédente : surveiller FVG spécifiquement dans les semaines à venir, et si la sous-performance persiste au-delà de ce format, creuser le spread réel vs supposé dans `transactionCosts.js`/`DEFAULT_SPREADS` en priorité (c'est le paramètre le plus susceptible d'être décalé de la réalité sans jamais planter).

**Fichiers** : `scripts/replayLastWeekOnRealData.js`.

## Cette série s'est-elle déjà produite les années passées ? — 2026-09-15

Esdras, suite directe à l'explication de la série perdante : "Est ce que ca sait produit deja das les donnees des annees passes? Si ca sest produit peut wtre on pourait eviter ce mois non?"

Nouveau `scripts/checkAugustSeasonalityAcrossYears.js` — rejoue le MÊME combo de production complet (même construction que `replayLastWeekOnRealData.js`/`checkChallengeSurvivalOnRealTrades.js`) sur les **7 années complètes des CSV historiques déjà validés (2019-2025)**, puis isole dans CHAQUE année la fenêtre calendaire EXACTE de la série 2026 (17 août → 7 septembre) — même mois/jour, année différente, pas une fenêtre glissante.

**Résultat : aucune année passée n'a connu un épisode comparable sur cette fenêtre précise.**

| Année | Trades | W/L | Total R | Semaines perdantes | Plus longue série |
|---|---|---|---|---|---|
| 2019 | 17 | 6/11 | +8R | 0/3 | 0 |
| 2020 | 27 | 11/16 | +25R | 1/4 | 1 |
| 2021 | 21 | 7/13 | +10R | 1/4 | 1 |
| 2022 | 21 | 6/15 | +9R | 2/4 | 1 |
| 2023 | 20 | 4/16 | **-3R** | 2/4 | 1 |
| 2024 | 16 | 7/9 | +22R | 1/4 | 1 |
| 2025 | 23 | 7/16 | +11R | 1/3 | 1 |
| **2026** | — | — | **négatif** | **4/4** | **4** |

**6 des 7 années sont nettement POSITIVES sur cette même fenêtre** (de +8R à +25R) ; seule 2023 est légèrement négative (-3R), et même là, jamais plus d'une semaine perdante d'affilée. 2026 est donc un vrai cas isolé — pas un pli saisonnier qui se répète chaque année, mais une combinaison de circonstances propre à cette année précise (le régime de volatilité mesurablement plus bas trouvé dans la note précédente).

**Réponse à "peut-on éviter ce mois" : non, ce serait une mauvaise idée.** Exclure systématiquement la fenêtre du 17 août au 7 septembre chaque année aurait sacrifié en moyenne ~+12R par an (moyenne des 6 années positives), pour n'éviter qu'un seul -3R (2023) sur 7 ans — un marché perdant-perdant classique de sur-ajustement à un seul épisode (même discipline déjà appliquée dans `calendar-exclusion-analysis.md` : ne jamais exclure une période a posteriori juste parce qu'elle a mal tourné une fois).

`npm test` : 531/531 (inchangé — script d'analyse seul, aucun changement de comportement en production).

**Fichiers** : `scripts/checkAugustSeasonalityAcrossYears.js` (nouveau).

## Le pire mois, et le meilleur mois pour démarrer un challenge — 2026-09-15

Esdras : "Et Le mois de janvier a fevrier? Ny a til pas un mois qui produit le plus de perte au lieu de gain? En plus j'aimerais savoir si je decide de prendre Le challenge, dans quel mois commencer."

Deux questions distinctes, traitées séparément dans le nouveau `scripts/checkMonthlySeasonalityAndChallengeStart.js` (même rejeu 7 ans du combo réel que le script précédent) :

**A) Y a-t-il un mois qui perd plus qu'il ne gagne ?** Regroupé par mois calendaire, toutes années confondues (2019-2025) :

| Mois | Total R (7 ans cumulés) |
|---|---|
| février (pire) | +82R |
| décembre | +91R |
| mars | +111R |
| mai | +121R |
| juin | +129R |
| août | +132R |
| avril | +159R |
| septembre / novembre | +168R |
| juillet | +177R |
| janvier | +184R |
| octobre (meilleur) | +197R |

**Réponse : non, aucun mois n'est net négatif.** Les 12 mois sont tous POSITIFS sur 7 ans cumulés — février est le plus faible (+82R, 29% de réussite, le taux le plus bas de l'année) mais reste largement gagnant, pas un mois à éviter en soi.

**B) Dans quel mois commencer un challenge ?** Simulé un vrai départ de challenge (FTMO 1-Step comme référence — cible 10%, perte quotidienne max 3%, plancher trailing-eod 10%, risque 0.5%/trade compounding, même `GuardrailEngine._overallDrawdownFloor()` que la production) au 1er de CHAQUE mois, sur chacune des 7 années où ce mois existe dans les données, fenêtre d'observation de 90 jours (choisie avant de regarder un résultat — aucun de ces programmes n'a de vraie limite de temps réglementaire).

**Résultat : le plancher n'a JAMAIS cassé, peu importe le mois de départ (0/7 dans les 12 cas).** La cible de profit est atteinte dans 7 cas sur 7 pour 10 des 12 mois ; janvier et février sont les deux seuls à n'atteindre la cible que 6 fois sur 7 dans la fenêtre de 90 jours (une année sur les deux n'a simplement pas eu le temps, jamais cassé pour autant). Classement (moins de casse d'abord, puis le plus rapide) : **octobre (24j en moyenne) > juillet (26j) > septembre (28j) > mai (30j) > janvier (31j) > juin (32j) > avril (35j) > novembre (36j) > décembre (37j) > février (37j) > août (38j) > mars (39j)**.

**Recommandation directe** : octobre est le meilleur mois pour démarrer (le plus rapide vers la cible, jamais cassé sur 7 ans) ; février reste le plus lent à atteindre la cible (cohérent avec le point A), mais même lui n'a jamais cassé le plancher dans cette simulation — pas un mois à éviter absolument, juste un mois où s'attendre à une progression plus lente vers la cible.

`npm test` : 531/531 (inchangé — script d'analyse seul).

**Fichiers** : `scripts/checkMonthlySeasonalityAndChallengeStart.js` (nouveau).

## Même simulation, mais pour 2026 (vraies données) — 2026-09-15

Esdras, après avoir vérifié la méthodologie du script précédent : "Fais la meme simulation pour lannee 2026". Esdras a fourni directement le `ADMIN_EXPORT_TOKEN` (même discipline de sécurité que la session précédente pour le rejeu de 7 mois — voir HANDOFF.md "Suite : ~7 mois réels via la route admin" : token utilisé uniquement en paramètre de requête `curl` direct, jamais écrit dans un fichier du projet ni commité — vérifié par recherche avant de committer, aucune trace trouvée).

**Récupéré via `/admin/export-candles?days=245&token=...`** : 2026-02-10 → 2026-09-15 (plafond réel du courtier par requête, ~245 jours — pas tout à fait janvier, voir plus bas).

**Nouveau `scripts/checkChallengeStart2026OnRealData.js`** — même logique EXACTE que `checkMonthlySeasonalityAndChallengeStart.js` (FTMO 1-Step référence, risque challenge 0.5%/trade compounding, fenêtre de 90 jours, même `GuardrailEngine`), mais appliquée à UNE SEULE année réelle (2026) au lieu de 7 années de backtest. Prend un dossier de CSV en argument (jamais le token lui-même), même convention que les scripts jumeaux de rejeu réel.

**Résultat, mois par mois** :

| Mois de départ | Couverture | Plancher cassé | Cible atteinte |
|---|---|---|---|
| janvier / février | pas de données réelles avant le 10 février | non simulable | — |
| mars | complète (90j) | non | oui, en 46j |
| avril | complète (90j) | non | oui, en **15j** (le plus rapide) |
| mai | complète (90j) | non | oui, en 73j (le plus lent) |
| juin | complète (90j) | non | oui, en 49j |
| juillet | tronquée (77j/90j réels) | non | oui, en 24j — atteint avant même la troncature |
| août | tronquée (46j/90j réels) | non | pas encore (trop tôt pour savoir, pas un échec) |
| septembre | tronquée (15j/90j réels) | non | pas encore (idem) |
| octobre → décembre | pas encore arrivé | — | — |

**Aucun mois testé n'a cassé le plancher en 2026, cohérent avec le résultat 2019-2025.** Avril est le départ le plus rapide observé cette année (15 jours jusqu'à la cible) ; mai le plus lent (73 jours) mais toujours sans casser. Août et septembre sont honnêtement rapportés "pas encore" plutôt que "échoué" — la fenêtre de 90 jours n'a simplement pas eu le temps de s'écouler.

`npm test` : 531/531 (inchangé — script d'analyse seul, aucune donnée 2026 committée dans le repo, uniquement dans le scratchpad de session).

**Fichiers** : `scripts/checkChallengeStart2026OnRealData.js` (nouveau).

## Assistant IA dans le chat du dashboard — 2026-09-15

Esdras, après le rapport PDF investisseur : "est Il possible de mettre un IA dans le chat de Mon bot pour repondre a des questions sur Les données ?" — puis, en pensant à l'investisseur ciblé par le PDF, qui n'est "pas un grand en trading" : "faudrait que lon explique comme si on en parlais avec quelqun de normal". Discuté le coût d'abord (tarifs Anthropic API vérifiés en direct : Haiku 4.5 à 1$/5$ par million de tokens en entrée/sortie ; estimation ~5-10$/mois pour un usage réaliste, largement en dessous vu le volume d'un dashboard privé) puis construit, sur demande explicite ("Construire le chat IA du dashboard maintenant").

**`src/chatAssistant.js`** (nouveau) : `buildChatContext(store)` rassemble les vraies données du bot (compte réel via `getAccountReconciliation()` si connecté, agrégats du journal durable Supabase via `fetchPerformanceBySymbol()`, trades bruts des 90 derniers jours via `fetchRecentTradeRows()` déjà existant dans `supabaseTradeLog.js` — jamais recalculé, jamais inventé) ; `answerChatQuestion({ message, history, context })` appelle `claude-haiku-4-5` (voir la table de tarifs — largement suffisant pour reformuler des stats déjà calculées en français simple, jamais pour faire le calcul lui-même sur un point critique) avec un system prompt qui : explique les termes techniques (R multiple, drawdown...) comme à quelqu'un qui découvre le trading, interdit d'inventer un chiffre hors du contexte fourni, interdit tout conseil financier personnalisé, et rappelle que les performances passées ne garantissent rien. Contexte + instructions passés en deux blocs `system` séparés avec `cache_control: { type: 'ephemeral' }` sur le second — les questions suivantes d'une même conversation renvoient le même contexte (API sans état, tout l'historique est réenvoyé à chaque appel), donc le cache évite de le repayer intégralement à chaque question.

**Route** : `POST /chat` ajoutée à `createAccountRouter()` (donc dispo sur `/api/chat` et `/api/accounts/:id/chat`, même routeur que tout le reste) — même absence d'auth que chaque autre route de ce routeur (dashboard privé single-user, quiconque a l'URL voit déjà ces données brutes via les autres routes ; ce chat ne fait que les expliquer en langage clair). Renvoie 503 explicite si `ANTHROPIC_API_KEY` n'est pas configuré côté Render plutôt qu'une erreur opaque.

**`public/chat-widget.js`** (nouveau) : bulle flottante + panneau de chat, même pattern que `theme.js` (un seul fichier chargé sur les 4 pages — index/journal/chart/accounts — pas de framework). Historique de conversation gardé en mémoire de page (perdu à l'actualisation, comme un chat normal), renvoyé à chaque question via `POST /api/chat`. Vérifié en Playwright : la bulle et le panneau s'affichent correctement sur les 4 pages, l'envoi d'un message fonctionne, et sans `ANTHROPIC_API_KEY` configuré (le cas dans cet environnement de dev) le message d'erreur "L'assistant IA n'est pas configuré..." s'affiche proprement dans le chat au lieu de planter.

**Reste à faire côté Esdras** : ajouter `ANTHROPIC_API_KEY` dans les variables d'environnement Render pour activer réellement les réponses (sans cette clé, le bouton de chat existe mais répond toujours "pas configuré" — comportement voulu, pas un bug).

`npm test` : 531/531 (inchangé — aucun test n'existait pour le chat, qui appelle une vraie API externe payante ; vérifié manuellement via Playwright + un appel réel de bout en bout sans clé configurée, voir ci-dessus).

**Fichiers** : `src/chatAssistant.js` (nouveau), `public/chat-widget.js` (nouveau), `src/server.js` (route `/chat`), `public/index.html`/`journal.html`/`chart.html`/`accounts.html` (balise `<script src="/chat-widget.js" defer>`), `package.json`/`package-lock.json` (dépendance `@anthropic-ai/sdk`).

## Le chat récupère aussi les 7 années de backtest + bug trouvé sur le classement mensuel du PDF — 2026-09-15

Esdras, juste après la mise en ligne du chat : "comment faire pour qu'il ai Les données des 7 annees?" — le chat ne voyait jusque-là que le journal durable Supabase (le vrai trading depuis que la persistance existe), pas le backtest 2019-2025 déjà utilisé dans le rapport PDF investisseur.

**Solution retenue** : rejouer 7 ans de bougies à chaque message de chat serait beaucoup trop lent. Nouveau script `scripts/buildBacktestSummary.js` (même construction EXACTE du combo que `checkAugustSeasonalityAcrossYears.js`) qui rejoue le backtest UNE FOIS et écrit un résumé compact (`overall`, `byYear`, `byMonth`, `bySymbol`, `bySource`) dans `data/backtest-summary.json`, committé dans le repo et rechargé en mémoire par `chatAssistant.js` (`loadBacktestSummary()`, quelques ms au lieu de plusieurs secondes). À relancer manuellement si la stratégie/config change. Le contexte du chat contient maintenant deux sources bien distinguées dans le system prompt : `journal`/`recentTrades` (le vrai argent réel) et `backtest7Years` (la simulation historique 2019-2025) — jamais mélangées sans le dire.

**⚠️ Bug trouvé en construisant ce script, affecte le PDF déjà envoyé à l'investisseur** : les CSV de `data/backtest-input/` couvrent en réalité **2010-2025** (16 ans), pas seulement 2019-2025 comme supposé partout dans cette session. `checkMonthlySeasonalityAndChallengeStart.js`'s `partA_monthlyBreakdown()` (le classement "quel mois est le plus fort/faible", utilisé dans le PDF page 3) rejouait TOUT l'historique disponible sans filtrer sur les 7 années annoncées — contrairement à `partB_bestStartMonth()` (la simulation de démarrage de challenge), qui, elle, boucle explicitement sur `YEARS=[2019..2025]` et n'est donc PAS affectée : ses résultats ("0/84 cassé", classement des mois pour démarrer) restent valides tels quels.

Chiffres corrigés (2019-2025 strictement, 2606 trades décidés au lieu de 3086) :

| | PDF envoyé (en fait 2010-2025) | Corrigé (2019-2025, 7 ans réels) |
|---|---|---|
| Total | +1719R | **+1564R** |
| Février (pire mois) | +82R | +83R *(quasi inchangé)* |
| Meilleur mois | **Octobre** +197R | **Juillet** +186R *(octobre tombe à +173R, 3e)* |
| Janvier | +184R | +144R |
| Avril | +159R | +126R |
| Septembre | +168R | +146R |
| Novembre | +168R | +143R |

Le classement complet corrigé (pire → meilleur) : février (+83R) < décembre (+92R) < mars (+99R) < mai (+123R) < juin (+124R) < août (+125R) < avril (+126R) < novembre (+143R) < janvier (+144R) < septembre (+146R) < **octobre (+173R)** < **juillet (+186R, nouveau meilleur mois)**.

**Impact concret sur le PDF déjà envoyé** : la page 3 (graphique en barres + les 4 tuiles "mois le plus faible/fort") affiche des chiffres tirés de 16 ans de données au lieu des 7 années annoncées dans le texte, et désigne octobre comme meilleur mois alors que c'est juillet sur la vraie fenêtre 2019-2025. La page 6 (recommandation de démarrage) n'est PAS affectée (simulation correctement bornée). Pas encore corrigé dans le PDF lui-même — à faire si Esdras veut renvoyer une version corrigée à l'investisseur.

`npm test` : 531/531 (inchangé).

**Fichiers** : `scripts/buildBacktestSummary.js` (nouveau), `data/backtest-summary.json` (nouveau, généré — 2019-2025 uniquement), `src/chatAssistant.js` (charge le résumé, system prompt distingue les deux sources de données).

## PDF investisseur corrigé + rendu accessible à un non-trader — 2026-09-15

Suite du bug de classement mensuel trouvé ci-dessus. Esdras a validé la correction ("Oui, corrige et renvoie-moi le PDF"), puis a soulevé un problème différent en relisant : "C'est ecrit dans un language quune simple personne peut. Comprendre?" — le PDF utilisait "R" des dizaines de fois sans jamais le définir, entre autres termes ICT non expliqués. Rappel explicite en même temps : "Noublies pas que c'est pour convainxre de linvestissement" — donc rendre le PDF lisible sans l'édulcorer ni perdre son ton orienté preuve.

**Corrections apportées** (régénéré via le générateur existant, 9 → 10 pages) :
- Chiffres corrigés : juillet +186R comme vrai meilleur mois (pas octobre +197R), février +83R (pas +82R) — voir l'entrée précédente pour le détail du bug.
- **Nouvelle page 2 "Comment lire ce rapport"** (glossaire) : R, drawdown, plancher statique/trailing, prop firm, backtest, win rate — chacun expliqué en une phrase simple, cadré comme argument de conviction plutôt que comme définition scolaire (à la demande explicite d'Esdras de garder l'angle persuasif).
- Section stratégie (page 3) réorganisée pour mener par le bénéfice (diversification sur 5 mécanismes, pas un seul pari) avant les noms techniques ICT.
- Page 7 (recommandation) clarifiée pour distinguer explicitement "meilleur mois pour DÉMARRER un challenge" (octobre, simulation de démarrage non affectée par le bug) de "meilleur mois calendaire en général" (juillet).

Vérifié visuellement page par page via Playwright (bug de troncature de texte trouvé et corrigé au passage : `statTiles()` clippait "10 fév → 15 sept" avec une taille de police fixe — ajout d'un rétrécissement dynamique + `maxWidth`).

**Fichiers** : uniquement le script de génération du PDF (hors dépôt, scratchpad de session) — aucun fichier commité dans `ict-fvg-bot` pour cette entrée, le PDF lui-même a été envoyé directement à Esdras.

## Faisabilité des challenges prop firm — HaitiForex vs FTMO/FundingPips/GoatFundedTrader/CTI — 2026-09-16

Esdras a partagé les règles exactes d'un challenge local (haitiforex.org/Practice.html, compte $50,000, ticket 2,500 gourdes, payout 25,000 gourdes) : objectif 10%, perte max 5% du capital (statique), **plafond de gain de $1,100/jour ($2.2%)**, minimum 5 jours de trading, **maximum 30 jours de durée de compte**, no scalping (durée min 5 minutes/trade), toutes les positions fermées avant 16h Haiti sinon compte annulé.

**Simulation construite** (scripts jetables de session, non commités) : rejeu du combo de production exact sur 2019-2025, une tentative par mois calendaire (84 tentatives), avec toutes les contraintes ci-dessus modélisées (plafond de gain quotidien qui limite ce qui compte vers l'objectif sans limiter le vrai P&L du compte, plancher statique, fenêtre de temps bornée).

**Résultat HaitiForex** : **26% de réussite** sur 84 tentatives, **0% d'échec par perte** (le plancher n'est jamais le problème) — l'échec vient à 74% du temps écoulé (30 jours) avant que le plafond de gain journalier ait laissé le compteur officiel atteindre l'objectif, alors que le compte gagne souvent PLUS que $5,000 en argent réel sur la même période. Testé sans le plafond journalier (toutes choses égales par ailleurs) : **46%** — le plafond à lui seul coûte ~20 points de réussite sans réduire le risque d'un centime.

**Comparaison avec les vraies règles des prop firms déjà cataloguées dans `src/propFirms/*.js`** (FTMO, FundingPips, GoatFundedTrader, CTI — voir ces fichiers pour le détail et les sources), même méthodologie (84 tentatives, 2019-2025), enchaînement des phases pour les programmes 2-step :

| Programme | Objectif | Perte quot. | Drawdown max | Limite de temps | Réussite | Délai moyen si réussi |
|---|---|---|---|---|---|---|
| **FTMO 1-Step** | 10% | 3% | 10% (trailing EOD) | aucune | **100%** | 35j cal / 20j trading |
| FTMO 2-Step | 10% puis 5% | 5% | 10% (statique) | aucune | 98.8% | 57j cal / 33j trading |
| FundingPips 2-Step Standard | 8% puis 5% | 5% | 10% (statique) | aucune | 98.8% | 49j cal / 28j trading |
| FundingPips 1-Step Flex | 12% | 3% | 12% (statique) | aucune | 98.8% | 43j cal / 25j trading |
| GoatFundedTrader 1-Step | 10% | 3% | 6% (statique) | non confirmée | 92.9% | 34j cal / 19j trading |
| CTI 1-Step | 8% | aucune | 5% (trailing serré) | aucune | 80.95% | 23j cal / 13j trading |
| HaitiForex $50k | 10% | — | 5% statique | **30j max** | 26% | bloqué par la deadline |

Aucun programme testé (HaitiForex compris) n'a jamais échoué par perte quotidienne ou drawdown — la stratégie ne s'approche jamais de casser un compte, peu importe la structure de règles. La seule variable qui fait vraiment varier le taux de réussite est la **rigidité du temps/plafond imposée**, pas le risque réel de la stratégie.

**Décision d'Esdras** : ne pas prendre le challenge HaitiForex ("mission impossible" initialement, nuancé après calcul — mathématiquement le pari est +EV avec son propre payout 10x, mais le vrai risque identifié est la fiabilité de la contrepartie : paiements informels Moncash/Zelle, contact WhatsApp uniquement, règle "activité frauduleuse" vague et à sens unique, page mélangeant challenge et sollicitation d'investisseurs façon MLM). **FTMO 1-Step identifié comme le meilleur choix objectif** (100% de réussite historique, une seule phase, aucune limite de temps, aucun plafond bizarre) — prix réels des comptes FTMO pas encore vérifiés, à faire dans une prochaine session si Esdras veut avancer.

`npm test` : inchangé (aucun code de production touché — uniquement des scripts d'analyse de session, non commités).

**Fichiers** : aucun commité — scripts de simulation dans le scratchpad de session uniquement. À recréer ou committer en dur dans `scripts/` si cette analyse doit être répétée régulièrement (même pattern que `scripts/buildBacktestSummary.js`).

## US100 étendu à 15 ans d'historique (2010-2025) — 2026-09-16

Esdras a uploadé 9 fichiers HistData.com M1 (`NSXUSD`, un par année 2010-2018) — `data/backtest-input/US100.csv` ne couvrait jusque-là que 2019-2025 (156 715 bougies M15), le plus court historique des 5 symboles réels, alors qu'EURUSD/GBPUSD remontent déjà à 2018 et GER40/USDCAD à 2010.

**Conversion** : réutilisé tel quel `scripts/convertHistData.js` (déjà utilisé pour USDCAD/GER40 - même convention horaire HistData "EST sans DST", parsée comme UTC brut pour rester cohérente avec elle-même et avec le resampling H1/H4 du bot, comme documenté dans ce script). 2 687 073 bougies M1 → 192 342 bougies M15 (2010-11-14 → 2018-12-31), fusionnées avec les 156 715 bougies existantes (2019-2025) : aucun chevauchement, aucun doublon retiré. **`US100.csv` couvre maintenant 2010-11-14 → 2025-12-31 (349 057 bougies)**, désormais aligné avec les autres symboles réels.

`npm test` : 531/531 (inchangé - fichier de données seul, aucun code touché).

**Pas encore fait** : le backtest 7 ans (`data/backtest-summary.json`, le rapport PDF investisseur, l'analyse de faisabilité des prop firms ci-dessus) reste délibérément borné à 2019-2025 partout - cette nouvelle donnée ouvre la possibilité d'un vrai backtest 15 ans si Esdras le demande, mais aucun résultat existant n'a été recalculé automatiquement (`buildBacktestSummary.js` filtre encore explicitement sur `YEARS=[2019..2025]`, à modifier manuellement si on veut élargir la fenêtre officiellement communiquée).

**Fichiers** : `data/backtest-input/US100.csv` (étendu, 8.2 Mo → ~18 Mo).

## US500 étendu à 15 ans d'historique (2010-2025) — 2026-09-16

Même chantier que US100 ci-dessus, immédiatement après : Esdras a uploadé 9 fichiers HistData.com M1 `SPXUSD` (2010-2018). Même méthode exacte (`scripts/convertHistData.js`, M15, fusion avec les 156 795 bougies existantes 2019-2025) : 2 117 667 bougies M1 → 190 549 bougies M15 (2010-11-14 → 2018-12-31), fusionnées sans chevauchement ni doublon. **`US500.csv` couvre maintenant 2010-11-14 → 2025-12-31 (347 344 bougies)**, aligné avec US100.

`npm test` : 531/531 (inchangé).

**Fichiers** : `data/backtest-input/US500.csv` (étendu).

## XAUUSD étendu à 16+ ans d'historique (2009-2025) — 2026-09-16

Troisième et dernier symbole de cette série (après US100/US500 ci-dessus) : Esdras a uploadé 9 fichiers HistData.com M1 `XAUUSD` (2009-2017, un an de plus que les deux précédents). Même méthode exacte : 3 093 575 bougies M1 → 210 229 bougies M15 (2009-03-15 → 2017-12-29), fusionnées avec les 162 431 bougies existantes (2018-2025) sans chevauchement ni doublon. **`XAUUSD.csv` couvre maintenant 2009-03-15 → 2025-12-31 (372 660 bougies)** — le plus long historique des 5 symboles réels.

`npm test` : 531/531 (inchangé).

**Bilan des 5 symboles réels après cette série de 3 extensions** : US100/US500 démarrent 2010-11-14, XAUUSD 2009-03-15, GER40 déjà à 2010 (session antérieure), seul EURUSD reste borné à 2018-01-01 (le plus court des 5) — à étendre si Esdras trouve/upload des fichiers HistData EURUSD M1 pré-2018.

**Fichiers** : `data/backtest-input/XAUUSD.csv` (étendu).

## Recherche GBPUSD/USDCAD — GBPUSD retenu (conditionnel au type de plafond de perte de la prop firm), USDCAD rejeté — 2026-09-16

Esdras, une fois connectée à internet pendant l'upload des fichiers ci-dessus : "tu ne profites pas pour me demander des pairs que tu penses seraient bien de les trader?" — plutôt que de demander de nouvelles données à l'aveugle, vérification de ce qui existait déjà et n'était pas exploité : `GBPUSD.csv` (2019-2025) et `USDCAD.csv` (2010-2025), jamais validés ni ajoutés au combo réel (5 symboles actuels : US100/US500/XAUUSD/EURUSD/GER40).

**Méthode réutilisée telle quelle** (aucun nouveau code) : `scripts/runTrainTestValidation.js` (grille de 168 configs, cutoff 2024-01-01, coûts de transaction réels) — le même outil qui a validé les 5 symboles actuels à l'origine.

**USDCAD : rejeté.** Aucune des 5 meilleures configs trouvées sur train (2010-2023) ne tient sur test (2024-2025) — toutes passent en R net négatif hors-échantillon (ex: +0.03R train → -0.10R test). Signe classique de surapprentissage, pas un edge réel.

**GBPUSD : recherche en 3 étapes, edge confirmé mais avec une réserve importante.**

1. **Grille standard (168 configs, session NY AM 8h-12h uniquement)** : un seul survivant, `H4_EMA20 / swing / structure OFF / session ON`, edge très mince (train 0.05R / test 0.04R, PF ~1.05-1.07) — jugé initialement trop faible pour être fiable.

2. **Recherche de fenêtre de session étendue** (le grid standard ne teste QUE 8h-12h ON/OFF, jamais d'autre horaire — GBP étant une devise à forte activité Londres, testé au-delà de la session NY) : la fenêtre **7h-10h NY (chevauchement Londres-NY), avec le filtre de structure ICT réactivé (ON)**, ressort nettement meilleure : train 0.08R / test 0.09R, PF 1.11/1.13.

3. **Vérification de robustesse** (3 découpages train/test différents : 2022/2023/2024, + année par année 2019-2025) : **positif sur les 3 découpages** (0.05R à 0.11R des deux côtés) et **6 années sur 7 positives** (seule 2023 légèrement négative, -0.03R, quasi breakeven) — un signal statistiquement bien plus crédible qu'à l'étape 1, pas du bruit.

**Config retenue pour GBPUSD (si activé) :** `variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: {startHour: 7, endHour: 10}, liquiditySweepEnabled: false`.

**Test au niveau compte complet** (`portfolioSimulator.js`, vraies guardrails du bot, $10,000, 2019-2025 continu — pas de reset annuel), à la demande explicite d'Esdras de tester risque réduit (0.3%) + pyramidage "stops indépendants" :

| Scénario | Trades (pyramidés) | Win rate | Drawdown statique | Drawdown trailing | Solde final |
|---|---|---|---|---|---|
| Sans pyramide, 0.5%/trade | 650 | 27.3% | 3.9% | 16.1% | $12,230 (+22.3%) |
| Sans pyramide, 0.3%/trade | 650 | 27.3% | 2.3% | 9.9% | $11,351 (+13.5%) |
| **Pyramide, 0.3%/trade de base** | **1088 (447)** | **31.4%** | **4.5%** | **13.0%** | **$12,247 (+22.5%)** |
| Pyramide, 0.5%/trade de base | 1088 (447) | 31.4% | 7.7% | 21.2% | $13,690 (+36.9%) |

**Découverte importante en cours de route** : le drawdown en R brut (25-35R, calculé sans guardrails via `gridRunner.js`) surestimait largement le vrai risque — les guardrails réelles du bot (max trades/jour, cooldown après perte, limite de perte journalière) empêchent d'enchaîner les signaux pendant une séquence perdante. Le drawdown STATIQUE réel simulé au niveau compte (3.9%-4.5%) est très en dessous de cette estimation brute. Risque réduit (0.3%) + pyramidage rattrape quasiment exactement le rendement du risque plein sans pyramide (22.5% vs 22.3%), avec plus de trades et un meilleur win rate.

**La réserve qui reste, et pourquoi la décision est CONDITIONNELLE** : drawdown **statique** (3.9-4.5%) très correct, mais drawdown **trailing** (13-16%) dépasse un plafond trailing de 10% (FTMO 1-Step, GoatFundedTrader). GBPUSD n'est donc viable QUE pour une prop firm à plafond **statique** (FTMO 2-Step, FundingPips — déjà identifiées comme les meilleures options dans l'analyse de faisabilité des challenges ci-dessus), pas pour une à plafond trailing.

**Décision d'Esdras** : "on va l'ajouter dépendamment de quel challenge on prend" — GBPUSD sera ajouté à `config.js` (`fvg.perSymbol.GBPUSD`, config ci-dessus) UNE FOIS la prop firm choisie, seulement si celle-ci utilise un plafond de perte statique. Pas encore fait — aucun changement de code cette session, recherche uniquement (scripts de test jetables, non commités, mêmes outils déjà existants dans `scripts/`/`src/backtest/gridRunner.js`/`src/backtest/portfolioSimulator.js`, aucun nouveau fichier créé).

`npm test` : inchangé (aucun code de production touché).

**Fichiers** : aucun commité — recherche uniquement, cette entrée HANDOFF.md documente les résultats pour la prochaine session qui ajoutera réellement `GBPUSD` à `config.js` une fois la firme choisie.

## ⚠️ CORRECTIF IMPORTANT — comparaison des prop firms refaite avec l'historique étendu (2009-2025) : "FTMO 1-Step = 100%" était trop optimiste — 2026-09-16

Suite directe des 3 extensions de données ci-dessus (US100/US500/XAUUSD maintenant 2009-2010 → 2025). Esdras, une fois les 3 symboles étendus : "on peut refaire les simulations pour avoir des données beaucoup plus complètes ?" — la comparaison des 6 programmes prop firm (voir entrée "Faisabilité des challenges prop firm" plus haut) a été relancée SANS filtrer sur 2019-2025, en utilisant l'historique complet disponible par symbole (US100/US500 depuis nov. 2010, XAUUSD depuis mars 2009, GER40 depuis nov. 2010, EURUSD reste le plus court à 2018 — donc les trades Judas Swing/EURUSD ne démarrent qu'en 2018, mais FVG sur US100/US500/XAUUSD et Weekly Sweep sur GER40 tournent depuis 2009-2010). Résultat : **202 tentatives mensuelles au lieu de 84** (2.4x plus d'échantillons), fenêtre réelle 2009-03-15 → 2025-12-31, 4782 trades décidés (contre 2626 sur 2019-2025 seul).

**Le changement le plus important : FTMO 1-Step, présenté dans l'entrée précédente comme "100% de réussite, aucun échec par drawdown en 7 ans", tombe à 83.66% (169/202) une fois testé sur 16+ ans — 33 échecs par drawdown trailing EOD jamais observés sur la fenêtre plus courte.** Ce n'était pas une erreur de calcul à l'époque — la fenêtre 2019-2025 n'avait simplement jamais connu les conditions de marché (2009-2018) qui font casser ce plancher. Tableau complet, ancien (84 tentatives) vs nouveau (202 tentatives) :

| Programme | Ancien (2019-2025, n=84) | **Nouveau (2009-2025, n=202)** |
|---|---|---|
| FTMO 1-Step | 100% | **83.66%** (33 échecs drawdown) |
| FTMO 2-Step | 98.8% | **85.64%** (28 échecs drawdown) |
| FundingPips 2-Step Standard | 98.8% | **84.16%** (31 échecs drawdown) |
| **FundingPips 1-Step Flex** | 98.8% | **95.05%** — devient le MEILLEUR (9 échecs drawdown seulement) |
| GoatFundedTrader 1-Step | 92.9% | **80.2%** (40 échecs drawdown) |
| CTI 1-Step | 80.95% | **61.88%** (77 échecs drawdown, baisse la plus nette) |

**Aucun programme, dans les deux versions de l'analyse, n'a jamais échoué par perte QUOTIDIENNE** — uniquement par drawdown total/trailing. La stratégie ne "casse" jamais brutalement en une seule journée ; le risque réel est un enchaînement de pertes qui use le plancher de drawdown sur plusieurs semaines, davantage visible avec 16 ans de recul qu'avec 7.

**Recommandation RÉVISÉE** : **FundingPips 1-Step Flex remplace FTMO 1-Step comme meilleur choix objectif** (95% de réussite historique sur la fenêtre la plus complète disponible, contre 83.66% pour FTMO 1-Step). Prix réels des comptes FundingPips 1-Step Flex pas encore vérifiés — à faire dans une prochaine session si Esdras veut avancer sur ce choix.

**Leçon méthodologique explicite pour la suite** : une comparaison de prop firms sur seulement 7-8 ans (84 tentatives) peut donner une fausse impression de perfection sur certains programmes — préférer systématiquement la fenêtre la plus longue disponible par symbole pour ce type d'analyse, maintenant que US100/US500/XAUUSD/GER40 remontent tous à 2009-2010.

`npm test` : inchangé (aucun code de production touché, script d'analyse de session uniquement, non commité).

**Fichiers** : aucun commité — script de comparaison dans le scratchpad de session (même méthode que l'entrée "Faisabilité des challenges" précédente, juste sans le filtre d'années). Cette entrée HANDOFF.md est la source de vérité à jour ; l'entrée précédente reste dans l'historique pour comprendre comment la conclusion a évolué, mais ses chiffres de comparaison prop firm sont dépassés par celle-ci.

## Recherche de nouveaux candidats de trade — NWOG/US500 rejeté après vérification, Judas Swing confirme EURUSD comme seul bon choix — 2026-09-16

Après avoir compté les trades réels de la semaine (3 lundi-mercredi, 10 la semaine précédente, net ~0R), Esdras a demandé, en plaisantant à moitié ("On augmente encore les trades? 😅"), s'il fallait chercher plus de volume. Réponse : seulement via la même rigueur que d'habitude, pas en assouplissant les filtres existants. Deux candidats identifiés à partir des scopes déjà restreints dans `config.js` (NWOG scopé à US100+GER40 seulement, Judas Swing scopé à EURUSD seulement) : NWOG sur XAUUSD/US500, et Judas Swing sur les 7 autres symboles disponibles. Réutilisé `scripts/runNwogStrategyAnalysis.js` et `scripts/runJudasSwingStrategyAnalysis.js` (déjà existants, jamais relancés depuis l'extension des données 2009/2010→2025) — résultats régénérés dans `data/backtest-input/nwog-strategy-analysis.md` et `judas-swing-strategy-analysis.md`.

**NWOG/XAUUSD** : rejeté net, train -0.15R / test -0.11R.

**NWOG/US500** : semblait prometteur au premier passage (train 0.02R / test 0.34R, techniquement "tient" par la règle de verdict) — **rejeté après vérification de robustesse** (même traitement que GBPUSD/FVG plus haut) : train reste quasi plat sur 4 découpages différents (2021/2022/2023/2024, jamais au-dessus de 0.02R), et le détail année par année montre une instabilité violente (2017 : -16.56R, 2012 : -7.49R, contre 2025 : +28.77R) — le "signal positif" en test vient presque entièrement d'une seule année récente exceptionnelle (2025), pas d'un edge réel. Exactement le piège de surapprentissage que la vérification à plusieurs découpages est censée attraper.

**Judas Swing sur les 7 autres symboles** : aucun candidat crédible trouvé. EURUSD (déjà en production) reste de loin le meilleur (train 0.03R / test 0.18R). US100 "passe" techniquement la règle de verdict mais avec un edge quasi nul (train 0.01R, à peine distinguable du bruit). GER40 s'effondre en test (0.11R→0.01R). USDJPY montre le même piège train-négatif/test-positif que NWOG/US500 (train -0.11R, test +0.23R — pas fiable sans vérification supplémentaire, non poussée plus loin faute de signal train positif pour commencer). GBPUSD (-0.24R test) et USDCAD (-0.17R test) rejetés nets.

**Conclusion** : aucun nouveau mécanisme à ajouter cette fois. Les scopes actuels (NWOG US100+GER40, Judas Swing EURUSD seul) restent les bons choix — pas un résultat négatif au sens de "recherche ratée", mais la confirmation que la config déjà en production était déjà optimale parmi ce qui a été testé. Seul GBPUSD/FVG (entrée précédente, plancher statique uniquement) reste un candidat réel en attente, conditionnel au choix de prop firm.

`npm test` : inchangé (aucun code de production touché, seulement régénération de 2 rapports d'analyse déjà existants avec l'historique étendu).

**Fichiers** : `data/backtest-input/nwog-strategy-analysis.md` et `data/backtest-input/judas-swing-strategy-analysis.md` (régénérés avec l'historique étendu, chiffres légèrement différents des versions précédentes mais mêmes conclusions qualitatives).

## Weekly Sweep testé sur les 7 autres symboles — US500 ressort comme candidat robuste (chevauchement PAS ENCORE vérifié) — 2026-09-16

Suite directe de la recherche ci-dessus : Weekly Sweep (déjà LIVE sur GER40 seul, voir `config.js` `weeklySweep`) n'avait **jamais** été testé avec la même rigueur 8-symboles/train-test que NWOG/Judas Swing/Breaker Block — angle mort identifié et comblé. Nouveau script `scripts/runWeeklySweepStrategyAnalysis.js` (même gabarit exact que `runNwogStrategyAnalysis.js`/`runJudasSwingStrategyAnalysis.js`, réutilise `runWeeklySweepBacktest` de `src/backtest/weeklyLiquiditySweep.js` tel quel), résultat dans `data/backtest-input/weekly-sweep-strategy-analysis.md`.

**US500 ressort nettement meilleur que tous les autres candidats testés aujourd'hui** — contrairement à NWOG/US500 (rejeté juste avant, train quasi plat + années violemment instables), celui-ci est robuste sur 4 découpages différents (2021/2022/2023/2024), jamais négatif, jamais de grand écart train/test :

| Cutoff | Espérance train/test | Profit factor train/test |
|---|---|---|
| 2021-01-01 | 0.09 / 0.08 | 1.11 / 1.11 |
| 2022-01-01 | 0.10 / 0.06 | 1.13 / 1.08 |
| 2023-01-01 | 0.09 / 0.10 | 1.11 / 1.14 |
| 2024-01-01 | 0.08 / 0.16 | 1.10 / 1.21 |

Année par année (2011-2025) : **10 années positives sur 15**, pertes contenues (pire : -13.87R en 2016 — rien de comparable au -16.56R catastrophique isolé de NWOG/US500 en 2017). **716 trades sur la période complète, +63.30R cumulé.**

Autres symboles testés dans le même passage, tous rejetés ou trop faibles : XAUUSD (train -0.10R/test -0.21R, rejeté net), GBPUSD (train -0.11R/test -0.16R, rejeté net), EURUSD/USDJPY/USDCAD (même piège train-négatif/test-positif suspect que NWOG/US500, pas creusé davantage faute de signal train positif pour commencer), US100 (train 0.17R/test 0.03R, s'affaiblit trop pour passer le seuil).

**⚠️ PAS ENCORE FAIT avant de déployer** : vérifier le chevauchement avec FVG et Divergence, déjà actifs sur US500 (même vérification que Breaker Block/GER40 avant son activation : 7.7%/4.8% de chevauchement historique/réel, jugé assez bas). Weekly Sweep/US500 n'a pas encore ce calcul — c'est la prochaine étape avant toute activation dans `config.js`, pas encore faite cette session (question posée à Esdras, réponse pas encore reçue au moment de ce commit).

`npm test` : inchangé (nouveau script d'analyse seul, aucun mécanisme activé).

**Fichiers** : `scripts/runWeeklySweepStrategyAnalysis.js` (nouveau), `data/backtest-input/weekly-sweep-strategy-analysis.md` (nouveau, généré).

## Weekly Sweep/US500 activé en production — vérification de chevauchement terminée, propre — 2026-09-16

Suite immédiate de l'entrée précédente. Esdras a confirmé ("Oui") de faire la vérification de chevauchement puis d'activer si c'est propre.

**Vérification faite** (`scripts/testAddWeeklySweepUs500.mjs`, scratch de session, non commité — même principe que `testAddNwogGer40ToCombo.js`/`testAddBreakerBlockGer40ToCombo.js` mais AJOUT RÉEL au moteur complet plutôt qu'un simple proxy calendaire, puisque `weeklySweepConfig` accepte directement une liste de symboles sans le contournement nécessaire pour NWOG/GER40 bidirectionnel) : combo de production complet rejoué avec et sans `US500` dans `weeklySweep.symbols`, sur les deux fenêtres (historique 2009/2010-2025 ET les 7 mois réels broker déjà committés) :

| Fenêtre | Sans Weekly Sweep/US500 | Avec | Impact net |
|---|---|---|---|
| Historique complet | 7217 trades, +2964R | 7798 trades, +3087R | **+581 trades, +123R** |
| Réel (7 mois broker) | 287 trades, +98R | 310 trades, +107R | **+23 trades, +9R** |

**Chevauchement avec FVG/Divergence (déjà actifs sur US500)** : minime des deux côtés — FVG passe de 515→505 trades (-1.9%) sur l'historique et reste inchangé (11→11) sur la fenêtre réelle ; Divergence passe de 890→875 (-1.7%) puis 36→35 (-2.8%). Aucune dégradation notable de ce qui tournait déjà.

**Activé** : `config.js` `weeklySweep.symbols` passe de `['GER40']` à `['GER40', 'US500']`. `npm test` : 534/534 (inchangé — pas de nouveau test unitaire nécessaire, `runWeeklySweepBacktest` déjà testé, c'est juste un changement de config).

**Fichiers** : `src/config.js` (`weeklySweep.symbols` étendu, commentaire complet ajouté). Script de vérification (`testAddWeeklySweepUs500.mjs`) resté en scratch de session, non commité — à recréer si cette vérification doit être refaite pour un autre symbole/mécanisme (même pattern que les scripts `testAddXxxToCombo.js` déjà committés, pourrait valoir la peine de le committer aussi si ce genre de vérification devient fréquent).

## Politique durable : tous les tests incluent maintenant tout l'historique disponible — `buildBacktestSummary.js` mis à jour — 2026-09-16

Esdras, décision explicite et durable : "Tous Les nvs tests doivent inclure Tous Les annees maintenant, decris la performance de ma strategy pendant toutes ces annees." Retire le filtre `YEARS=[2019..2025]` de `scripts/buildBacktestSummary.js` (le seul endroit qui bornait encore artificiellement à 7 ans après le correctif prop-firm de l'entrée précédente) — même discipline que ce correctif : chaque symbole garde son propre historique réel le plus long, aucune homogénéisation à une fenêtre commune. `data/backtest-summary.json` régénéré (alimente aussi le chat IA du dashboard, `src/chatAssistant.js` - vérifié qu'il lit le JSON sans supposer un champ `years` figé, aucun changement de code nécessaire là).

**Nouvelle couverture : 2009-03-15 → 2025-12-31, 17 années calendaires** (US100/US500 depuis 2010-11-14, XAUUSD depuis 2009-03-15, GER40 depuis ~2010, EURUSD/Judas Swing reste le plus court à 2018-01-01 — pas d'homogénéisation, chaque mécanisme compte depuis que SES données existent réellement).

**Performance de la stratégie sur ces 17 années, combo de production complet (FVG + Divergence + NWOG + Judas Swing + Weekly Sweep, BTCUSD exclu)** :

- **4824 trades décidés, 30,5% de réussite, +2255R au total. Aucune année négative sur 17 ans** — le pire résultat annuel est encore +1R (2010), tout le reste est solidement positif.
- **Tendance nette entre les deux ères** : 2009-2017 (avant EURUSD/Judas Swing, 3-4 mécanismes seulement) tourne à 18-28% de réussite et 1R à 99R par an ; 2018-2025 (les 5 mécanismes actuels réunis) tourne à 28-36% de réussite et 156R à 289R par an — nettement plus fort et plus régulier. Pas forcément un edge qui s'améliore avec le temps : 2018 est aussi l'année où Judas Swing/EURUSD entre dans les données ET où US100/US500 passent d'un historique HistData plus ancien à la source utilisée pour la validation d'origine — les deux ères ne sont pas directement comparables sans creuser plus, à garder en tête avant de conclure à une tendance.
- **Par symbole** : US100 porte l'essentiel du résultat (+1450R sur 1851 trades, 31,5%) grâce à sa cible étendue 1:5 et son statut multi-touch. XAUUSD est le plus faible (24,3% de réussite, +117R sur 567 trades) — cohérent avec les réserves déjà documentées ailleurs sur cet instrument.
- **Par mécanisme** : FVG contribue le plus en R absolu (+1590R) mais avec le taux de réussite le plus bas (29,2%, cohérent avec son RR 4-5) ; NWOG a le meilleur taux de réussite (36,8%) sur le plus petit échantillon (258 trades) ; Divergence/Judas Swing/Weekly Sweep se situent tous autour de 30-32%.

`npm test` : 531/531 (inchangé — fichier de données régénéré, aucun code de comportement production touché).

**Fichiers** : `scripts/buildBacktestSummary.js` (filtre retiré), `data/backtest-summary.json` (régénéré, 17 ans au lieu de 7).

## Cible dynamique "draw on liquidity" sur US100 — reprend la question ouverte, résultat prometteur — 2026-09-16

Esdras : "Trop peu, on teste autre chose pour augmenter nos trades gagnant?" (suite au taux de gain ~30% global, section "Test avec GBPUSD" ci-dessus). Reprend directement la question ouverte jamais traitée (voir plus haut, section "Question ouverte d'Esdras... peut-on trouver un moyen de savoir AVANT si le marché va vraiment jusqu'à 1:4/1:5") : il avait déjà été vérifié empiriquement que 100% de la baisse de taux de gain à cible étendue (1:4/1:5) vient de trades DÉJÀ gagnants à 1:3 qui repartent jusqu'au stop d'origine avant d'atteindre la cible fixe plus loin — jamais de nouvelle perte directe.

**Idée testée** : au lieu d'un multiple R fixe, la cible devient le prochain point de liquidité ICT ("draw on liquidity") encore intact — le swing high/low confirmé le plus proche au-delà de l'entrée, PAS ENCORE balayé par une bougie ultérieure — plafonné entre 1.5x et 6x la distance du stop, avec repli sur 1:3 fixe si aucun niveau valide n'existe dans cette fourchette.

**Implémentation** (recherche uniquement, rien branché en production) : `src/backtest/dynamicLiquidityTarget.js` — `buildLiquidityTargetLookup()` fait un seul passage chronologique sur les bougies (comme `makeStructureBiasLookup()`), maintient l'ensemble des swing highs/lows confirmés et encore "intacts" (aucune bougie n'a encore dépassé leur niveau depuis leur formation), et répond à chaque entrée avec le niveau le plus proche dans la bonne direction. Mêmes entrées/stops que la production (`MultiTouchFvgEngine` + `buildMultiTouchFilterPredicate`, config US100 copiée telle quelle de `config.js`) — SEULE la cible change. `scripts/runDynamicLiquidityTargetAnalysis.js` compare les deux sur US100 (train < 2024, test >= 2024).

**Résultat (US100, train/test)** :

| | Fixe 1:5 (production) | Dynamique (liquidité) |
|---|---|---|
| Train : n / WR / R moyen / PF / DDmax | 969 / 31.4% / 0.77R / 2.01 / 32.77R | 1004 / **36.9%** / **0.88R** / **2.24** / **29.57R** |
| Test : n / WR / R moyen / PF / DDmax | 229 / 36.7% / 1.11R / 2.61 / 11.07R | 235 / **38.7%** / **1.27R** / **2.91** / **10.03R** |

Amélioration sur TOUS les indicateurs, sur TRAIN ET TEST à la fois (taux de gain, R moyen, profit factor, ET drawdown max qui baisse au lieu de monter — contrairement à la cible fixe étendue qui améliore l'espérance mais alourdit le drawdown). Une liquidité valide est trouvée pour 90-92% des trades (repli sur 1:3 fixe pour le reste), RR réellement utilisé en moyenne ~4.3-4.8 (proche du 1:5 actuel, mais adaptatif au lieu de fixe).

**Vérification de robustesse année par année (2011-2025)** : la cible dynamique améliore le R moyen sur **12 années sur 15** (2011 et 2013 légèrement pires, 2018 quasi identique) — pas un artefact d'une seule fenêtre chanceuse.

**Pas encore en production** — un seul découpage train/test (comme la cible étendue 1:4/1:5 à l'origine), jamais observé en live, et le mécanisme de "niveau intact" (jamais balayé depuis sa formation) reste une approximation raisonnable mais simplifiée du concept ICT complet (ne distingue pas encore les niveaux "premium/discount", ni la taille relative du pool de liquidité). Prochaine étape naturelle si Esdras veut avancer : le forward-tester (`forwardTest.js`) sur ce mode dynamique, puis une simulation de compte complète (guardrails réelles) avant d'envisager un déploiement réel.

`npm test` : 531/531 (aucun fichier de production existant modifié — nouveau fichier `src/backtest/dynamicLiquidityTarget.js` uniquement, rien branché dans `config.js`/`liveStrategyEngine.js`).

**Fichiers** : `src/backtest/dynamicLiquidityTarget.js` (nouveau), `scripts/runDynamicLiquidityTargetAnalysis.js` (nouveau).

## Cible dynamique étendue à US500/XAUUSD, puis test du combo complet sur 7 mois — 2026-09-16 (suite directe)

Esdras : "Teste aussi sur US500/XAUUSD, et fais le forward test aussi. Ensuite teste le nouveau système de combo pour les 7 derniers mois."

**US500/XAUUSD : résultat NÉGATIF/mitigé — contrairement à US100.** `scripts/runDynamicLiquidityTargetAnalysis.js` étendu aux 3 symboles (même config production copiée de `config.js` pour chacun), résultat :

| Symbole | Train (R moyen fixe → dynamique) | Test (R moyen fixe → dynamique) | RR moyen réellement utilisé |
|---|---|---|---|
| US100 | 0.77R → **0.88R** (+0.109R) | 1.11R → **1.27R** (+0.165R) | 4.25-4.79 (proche du 1:5 fixe) |
| US500 | 0.71R → 0.50R (**-0.213R**) | 1.29R → 1.14R (**-0.146R**) | 3.84-4.06 |
| XAUUSD | 0.17R → 0.05R (**-0.124R**) | 0.46R → 0.47R (quasi nul, +0.012R) | 2.23-2.24 (bien en dessous du 1:4 fixe) |

**Explication** : le taux de gain monte bien sur les 3 symboles (logique, mécanique), mais sur US500/XAUUSD le RR réellement capturé par la liquidité la plus proche est systématiquement PLUS BAS que le multiple fixe actuel (surtout XAUUSD : ~2.2 contre 4 fixe) — plus de gains, mais chacun vaut moins, et le résultat net perd au change. Seul US100 a des pools de liquidité naturellement assez loin (H4/EMA200, tendance plus établie) pour que le compromis reste gagnant. **Conclusion honnête : la cible dynamique n'est PAS un principe universel qui améliore tout — elle est spécifiquement bonne sur US100, mauvaise/neutre ailleurs.** Ne pas généraliser à tous les symboles.

**"Forward test"** : la méthodologie déjà utilisée (train < 2024-01-01 / test >= 2024-01-01, jamais retouchée après avoir vu le résultat) EST le forward-test au sens de ce projet (`src/backtest/forwardTest.js` fait exactly ça : "split historical candles at a cutoff date, replay strategy before/after, compare" — même principe, ici appliqué symbole par symbole plutôt qu'au combo complet). Aucune fenêtre supplémentaire nécessaire au-delà de ce qui précède.

**Nouveau système de combo testé sur les 7 derniers mois** (`scripts/testNewComboWithDynamicTarget.js`) — **⚠️ précision importante : ce sandbox n'a AUCUNE connexion broker réelle (pas de credentials cTrader configurés ici)**, donc "les 7 derniers mois" signifie les 7 derniers mois CALENDAIRES de l'historique CSV disponible (2025-06-01 → 2025-12-31, le CSV s'arrêtant à cette date), PAS les 7 derniers mois de trading réel en production. Rejoue le combo complet (5 mécanismes) en gardant TOUT identique à la production SAUF US100/FVG, dont la cible passe de fixe 1:5 à dynamique (liquidité) — seul le mécanisme validé positif ci-dessus est modifié, US500/XAUUSD/EURUSD/GER40/Divergence/NWOG/Judas Swing/Weekly Sweep restent inchangés.

**Résultat sur la fenêtre (juin-décembre 2025, 232-234 trades)** :

| | Combo production (US100 fixe) | Combo nouveau (US100 dynamique) |
|---|---|---|
| Trades | 232 | 234 |
| Taux de gain | 37.8% | 37.9% |
| Total R | +205.00R | **+213.89R** (+8.89R, ~+4%) |

Amélioration modeste mais cohérente au niveau du combo entier (dilué par les 4 autres mécanismes inchangés qui pèsent pour ~47R sur les ~205-213R totaux). Détail mois par mois (reset $10,000, cible +10%) : gains marginaux sur juin/juillet/août/septembre (ex. juillet : 18j→15j pour atteindre la cible, +20R→+22.76R), quasi identique en octobre, légèrement plus lent en novembre/décembre (28j au lieu de 23j en novembre) — pas d'amélioration uniforme mois par mois, mais positif sur l'ensemble de la fenêtre.

**Statut** : toujours recherche uniquement, `config.js` non modifié. Si Esdras veut avancer vers la production : ne changer QUE `fvg.perSymbol.US100` (ajouter la logique de cible dynamique dans `liveStrategyEngine.js`/`_buildFvgEngine`, actuellement seulement dans `backtestEngine.js`/scripts de recherche), garder US500/XAUUSD sur leur cible fixe actuelle.

`npm test` : 531/531 (aucun fichier de production modifié).

**Fichiers** : `scripts/runDynamicLiquidityTargetAnalysis.js` (étendu à US500/XAUUSD), `scripts/testNewComboWithDynamicTarget.js` (nouveau).

## Même test sur VRAIES données broker (7 mois réels, pas un proxy CSV) — résultat NÉGATIF, décision revue — 2026-09-16 (suite directe)

Esdras a fourni `ADMIN_EXPORT_TOKEN` pour extraire les vraies bougies M15 depuis la production (`GET /api/admin/export-candles?symbol=X&days=245&token=...`, cTrader connecté en production, plafond réel de 245 jours/requête). Fenêtre obtenue : **2026-02-10 -> 2026-09-16, soit ~7 mois pile** — exactement la période demandée, mais cette fois du vrai trading réel/données broker réelles, pas les CSV historiques (qui s'arrêtent au 2025-12-31 et n'ont donc AUCUN chevauchement avec cette fenêtre).

`scripts/testNewComboOnRealData7Months.js` (nouveau, même logique que `testNewComboWithDynamicTarget.js` mais pointé sur les vraies données) — résultat :

| | Combo production (US100 fixe 1:5) | Combo nouveau (US100 dynamique) |
|---|---|---|
| Trades US100/FVG | 46 | 44 |
| Total R (combo entier) | **+63.00R** | +47.73R |

**Résultat INVERSE de ce qu'avait montré le proxy CSV (7 derniers mois de l'historique 2009-2025, qui donnait +205R → +213.89R, positif).** Sur les vraies données récentes, la cible dynamique fait PERDRE 15.27R au combo par rapport à la production actuelle — mois par mois, juillet 2026 est le plus parlant : production atteint la cible +10% en 23 jours (+20R), le nouveau système ne l'atteint JAMAIS ce mois-là (+15.73R seulement, 15 trades au lieu de 12).

**Pourquoi ce n'est pas forcément contradictoire, mais reste un signal d'alerte sérieux** : la vérification année-par-année faite plus tôt (US100, 2011-2025) montrait déjà que la cible dynamique n'améliore PAS systématiquement chaque année individuelle — 12 années sur 15 positives, mais 2011/2013 nettement pires. Avec seulement 44-46 trades FVG sur cette fenêtre de 7 mois, une variance de cet ordre est statistiquement plausible, pas forcément un signe que le concept est cassé. MAIS c'est aussi le test le plus rigoureux possible : de vraies données que ni le concept ni son réglage (clamp [1.5,6], repli 1:3) n'ont jamais vues, sur la période la plus RÉCENTE, pas un backtest arrangé après coup.

**Décision révisée : NE PAS déployer la cible dynamique en production pour l'instant.** Le backtest 17 ans reste positif et robuste (12/15 années), mais le seul test véritablement "en aveugle" disponible (ce fenêtre réelle récente) est négatif. Cohérent avec la mise en garde déjà répétée plusieurs fois dans ce document : un seul découpage/une seule fenêtre ne suffit jamais à valider un changement avant capital réel — ici on a maintenant DEUX fenêtres de test (2024-2025 CSV, positif ; 2026-02→09 réel, négatif) qui ne s'accordent pas, ce qui est justement le signal qu'il faut encore attendre avant de conclure, pas trancher dans un sens ou l'autre.

**Mise à jour (2026-09-16, même session) — Esdras : "on commit tout pour ne pas perdre des info pertinentes"** : décision revue — les 5 CSV réels exportés SONT maintenant committés (`data/real-data-2026-02-to-09/`, avec un `README.md` documentant leur provenance exacte : route, date d'export, plafond de 245 jours cTrader). Vérifié avant commit que le token lui-même n'apparaît nulle part dans ces fichiers (juste des bougies `time,open,high,low,close`) — seule la donnée de marché est conservée, jamais le secret utilisé pour l'obtenir. Choix justifié : cette fenêtre réelle est le seul test qui contredit le backtest 17 ans, donc précieuse à garder reproductible plutôt que perdue dans un scratchpad éphémère de session.

`npm test` : 531/531 (aucun fichier de production modifié).

**Fichiers** : `scripts/testNewComboOnRealData7Months.js`, `data/real-data-2026-02-to-09/*.csv` + `README.md` (nouveaux, committés).

## Candidat trouvé pour "augmenter les trades sans compromettre la qualité" : NWOG/GER40 (déjà validé, jamais déployé) — 2026-09-16

Esdras : "je veux toujours améliorer mes trades ou un autre pair pour augmenter les trades sans compromettre la qualité." Plutôt que de rouvrir une recherche de zéro sur une nouvelle paire (USDJPY/USDCAD/GBPUSD déjà creusés à fond, voir sections précédentes - rendements décroissants), repris un candidat DÉJÀ validé et laissé de côté : **NWOG bidirectionnel sur GER40** (voir "GER40 — vrai spread confirmé... NWOG réhabilité", 2026-09-15) — déjà passé le verdict formel train/test, le contrôle achat/vente (59/41, pas un biais haussier caché) et la robustesse par blocs de 2 ans (6/8 positifs, aucune année >22% du profit). Non déployé jusqu'ici uniquement pour pouvoir attribuer clairement un futur problème/succès à Weekly Sweep/GER40 (seul mécanisme GER40 actuellement live) pendant sa période d'observation initiale — PAS pour un problème de qualité.

**Contrainte technique découverte en creusant** : `CONFIG.nwog` n'a qu'UN SEUL flag `longOnly` partagé par tous les symboles de `nwog.symbols` (`liveStrategyEngine.js`/`_processNwogCandidate`). US100/NWOG est validé achat-seul, mais GER40/NWOG est validé BIDIRECTIONNEL (59/41) — les deux ne peuvent pas partager le même `nwogConfig` sans casser l'un des deux réglages. `scripts/testAddNwogGer40ToCombo.js` (nouveau) simule donc GER40/NWOG SÉPARÉMENT via `src/backtest/nwog.js` directement (bidirectionnel, comme validé), fusionné avec le reste du combo de production inchangé — même discipline que `dynamicLiquidityTarget.js` pour US100/FVG.

**Résultat sur les 17 ans d'historique (2009/2010-2025)** :

| | Combo production (sans NWOG/GER40) | Combo + NWOG/GER40 |
|---|---|---|
| Trades | 4824 | **5504** (+680, +14%) |
| Taux de gain | 30.5% | **30.7%** (légèrement mieux, pas dégradé) |
| Total R | +2255.00R | **+2447.00R** (+192.00R) |

**Résultat sur la fenêtre réelle committée (2026-02-10 → 2026-09-16, broker cTrader réel)** :

| | Combo production (sans NWOG/GER40) | Combo + NWOG/GER40 |
|---|---|---|
| Trades | 146 | **175** (+29, +20%) |
| Taux de gain | 30.1% | **32.6%** (mieux) |
| Total R | +53.00R | **+76.00R** (+23.00R, +43%) |

**NWOG/GER40 seul sur cette fenêtre réelle : 29 trades, 44.8% de taux de gain, +23R** — encore mieux que sa moyenne historique (32.1%), échantillon petit (n=29) donc à ne pas surinterpréter, mais dans le bon sens, contrairement à la cible dynamique testée juste avant qui avait donné un résultat contraire entre historique et réel.

**Chevauchement avec Weekly Sweep/GER40 (même symbole)** : seulement 64/680 trades historiques (9.4%) et 4/29 réels (13.8%) avaient une position Weekly Sweep ouverte au même moment — peu de compétition pour le même budget de garde-fou (`maxTradesPerDay`), les deux mécanismes restent largement indépendants dans le temps.

**Conclusion : c'est le meilleur candidat "plus de trades sans perte de qualité" identifié dans ce projet à ce jour** — validé sur DEUX fenêtres indépendantes qui s'accordent (contrairement à la cible dynamique US100 où historique et réel se contredisaient), augmente le volume ET la qualité simultanément, chevauchement minimal avec le mécanisme GER40 déjà live.

**Pas encore déployé** — nécessite un petit changement de code (`liveStrategyEngine.js` : `longOnly` par symbole au lieu d'un seul flag partagé sur `nwogConfig`, pour que US100 reste achat-seul et GER40 reste bidirectionnel dans la même config) avant de pouvoir l'activer proprement sans casser le réglage US100 existant. Décision d'implémenter ou non laissée à Esdras.

`npm test` : 531/531 (aucun fichier de production modifié — recherche uniquement).

**Fichiers** : `scripts/testAddNwogGer40ToCombo.js` (nouveau).

## NWOG/GER40 DÉPLOYÉ EN PRODUCTION — 2026-09-16 (suite directe, même session)

Esdras : "Oui, implémente le changement et active NWOG/GER40."

**Changement de code** : `CONFIG.nwog.longOnly` (booléen unique, partagé par tous les symboles) remplacé par `CONFIG.nwog.longOnlySymbols` (tableau — les symboles listés restent achat-seul, tout symbole absent de la liste reste bidirectionnel). `liveStrategyEngine.js`/`_processNwogCandidate()` : `cfg.longOnly && !bullish` → `cfg.longOnlySymbols?.includes(symbol) && !bullish`. Changement mécanique, aucune autre logique touchée.

**Config production** (`src/config.js`) :
```
nwog: {
  symbols: ['US100', 'GER40'],
  rrMultiple: 3,
  maxHoldingM15Candles: 480,
  longOnlySymbols: ['US100'],   // GER40 reste bidirectionnel (59/41 validé)
},
```

**Tests** : `test/liveStrategyEngine.test.js` — les 2 tests `longOnly` existants adaptés à `longOnlySymbols`, + 1 nouveau test confirmant explicitement le nouveau comportement (un symbole ABSENT de `longOnlySymbols` reste bidirectionnel même quand un AUTRE symbole de la même config est restreint) — c'est la garantie qui manquait avant ce changement. `npm test` : **532/532** (531 + 1 nouveau).

**Vérification end-to-end après le changement** (pas juste les tests unitaires — un script ad hoc, non committé, a rejoué le VRAI `CONFIG.nwog` via `LiveStrategyEngine` sur tout l'historique 17 ans) :
- NWOG/US100 : 258 trades, **258 achats / 0 vente** (confirmé toujours achat-seul, comme avant ce changement)
- NWOG/GER40 : 599 trades, **289 achats / 310 ventes** (confirmé bidirectionnel, bien équilibré), taux de gain 32.1%, **+169.00R**

Le chiffre GER40 (599 trades net, +169R) est un peu plus bas que l'estimation isolée précédente (680 trades, +192R, `runNwogBacktest()` sans netting) — différence attendue et RASSURANTE : ce chiffre-ci passe par le VRAI netting de production (une seule position ouverte par symbole à la fois, en compétition avec Weekly Sweep/GER40 déjà live) plutôt qu'une simulation isolée. Reste une contribution nette solide même après ce netting réel.

**Statut : EN PRODUCTION.** GER40 trade maintenant avec 2 mécanismes simultanés (Weekly Sweep + NWOG bidirectionnel), US100/NWOG inchangé (toujours achat-seul). À surveiller dans les prochaines semaines comme tout déploiement récent (Weekly Sweep/GER40 lui-même n'a que quelques jours de vie réelle à ce stade).

`npm test` : 532/532. **Fichiers** : `src/config.js`, `src/liveStrategyEngine.js`, `test/liveStrategyEngine.test.js`.

## Recherche d'un 3e candidat GER40 : Breaker Block réhabilité (spread correct + robustesse), résultat très positif — 2026-09-16

Esdras : "Ensuite check encore d'autre combo ou strategy pour augmenter le nombre de trade." Plutôt qu'une nouvelle paire (rendements décroissants, voir sessions précédentes), repris **Breaker Block/GER40**, laissé en "zone grise" le 2026-09-15 (passait le verdict formel mais vérifié seulement avec le MAUVAIS spread, 1.0 au lieu du 0.5 confirmé depuis par Esdras, et jamais soumis au contrôle de robustesse par blocs de 2 ans qui avait réhabilité NWOG).

**Re-vérifié avec le bon spread (0.5, déjà corrigé dans `transactionCosts.js` depuis le 2026-09-15) + mêmes contrôles que NWOG :**

| Contrôle | Breaker Block/GER40 | Repère (NWOG/GER40) | Repère (Weekly Sweep/GER40) |
|---|---|---|---|
| Verdict formel train/test | ✅ tient (train 0.11R n=1250, test **0.17R** n=312 — test meilleur que train) | ✅ tient (0.20R) | ✅ tient (0.24R) |
| Répartition achat/vente | 60% achat / 40% vente | 59%/41% | 32%/68% |
| Blocs de 2 ans positifs | **7/8** (seul 2010-2011 négatif) | 6/8 | 6/8 |
| Meilleure année seule | 34% (2024) | 22% | 16% |
| Échantillon | **1562 trades** (16 ans) | ~940 | plus petit |

Concentration de la meilleure année un peu plus élevée que les deux autres (34% contre 16-22%), mais RIEN à voir avec les 82-146% qui avaient fait rejeter Asian Range Breakout/Unicorn Model/Asian Range Fade — et l'échantillon est de loin le plus grand des 3 candidats GER40. **Rehabilité selon les mêmes critères qui ont déjà rehabilité NWOG.**

**Test d'ajout au combo actuel (déjà FVG+Divergence+NWOG(US100 achat seul/GER40)+Judas Swing+Weekly Sweep(GER40))** — `scripts/testAddBreakerBlockGer40ToCombo.js` (nouveau) :

| | 17 ans historique | Fenêtre réelle (2026-02→09) |
|---|---|---|
| Trades sans Breaker Block | 5377, WR 30.7%, +2414R | 172, WR 33.1%, +79R |
| Trades AVEC Breaker Block | **6939** (+1562, +29%), WR 30.5%, +2607.11R | **277** (+105, **+61%**), WR 32.1%, +98.17R (+24%) |
| Chevauchement avec Weekly Sweep/NWOG (même symbole) | 121/1562 (7.7%) | 5/105 (4.8%) |

**Résultat net : le taux de gain du combo reste quasiment inchangé (variation de -0.2 à -1 point) alors que le volume de trades augmente massivement (+29% historique, +61% sur la fenêtre réelle) — exactement "augmenter les trades sans compromettre la qualité".** Chevauchement minimal avec les 2 autres mécanismes GER40 déjà live. Confirmé sur DEUX fenêtres indépendantes qui s'accordent (comme NWOG, contrairement à la cible dynamique US100).

**Pas encore déployé — contrairement à NWOG/GER40, Breaker Block n'a AUCUN câblage dans `liveStrategyEngine.js`** (existe uniquement comme script de backtest, `src/backtest/breakerBlock.js`). Le déployer demanderait d'écrire un vrai module `_processBreakerBlockCandidate()` (même chemin `openPositions`/netting/auto-exécution que les autres), pas juste un changement de config — un chantier plus proche de l'ajout initial de Weekly Sweep/NWOG que du fix `longOnlySymbols` de tout à l'heure. Décision d'implémenter laissée à Esdras.

`npm test` : 532/532 (aucun fichier de production modifié — recherche uniquement). **Fichiers** : `scripts/testAddBreakerBlockGer40ToCombo.js` (nouveau).

## Breaker Block/GER40 IMPLÉMENTÉ ET ACTIVÉ EN PRODUCTION — 2026-09-16 (suite directe, même session)

Esdras : "Oui, implémente le mécanisme et active Breaker Block/GER40."

**Nouveau mécanisme live, premier écrit depuis Weekly Sweep** (contrairement à NWOG plus tôt, un simple changement de config ne suffisait pas ici) :

- `src/backtest/breakerBlock.js` : `findOrderBlock()` exporté (était privé) pour être réutilisable ailleurs sans dupliquer la logique.
- `src/liveStrategyEngine.js` : nouveau `breakerBlockConfig` (constructeur, opt-in uniquement comme `nwogConfig`/`judasSwingConfig`/`weeklySweepConfig` - les 3 moteurs backtest/rapport ne l'héritent pas silencieusement), dispatch dans `ingestCandle()`, et 3 nouvelles méthodes :
  - `_computeBreakerBlockCandidates(candles)` : rejoue EXACTEMENT les étapes 3-5 (watchBreak → watchRetest → pendingEntry) de `runBreakerBlockBacktest()` - seule la moitié "gestion de trade" (étape 1, gérée par le netting partagé du moteur) est laissée de côté. Délibérément SANS garde `!open` (contrairement à l'original, qui suivait uniquement SA PROPRE position) - un détecteur pur, indépendant de toute position ouverte, exactement comme NWOG/Judas Swing/Weekly Sweep - c'est le netting partagé (`_blockReason`) qui décide si un candidat détecté peut réellement ouvrir une position.
  - `_detectBreakerBlockSignal()` / `_processBreakerBlockCandidate()` : même forme que les 3 mécanismes existants, AUCUN filtre de direction (contrairement à NWOG/US100) - GER40/Breaker Block validé bidirectionnel.
  - Câblé aussi dans `_warmUpOneSymbol()` (précalcul des candidats, même motif que NWOG/Judas Swing/Weekly Sweep).
- `src/config.js` : nouveau bloc `breakerBlock: { symbols: ['GER40'], rrMultiple: 3, maxHoldingM15Candles: 480 }`.
- `src/accountRuntime.js` : `breakerBlockConfig: config.breakerBlock` ajouté au SEUL vrai moteur live.
- `scripts/buildBacktestSummary.js` : `breakerBlockConfig: CONFIG.breakerBlock` ajouté (sinon le résumé qui alimente le chat IA du dashboard aurait silencieusement ignoré ce nouveau mécanisme) — `data/backtest-summary.json` régénéré (6829 trades décidés, +2720R, 30.5% de réussite, contre 5462/+2447R/30.7% avant Breaker Block).

**Tests** (`test/liveStrategyEngine.test.js`) : 2 nouveaux tests (entrée+netting), même fixture que `test/breakerBlock.test.js` mais RE-ESPACÉE — la fixture originale utilisait un `lookback` custom (2) pour `detectBosEvents`, trop serré pour le `SWING_LOOKBACK=5` réellement utilisé en production (la bougie du BOS, avec son haut artificiellement énorme, tombait DANS la fenêtre de confirmation du swing high à 5 candles d'écart, invalidant le point de swing avant même que le BOS puisse s'y référer). Fenêtre re-vérifiée directement contre `runBreakerBlockBacktest(candles, {})` (tous les paramètres par défaut) avant d'écrire le test. `npm test` : **534/534** (532 + 2 nouveaux).

**Vérification bout-en-bout** (script ad hoc, non committé) — rejoué le VRAI `CONFIG.breakerBlock` via `LiveStrategyEngine` sur tout l'historique 17 ans :
- Breaker Block/GER40 : 1518 trades, **734 achats / 784 ventes** (48%/52% — encore mieux équilibré que l'estimation isolée 60/40, une fois le netting réel avec Weekly Sweep/NWOG appliqué), taux de gain 30.3%, **+319.00R**
- Combo complet (avec Breaker Block) : 6872 trades, taux de gain 30.5%, **+2720.00R**

**Statut : EN PRODUCTION.** GER40 trade maintenant avec 3 mécanismes simultanés (Weekly Sweep + NWOG bidirectionnel + Breaker Block bidirectionnel). US100/US500/XAUUSD/EURUSD inchangés. À surveiller de près dans les prochaines semaines — c'est le mécanisme le plus récent des 3 sur GER40 et celui qui ajoute le plus de volume de trades d'un coup.

`npm test` : 534/534. **Fichiers** : `src/backtest/breakerBlock.js`, `src/liveStrategyEngine.js`, `src/config.js`, `src/accountRuntime.js`, `scripts/buildBacktestSummary.js`, `data/backtest-summary.json`, `test/liveStrategyEngine.test.js`.

## Suite de la recherche : Breaker Block sur US100 rejeté (piège haussier), mais FVG multi-contact sur US500/XAUUSD — le meilleur candidat trouvé cette session — 2026-09-16 (autorisation explicite d'Esdras : "cherche encore plus de possibilité")

**Piste 1, rejetée : Breaker Block étendu à US100.** Il passe aussi le verdict formel (train 0.03R, test 0.14R n=1566/313), mais les mêmes contrôles qui ont validé GER40 le démasquent : **91% du profit vient des achats** (9% seulement des ventes — piège de biais haussier classique, même signature qu'Asian Range Breakout), et **65% du profit net vient d'une seule année (2022)**, seulement 5/8 blocs de 2 ans positifs. US500/EURUSD encore plus faibles (R négatif net). **Ne généralise PAS depuis GER40** — confirme que GER40 est un cas vraiment particulier, pas une preuve que Breaker Block marche "partout".

**Piste 2, très prometteuse : FVG multi-contact étendu à US500/XAUUSD.** Validé sur US100 depuis longtemps (déjà en production), mais JAMAIS testé avec la même rigueur sur US500/XAUUSD (`fvg.perSymbol.US100.multiTouch` comment: "US500/XAUUSD restent en single-touch, jamais validés avec la même rigueur"). Rapport `data/backtest-input/fvg-multi-touch-analysis.md` regénéré avec les données actuelles (historique 17 ans, spreads corrigés) :

| Symbole | Contact unique (n / WR / R total) | Multi-contact (n / WR / R total) | Robustesse (achat/vente, blocs 2 ans) |
|---|---|---|---|
| **US500** | 183 / 31.8% / +147.61R | **433 / 31.9% / +336.59R** | 58%/42%, **8/8 blocs positifs**, meilleure année 15% |
| XAUUSD | 564 / 24.5% / +117.16R | 1159 / 23.5% / +122.66R | 41%/59%, 7/9 blocs positifs, meilleure année 24% |

**US500 est le meilleur candidat trouvé dans TOUTE cette session** : +137% de trades, taux de gain QUASI IDENTIQUE (31.8%→31.9%, pas de dégradation), R total qui **plus que double** (+147.61R → +336.59R), et le profil de robustesse le plus propre vu jusqu'ici — 8 blocs de 2 ans sur 8 positifs (aucun autre candidat, y compris NWOG/Weekly Sweep/Breaker Block sur GER40, n'a fait mieux que 7/8 ou 6/8), achat/vente bien équilibré, concentration annuelle la plus faible (15%, contre 16-34% pour les 3 candidats GER40).

XAUUSD est plus faible : +105% de trades mais seulement +4.7% de R total (l'edge XAUUSD de base est déjà mince, doubler le volume double surtout le bruit autour d'un edge fin) — passe quand même les contrôles de robustesse, mais le gain est marginal.

**⚠️ Vérification sur les données réelles (2026-02→09, leçon retenue après la cible dynamique US100 qui s'était contredite entre historique et réel) — résultat NUANCÉ, échantillons minuscules :**

| Symbole | Contact unique réel | Multi-contact réel |
|---|---|---|
| US500 | n=4, WR 75%, +13.58R | n=13, WR 30.8%, +10.19R |
| XAUUSD | n=10, WR 10%, -5.18R | n=34, WR 12.1%, -13.64R |

US500 : le contact unique montre 75% de réussite sur seulement 4 trades (bruit statistique pur, très au-dessus du 32% attendu - pas un signal fiable), le multi-contact retombe à 30.8% sur 13 trades, proche de l'attendu historique (31.9%), mais avec MOINS de R total sur cette fenêtre précise (10.19R contre 13.58R) - échantillon bien trop petit pour trancher dans un sens ou l'autre. XAUUSD : les DEUX configs sont perdantes sur cette fenêtre réelle (le marché XAUUSD a globalement été difficile pour FVG récemment, pas spécifique au multi-contact), le multi-contact perd plus en absolu mais avec 3x plus de trades.

**Conclusion honnête** : US500 reste le candidat le plus solide de cette session sur la robustesse historique (8/8 blocs, quasi 17 ans de données, +128% de R), mais comme pour la cible dynamique, l'échantillon réel récent ne le confirme pas encore (trop petit, n=4 vs n=13, pour être concluant dans un sens ou l'autre - contrairement à la cible dynamique où le réel CONTREDISAIT clairement l'historique avec un échantillon plus solide). XAUUSD est plus faible sur toute la ligne (gain marginal historique + négatif réel) - je ne recommande pas de l'activer. **Décision sur US500 laissée à Esdras** : soit activer maintenant sur la force de la robustesse historique exceptionnelle, soit attendre plus de données réelles avant de trancher (même logique que la cible dynamique, qui reste en observation).

`npm test` : 534/534 (aucun fichier de production modifié — recherche uniquement, seul `data/backtest-input/fvg-multi-touch-analysis.md` régénéré avec les données/config actuelles). **Fichiers** : `data/backtest-input/fvg-multi-touch-analysis.md` (régénéré).

## FVG multi-contact ACTIVÉ sur US500, puis test final train/test/réel du combo complet — 2026-09-16 (suite directe, même session)

Esdras : "Oui, active le multi-contact sur US500. Et on VA faire un test avec Tous ces strategy combine, train vs test vs ces 7 derniers mois avant de sarreter."

**Activation** : `CONFIG.fvg.perSymbol.US500.multiTouch = true` (`src/config.js`) — AUCUN changement de code nécessaire, `_buildFvgEngine()` lisait déjà ce champ de façon générique (pas spécifique à US100). Deux effets de bord découverts et corrigés :
- `src/dataSources/tradeCompliance.js` : commentaire de mise en garde ("KNOWN CAVEAT") mis à jour pour ne plus dire "US100 seulement" — le code lui-même était déjà générique, seul le commentaire mentait par omission.
- `test/chartOverlays.test.js` : **2 tests cassés** — ils utilisaient délibérément US500 comme repère "toujours en contact unique" pour tester le comportement des zones "stale" (une zone jamais vue se fermer, avant les correctifs multi-contact). Maintenant que US500 est aussi multi-contact, ces deux tests devenaient invalides pour la même raison qu'ils testaient. Corrigés en utilisant **XAUUSD** à la place (le seul des 3 instruments FVG encore en contact unique). `npm test` : **534/534** (inchangé en nombre, 2 tests réécrits).

`data/backtest-summary.json` régénéré (7173 trades décidés, +2964R, 30.4% de réussite — reflète maintenant les 3 mécanismes GER40 + le multi-contact US500).

**Test final demandé : combo complet (TOUT ce qui a été ajouté cette session), train vs test vs 7 mois réels** — `scripts/testFullComboTrainTestReal.js` (nouveau), rejoue le combo directement depuis `CONFIG` (pas de config manuelle en dur, donc toujours à jour avec `config.js`) sur 3 fenêtres : historique < 2024-01-01 (train), historique >= 2024-01-01 (test, même découpage que partout ailleurs dans ce projet), et la fenêtre réelle déjà committée (`data/real-data-2026-02-to-09/`, 2026-02→09) :

| Fenêtre | Trades | Taux de gain | R moyen | Total R |
|---|---|---|---|---|
| TRAIN | 6028 | 29.7% | 0.379 | +2271.00R |
| TEST | 1164 | 34.0% | 0.577 | +666.00R |
| **RÉEL (7 mois)** | 287 | 31.4% | 0.341 | +98.00R |

**Cohérence rassurante** : le réel (31.4% / 0.341R) tombe ENTRE le train (29.7% / 0.379R) et le test (34.0% / 0.577R) sur le taux de gain, et reste solidement positif sur le R moyen même si un peu plus bas que les deux périodes historiques (0.341 contre 0.379/0.577) — pas de divergence massive ni de signe de rupture de régime, contrairement à ce qui avait été vu pour la cible dynamique US100 (où le réel contredisait franchement l'historique). Écart test→réel : -2.6 points de taux de gain, -0.236R d'espérance moyenne — dans l'ordre de grandeur attendu d'un échantillon de 287 trades contre 1164, pas un signal d'alarme.

**Détail par mécanisme (réel, 7 mois)** : NWOG le plus fort (46.5% de réussite, +37R sur 43 trades — porte à la fois US100 achat-seul et GER40 bidirectionnel, cohérent avec son bon comportement historique) ; FVG plus faible que d'habitude (25.5% contre 33.7% en test — à surveiller, écho du signal déjà noté ailleurs dans ce document sur une fenêtre FVG antérieure plus dure) ; Breaker Block très proche de son propre chiffre train (30.0% pile) ; Divergence à l'équilibre (+0.00R, 25.0%). Rien d'alarmant pris dans son ensemble — le combo reste net positif sur les 3 fenêtres sans exception.

**Session arrêtée ici, à la demande d'Esdras.** Résumé de tout ce qui a été ajouté aujourd'hui : NWOG/GER40 (bidirectionnel), Breaker Block/GER40 (nouveau mécanisme), FVG multi-contact/US500. GER40 trade maintenant avec 3 mécanismes, US500 est maintenant multi-contact comme US100. Cible dynamique de liquidité (US100) reste en observation, PAS déployée (résultat contradictoire train/réel). XAUUSD reste inchangé (single-touch, aucun nouveau mécanisme) - testé mais pas assez convaincant partout.

`npm test` : 534/534. **Fichiers** : `src/config.js`, `src/dataSources/tradeCompliance.js`, `test/chartOverlays.test.js`, `data/backtest-summary.json`, `scripts/testFullComboTrainTestReal.js` (nouveau).

## Reprise après capture d'écran du dashboard réel — le déploiement était déjà en ligne, mais le nouveau mécanisme n'était PAS reflété partout dans le site — 2026-09-16 (même session)

Esdras a envoyé une capture d'écran du dashboard réel (`ict-fvg-bot.onrender.com`) : "Et ces modifications dans le corps du site? Rien n'a été modifié" + "malgré plusieurs pertes, on est retourné à 10000" + "ajoutes les autres pairs qu'on a mis et les autres strategy aussi."

**Vérification via l'API Render (`mcp__Render__*`)** : le déploiement `ict-fvg-bot` (`srv-dafkaav40ujc73bm3cl0`) a `autoDeploy: yes` sur la branche `claude/lire-handoff-hxisa5` — CHAQUE commit poussé cette session a bien déclenché un déploiement automatique, et le dernier (commit `e963825`, "Activate FVG multi-touch on US500...") est **status: "live"**, terminé à 09:43:41 UTC. Logs confirment une reconnexion cTrader propre juste après (`[cTrader:default] connected and live for account 48587457` à 09:43:56). **Le code EST bien en production** — "rien n'a été modifié" n'était pas un problème de déploiement.

**🔴 "aucune donnée récente (60 min)" expliqué** : la capture (5:46, probablement heure locale ≈ 09:46 UTC) a été prise à peine 2-3 minutes après le redémarrage automatique du service (redéploiement déclenché par mon dernier commit) — un artefact TRANSITOIRE de calendrier de déploiement rapide pendant cette session, pas une vraie panne. Devrait se résorber de lui-même une fois quelques bougies M15 fraîches reçues après le redémarrage.

**Solde 10000.00 malgré des pertes, expliqué** : `GET /api/accounts` confirme `broker.isDemo: true` pour le compte "default" (déjà documenté dans `config.js` — compte cTrader DEMO chez fpmarketssc, PAS de l'argent réel, malgré le badge "LIVE" qui fait référence à `accountMode` = niveau de risque 0.3%, pas au statut réel/démo du courtier). Solde (10000.00) et équité (9999.70 dans la capture) sont deux valeurs DIFFÉRENTES — l'équité inclut le P&L flottant d'une position ouverte, le solde non. Le **-2.12R / 28 trades** du journal durable est une troisième mesure encore différente (en multiples de R, pas en dollars) — à 0.3% de risque sur $10k, -2.12R ≈ quelques dizaines de dollars, cohérent avec un solde proche de 10000 sans "réinitialisation" mystérieuse. Trois métriques légitimement différentes, pas un signe d'effacement des pertes.

**⚠️ Vrai bug trouvé en creusant "qu'est-ce qui doit être modifié dans le site" — Breaker Block invisible/mal étiqueté à plusieurs endroits**, alors qu'il trade déjà en LIVE depuis ~30 min au moment de cette capture :
- `public/index.html` (3 endroits) + `public/journal.html` (1 endroit) : la fonction `sourceLabel`/objets `sourceLabelFull`/`sourceLabelShort` n'avaient PAS d'entrée `breakerblock` → un trade Breaker Block réel se serait affiché comme **"manuel/inconnu"** dans le journal au lieu de "Breaker Block".
- `src/dataSources/cTraderDataSource.js` + `matchTraderDataSource.js` : le texte des notifications push (ntfy.sh) tombait sur le cas par défaut `'FVG rempli'` pour un signal Breaker Block — une notificationréelle aurait affiché à tort "FVG rempli" au lieu de "Breaker Block (GER40)".
- **`src/dataSources/dealPairing.js` — le plus sérieux des quatre** : `LABEL_SOURCE_RE` (regex qui relit le label `auto-<source>-<symbole>` posé sur chaque ordre réel pour reconstituer l'historique/réconciliation) n'incluait pas `breakerblock`. Les VRAIS ordres Breaker Block sont bien étiquetés correctement à l'envoi (`auto-breakerblock-GER40`, `_handleAutoExecuteEntry` construit le label génériquement à partir de `signal.source` — aucun bug côté exécution), mais cette regex ne les aurait PAS reconnus en relisant l'historique du courtier → tout trade Breaker Block réel déjà clôturé aurait été réconcilié avec `source: null`, cassant silencieusement les statistiques par mécanisme dans le journal pour ce mécanisme précis.

**Corrigé** : les 4 fichiers ci-dessus + `test/dealPairing.test.js` (nouveau cas de test couvrant explicitement `auto-breakerblock-GER40`, + 2 cas `judaswing`/`weeklysweep` qui manquaient aussi à ce test bien qu'ils fonctionnent déjà correctement en production). Vérifié qu'aucun autre fichier (`chart.html`, `accounts.html`, `server.js`) n'a de liste figée de sources à mettre à jour — `chart.html` reste volontairement scopé à FVG/Divergence seulement (limite déjà existante avant cette session, pas une régression).

`npm test` : 534/534 (même nombre, une assertion ajoutée à un test existant + le nouveau cas breakerblock). **Fichiers** : `public/index.html`, `public/journal.html`, `src/dataSources/cTraderDataSource.js`, `src/dataSources/matchTraderDataSource.js`, `src/dataSources/dealPairing.js`, `test/dealPairing.test.js`.

## Divergence GER40 rejetée (échoue le test de sanité) et pyramidage XAUUSD rejeté (sous-performe à risque égal) — 2026-09-16

Suite de la recherche "autres idées pour augmenter la fréquence" : deux pistes supplémentaires demandées explicitement par Esdras ("1-2" : autre paire Divergence, pyramidage étendu à XAUUSD/GER40).

**Divergence GER40/US100 et GER40/US500** : au premier passage, résultat spectaculaire — quasiment toutes les configs (lookback×seuil) passent le verdict train/test, espérance 0.03R à 0.32R. Mais corrélation H1 mesurée à seulement 0.197-0.222 (contre 0.935 pour US100/US500, 0.685 pour EURUSD/GBPUSD déjà rejeté) — signal d'alarme avant de conclure. **Test de sanité décisif** : la même méthode appliquée à GER40/EURUSD (corrélation 0.034, quasiment aucun lien) donne un résultat presque identique (8/9 configs passent). Conclusion : ce n'est PAS un vrai signal de divergence entre paires — c'est un edge générique de rachat de repli propre à GER40 lui-même (cohérent avec NWOG/Weekly Sweep/Breaker Block déjà validés dessus), habillé à tort en "stratégie de paires". **Rejeté tel que conçu** — un vrai edge GER40-seul existerait peut-être, mais ce serait un NOUVEAU mécanisme à concevoir et valider proprement (avec vérification de chevauchement contre les 3 mécanismes GER40 déjà actifs), pas une extension de Divergence.

**Pyramidage sur XAUUSD** (seul candidat valide : le pyramidage ne s'applique qu'aux trades FVG dans le code — `_maybeRequestPyramid` vérifie `pyramidConfig.symbols.includes(symbol)` — et GER40 n'a pas de FVG live, seulement NWOG/Weekly Sweep/Breaker Block, donc "pyramider GER40" n'a pas de sens tel que le système est conçu). Piège méthodologique trouvé en cours de route : `warmUp()` (rejeu direct) ne résout JAMAIS une jambe de pyramide — ça demande une confirmation broker (`markPyramidOrderPlaced`/`markPyramidOrderFilled`) qui n'existe pas en simulation, contrairement à FVG/Divergence/NWOG/etc. résolus directement par l'événement `closed`. `portfolioSimulator.js` (déjà utilisé pour US100/US500) reste le bon outil.

Résultat, comparaison à risque égal (0.25%/trade pyramidé = même pire cas $ que 0.5% sans pyramide, même principe que la comparaison US100/US500 d'origine) :

| Année | Sans pyramide (0.5%) | Avec pyramide (0.25%, risque égal) |
|---|---|---|
| 2019 | +3.7% | +3.9% |
| 2020 | +12.9% | +12.4% |
| 2021 | -4.4% (WR 11.5%) | -3.3% (WR 14.9%) |
| 2023 | +10.9% | +8.5% |
| 2024 | +8.4% | +3.0% |
| 2025 | +9.7% | +8.0% |
| **Total cumulé (6 ans)** | **+41.2%** | **+32.5%** |

Contrairement à US100/US500 (où pyramidage + risque réduit égalait quasiment le risque plein sans pyramide), ici le pyramidage **sous-performe nettement** à risque égal — sauf sur la seule vraie mauvaise année (2021, win rate sous 15%), où il atténue légèrement la perte sans l'effacer. XAUUSD a un vrai passage à vide cette année-là, et pyramider dedans amplifie le problème plus qu'il ne profite des bonnes années ailleurs. **Rejeté.**

**Conclusion générale** : deux résultats négatifs, mais avec preuve rigoureuse (test de sanité pour Divergence, comparaison à risque égal pour le pyramidage) plutôt que des suppositions. Bilan de la session de recherche "augmenter la fréquence sans compromettre la qualité" : Weekly Sweep/US500 activé (seul vrai gain trouvé), NWOG/XAUUSD-US500 rejeté, Judas Swing confirmé EURUSD-seul, Divergence GER40 rejetée, Pyramidage XAUUSD rejeté.

`npm test` : inchangé (aucun code de production touché, recherche uniquement).

**Fichiers** : aucun commité — scripts d'exploration dans le scratchpad de session (mêmes patterns que `runDivergenceStrategyAnalysis.js`/`runDivergenceEurGbpStrategyAnalysis.js` pour la partie Divergence, `runPyramidIndependentAccountImpact.js` pour la partie pyramide — à recréer si besoin de refaire ces tests précis).
