# Analyses des 11 exemples d'Esdras (FVG M15 + 4hr) — 30 septembre 2026

Descriptif seulement : aucune de ces analyses ne juge une performance. Contexte et conclusions : `docs/methode-esdras-fvg.md`.
Les 11 exemples (US100 ×5, US500 ×6, septembre 2026) sont écrits en tête de chaque script (`EX` : zone d'entrée dessinée, ligne 4hr, fenêtre de dates).

**Données** : `data/esdras-examples/live-US100.json` et `live-US500.json` = bougies M15 du bot déployé (`GET /api/candles?symbol=US100&limit=5000`, heures UTC),
prises le 30/09 à 02 h 15 UTC. Pour les rafraîchir : `curl -s "https://ict-fvg-bot.onrender.com/api/candles?symbol=US100&limit=5000" -o data/esdras-examples/live-US100.json` (idem US500) ;
l'API ne garde que les 5 000 dernières bougies, donc ne pas écraser ces fichiers sans raison (les exemples datent du 10 au 29 septembre).

**Lancer** (depuis la racine du dépôt, quelques secondes chacun) : `node scripts/research-fvg-esdras/<script>.mjs`

| Script | Ce qu'il montre |
|---|---|
| `exp-suivi-ex.mjs` | avec la définition finale du FVG (partie non mangée, `scripts/lib/fvgFollow.js`), une zone active existe sur la boîte de chacun des 11 trades : 11/11 |
| `exp-pen.mjs` | pénétration de la bougie suivante dans le dernier FVG (0 % = dehors) : base de la règle « partie non mangée » ; le micro-FVG du 11/09 est traversé à 648 % |
| `exp-funnel.mjs` | entonnoir : FVG d'entrée 11/11 → direction 9/11 → ligne 4hr (groupe de 3 règles) 8/11 → FVG à gauche 7/11 (ancienne règle de validité) |
| `exp-all.mjs` | comparaison de règles pour choisir la ligne 4hr : pivot H4, le plus proche, le plus extrême sur 24 h / 72 h, le plus récent : 6/11 au mieux, 1/5 hors échantillon |
| `exp-final.mjs` | chaîne complète avec la validité « ≤ 50 % de pénétration » (règle remplacée depuis par « partie non mangée ») : 6/11 de bout en bout, ≈ 4,5 alertes par jour et par paire |

Ils s'appuient sur `scripts/lib/fvgGaucheV2.js` (blocs H4 alignés sur l'UTC, extrêmes non balayés, zones fusionnées) et `scripts/lib/fvgFollow.js`.
Les autres essais (fourchette de N bougies H4, zigzag, bougie qui ouvre un FVG H4, plus grande impulsion) ont donné 2 à 6 exemples sur 11 : voir le document de méthode.
Contrôles hors de ce dossier : `scripts/checkFvgDirection.js` (la direction seule est neutre), `scripts/checkFvgContext.js` (contexte H4).
