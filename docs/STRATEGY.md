# Setup de trading actuel — US100 / US500 uniquement

Dernière mise à jour : 2026-09-05. Ce document résume le setup actuellement validé
(tient sur des données jamais vues, 2024-2025). EURUSD et GBPUSD ont été retirés du plan :
aucune configuration testée pour ces deux paires n'a montré un edge net qui survit
hors-échantillon (voir `data/backtest-input/train-test-validation.md`).

⚠ Ce setup remplace une version antérieure qui recyclait simplement la config choisie pour
la fenêtre 08h-12h après avoir découvert que 10h-11h ("Silver Bullet") était meilleure. En
refaisant une recherche complète (168 configs) avec la fenêtre 10h-11h FIXÉE dès le départ
(`scripts/runSilverBulletGridSearch.js`, résultats dans `silver-bullet-grid-search.md`), on a
trouvé un combo nettement meilleur : ajouter un filtre de biais HTF (EMA) EN PLUS de la
structure ICT, de la session et du liquidity sweep bat tout ce qu'on avait avant sur le
profit factor net en test — au prix d'un nombre de signaux plus petit (30-40 sur la période
test), donc statistiquement un peu moins solide malgré le meilleur chiffre.

## Configuration par symbole (meilleur combo trouvé)

| Paramètre | US100 | US500 |
|---|---|---|
| Biais HTF (EMA) | H4, EMA 200 | H1, EMA 50 |
| Structure de marché ICT (BOS) | ON | ON |
| Fenêtre horaire (NY, DST-aware) | 10h00–11h00 ("Silver Bullet") | 10h00–11h00 ("Silver Bullet") |
| Type de stop | bord opposé de la zone FVG (fvg-edge) | bord opposé de la zone FVG (fvg-edge) |
| Ratio risque:récompense visé | 1:3 fixe | 1:3 fixe |
| Filtre liquidity sweep | ON (recommandé) | ON (recommandé) |

Performance nette sur TEST (2024-2025, jamais vue pendant la recherche) :
- US100 (H4/EMA200) : win rate net 44.7%, profit factor net 2.19, R net moyen +0.70/trade (38 signaux)
- US500 (H1/EMA50) : win rate net 42.9%, profit factor net 2.16, R net moyen +0.70/trade (30 signaux)

Variante "sans sweep" (plus de trades, qualité un peu moindre, utile si le rythme du filtre
sweep est trop lent) : win rate net ~33-45%, PF net ~1.3-1.7 selon l'année, 2-3x plus de
signaux — voir `challenge-simulation-by-year.md` pour le détail année par année des deux
variantes.

## Paramètres de compte

- Risque par trade : **0.25% à 0.5%** du solde. Ce nouveau combo montre des drawdowns
  nettement plus bas que l'ancien (max trailing 8.1% observé à 0.5% de risque sur 7 années
  testées, jamais de bust statique -10%) — donc 0.5% est maintenant défendable, pas
  seulement 0.25% comme avec l'ancien setup. Voir `challenge-simulation-by-year.md`.
- Garde-fous (`src/config.js`) : max 2 trades/jour (budget PARTAGÉ entre US100 et US500),
  cooldown 30 min après une perte close, stop journalier interne à -2% (marge sous la limite
  FundingPips réelle de 5%/jour).
- Fréquence attendue : avec sweep ON, environ 20-40 trades par an et par symbole (donc très
  peu, quelques trades par mois) — encore plus rare que l'ancien setup, car le filtre HTF
  ajouté restreint encore les signaux. Sans sweep, 80-140 trades/an et par symbole.

## Ce qu'on a vérifié empiriquement sur "aller plus vite" (`checkFastChallengeRisk.js`)

Augmenter le risque par trade pour finir en 30 jours a été testé directement (pas supposé) :
à 0.25-0.5% de risque, l'objectif combiné (~13.4%) n'est JAMAIS atteint en 30 jours sur
aucune des 7 années. À 2-5% de risque, ça passe parfois (4 années sur 7) mais le compte
explose (perd plus de 10%) sur 1 à 3 des 7 années testées selon le niveau — voir
`fast-challenge-risk-check.md`. **Conclusion : ne pas pousser le risque pour aller plus vite,
le nombre de trades disponibles est trop faible pour que ça marche de façon fiable.**

