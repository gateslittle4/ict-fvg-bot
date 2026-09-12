#!/usr/bin/env node
// runFvgCombinedAnalysis.js
// Usage: node scripts/runFvgCombinedAnalysis.js <dir-with-csvs>
//
// Combines the two ideas tested separately above (both explicit requests
// from Esdras, 2026-09-12): multi-touch (a rejected touch no longer
// consumes the zone) AND excluding the immediate next-candle touch (<15min
// after formation isn't a real retest). Same production config, zero
// parameters retuned, train screen / test verification. Compared against
// the production single-touch baseline AND each idea alone (see
// fvg-multi-touch-analysis.md / fvg-first-candle-analysis.md) so the
// combination's marginal effect is visible, not just its raw number.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { runOneConfig } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgCombinedAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const md = [];
  md.push('# FVG : multi-contact + exclusion bougie immédiate, combinés');
  md.push('');
  md.push(
    "Combine les deux idées d'Esdras testées séparément (voir fvg-multi-touch-analysis.md et " +
      "fvg-first-candle-analysis.md) : `MultiTouchFvgEngine` avec `minCandlesBeforeEligible: 2` (le contact sur la " +
      "toute première bougie n'est même pas tenté, la zone attend simplement). Même config de production, zéro " +
      "paramètre retouché. Référence = contact unique (production actuelle)."
  );
  md.push('');
  md.push('| Symbole | Mécanisme | Trades train | Espérance train (R) | R total train | Trades test | Espérance test (R) | R total test | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const cfg = CONFIG.fvg.perSymbol[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // Baseline
    const baseTrain = runOneConfig(trainCandles, symbol, spread, cfg).summaryNet;
    const baseTest = runOneConfig(testCandles, symbol, spread, cfg).summaryNet;
    const baseV = verdict(baseTrain.expectancyR, baseTest.expectancyR, baseTrain.totalSignals, baseTest.totalSignals);
    md.push(`| ${symbol} | contact unique (production) | ${baseTrain.totalSignals} | ${fmtNum(baseTrain.expectancyR)} | ${fmtNum(baseTrain.totalSignals * baseTrain.expectancyR, 1)} | ${baseTest.totalSignals} | ${fmtNum(baseTest.expectancyR)} | ${fmtNum(baseTest.totalSignals * baseTest.expectancyR, 1)} | ${baseV} |`);
    console.error(`[${symbol}] baseline train n=${baseTrain.totalSignals} exp=${fmtNum(baseTrain.expectancyR)} | test n=${baseTest.totalSignals} exp=${fmtNum(baseTest.expectancyR)}`);

    // Combined: multi-touch + minCandlesBeforeEligible=2
    const predTrain = buildMultiTouchFilterPredicate(trainCandles, symbol, cfg);
    const predTest = buildMultiTouchFilterPredicate(testCandles, symbol, cfg);
    const engTrain = new MultiTouchFvgEngine({ symbol, checkFilters: predTrain, minCandlesBeforeEligible: 2 });
    const engTest = new MultiTouchFvgEngine({ symbol, checkFilters: predTest, minCandlesBeforeEligible: 2 });
    const tradesTrain = withCosts(runBacktest({ candles: trainCandles, symbol, fvgEngine: engTrain, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple }), symbol);
    const tradesTest = withCosts(runBacktest({ candles: testCandles, symbol, fvgEngine: engTest, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple }), symbol);
    const combTrain = summarizeTrades(tradesTrain);
    const combTest = summarizeTrades(tradesTest);
    const combV = verdict(combTrain.expectancyR, combTest.expectancyR, combTrain.totalSignals, combTest.totalSignals);
    md.push(`| ${symbol} | **multi-contact + hors bougie immédiate** | ${combTrain.totalSignals} | ${fmtNum(combTrain.expectancyR)} | ${fmtNum(combTrain.totalSignals * combTrain.expectancyR, 1)} | ${combTest.totalSignals} | ${fmtNum(combTest.expectancyR)} | ${fmtNum(combTest.totalSignals * combTest.expectancyR, 1)} | ${combV} |`);
    console.error(`[${symbol}] combined train n=${combTrain.totalSignals} exp=${fmtNum(combTrain.expectancyR)} | test n=${combTest.totalSignals} exp=${fmtNum(combTest.expectancyR)}`);
  }

  const outMd = path.join(dir, 'fvg-combined-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
