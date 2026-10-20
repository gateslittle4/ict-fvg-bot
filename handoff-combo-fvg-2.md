# active-memory handoff: Combo FVG (ict-fvg-bot), F2 en démo, combos testés

**Handoff #2** · 2026-10-06 · Lineage: #1 (2026-10-06): protocole entraînement/test/forward appliqué au Combo FVG v6, variantes F1–F3 et G1, lot 4 à l'aveugle, critères 1 et 2 à coder; #2 (2026-10-06): critères 1 et 2 + 10 combos testés (aucun ne passe), report au lendemain (B) rejeté, rejeu M1 de F2, analyse 2026, critère de démo F2 écrit, comparaison avec le combo du site entamée

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: None active. If the user types /amcodeword, start every reply with the phrase they choose (default "Yes Boss!").
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** trouver une version du « Combo FVG » (US100 M15, achats) assez solide pour une démo, avec un protocole honnête : règles écrites avant le calcul, entraînement 2011–2022 (deux moitiés), test 2023–2025 lu une fois, 2026 puis démo en forward.
- **Done looks like:** une version qui passe ses critères pré-enregistrés (rythme ≥ 1,5 trade/semaine souhaité, t ≥ 2,6, deux moitiés positives, test > 0), puis une démo à règles figées avec critère écrit. Aucune variante n'a passé à ce jour ; F2 est la candidate pour une démo TEST (pas une preuve).
- **Context:** projet « ICT FVG bot » (dépôt `C:\Users\Adm\Documents\ict-fvg-bot`, branche `claude/commit-access-a7k1hw`). Simulation seulement, aucun ordre réel. Méthode = celle de Krystofia (FVG strict M15, validation par c4, entrée 50 %, cible = FVG M15 « à gauche »).

## 2. About the user (as relevant to this work)
- Il parle de « mon setup / ma stratégie ». Les docs du projet l'appellent Krystofia (économiste/data, BRH, Haïti, décide elle-même). La mémoire du compte dit qu'il se présente comme Esdras (voir section 12).
- Il juge les trades à la main avec des PD arrays H4 (high/low H4, FVG H4) et des FVG M15. Il veut 2–3 trades par semaine. Fuseau : America/Port-au-Prince (UTC−4) ; les messages arrivent parfois marqués Jamaica (UTC−5). Graphiques de sa plateforme : axe en UTC.
- Il pose des questions courtes et concrètes ; il veut comprendre (« explique F2 », « pourquoi 2026 est négatif ? ») et décide lui-même.

## 3. Style & communication
- **Language:** français.
- **Tone:** direct, simple, étape par étape.
- **Reply length:** court (moins de 100 mots par défaut) ; plus long seulement si détail demandé.
- **Formatting:** peu de listes ; tableau seulement pour des résultats chiffrés.
- **Working style:** dire d'abord ce qu'on fait ; poser au plus une question à la fois ; écrire règles et critères AVANT de calculer ; mettre les images dans le chat pour qu'il puisse répondre ; dire clairement quand l'ordinateur n'est pas joignable.
- **Avoid:** inventer, deviner une définition, régler une règle sur un exemple, valider un trade à sa place, enchaîner des essais sur les mêmes données après un échec.

