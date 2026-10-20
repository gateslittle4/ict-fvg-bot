# active-memory handoff: Combo FVG (ict-fvg-bot), validation et critères de contexte

**Handoff #1** · 2026-10-06 · Lineage: #1 (2026-10-06): protocole entraînement/test/forward appliqué au Combo FVG v6, variantes F1–F3 et G1, lot 4 à l'aveugle, critères 1 et 2 à coder

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
- **Done looks like:** une version qui passe ses critères pré-enregistrés (rythme ≥ 1,5 trade/semaine souhaité, t ≥ 2,5–2,6, deux moitiés positives, test > 0), puis une démo à règles figées avec critère écrit.
- **Context:** projet « ICT FVG bot » (dépôt `C:\Users\Adm\Documents\ict-fvg-bot`, branche `claude/commit-access-a7k1hw`). Simulation seulement, aucun ordre réel. Méthode = celle de Krystofia (FVG strict M15, validation par c4, entrée 50 %, cible = FVG M15 « à gauche »).

## 2. About the user (as relevant to this work)
- Il parle de « mon setup / ma stratégie ». Les docs du projet l'appellent Krystofia (économiste/data, BRH, Haïti, décide elle-même). La mémoire du compte dit qu'il se présente comme Esdras (voir section 12).
- Il juge les trades à la main avec des PD arrays H4 (high/low H4, FVG H4) et des FVG M15. Il veut 2–3 trades par semaine. Fuseau : America/Port-au-Prince (UTC−4). Graphiques de sa plateforme : axe en UTC.

## 3. Style & communication
- **Language:** français.
- **Tone:** direct, simple, étape par étape.
- **Reply length:** court (moins de 100 mots par défaut) ; plus long seulement si détail demandé.
- **Formatting:** peu de listes ; tableau seulement pour des résultats chiffrés.
- **Working style:** dire d'abord ce qu'on fait ; poser au plus une question à la fois ; écrire règles et critères AVANT de calculer ; mettre les images dans le chat pour qu'il puisse répondre.
- **Avoid:** inventer, deviner une définition, régler une règle sur un exemple, valider un trade à sa place.

## 4. Hard rules (word for word)
1. "Réponds en français. Krystofia décide ; ne valide jamais un trade à sa place." (CLAUDE.md du projet)
2. "Avant toute autre chose, lis `docs/BRIEF-SEANCE-QUIZ.md` en entier" puis seulement d'autres fichiers ; "Ne lis pas HANDOFF.md en entier (1 Mo) sans raison précise."
3. Protocole : règles figées et critères écrits avant le calcul ; aucun amendement après lecture des résultats ; pas d'autre essai sur les mêmes données après un échec.
4. Entraînement 2011–2022 (moitiés 2011–2016 et 2017–2022), test 2023–2025 lu une fois, 2026 descriptif ; le vrai forward = démo à partir du 05/10/2026.
5. Les blocs 2023–2025 et 2026 ne sont plus vierges pour le Combo FVG (règles choisies en les regardant) ; le seul bloc jamais vu est 2011–2018.
6. Tout nouveau code avec logique métier = au moins un test (ENF-TEST-001).
7. Ne rien committer dans git sans que ce soit demandé ; ne pas pousser vers GitHub.

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | A dit que la v6 donne ~30 trades/an | Il pense 2–3 trades/semaine ; mesure : v6 ≈ 0,7/semaine, achats sans filtre ≈ 6/semaine, achats+ventes ≈ 9,5/semaine (donc il parlait d'une version plus souple) |
| 2 | A codé « deux modes A/B + interrupteur de distance au low H4 » à partir de « essaie de coder les deux » | « les deux » = les deux critères proposés par Claude : (1) biais par le dernier PD array touché, (2) FVG M15 cible déjà touché = pas d'aimant ; puis un interrupteur selon le contexte. Il a interrompu l'exécution ; rien n'a été calculé, le document du pré-enregistrement a été supprimé. |
| 3 | A dit « le projet n'est pas sous git » (message d'un hook) | Le dépôt était déjà sous git ; ne rien initialiser |
| 4 | A fourni les images du lot dans un dossier | « met le ici pour que je puisse répondre » : images dans le chat |
| 5 | A proposé un seuil de « proche » pour la cible H4 | Pas de seuil chiffré donné par lui ; question restée ouverte |

## 6. Decisions
| Decision | Why |
|---|---|
| Combo FVG v6 : NON validée | t = 0,31 sur 2011–2022, 2011–2016 négatif, pas meilleure que « achats sans filtre » |
| Démo possible comme TEST (règles figées, journal complet, critère écrit avant), pas d'argent réel | Aucune preuve d'avantage statistique |
| F2 (balayage de low H4 seul) = candidate à suivre en démo | 2,08 trades/semaine, deux moitiés positives, mais t = 2,04 et 2026 négatif |
| Pas de règle « 2–3 trades/semaine » validée | Aucune variante n'a passé ses critères |
| Coder les deux critères (1 : dernier PD array touché ; 2 : aimant intact) puis un interrupteur de contexte | Demande de l'utilisateur |

