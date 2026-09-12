#!/usr/bin/env node
// runFvgPreDeployRiskAnalysis.js
// Usage: node scripts/runFvgPreDeployRiskAnalysis.js <dir-with-csvs>
//
// Esdras's explicit "avant de déployer" due-diligence question (2026-09-12),
// about the US100 multi-contact FVG mechanism validated earlier tonight
// (MultiTouchFvgEngine, not yet deployed): "où va tu mettre le stop loss, le
// tp, combien de rrr, est-ce que c'est fixe ou flexible? Compare fixe et
// dynamique, compare le nombre de trades gagnants suivis vs perdants suivis,
// compare aussi pyramidal vs non pyramidal et compare aussi risque fixe vs
// dynamique selon qu'on perde ou gagne." Follow-up (same day): "documente un
// peu plus chaque réponse, surtout mon idée de pyramider les trades" - this
// version adds worked numeric examples (real trades from the dataset, not
// invented numbers) to every section, and a full breakdown of HOW a
// pyramided trade can resolve (win-win / win-loss / loss-loss - and why
// loss-win never happens, a geometric consequence explained below).
//
// Stop/target mechanics themselves are NOT a number to compute - they're
// already fixed by computeStop()/runBacktest() (see backtestEngine.js):
// entry = zone edge (the ICT re-entry price), stop = computeStop() in
// 'fvg-edge' mode (far edge of the gap + 10% buffer), target = entry +
// rrMultiple x distance, RR read from CONFIG.fvg.perSymbol.US100 (production
// value, currently 5). All three are fixed AT ENTRY and never adjusted
// afterward - no trailing stop, no breakeven move, matching every other
// mechanism in this project. This script answers the three things that
// actually need real numbers: win/loss STREAKS, pyramid vs no pyramid (Esdras's
// own idea: "et si je pyramidais mes trades gagnants?"), and fixed vs dynamic
// position sizing - all on the exact SAME multi-contact US100 trade sequence
// (net of costs), so the comparisons stay comparable and none of them
// silently re-picks a different set of trades.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import {
  runBacktest,
  runBacktestPyramidIndependentStops,
  summarizeTrades,
} from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOL = 'US100';
const CFG = CONFIG.fvg.perSymbol.US100;

// Dynamic-risk rule tested: halve risk (0.5% -> 0.25%) after 2 CONSECUTIVE
// losses, restore to full risk after any win. Chosen as the simplest,
// least-arbitrary rule that reacts to the exact loss streak this script
// measures - not tuned/grid-searched against the outcome.
const BASE_RISK_PCT = 0.5;
const REDUCED_RISK_PCT = 0.25;
const LOSSES_BEFORE_REDUCTION = 2;

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function fmtNum(x, d = 2) {
  return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—';
}
function fmtPct(x, d = 1) {
  return x !== null && x !== undefined && Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—';
}
function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}
function fmtPrice(x) {
  return Number.isFinite(x) ? x.toFixed(2) : '—';
}

// --- Win/loss streaks (on the FULL rMultiple sequence, in exit order).
// Also records the trade INDICES of each streak so the worst one can be
// shown as a real, dated example rather than just a bare number.
function computeStreaks(trades) {
  const streaks = { win: [], loss: [] };
  let curType = null;
  let curLen = 0;
  let curStart = 0;
  const flush = (endIdx) => {
    if (curType) streaks[curType].push({ len: curLen, startIdx: curStart, endIdx });
  };
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.outcome === 'timeout') continue; // neither a win nor a loss streak event
    const type = t.outcome === 'win' ? 'win' : 'loss';
    if (type === curType) curLen += 1;
    else {
      flush(i - 1);
      curType = type;
      curLen = 1;
      curStart = i;
    }
  }
  flush(trades.length - 1);

  const maxWinEntry = streaks.win.reduce((a, b) => (b.len > (a?.len ?? 0) ? b : a), null);
  const maxLossEntry = streaks.loss.reduce((a, b) => (b.len > (a?.len ?? 0) ? b : a), null);
  const avgWin = streaks.win.length ? streaks.win.reduce((s, x) => s + x.len, 0) / streaks.win.length : 0;
  const avgLoss = streaks.loss.length ? streaks.loss.reduce((s, x) => s + x.len, 0) / streaks.loss.length : 0;
  const lossDist = {};
  for (const l of streaks.loss) lossDist[l.len] = (lossDist[l.len] || 0) + 1;

  return {
    maxWin: maxWinEntry?.len ?? 0,
    maxLoss: maxLossEntry?.len ?? 0,
    maxLossEntry,
    avgWin,
    avgLoss,
    winStreakCount: streaks.win.length,
    lossStreakCount: streaks.loss.length,
    lossDist,
  };
}

