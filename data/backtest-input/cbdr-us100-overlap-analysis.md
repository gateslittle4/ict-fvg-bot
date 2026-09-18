# CBDR autonome (US100) vs mécanismes déjà en production — analyse de chevauchement

Question d'Esdras : ajouter CBDR comme 5e mécanisme sur US100 ajoute-t-il une vraie diversification, ou re-trade-t-il des mouvements déjà capturés par ce qui tourne en production sur ce même symbole (FVG, Divergence, NWOG, Silver Bullet — les 4 mécanismes live sur US100 aujourd'hui, voir config.js) ? Contrairement à l'analyse équivalente faite pour Silver Bullet (`silver-bullet-overlap-analysis.md`), qui approxime la production en concaténant chaque mécanisme calculé indépendamment (sans simuler le vrai netting, et sans Divergence — aucun module de backtest autonome n'existe pour elle), cette analyse rejoue la VRAIE logique de production via `LiveStrategyEngine.warmUp()` — le même chemin de code que le bot live emprunte réellement, netting réel inclus (`openPositions` est une Map par symbole, partagée entre tous les mécanismes — voir `src/liveStrategyEngine.js:536` — une seule position ouverte à la fois sur US100, premier signal arrivé bloque les autres). Chevauchement MÊME sens = double exposition au même mouvement ; sens OPPOSÉ = deux mécanismes qui se contredisent en même temps. Historique complet disponible (pas de split train/test ici — ce n'est pas un test d'edge, c'est un test de corrélation temporelle).

Trades production reconstruits sur US100 (netting réel) : **3841** — silverbullet: 1124, divergence: 716, nwog: 265, fvg: 1736.

| Trades CBDR | Chevauchement (tout) | Même sens (double exposition) | Sens opposé (contradiction) | Aucun chevauchement |
|---|---|---|---|---|
| 1245 | 361 (29.0%) | 143 (11.5%) | 228 (18.3%) | 884 (71.0%) |

Chevauchement par mécanisme déjà en production (un trade CBDR peut chevaucher plusieurs mécanismes à la fois, les compteurs ne s'additionnent donc pas forcément au total ci-dessus) :

| Mécanisme | Trades CBDR qui le chevauchent |
|---|---|
| divergence | 152 |
| silverbullet | 121 |
| fvg | 111 |
| nwog | 17 |