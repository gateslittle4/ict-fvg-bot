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
// dynamique selon qu'on perde ou gagne."
//
// Stop/target mechanics themselves are NOT a number to compute - they're
// already fixed by computeStop()/runBacktest() (see backtestEngine.js):
// entry = zone edge (the ICT re-entry price), stop = computeStop() in
// 'fvg-edge' mode (far edge of the gap + 10% buffer), target = entry +
// rrMultiple x distance, RR read from CONFIG.fvg.perSymbol.US100 (production
// value, currently 5). All three are fixed AT ENTRY and never adjusted
// afterward - no trailing stop, no breakeven move, matching every other
// mechanism in this project. This script answers the three things that
// actually need real numbers: win/loss STREAKS, pyramid vs no pyramid, and
// fixed vs dynamic position sizing - all on the exact SAME multi-contact
// US100 trade sequence (net of costs), so the three comparisons are directly
// comparable and none of them silently re-picks a different set of trades.

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

// --- Win/loss streaks (on the FULL rMultiple sequence, in exit order) ---
function computeStreaks(trades) {
  const streaks = { win: [], loss: [] };
  let curType = null;
  let curLen = 0;
  const flush = () => {
    if (curType) streaks[curType].push(curLen);
  };
  for (const t of trades) {
    if (t.outcome === 'timeout') continue; // neither a win nor a loss streak event
    const type = t.outcome === 'win' ? 'win' : 'loss';
    if (type === curType) curLen += 1;
    else {
      flush();
      curType = type;
      curLen = 1;
    }
  }
  flush();

  const maxWin = streaks.win.length ? Math.max(...streaks.win) : 0;
  const maxLoss = streaks.loss.length ? Math.max(...streaks.loss) : 0;
  const avgWin = streaks.win.length ? streaks.win.reduce((s, x) => s + x, 0) / streaks.win.length : 0;
  const avgLoss = streaks.loss.length ? streaks.loss.reduce((s, x) => s + x, 0) / streaks.loss.length : 0;
  const lossDist = {};
  for (const l of streaks.loss) lossDist[l] = (lossDist[l] || 0) + 1;

  return { maxWin, maxLoss, avgWin, avgLoss, winStreakCount: streaks.win.length, lossStreakCount: streaks.loss.length, lossDist };
}