## Repères FundingPips vérifiés cette session (fundingpips.com / help.fundingpips.com)

**2-Step Standard** : Phase 1 = +8%, Phase 2 = +5% (du nouveau solde), perte quotidienne max
5% (calculée sur la valeur la plus haute entre solde/équité d'ouverture du jour), perte totale
max 10% (statique, ne bouge jamais), minimum 3 jours de trading par phase.
**Aucune limite de temps maximale** — seule contrainte temporelle : au moins un trade complété
tous les 30 jours consécutifs (règle d'inactivité). Avec notre fréquence de trading (au moins
quelques trades par mois même avec le filtre sweep), cette règle est largement respectée —
**il n'y a donc aucune urgence à finir vite, contrairement à l'hypothèse de départ.**

**1-Step Flex** : cible unique +12% (plus bas que le total ~13.4% du 2-Step), perte
quotidienne max 3% (plus stricte), perte totale max 12% (statique, un peu plus large que le
2-Step), aucun minimum de jours de trading, aucune limite de temps. Une cible légèrement plus
basse en un seul palier plutôt que deux - potentiellement un meilleur choix, prix non vérifié.

**FundingPips Zero** (compte instantané, sans évaluation) : rejeté comme option pour CE
setup — ses règles de déblocage de retrait (7 jours profitables d'au moins 0.25% chacun sur
une fenêtre glissante de 30 jours, score de consistance ≤15% = plus gros jour de gain / profit
total) sont conçues pour du trading actif quotidien. Avec seulement 20-140 trades PAR AN, on
ne peut probablement pas générer 7 jours gagnants distincts par mois de façon fiable — ce
modèle ne correspond pas au profil de cette stratégie.

**Recommandation** : rester sur le 2-Step Standard (pas de pression de temps réelle, déjà
vérifié), ou envisager le 1-Step Flex si son prix est comparable (cible totale plus basse,
plancher de drawdown un peu plus large). Éviter FundingPips Zero pour ce setup précis.

## Caveats non résolus

- Spreads US100 (1.0 point) et US500 (0.4 point) utilisés dans le calcul restent INDICATIFS,
  jamais vérifiés contre la vraie spec de contrat FundingPips/cTrader.
- US100 et US500 sont corrélés à 0.93 — les trader ensemble n'est PAS une vraie diversification.
- Échantillon test plus petit qu'avant pour le combo optimal (30-40 signaux) — prometteur mais
  statistiquement plus fragile qu'un résultat basé sur des centaines de signaux. À surveiller
  de près en conditions réelles avant d'augmenter la mise dessus.
- Prix et split de profit du 1-Step Flex et de FundingPips Zero non vérifiés (seulement les
  règles de risque/temps).
- Le bot en direct (`src/store.js`, `src/dataSources/*`) n'applique PAS encore ces filtres
  (biais HTF, structure BOS, fenêtre horaire, liquidity sweep) — il ne fait tourner qu'un
  `FvgEngine` brut par symbole pour l'instant. Câbler `buildFilteredEngine` (voir
  `src/backtest/gridRunner.js`) dans le chemin live est un travail restant avant d'utiliser
  ce setup en conditions réelles.

## Historique / fichiers de référence

- Comparaison de fenêtres horaires : `data/backtest-input/session-window-comparison.md`
- Recherche du meilleur combo, fenêtre 10h-11h fixée : `data/backtest-input/silver-bullet-grid-search.md`
- Filtre liquidity sweep (ancienne config) : `data/backtest-input/liquidity-sweep-comparison.md`
- Validation train/test complète (168 configs, 4 symboles) : `data/backtest-input/train-test-validation.md`
- Simulation de compte avec garde-fous : `data/backtest-input/portfolio-simulation.md`
- Simulation "challenge $10,000" par année, sweep on/off, 0.25%/0.5% risque : `data/backtest-input/challenge-simulation-by-year.md`
- Test empirique "augmenter le risque pour aller plus vite" : `data/backtest-input/fast-challenge-risk-check.md`
- Grid complet original (168 configs × 4 symboles, fenêtre 08h-12h) : `data/backtest-input/backtest-report.md`
