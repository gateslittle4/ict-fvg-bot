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