## 7. Changed / rejected
- v6 complète → F1/F2/F3 (un seul filtre H4 à la fois) pour plus de trades.
- Fenêtre 06:00–16:00 → test 06:00–17:00 sans filtre H4 : rien d'utile (ADD).
- Fenêtre W = 32 du balayage → G1 « balayage valable jusqu'au toucher d'un PD array opposé » : non validée.
- ❌ « Deux modes A/B avec interrupteur de distance au low H4 » (mal compris, jamais calculé).
- ❌ Proxy « entrée dans un FVG H4 haussier non rempli = laisser » : contredit sa prise du trade 5.
- ❌ Break-even, partiels, trailing (déjà rejetés dans le brief).

## 8. Data & facts (exact)
Données : HistData M1 US100 `data/histdata-m1/US100.csv.gz` (2010-11-14 → 2022-12-30) ; broker M1 `data/real-m1-full/US100.csv.gz` (2023-01-11 → 2026-09-21) ; M15 reconstruites avec heure NY réelle (DST) ; live : `https://ict-fvg-bot.onrender.com/api/candles?symbol=US100&limit=5000` (temps en ms UTC, 5000 bougies ≈ 21 juil.–6 oct. 2026). Règles de base (toutes variantes) : achats, 06:00–16:00 NY, FVG d'entrée ≤ 8 bougies, entrée 50 %, stop c1 − 3 pts, TP max(½ FVG cible, 3R), spread 0,6 pt, tout proportionnel à prix moyen de l'année / 8200, rejeu M15 pessimiste (stop avant TP).