## 4. Hard rules (word for word)
1. "Réponds en français. Krystofia décide ; ne valide jamais un trade à sa place." (CLAUDE.md du projet)
2. "Avant toute autre chose, lis `docs/BRIEF-SEANCE-QUIZ.md` en entier" puis seulement d'autres fichiers ; "Ne lis pas HANDOFF.md en entier (1 Mo) sans raison précise." (le brief fait 70 Ko ; dans le chat précédent seul son début a été lu)
3. Protocole : règles figées et critères écrits avant le calcul ; aucun amendement après lecture des résultats ; pas d'autre essai sur les mêmes données après un échec.
4. Entraînement 2011–2022 (moitiés 2011–2016 et 2017–2022), test 2023–2025 lu une fois, 2026 descriptif ; le vrai forward = démo à partir du 05/10/2026.
5. Les blocs 2023–2025 et 2026 ne sont plus vierges pour le Combo FVG ; le seul bloc jamais vu est 2011–2018 (pour v6).
6. Tout nouveau code avec logique métier = au moins un test.
7. Ne rien committer dans git sans que ce soit demandé ; ne pas pousser vers GitHub. (Les fichiers sont écrits dans le dossier du projet via le pont, sans git.)
8. Le test 2023–2025 n'est lu (R) que pour une variante qui a déjà passé les critères d'entraînement ; avant, seul le nombre de trades est lu.

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | A dit que la v6 donne ~30 trades/an | Il pense 2–3 trades/semaine ; mesure : v6 ≈ 0,7/semaine, achats sans filtre ≈ 6/semaine, achats+ventes ≈ 9,5/semaine |
| 2 | A codé « deux modes A/B + interrupteur de distance au low H4 » | « les deux » = critères (1) dernier PD array touché, (2) FVG M15 cible déjà touché = pas d'aimant ; puis interrupteur selon le contexte. Rien n'a été calculé avec l'ancien code. |
| 3 | A dit « le projet n'est pas sous git » (message d'un hook) | Le dépôt était déjà sous git ; ne rien initialiser |
| 4 | A fourni les images du lot dans un dossier | « met le ici pour que je puisse répondre » : images dans le chat |
| 5 | A proposé un seuil de « proche » pour la cible H4 | Pas de seuil chiffré donné par lui ; question restée ouverte |
| 6 | A interrompu son travail en disant que l'ordinateur était déconnecté, sans dire qu'il l'avait trouvé avant | L'utilisateur : « T'as pas trouvé l'ordi ? » → dire clairement : trouvé, lu, et ce qui a été refusé (un enregistrement qu'il a refusé) |
| 7 | Dans la 1re passe du rejeu M1, a compté la durée maximale de détention en temps réel (week-ends inclus) | Corrigé par Claude lui-même (compter en bougies M15) ; seuls les chiffres corrigés sont valides |

## 6. Decisions
| Decision | Why |
|---|---|
| Combo FVG v6 : NON validée | t = 0,31 sur 2011–2022, 2011–2016 négatif |
| F2 (balayage du low H4 seul) = candidate pour une démo TEST, règles figées, aucun ordre réel | 2,08 trades/semaine, deux moitiés positives, mais t ≈ 2,03–2,04 et 2026 négatif ; ne prouve rien |
| Coder les critères 1 et 2 + interrupteur (« oui, teste les combos possibles ») ; interrupteur par défaut confirmé : PD array H4 touché dans les dernières 24 h → critère 1, sinon critère 2 | Demande de l'utilisateur |
| Variante B « report au lendemain » testée (« Essaie b ») puis NON ajoutée (« Donc on ne l'ajoute pas ») | Moyenne baisse, trades du report perdants |
| Écrire le critère de démo de F2 avant de lancer (« oui ») | Demande de l'utilisateur ; seuils encore à confirmer par lui |
| Enregistrer code, tests et docs dans le dossier du projet, sans git (« Les deux ») | Demande de l'utilisateur |
| Rejeu minute par minute de F2 sur M1 (« Oui ») | Pour vérifier le pessimisme M15 |
| Pas de règle « 2–3 trades/semaine » validée | Aucune variante n'a passé ses critères |

## 7. Changed / rejected
- v6 complète → F1/F2/F3 (un seul filtre H4 à la fois) pour plus de trades.
- Fenêtre 06:00–16:00 → test 06:00–17:00 sans filtre H4 : rien d'utile.
- Fenêtre W = 32 du balayage → G1 « balayage valable jusqu'au toucher d'un PD array opposé » : non validée.
- Critères 1, 2, ET, OU, interrupteur sur « achats sans filtre » et sur F2 : aucun ne passe.
- F2 + report au lendemain (variante B) : rejeté. La variante A (balayage valable jusqu'à 16:00 NY le lendemain) n'a pas été testée.
- ❌ « Deux modes A/B avec interrupteur de distance au low H4 » (mal compris, jamais calculé).
- ❌ Proxy « entrée dans un FVG H4 haussier non rempli = laisser » : contredit sa prise du trade 5.
- ❌ Break-even, partiels, trailing.
- ❌ Modifier F2 d'après l'analyse descriptive de 2026 (sous-groupes trop petits, risque de hasard).

## 8. Data & facts (exact)
Données : HistData M1 US100 `data/histdata-m1/US100.csv.gz` (2010-11-14 → 2022-12-30) ; broker M1 `data/real-m1-full/US100.csv.gz` (2023-01-11 → 2026-09-21) ; M15 reconstruites avec heure NY réelle (DST) ; live : `https://ict-fvg-bot.onrender.com/api/candles?symbol=US100&limit=5000`. Règles de base : achats, 06:00–16:00 NY, FVG d'entrée ≤ 8 bougies, entrée 50 %, stop c1 − 3 pts, TP max(½ FVG cible, 3R), spread 0,6 pt, tout proportionnel à prix moyen de l'année / 8200, rejeu M15 pessimiste (stop avant TP). Seuil de rentabilité à 3R : 25 % de gagnants. 155 semaines sur 2023–2025.

**F2 = achats ; balayage du low des 6 dernières barres H4 complètes dans les 32 bougies M15 avant c3 ; le reste inchangé.**

Résultats antérieurs (R par trade) :
| Variante | 2011–2016 | 2017–2022 | 2011–2022 | Test 2023–25 | 2026 (au 21/09) | Trades/sem. 2023–25 |
|---|---|---|---|---|---|---|
| v6 complète | −0,029 (250) | +0,092 (206) | +0,026 (456), t 0,31 | +0,099 (112), t 0,56 | +0,109 (23) | 0,72 |
| Achats sans filtre | +0,027 (1 732) | +0,023 (1 914) | +0,025 (3 646), t 0,83 | +0,075 (937), t 1,19 | −0,089 (219) | ~6 |
| F2 | +0,067 (617) | +0,146 (605) | +0,106 (1 222), t 2,04 | +0,183 (325), t 1,71 | −0,239 (87) | 2,08 |
| G1 | +0,046 (221) | +0,225 (223) | +0,136 (444), t 1,54 | +0,138 (141) | −0,397 (33) | 0,90 |
- v6 sur 2011–2018 (jamais vu) : −0,026 (315), t −0,27.

Combos de cette séance (étape 1, test 2023–25 masqué ; moyenne (n) par bloc ; critères : ≥ 1,5/sem., t ≥ 2,6, moitiés > 0, meilleur que le contrôle) :
| Variante | 2011–2016 | 2017–2022 | 2011–2022 (t) | Trades/sem. |
|---|---|---|---|---|
| b0_none (achats sans filtre, contrôle) | +0,027 (1 732) | +0,023 (1 914) | +0,025 (3 646), t 0,83 | 6,05 |
| b0_c1 | +0,014 (767) | +0,109 (836) | +0,063 (1 603), t 1,37 | 2,69 |
| b0_c2 | +0,074 (870) | +0,036 (1 001) | +0,054 (1 871), t 1,24 | 3,11 |
| b0_and | +0,034 (373) | +0,085 (419) | +0,061 (792), t 0,91 | 1,42 |
| b0_or | +0,045 (1 252) | +0,066 (1 399) | +0,056 (2 651), t 1,56 | 4,31 |
| b0_sw | +0,014 (767) | +0,112 (837) | +0,065 (1 604), t 1,41 | 2,69 |
| b2_none (F2, contrôle) | +0,067 (617) | +0,146 (605) | +0,106 (1 222), t 2,04 | 2,10 |
| b2_c1 (= b2_sw, mêmes résultats) | +0,037 (416) | +0,179 (423) | +0,108 (839), t 1,70 | 1,45 |
| b2_c2 | −0,032 (309) | +0,070 (305) | +0,019 (614), t 0,26 | 1,06 |
| b2_and | −0,031 (206) | +0,068 (219) | +0,020 (425), t 0,23 | 0,77 |
| b2_or | +0,023 (519) | +0,166 (507) | +0,094 (1 026), t 1,64 | 1,73 |
Meilleur t = 1,73 (b0_sw 1,41 ; b2_c1 1,70 ; b2_or 1,64). Aucune ne passe ; test non lu. Définitions : c1 = dernier PD array H4 touché est de type « bas » (low des 6 barres H4 balayé ou FVG H4 haussier non rempli touché par le dessus) ; c2 = FVG M15 cible jamais pénétré ; sw = si événement H4 dans les 96 dernières bougies avant c3 → c1 sinon c2.

F2 + report au lendemain (J, critères : t ≥ 3,0 car ~16 hypothèses) : 2011–2016 +0,046 (848) ; 2017–2022 +0,087 (908) ; 2011–2022 +0,067 (1 756), t 1,53 ; 2,87 trades/sem. ; trades admis par le report seul : −0,024 (535), t −0,29. NON VALIDÉE.

Rejeu minute par minute de F2 (mêmes trades ; M15 pessimiste → M1) :
| Période | M15 | M1 |
|---|---|---|
| 2011–2016 | +0,067 (617) | +0,062 (616) |
| 2017–2022 | +0,146 (605) | +0,150 (603) |
| 2011–2022 | +0,106 (1 222), t 2,04 | +0,106 (1 219), t 2,03 |
| 2023–2025 | +0,183 (325), t 1,71 | +0,187 (324), t 1,74 |
| 2026 | −0,239 (87), t −1,42 | −0,147 (87), t −0,84 |
Transitions 2011–2022 : stop→stop 866, tp→tp 287, temps→temps 65, tp→annulé (TP avant remplissage) 2, stop→tp 1, stop→annulé 1. Limite : la règle « une seule position à la fois » n'a pas été rejouée.

F2 en 2026 (descriptif, M15) : par mois — janv +0,333 (6) ; févr −0,636 (11) ; mars −0,250 (16) ; avr +1,846 (4) ; mai +0,333 (9) ; juin −1,000 (4) ; juil −0,393 (21) ; août −0,653 (6) ; sept −0,600 (10). RR visé ≥ 4 : 2026 0 gagnant sur 17 (−1,000) ; 2023–25 41 % sur 32 (+1,426). Stop médian 0,281 % du prix (2026) contre 0,252 % (2023–25). Sorties 2026 : 70 stops, 15 TP, 2 temps. Par tiers : −0,310, +0,221, −0,627. Pas de cause unique.

Critère de démo F2 (`docs/CRITERE-DEMO-F2.md`) : départ 05/10/2026 ; à 60 trades remplis moyenne R > 0 pour continuer sinon abandon ; arrêt anticipé si cumul ≤ −15 R ; écart-type par trade ≈ 1,8 R → erreur ≈ 0,24 R à 60 trades (si vrai +0,106 : ~67 % de passer ; si 0 : ~50 %) ; 150 trades ≈ 14 mois, erreur 0,15 R ; 300 trades ≈ 2,8 ans, erreur 0,10 R. Seuils 60 et −15 R = propositions de Claude à confirmer.

Combo du site (lecture du code, rien exécuté) : `src/liveStrategyEngine.js` = « FVG filtré » (biais EMA HTF + structure ICT + fenêtre NY + balayage de liquidité) sur US100, US500, XAUUSD + Divergence US100/US500 + autres mécanismes (8 mécanismes, RSI(2), ORB, Judas Swing, EURUSD) ; netting une position par instrument. `docs/STRATEGY.md` est marqué PÉRIMÉ (chiffres « +0,70 R/trade sur 30–38 signaux » d'avant les corrections de méthode : ne pas les citer). La page simulateur ne mentionne pas « combo ».

Trade du 2 oct. 2026 (capture de l'utilisateur) : FVG d'achat 30701,85–30726,85 (c3 04:00 NY), cible FVG de vente 30840,55–30882,05 ; ordre posé 06:00 NY, entrée 30714,3, stop 30638,8, TP 30940,9 (3R), rempli 07:45, TP 08:45 = +3R. Retrouvé par « achats sans filtre » ; PAS par v6 ni F2.
Lot 4 (10 achats de continuation) : il prend 2, 3, 4, 5 ; laisse 1, 6, 7, 8, 10 ; hésite 9 ; issues −1R sauf 5 et 6 (+3R).
Commits git (branche `claude/commit-access-a7k1hw`) : d9607ee (v6), 849110b (F1–F3, fenêtre 17 h), 3e481c0 (G1).
Empreintes SHA-256 : comboH.mjs c0826ebd01e6ddaddf013f58080047fc8700e0ffc3bc8cf22e42f15084246a7b ; comboH.test.mjs 7b8218942df4415588822c7fbdd9941c52e9a834ad4ecfc2e271852161a5186e ; comboJ.mjs 12e6d000f6a5295cef13e1c56988e20b883fb985c37266c4e10ca3df64d1f041 ; comboJ.test.mjs 6ccb1570f12557fc959da5193ebf210ba305a46160f8b822216f3ca9ca0a78e5 (comboM1.mjs a été corrigé après sa première exécution).

## 9. People, terms & names
- **People:** Krystofia = la trader dont la méthode est codée (nom dans les docs du projet) ; Esdras = nom que l'utilisateur donne dans la mémoire du compte.
- **Terms & nicknames:** FVG = fair value gap ; c1/c3/c4 = bougies de validation ; « FVG à gauche » = premier FVG M15 dans le sens du TP (cible/aimant) ; PD array = FVG, high ou low d'une unité de temps ; balayage = low H4 pris ; « Combo FVG » = v6 ; F2 = balayage seul ; R = unité de risque ; « report au lendemain » = variante B/J.
- **Names in use:** `scripts/comboFvgV6/` : `comboV6.mjs`, `comboF.mjs`, `comboG.mjs`, `comboH.mjs`, `comboJ.mjs`, `comboM1.mjs` (+ `.test.mjs` pour G, H, J, M1), `fenetre17.mjs`, `lib/krysBacktest.js`, `lib/krysMethod.js` ; docs `PREREG-/RESULTAT-COMBO-FVG-V6 / UN-FILTRE / BALAYAGE-EVENEMENT / CRITERES / REPORT-LENDEMAIN.md`, `CRITERE-DEMO-F2.md`, `REVUE-LOT4-CONTINUATION.md` ; lancement : `node comboH.mjs <dossier data> train` (idem comboJ ; comboM1 sans mode).

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| v6, F1–F3, G1 | final, committed git | commits d9607ee, 849110b, 3e481c0 | non validées |
| comboH (critères 1, 2, combos) + tests (3) + PREREG/RESULTAT-CRITERES | final, écrit dans le dossier (non committé git) | scripts/comboFvgV6/, docs/ | aucune variante ne passe |
| comboJ (report au lendemain) + tests (3) + PREREG/RESULTAT | final, écrit dans le dossier (non committé git) | idem | non validée |
| comboM1 (rejeu minute) + tests (5) | final, écrit dans le dossier (non committé git) | scripts/comboFvgV6/ | pas de document résultat ; chiffres en section 8 |
| `desc2026.mjs` (analyse 2026) | NON enregistré, perdu avec l'ancien chat | — | chiffres en section 8 ; à refaire si besoin |
| CRITERE-DEMO-F2.md | final, seuils à confirmer | docs/ | démo non lancée |
| Comparaison F2 vs combo du site | pas commencée (code lu seulement) | `src/liveStrategyEngine.js`, `src/backtest/gridRunner.js` (`buildFilteredEngine`, non lu) | demander avant de la faire |
| Lot 4 + revue | final, non committé git | `Claude outputs\lot4\`, `docs\REVUE-LOT4-CONTINUATION.md` | |
Note outils : le pont vers l'ordinateur se déconnecte par moments ; pas d'accès shell à la machine (device_bash instable). Travail fait dans le conteneur après copie des fichiers ; enregistrement par commit de fichiers. L'utilisateur a refusé deux appels d'outil (un enregistrement, un lancement de script) puis a donné son accord.

## 11. Next steps
1. **Next action:** demander à l'utilisateur de choisir les seuils de la démo F2 : (a) 60 trades remplis + arrêt à −15 R, ou (b) viser 150 trades (≈ 14 mois, recommandé par Claude) ; puis mettre à jour `docs/CRITERE-DEMO-F2.md` en conséquence.
2. Demander s'il veut comparer le « FVG filtré » du site à F2 sous le même protocole (US100, 2011–2022, mêmes spreads) ; si oui, lire d'abord `buildFilteredEngine` pour voir s'il applique la règle c4, écrire le pré-enregistrement, puis tester.
3. Si demandé : vérifier le code du bot en direct (décision à la fermeture M15, surveillance des remplissages/stop/TP à chaque minute) ; recommandation de Claude, non vérifiée dans le code.
4. Optionnel : écrire un document résultat du rejeu M1 ; refaire `desc2026.mjs`.

## 12. Open questions ⚠️
- Seuils de démo F2 : 60 trades / −15 R, ou 150 trades ?
- Veut-il la comparaison F2 vs FVG filtré du site ? (et lequel : US100 seulement ?)
- Qui est l'utilisateur : Krystofia ou Esdras ? Ne pas deviner.
- Sur quelle base appliquer les critères de contexte : « achats sans filtre » ou F2 ? (testé les deux ; aucune ne passe)
- Définition de « proche » pour une cible H4 (jamais donnée) et cible H4 vs FVG M15 7 jours max (idée de l'utilisateur, non codée).
- Lot 4 : pourquoi le 5 (dans un FVG H4) pris alors que 7 et 10 (aussi dedans) laissés ?
- Le trade du 2 octobre n'a pas pu être vérifié avec la variante B (données jusqu'au 21/09 seulement).

## 13. Re-attach checklist
- [ ] Le dossier du projet `ict-fvg-bot` doit être lié à la session (scripts, docs, données) : sinon attacher `docs/CRITERE-DEMO-F2.md`, `docs/PREREG-/RESULTAT-COMBO-FVG-CRITERES.md` et `scripts/comboFvgV6/`.
- [ ] Optionnel : `data/histdata-m1/US100.csv.gz` et `data/real-m1-full/US100.csv.gz` pour refaire un calcul.

---
<sub>Audit: 13/13 sections · 8 rules · 7 corrections · ~110 data points · secrets removed: none found · generated by active-memory</sub>