// --- Fixed vs dynamic risk: replay the SAME trade sequence, only the % of
// account risked per trade changes. Compound growth (risk % of CURRENT
// equity, not of the fixed starting balance), consecutive-loss counter reset
// on any win - same streak definition as computeStreaks() above.
function simulateRiskMode(trades, mode) {
  let equity = 1; // multiplicative factor, starts at 1x
  let peak = 1;
  let maxDrawdownPct = 0;
  let consecutiveLosses = 0;
  let riskSum = 0;
  let riskCount = 0;

  for (const t of trades) {
    if (t.outcome === 'timeout') {
      // timeout trades still carry a small rMultiple (see runBacktest) and still cost/gain risk-sized capital
    }
    let riskPct = BASE_RISK_PCT;
    if (mode === 'dynamic' && consecutiveLosses >= LOSSES_BEFORE_REDUCTION) riskPct = REDUCED_RISK_PCT;
    riskSum += riskPct;
    riskCount += 1;

    equity *= 1 + (riskPct / 100) * t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, (peak - equity) / peak);

    if (t.outcome === 'loss') consecutiveLosses += 1;
    else if (t.outcome === 'win') consecutiveLosses = 0;
    // a timeout neither extends nor resets the loss streak counter
  }

  return {
    finalReturnPct: equity - 1,
    maxDrawdownPct,
    avgRiskPct: riskCount ? riskSum / riskCount : BASE_RISK_PCT,
  };
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

  const baseTrainSummary = summarizeTrades(baseTrainTrades);
  const baseTestSummary = summarizeTrades(baseTestTrades);
  const pyTrainSummary = summarizeTrades(pyTrainTrades);
  const pyTestSummary = summarizeTrades(pyTestTrades);
  const pyTrainAdds = pyTrainTrades.filter((t) => t.unitsDeployed === 2).length;
  const pyTestAdds = pyTestTrades.filter((t) => t.unitsDeployed === 2).length;

  const streaks = computeStreaks(allTrades);

  const riskTrainFixed = simulateRiskMode(baseTrainTrades, 'fixed');
  const riskTrainDynamic = simulateRiskMode(baseTrainTrades, 'dynamic');
  const riskTestFixed = simulateRiskMode(baseTestTrades, 'fixed');
  const riskTestDynamic = simulateRiskMode(baseTestTrades, 'dynamic');

  const md = [];
  md.push('# US100 multi-contact — avant déploiement : stop/target, streaks, pyramide, risque fixe vs dynamique');
  md.push('');
  md.push(
    "Question directe d'Esdras (2026-09-12) avant tout déploiement du multi-contact US100 " +
      "(`MultiTouchFvgEngine`, validé plus tôt ce soir, toujours pas déployé). Les 4 comparaisons ci-dessous " +
      "tournent sur EXACTEMENT la même séquence de trades (multi-contact US100, config production verbatim, " +
      "net de coûts), pour rester comparables entre elles."
  );
  md.push('');
  md.push('## 1. Mécanique stop/target (rappel, ce n\'est pas un chiffre à calculer)');
  md.push('');
  md.push(
    `- **Entrée** : bord de la zone FVG (ordre LIMIT, prix de ré-entrée ICT), pas le prix de marché.\n` +
      `- **Stop** : mode \`${CFG.stopMode}\` — bord opposé de la zone + 10% de marge de la hauteur de la zone (\`computeStop()\`, backtestEngine.js).\n` +
      `- **Target** : entrée + RR × distance, avec RR = **${CFG.rrMultiple}** (valeur production actuelle, lue depuis \`CONFIG.fvg.perSymbol.US100\`).\n` +
      `- **Fixe ou flexible** : FIXE — les trois sont posés à l'entrée et jamais retouchés ensuite (pas de trailing, pas de mise à breakeven), comme partout ailleurs dans ce projet.`
  );
  md.push('');
  md.push('## 2. Streaks (trades gagnants/perdants d\'affilée), période complète 2019-2025');
  md.push('');
  md.push(`n = ${allTrades.length} trades (train + test, multi-contact, sans pyramide)`);
  md.push('');
  md.push('| | Max d\'affilée | Moyenne par série | Nombre de séries |');
  md.push('|---|---|---|---|');
  md.push(`| Gagnants | ${streaks.maxWin} | ${fmtNum(streaks.avgWin, 1)} | ${streaks.winStreakCount} |`);
  md.push(`| Perdants | ${streaks.maxLoss} | ${fmtNum(streaks.avgLoss, 1)} | ${streaks.lossStreakCount} |`);
  md.push('');
  md.push(
    `Distribution des séries de pertes : \`${JSON.stringify(streaks.lossDist)}\` (longueur → nombre de fois observée). ` +
      `À ${BASE_RISK_PCT}% de risque/trade, la pire série déjà vue (${streaks.maxLoss} pertes d'affilée) correspond à environ ` +
      `${fmtNum(streaks.maxLoss * BASE_RISK_PCT, 1)}% du compte perdus d'affilée dans le pire cas historique.`
  );
  md.push('');
  md.push('## 3. Pyramidal (unités indépendantes) vs non pyramidal');
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
    `Gain en R total : ${fmtNum(pyTrainGainPct, 0)}% en train, ${fmtNum(pyTestGainPct, 0)}% en test. ` +
      `Coût : drawdown max en R légèrement plus haut (${fmtNum(baseTestSummary.maxDrawdownR)}R → ${fmtNum(pyTestSummary.maxDrawdownR)}R en test) ` +
      `— le second lot déploie du risque supplémentaire une fois le mouvement déjà en faveur, mais le stop de l'unité ORIGINALE ` +
      `n'est jamais déplacé (voir le commentaire de \`runBacktestPyramidIndependentStops\` dans backtestEngine.js).`
  );
  md.push('');
  md.push('## 4. Risque fixe vs risque dynamique (réduit après pertes consécutives)');
  md.push('');
  md.push(
    `Règle testée : ${BASE_RISK_PCT}% de risque/trade normalement, réduit à ${REDUCED_RISK_PCT}% (moitié) après ` +
      `${LOSSES_BEFORE_REDUCTION} pertes consécutives, restauré à ${BASE_RISK_PCT}% dès le prochain gain. Appliqué à la MÊME ` +
      'séquence de trades multi-contact (sans pyramide) — seul le sizing change, pas la sélection des trades. Croissance composée (% du capital courant, pas du capital de départ).'
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
      "s'applique aussi aux trades qui, après coup, auraient été des gagnants juste après la série de pertes."
  );

  const outMd = path.join(dir, 'fvg-us100-pre-deploy-risk-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