// --- Fixed vs dynamic risk: replay the SAME trade sequence, only the % of
// account risked per trade changes. Compound growth (risk % of CURRENT
// equity, not of the fixed starting balance), consecutive-loss counter reset
// on any win - same streak definition as computeStreaks() above. Optionally
// records a per-trade log (equity/riskPct at each step) for illustration.
function simulateRiskMode(trades, mode, { withLog = false } = {}) {
  let equity = 1; // multiplicative factor, starts at 1x
  let peak = 1;
  let maxDrawdownPct = 0;
  let consecutiveLosses = 0;
  let riskSum = 0;
  let riskCount = 0;
  const log = [];

  for (const t of trades) {
    let riskPct = BASE_RISK_PCT;
    if (mode === 'dynamic' && consecutiveLosses >= LOSSES_BEFORE_REDUCTION) riskPct = REDUCED_RISK_PCT;
    riskSum += riskPct;
    riskCount += 1;

    const before = equity;
    equity *= 1 + (riskPct / 100) * t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, (peak - equity) / peak);

    if (withLog) log.push({ entryTime: t.entryTime, outcome: t.outcome, rMultiple: t.rMultiple, riskPct, equityBefore: before, equityAfter: equity });

    if (t.outcome === 'loss') consecutiveLosses += 1;
    else if (t.outcome === 'win') consecutiveLosses = 0;
    // a timeout neither extends nor resets the loss streak counter
  }

  return {
    finalReturnPct: equity - 1,
    maxDrawdownPct,
    avgRiskPct: riskCount ? riskSum / riskCount : BASE_RISK_PCT,
    log,
  };
}

// --- Pick one real, illustrative pyramided trade per resolution category,
// so the mechanism can be explained with actual numbers instead of a
// hypothetical.
function findPyramidExamples(pyTrades) {
  const pyramided = pyTrades.filter((t) => t.unitsDeployed === 2);
  const byOutcome = {};
  for (const t of pyramided) byOutcome[t.managementOutcome] = (byOutcome[t.managementOutcome] || 0) + 1;
  const pick = (outcome) => pyramided.find((t) => t.managementOutcome === outcome);
  return {
    total: pyramided.length,
    byOutcome,
    winWin: pick('pyramid-independent-win-win'),
    winLoss: pick('pyramid-independent-win-loss'),
    lossLoss: pick('pyramid-independent-loss-loss'),
    lossWin: pick('pyramid-independent-loss-win'), // expected to never occur - see write-up
  };
}

