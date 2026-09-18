// labRunner.js
// Pure execution layer for the "Labo de stratégies" dashboard tab (see
// labRegistry.js for why this exists and what it deliberately excludes).
// Kept separate from labRegistry.js (data) and from server.js (CSV I/O) so
// the actual trade-processing logic is testable without touching disk.

import { LAB_STRATEGIES } from './labRegistry.js';
import { summarizeTrades } from './backtestEngine.js';
import { DEFAULT_SPREADS } from './transactionCosts.js';

// Same convention as every scripts/run<Name>StrategyAnalysis.js in this
// project: a trade whose stop distance is too close to the spread is not a
// realistically tradeable signal, so it's dropped rather than counted as a
// (misleadingly cheap) loss or win.
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

/**
 * @param {Array<{distance:number, rMultiple:number}>} trades - raw, pre-cost
 * @param {string} symbol
 * @returns {Array} trades with realistic spread cost applied, unviable ones dropped
 */
export function applyTransactionCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  if (!spread) return trades;
  const viable = trades.filter((t) => !Number.isFinite(t.distance) || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    if (!Number.isFinite(t.distance) || t.distance <= 0) return t;
    const costR = spread / t.distance;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
}

// Same split point as EVERY scripts/run<Name>StrategyAnalysis.js in this
// project (grepped across all of them 2026-09-18: identical literal in
// every one) - screen on data before this date, verify on data after it,
// never trust a full-history number alone. Baking this into the Lab too,
// not just the one-off scripts, so a result shown here carries the same
// "did this actually hold up out of sample" discipline instead of a number
// that could just be curve-fit to the whole history.
export const TRAIN_TEST_CUTOFF = Date.UTC(2024, 0, 1);
const MIN_TRADES_FOR_VERDICT = 10;

/**
 * Same rule as every analysis script's own verdict() (copied here as the
 * one canonical version rather than re-copied per script). 'holds' requires
 * the out-of-sample expectancy to be at least 30% of the in-sample one -
 * anything weaker is flagged rather than presented as confirmed.
 */
export function labVerdict(trainExpectancy, testExpectancy, trainCount, testCount) {
  if (trainCount < MIN_TRADES_FOR_VERDICT || testCount < MIN_TRADES_FOR_VERDICT) return 'not-enough-trades';
  if (testExpectancy === null || testExpectancy === undefined) return 'not-enough-trades';
  if (testExpectancy <= 0) return 'fails';
  if (trainExpectancy > 0 && testExpectancy >= 0.3 * trainExpectancy) return 'holds';
  return 'weakened';
}

/**
 * Runs one strategy on the train slice (before TRAIN_TEST_CUTOFF) and the
 * test slice (on/after it) separately, plus a verdict on whether the
 * train-period edge actually survived out of sample.
 */
export function runLabBacktestTrainTest(strategyId, candles, symbol) {
  const trainCandles = candles.filter((c) => c.time < TRAIN_TEST_CUTOFF);
  const testCandles = candles.filter((c) => c.time >= TRAIN_TEST_CUTOFF);
  const train = runLabBacktest(strategyId, trainCandles, symbol);
  const test = runLabBacktest(strategyId, testCandles, symbol);
  return {
    train,
    test,
    verdict: labVerdict(train.summary.expectancyR, test.summary.expectancyR, train.summary.totalSignals, test.summary.totalSignals),
  };
}

/**
 * Runs one registered strategy against one candle series end to end:
 * raw signals -> realistic transaction costs -> summary stats + a
 * chartable equity curve ({time, cumulativeR} points, matching the SAME
 * shape index.html/journal.html's renderEquityCurve() already expects).
 * @param {string} strategyId - a key of LAB_STRATEGIES
 * @param {Array<{time:number,open:number,high:number,low:number,close:number}>} candles
 * @param {string} symbol - drives which spread applies, nothing else
 */
export function runLabBacktest(strategyId, candles, symbol) {
  const strategy = LAB_STRATEGIES[strategyId];
  if (!strategy) throw new Error(`Unknown lab strategy "${strategyId}"`);
  const rawTrades = strategy.run(candles);
  const trades = applyTransactionCosts(rawTrades, symbol);
  const summary = summarizeTrades(trades);
  const equityCurve = trades.map((t, i) => ({ time: t.entryTime, cumulativeR: summary.equityCurve[i] }));
  return { summary, trades, equityCurve, droppedAsNonViable: rawTrades.length - trades.length };
}

/**
 * Flattens a train/test result into the summary shape the screener tables
 * use - out-of-sample (test) figures are the headline number (and what
 * gets ranked), train is carried only for the verdict and its trade count.
 */
export function flattenTrainTestForScreen(trainTest) {
  return {
    trainSignals: trainTest.train.summary.totalSignals,
    testSignals: trainTest.test.summary.totalSignals,
    winRate: trainTest.test.summary.winRate,
    expectancyR: trainTest.test.summary.expectancyR,
    finalEquityR: trainTest.test.summary.finalEquityR,
    profitFactor: trainTest.test.summary.profitFactor,
    verdict: trainTest.verdict,
  };
}