Résultats (R par trade ; nombre de trades ; t) :
| Variante | 2011–2016 | 2017–2022 | 2011–2022 | Test 2023–25 | 2026 (au 21/09) | Trades/sem. 2023–25 |
|---|---|---|---|---|---|---|
| v6 complète | −0,029 (250) | +0,092 (206) | +0,026 (456), t 0,31 | +0,099 (112), t 0,56 | +0,109 (23) | 0,72 |
| Achats sans filtre | +0,027 (1 732) | +0,023 (1 914) | +0,025 (3 646), t 0,83 | +0,075 (937), t 1,19 | −0,089 (219) | ~6 |
| Achats + ventes sans filtre | −0,010 (2 956) | −0,051 (3 049) | −0,031 (6 005), t −1,32 | −0,050 (1 489) | −0,034 (358) | ~9,5 |
| F1 tendance seule | +0,041 (877) | −0,003 (917) | +0,019 (1 794), t 0,44 | +0,029 (444) | +0,103 (84) | 2,85 |
| **F2 balayage seul** | +0,067 (617) | +0,146 (605) | +0,106 (1 222), t 2,04 | +0,183 (325), t 1,71 | −0,239 (87) | 2,08 |
| F3 pas dans FVG H4 baissier | +0,006 (1 546) | +0,046 (1 661) | +0,027 (3 207), t 0,84 | +0,074 (812) | −0,178 (203) | 5,21 |
| G1 balayage événementiel | +0,046 (221) | +0,225 (223) | +0,136 (444), t 1,54 | +0,138 (141) | −0,397 (33) | 0,90 |
| Fenêtre 06–17 h, achats sans filtre | +0,018 (1 777) | +0,009 (1 963) | +0,013 (3 740), t 0,45 | +0,083 (971) | −0,092 (239) | 6,2 |
| Fenêtre 06–17 h, achats+ventes | −0,025 (3 007) | −0,058 (3 104) | −0,042 (6 111), t −1,81 | −0,050 (1 549) | −0,080 (392) | 9,9 |
- v6 sur 2011–2018 (jamais vu) : −0,026 (315), t −0,27.
- Seuil de rentabilité à 3R : 25 % de gagnants.
- Trade du 2 oct. 2026 (capture de l'utilisateur) : FVG d'achat 30701,85–30726,85 (c3 04:00 NY), cible FVG de vente 30840,55–30882,05 (c3 1er oct. 02:45 NY) ; ordre posé 06:00 NY, entrée 30714,3, stop 30638,8, TP 30940,9 (3R), rempli 07:45, TP touché 08:45 = +3R. Retrouvé par « achats sans filtre » ; PAS par v6 ni F2 (dernier balayage de low H4 vers 13:15 NY le 1er oct., 15 h plus tôt > 32 bougies).
- Lot 4 (10 achats de continuation 2023–2025, tendance H4 haussière sans balayage, ordres remplis) : ses décisions → prend 2, 3, 4, 5 ; laisse 1, 6, 7, 8, 10 ; hésite 9. Issues : −1R sauf 5 (+3R) et 6 (+3R). Prises : 4 trades, 1 gagnant, 0 R ; refus : 5 trades, 1 gagnant, −1 R ; le 9 : −1 R.
- Ses raisons (lot 4) : 1 FVG M15 de gauche déjà touché, plus d'aimant ; 2 low H4 + FVG H4 pris il y a quelques jours, tendance continue, liquidity sweep le matin ; 3 sûrement une news, impulsion, « j'accepte » ; 4 prix entré dans un FVG H4 hier, setup attendu aujourd'hui ; 7 et 10 « on est toujours dans un FVG H4 haussier » ; 8 « le dernier PD array était un high H4 » ; 5 et 6 sans raison.
- Commits git (branche `claude/commit-access-a7k1hw`) : d9607ee (v6), 849110b (F1–F3, fenêtre 17 h), 3e481c0 (G1).

## 9. People, terms & names
- **People:** Krystofia = la trader dont la méthode est codée (nom dans les docs du projet) ; Esdras = nom que l'utilisateur donne dans la mémoire du compte.
- **Terms & nicknames:** FVG = fair value gap ; c1/c3/c4 = bougies de validation ; « FVG à gauche » = premier FVG M15 dans le sens du TP (cible/aimant) ; PD array = FVG, high ou low d'une unité de temps ; balayage = low H4 pris ; « Combo FVG » = v6 ; R = unité de risque ; BMS = cassure de structure.
- **Names in use:** `scripts/comboFvgV6/` (`comboV6.mjs`, `comboF.mjs`, `comboG.mjs`, `comboG.test.mjs`, `fenetre17.mjs`, `lib/krysBacktest.js`, `lib/krysMethod.js`, `package.json`) ; docs `PREREG-COMBO-FVG-V6.md`, `RESULTAT-COMBO-FVG-V6.md`, `PREREG-/RESULTAT-COMBO-FVG-UN-FILTRE.md`, `PREREG-/RESULTAT-COMBO-FVG-BALAYAGE-EVENEMENT.md`, `REVUE-LOT4-CONTINUATION.md` ; images `Claude outputs\lot4\continuation01..10.png`.

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| Pré-enregistrement + résultat v6 | final, committed | docs/, commit d9607ee | non validée |
| Un seul filtre H4 (F1–F3) | final, committed | docs/, scripts/comboFvgV6/comboF.mjs, 849110b | aucune ne passe ; F2 la plus proche |
| Fenêtre 06–17 h sans filtre | final, committed | scripts/comboFvgV6/fenetre17.mjs | rien d'utile |
| G1 événementiel + tests | final, committed | comboG.mjs, comboG.test.mjs (2 tests OK), 3e481c0 | non validée |
| Lot 4 + revue | final, NON committed dans git | `Claude outputs\lot4\`, `docs\REVUE-LOT4-CONTINUATION.md` (sur le disque) | clé des issues = section 8 ; le fichier lot4.json de travail est perdu |
| Critères 1 et 2 + interrupteur | not started | — | à coder, pré-enregistrer, tester |
| `comboH.mjs` (modes A/B) | abandonné | dossier de travail temporaire du chat (perdu) | ne pas reprendre |
| Critère de démo pour F2 | not started | — | à écrire |

## 11. Next steps
1. **Next action:** obtenir sa confirmation de ce qui décide l'interrupteur (proposition par défaut : critère 1 si un PD array H4 a été touché dans les dernières 24 h, sinon critère 2), puis coder les deux critères avec tests unitaires.
2. Écrire le pré-enregistrement (base du test, critères : ≥ 1,5 trade/semaine, t ≥ 2,6, deux moitiés > 0, test > 0, meilleur que le contrôle), tester chaque critère puis l'interrupteur sur 2011–2022, lire 2023–2025 une seule fois, rapporter 2026.
3. Écrire le critère de démo pour F2 (par ex. ≥ 60 trades, moyenne > 0) avant de la lancer.
4. Optionnel : committer `REVUE-LOT4-CONTINUATION.md` et les images du lot 4 si demandé.

## 12. Open questions ⚠️
- Qu'est-ce qui décide l'interrupteur ? Défaut proposé : PD array H4 touché dans les dernières 24 h → critère 1 ; sinon critère 2. À confirmer.
- Sur quelle base appliquer les critères : « achats sans filtre » (ils remplacent le balayage) ou F2 ?
- « Dernier PD array touché » : tape d'un FVG H4 = bougie qui entre dans la zone ? high H4 pris = au-dessus des 6 dernières barres H4 ?
- Lot 4 : pourquoi le 5 (dans un FVG H4) pris alors que 7 et 10 (aussi dedans) laissés ?
- Qui est l'utilisateur : Krystofia ou Esdras ? Ne pas deviner.
- Définition de « proche » pour une cible H4 (jamais donnée) et cible H4 vs FVG M15 7 jours max (idée de l'utilisateur, non codée).

## 13. Re-attach checklist
- [ ] Le dossier du projet `ict-fvg-bot` doit être lié à la session (données, scripts, docs) : pas de fichier à rattacher.
- [ ] Optionnel : `docs\REVUE-LOT4-CONTINUATION.md` si le dossier n'est pas lié.

---
<sub>Audit: 13/13 sections · 7 rules · 5 corrections · 60 data points · secrets removed: none found · generated by active-memory</sub>