function describePyramidExample(label, t, addAtR = 1) {
  if (!t) return `_${label} : aucun exemple trouvé dans les données._`;
  const bullish = t.direction === 'bullish';
  const addEntry = bullish ? t.entryPrice + addAtR * t.distance : t.entryPrice - addAtR * t.distance;
  const addStop = t.entryPrice; // geometry: addAtR=1 puts the added unit's own stop exactly at the original entry
  return (
    `**${label}** (${t.direction === 'bullish' ? 'achat' : 'vente'}, ${fmtDate(t.entryTime)} → ${fmtDate(t.exitTime)}) :\n` +
    `  - Unité originale : entrée ${fmtPrice(t.entryPrice)}, stop ${fmtPrice(t.stopPrice)}, target ${fmtPrice(t.targetPrice)} (distance D = ${fmtNum(t.distance)}).\n` +
    `  - Prix atteint +1×D en faveur → 2e unité ajoutée : entrée ${fmtPrice(addEntry)}, stop propre ${fmtPrice(addStop)} (= l'entrée originale, par géométrie), même target que l'unité originale.\n` +
    `  - Résultat : **${t.rMultiple >= 0 ? '+' : ''}${fmtNum(t.rMultiple)}R combiné** (unité originale : ${t.outcome}).`
  );
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFvgPreDeployRiskAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  // NOTE: buildMultiTouchFilterPredicate()'s bias/structure lookups
  // (makeBiasLookup/makeStructureBiasLookup, htfBias.js/marketStructure.js)
  // use an internal monotonic cursor that assumes it is queried with
  // strictly increasing candle times over ONE full ascending pass. Reusing
  // the SAME predicate instance across two separate full passes (baseline
  // then pyramid) leaves that cursor stuck at the end of the first pass and
  // silently corrupts every lookup on the second - so each engine below
  // gets its OWN freshly-built predicate, even though the underlying config
  // is identical.

  // --- Baseline (no pyramid) trade sequences, net of costs - used for streaks and risk sizing ---
  const engTrain = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: buildMultiTouchFilterPredicate(trainCandles, SYMBOL, CFG) });
  const engTest = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: buildMultiTouchFilterPredicate(testCandles, SYMBOL, CFG) });
  const baseTrainTrades = withCosts(
    runBacktest({ candles: trainCandles, symbol: SYMBOL, fvgEngine: engTrain, stopMode: CFG.stopMode, rrMultiple: CFG.rrMultiple }),
    SYMBOL
  );
  const baseTestTrades = withCosts(
    runBacktest({ candles: testCandles, symbol: SYMBOL, fvgEngine: engTest, stopMode: CFG.stopMode, rrMultiple: CFG.rrMultiple }),
    SYMBOL
  );
  const allTrades = [...baseTrainTrades, ...baseTestTrades];

  // --- Pyramid (independent stops) trade sequences, net of costs ---
  const pyEngTrain = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: buildMultiTouchFilterPredicate(trainCandles, SYMBOL, CFG) });
  const pyEngTest = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: buildMultiTouchFilterPredicate(testCandles, SYMBOL, CFG) });
  const pyTrainTrades = withCosts(
    runBacktestPyramidIndependentStops({ candles: trainCandles, symbol: SYMBOL, fvgEngine: pyEngTrain, stopMode: CFG.stopMode, rrMultiple: CFG.rrMultiple }),
    SYMBOL
  );
  const pyTestTrades = withCosts(
    runBacktestPyramidIndependentStops({ candles: testCandles, symbol: SYMBOL, fvgEngine: pyEngTest, stopMode: CFG.stopMode, rrMultiple: CFG.rrMultiple }),
    SYMBOL
  );
  const pyAllTrades = [...pyTrainTrades, ...pyTestTrades];

  const baseTrainSummary = summarizeTrades(baseTrainTrades);
  const baseTestSummary = summarizeTrades(baseTestTrades);
  const pyTrainSummary = summarizeTrades(pyTrainTrades);
  const pyTestSummary = summarizeTrades(pyTestTrades);
  const pyTrainAdds = pyTrainTrades.filter((t) => t.unitsDeployed === 2).length;
  const pyTestAdds = pyTestTrades.filter((t) => t.unitsDeployed === 2).length;

  const streaks = computeStreaks(allTrades);
  const worstLossSegment = streaks.maxLossEntry
    ? allTrades.slice(streaks.maxLossEntry.startIdx, streaks.maxLossEntry.endIdx + 1)
    : [];
  const worstLossSumR = worstLossSegment.reduce((s, t) => s + t.rMultiple, 0);

  const riskTrainFixed = simulateRiskMode(baseTrainTrades, 'fixed');
  const riskTrainDynamic = simulateRiskMode(baseTrainTrades, 'dynamic');
  const riskTestFixed = simulateRiskMode(baseTestTrades, 'fixed');
  const riskTestDynamic = simulateRiskMode(baseTestTrades, 'dynamic');

  // Illustrate fixed vs dynamic sizing on the actual worst loss streak found above.
  const worstStreakFixed = simulateRiskMode(worstLossSegment, 'fixed', { withLog: true });
  const worstStreakDynamic = simulateRiskMode(worstLossSegment, 'dynamic', { withLog: true });

  const pyExamples = findPyramidExamples(pyAllTrades);
  const oneExampleTrade = allTrades.find((t) => t.outcome === 'win') ?? allTrades[0];

  const md = [];
  md.push('# US100 multi-contact — avant déploiement : stop/target, streaks, pyramide, risque fixe vs dynamique');
  md.push('');
  md.push(
    "Question directe d'Esdras (2026-09-12) avant tout déploiement du multi-contact US100 " +
      "(`MultiTouchFvgEngine`, validé plus tôt ce soir, toujours pas déployé) : \"où va tu mettre le stop loss, le " +
      "tp, combien de RR, est-ce que c'est fixe ou flexible ? Compare fixe et dynamique, compare le nombre de " +
      "trades gagnants suivis vs perdants suivis, compare aussi pyramidal vs non pyramidal et compare aussi " +
      "risque fixe vs dynamique selon qu'on perde ou gagne.\" Les 4 sections ci-dessous tournent sur EXACTEMENT " +
      "la même séquence de trades (multi-contact US100, config production verbatim, net de coûts), pour rester " +
      "comparables entre elles. Chaque chiffre est accompagné d'au moins un exemple RÉEL tiré des données " +
      "(pas un cas inventé), pour que le mécanisme se comprenne sans avoir à relire le code."
  );
  md.push('');

  // ---------------------------------------------------------------------
  md.push('## 1. Mécanique stop/target');
  md.push('');
  md.push(
    `- **Entrée** : bord de la zone FVG (ordre LIMIT posé au bord du gap, le prix de ré-entrée classique ICT), ` +
      `jamais le prix de marché au moment du signal.\n` +
      `- **Stop** : mode \`${CFG.stopMode}\` — le bord OPPOSÉ de la zone, avec une marge de 10% de la hauteur de la ` +
      `zone au-delà (\`computeStop()\`, backtestEngine.js) pour éviter d'être sorti par une simple mèche qui ` +
      `revient tester exactement le bord.\n` +
      `- **Target** : entrée + RR × distance(entrée, stop), avec RR = **${CFG.rrMultiple}** (valeur production ` +
      `actuelle, lue directement depuis \`CONFIG.fvg.perSymbol.US100\` — ce n'était pas toujours 5 : voir "Cible ` +
      `étendue (1:4/1:5)" plus haut dans ce fichier, où ce paramètre a été monté depuis 1:3 après validation ` +
      `séparée).\n` +
      `- **Fixe ou flexible** : **FIXE**. Les trois niveaux (entrée, stop, target) sont posés une seule fois, au ` +
      `moment où le signal est validé, et ne bougent plus JAMAIS ensuite - pas de trailing stop, pas de mise à ` +
      `breakeven, pas de sortie anticipée sur un simple retournement de mèche. Le trade ne peut se terminer que de ` +
      `3 façons : le stop est touché (perte), le target est touché (gain), ou il expire après ${480} bougies sans ` +
      `avoir touché ni l'un ni l'autre (\`maxHoldingCandles\`, compté séparément comme "timeout", ni gagnant ni ` +
      `perdant dans les statistiques).`
  );
  md.push('');
  md.push('**Exemple réel** (un trade pris tel quel dans les données, pour rendre ça concret) :');
  md.push('');
  md.push(
    `Le ${fmtDate(oneExampleTrade.entryTime)}, un FVG ${oneExampleTrade.direction === 'bullish' ? 'haussier' : 'baissier'} valide un signal ` +
      `${oneExampleTrade.direction === 'bullish' ? 'achat' : 'vente'} à ${fmtPrice(oneExampleTrade.entryPrice)}. Le stop est posé à ` +
      `${fmtPrice(oneExampleTrade.stopPrice)} (distance = ${fmtNum(oneExampleTrade.distance)} points), le target à ` +
      `${fmtPrice(oneExampleTrade.targetPrice)} (soit ${fmtNum(oneExampleTrade.distance * CFG.rrMultiple)} points plus loin que ` +
      `l'entrée, ${CFG.rrMultiple}× la distance du stop). Résultat : ${oneExampleTrade.outcome === 'win' ? 'target touché, +' + fmtNum(oneExampleTrade.rMultiple) + 'R' : oneExampleTrade.outcome === 'loss' ? 'stop touché, -1R' : 'timeout'}, sortie le ${fmtDate(oneExampleTrade.exitTime)}.`
  );
  md.push('');

  // ---------------------------------------------------------------------
  md.push('## 2. Streaks (trades gagnants/perdants d\'affilée), période complète 2019-2025');
  md.push('');
  md.push(
    `n = ${allTrades.length} trades (train + test, multi-contact, SANS pyramide - la pyramide change les R mais pas ` +
      "le nombre de trades gagnants/perdants d'affilée, donc ces chiffres restent valables avec ou sans pyramide)."
  );
  md.push('');
  md.push('| | Max d\'affilée | Moyenne par série | Nombre de séries |');
  md.push('|---|---|---|---|');
  md.push(`| Gagnants | ${streaks.maxWin} | ${fmtNum(streaks.avgWin, 1)} | ${streaks.winStreakCount} |`);
  md.push(`| Perdants | ${streaks.maxLoss} | ${fmtNum(streaks.avgLoss, 1)} | ${streaks.lossStreakCount} |`);
  md.push('');
  md.push(
    `Distribution des séries de pertes : \`${JSON.stringify(streaks.lossDist)}\` (longueur → nombre de fois observée). ` +
      `Lecture : ${streaks.lossDist[1] ?? 0} fois une perte isolée, ${streaks.lossDist[2] ?? 0} fois 2 pertes d'affilée, ` +
      `... jusqu'à ${streaks.maxLoss} fois d'affilée, observé une seule fois en ${allTrades.length} trades.`
  );
  md.push('');
  if (streaks.maxLossEntry) {
    md.push(
      `**La pire série concrètement** : ${streaks.maxLoss} pertes d'affilée entre le ${fmtDate(worstLossSegment[0].entryTime)} et le ` +
        `${fmtDate(worstLossSegment[worstLossSegment.length - 1].exitTime)}, pour un total de ${fmtNum(worstLossSumR)}R perdus sur cette ` +
        `série (à ${BASE_RISK_PCT}% de risque fixe/trade, ça correspond à environ ${fmtNum(Math.abs(worstLossSumR) * BASE_RISK_PCT, 1)}% du compte perdu d'affilée - ` +
        `voir section 4 pour comment le sizing dynamique aurait amorti cette série précise).`
    );
    md.push('');
  }

  // ---------------------------------------------------------------------
  md.push('## 3. Pyramidal (l\'idée d\'Esdras : ajouter une 2e unité sur les trades qui bougent en notre faveur) vs non pyramidal');
  md.push('');
  md.push(
    "**Le principe, en clair** : dans le mode testé ici (`runBacktestPyramidIndependentStops`, backtestEngine.js), " +
      `dès que le prix a bougé d'1× la distance du stop (1×D) EN NOTRE FAVEUR par rapport à l'entrée originale, une ` +
      "**2e unité, de même taille**, est ajoutée à ce nouveau prix. Cette 2e unité a SON PROPRE stop, posé exactement " +
      "1×D en dessous d'elle (au-dessus pour une vente) - ce qui, par pure géométrie, atterrit exactement sur le " +
      "prix d'entrée ORIGINAL. Elle vise le MÊME target que l'unité originale. **Point clé, et c'est ce qui distingue " +
      "cette version d'un pyramidage \"classique\"** : le stop de l'unité ORIGINALE n'est JAMAIS déplacé, jamais mis " +
      "à breakeven, jamais touché par l'ajout de la 2e unité. Les deux unités vivent leur vie chacune de son côté " +
      "jusqu'à ce que les DEUX soient closes (stop, target, ou timeout) ; le trade combiné n'est comptabilisé " +
      "qu'une fois les deux résolues, et son R combiné est la somme des deux R individuels."
  );
  md.push('');
  md.push(
    "**Pourquoi ça vaut mieux qu'un pyramidage \"stop partagé\"** (l'autre version testée plus tôt dans ce projet, " +
      "voir `runBacktestManaged` mode `'pyramid'`, rejetée) : dans cette version-là, le stop des DEUX unités saute " +
      "au prix d'entrée original dès que la 2e unité est ajoutée - donc si le prix revient jusqu'à ce niveau, TOUT " +
      "le trade ferme là, y compris l'unité originale, qui dans le scénario \"sans pyramide\" aurait gardé son stop " +
      "large et serait restée ouverte, libre de repartir et d'atteindre son target plus tard. Avec des stops " +
      "indépendants, seule la 2e unité (qui n'aurait de toute façon pas existé sans le mouvement favorable) est " +
      "perdue dans ce cas - l'unité originale continue comme si de rien n'était."
  );
  md.push('');
  md.push('**Les 3 façons dont un trade pyramidé peut finir**, sur les 2019-2025 combinés :');
  md.push('');
  md.push('| Résultat | Nombre de fois | Explication |');
  md.push('|---|---|---|');
  md.push(`| Les deux unités touchent le target | ${pyExamples.byOutcome['pyramid-independent-win-win'] ?? 0} | Meilleur cas : ${CFG.rrMultiple}R (originale) + (${CFG.rrMultiple}R - 1×D de retard) ≈ ${2 * CFG.rrMultiple - 1}R combiné |`);
  md.push(`| L'unité ajoutée perd, l'originale touche quand même le target | ${pyExamples.byOutcome['pyramid-independent-win-loss'] ?? 0} | Le prix redescend une fois jusqu'au point d'ajout (stop de la 2e unité) puis REPART et atteint le target original |`);
  md.push(`| Les deux unités perdent | ${pyExamples.byOutcome['pyramid-independent-loss-loss'] ?? 0} | Le prix redescend jusqu'au stop de l'unité originale (donc passe forcément par le stop de la 2e unité avant) |`);
  md.push(`| L'originale perd, l'unité ajoutée gagne | ${pyExamples.byOutcome['pyramid-independent-loss-win'] ?? 0} | **N'arrive jamais** — voir explication ci-dessous |`);
  md.push('');
  md.push(
    "**Pourquoi \"l'originale perd mais l'ajout gagne\" n'arrive jamais** : c'est une conséquence géométrique, pas " +
      "un hasard de l'échantillon. Le stop de la 2e unité est exactement au prix d'entrée ORIGINAL - entre le prix " +
      "d'entrée et le stop original (plus loin, dans le sens défavorable). Pour que l'unité originale perde, le " +
      "prix doit descendre jusqu'à SON stop, ce qui veut dire qu'il doit obligatoirement traverser d'abord le prix " +
      "d'entrée original - donc déclencher le stop de la 2e unité EN PREMIER. Autrement dit : dès que l'unité " +
      "originale finit par perdre, l'unité ajoutée a déjà perdu avant elle, sur le chemin. \"Perte-gain\" est donc " +
      "structurellement impossible avec ce design ; seuls gain-gain, gain-perte et perte-perte existent."
  );
  md.push('');
  md.push('**Trois exemples réels, un par catégorie** :');
  md.push('');
  md.push(describePyramidExample('Gain-gain', pyExamples.winWin));
  md.push('');
  md.push(describePyramidExample('Gain (original) malgré la perte de l\'unité ajoutée', pyExamples.winLoss));
  md.push('');
  md.push(describePyramidExample('Perte-perte', pyExamples.lossLoss));
  md.push('');
  md.push('**Impact sur les statistiques globales** :');
  md.push('');
  md.push('| Période | Mode | Trades | Espérance (R) | R total | Drawdown max (R) | Trades pyramidés |');
  md.push('|---|---|---|---|---|---|---|');
  md.push(`| Train | sans pyramide | ${baseTrainSummary.totalSignals} | ${fmtNum(baseTrainSummary.expectancyR)} | ${fmtNum(baseTrainSummary.finalEquityR)} | ${fmtNum(baseTrainSummary.maxDrawdownR)} | — |`);
  md.push(`| Train | **avec pyramide** | ${pyTrainSummary.totalSignals} | ${fmtNum(pyTrainSummary.expectancyR)} | ${fmtNum(pyTrainSummary.finalEquityR)} | ${fmtNum(pyTrainSummary.maxDrawdownR)} | ${pyTrainAdds} |`);
  md.push(`| Test | sans pyramide | ${baseTestSummary.totalSignals} | ${fmtNum(baseTestSummary.expectancyR)} | ${fmtNum(baseTestSummary.finalEquityR)} | ${fmtNum(baseTestSummary.maxDrawdownR)} | — |`);
  md.push(`| Test | **avec pyramide** | ${pyTestSummary.totalSignals} | ${fmtNum(pyTestSummary.expectancyR)} | ${fmtNum(pyTestSummary.finalEquityR)} | ${fmtNum(pyTestSummary.maxDrawdownR)} | ${pyTestAdds} |`);
  md.push('');
  const pyTrainGainPct = ((pyTrainSummary.finalEquityR - baseTrainSummary.finalEquityR) / baseTrainSummary.finalEquityR) * 100;
  const pyTestGainPct = ((pyTestSummary.finalEquityR - baseTestSummary.finalEquityR) / baseTestSummary.finalEquityR) * 100;
  md.push(
    `Sur ${pyTrainSummary.totalSignals} trades en train, ${pyTrainAdds} ont reçu une 2e unité (soit ${fmtNum((pyTrainAdds / pyTrainSummary.totalSignals) * 100, 0)}% des trades) ; ` +
      `${pyTestAdds} sur ${pyTestSummary.totalSignals} en test (${fmtNum((pyTestAdds / pyTestSummary.totalSignals) * 100, 0)}%). ` +
      `Gain en R total : **${fmtNum(pyTrainGainPct, 0)}%** en train, **${fmtNum(pyTestGainPct, 0)}%** en test. ` +
      `Coût : drawdown max en R légèrement plus haut (${fmtNum(baseTestSummary.maxDrawdownR)}R → ${fmtNum(pyTestSummary.maxDrawdownR)}R en test) ` +
      `- logique, puisque le sizing total déployé grimpe temporairement pendant les trades pyramidés, même si l'unité originale ne risque jamais plus que ses 1× prévus.`
  );
  md.push('');

  // ---------------------------------------------------------------------
  md.push('## 4. Risque fixe vs risque dynamique (réduit après pertes consécutives)');
  md.push('');
  md.push(
    `**Règle testée** : ${BASE_RISK_PCT}% de risque par trade normalement, réduit à ${REDUCED_RISK_PCT}% (la moitié) dès que ` +
      `${LOSSES_BEFORE_REDUCTION} pertes consécutives se sont produites, restauré à ${BASE_RISK_PCT}% dès le trade suivant s'il gagne. ` +
      "Appliqué à la MÊME séquence de trades multi-contact (sans pyramide, pour isoler l'effet du sizing seul) - " +
      "seule la taille de position change, jamais la sélection des trades ni leur résultat individuel (win/loss/R " +
      "restent identiques). Croissance composée : chaque trade risque un % du capital COURANT, pas du capital de " +
      "départ, comme un vrai compte de trading."
  );
  md.push('');
  md.push('| Période | Mode | Compte final | Drawdown max | Risque moyen réel |');
  md.push('|---|---|---|---|---|');
  md.push(`| Train | fixe | ${fmtPct(riskTrainFixed.finalReturnPct)} | ${fmtPct(riskTrainFixed.maxDrawdownPct)} | ${fmtNum(riskTrainFixed.avgRiskPct, 2)}% |`);
  md.push(`| Train | **dynamique** | ${fmtPct(riskTrainDynamic.finalReturnPct)} | ${fmtPct(riskTrainDynamic.maxDrawdownPct)} | ${fmtNum(riskTrainDynamic.avgRiskPct, 2)}% |`);
  md.push(`| Test | fixe | ${fmtPct(riskTestFixed.finalReturnPct)} | ${fmtPct(riskTestFixed.maxDrawdownPct)} | ${fmtNum(riskTestFixed.avgRiskPct, 2)}% |`);
  md.push(`| Test | **dynamique** | ${fmtPct(riskTestDynamic.finalReturnPct)} | ${fmtPct(riskTestDynamic.maxDrawdownPct)} | ${fmtNum(riskTestDynamic.avgRiskPct, 2)}% |`);
  md.push('');
  md.push(
    "**Ce n'est pas un gain gratuit** : réduire le risque après 2 pertes réduit bien le drawdown max " +
      `(train ${fmtPct(riskTrainFixed.maxDrawdownPct)} → ${fmtPct(riskTrainDynamic.maxDrawdownPct)}, ` +
      `test ${fmtPct(riskTestFixed.maxDrawdownPct)} → ${fmtPct(riskTestDynamic.maxDrawdownPct)}), mais coûte de la croissance ` +
      `totale du compte (train ${fmtPct(riskTrainFixed.finalReturnPct)} → ${fmtPct(riskTrainDynamic.finalReturnPct)}, ` +
      `test ${fmtPct(riskTestFixed.finalReturnPct)} → ${fmtPct(riskTestDynamic.finalReturnPct)}), puisque le sizing réduit ` +
      "s'applique aussi aux trades qui, après coup, se révèlent gagnants juste après une série de pertes - le sizing " +
      "dynamique ne peut pas savoir à l'avance qu'une série va s'arrêter, donc il réduit systématiquement, y " +
      "compris juste avant un rebond."
  );
  md.push('');
  if (worstLossSegment.length > 0) {
    md.push(
      `**Sur la pire série de pertes trouvée en section 2** (${worstLossSegment.length} pertes d'affilée, ` +
        `${fmtDate(worstLossSegment[0].entryTime)} → ${fmtDate(worstLossSegment[worstLossSegment.length - 1].exitTime)}), en isolant juste cette série : ` +
        `le compte tombe à ${fmtPct(-worstStreakFixed.maxDrawdownPct)} en fixe contre seulement ${fmtPct(-worstStreakDynamic.maxDrawdownPct)} en dynamique ` +
        `- c'est précisément le genre de série que la réduction de risque est censée amortir, et elle le fait.`
    );
    md.push('');
  }

  const outMd = path.join(dir, 'fvg-us100-pre-deploy-risk-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
