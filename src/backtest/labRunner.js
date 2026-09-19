// labRunner.js
// Pure execution layer for the "Labo de stratégies" dashboard tab (see
// labRegistry.js for why this exists and what it deliberately excludes).
// Kept separate from labRegistry.js (data) and from server.js (CSV I/O) so
// the actual trade-processing logic is testable without touching disk.

import { LAB_STRATEGIES } from './labRegistry.js';
import { summarizeTrades } from './backtestEngine.js';
import { DEFAULT_SPREADS } from './transactionCosts.js';
import { expectancyStats } from './labAnalytics.js';

// Same convention as every scripts/run<Name>StrategyAnalysis.js in this
// project: a trade whose stop distance is too close to the spread is not a
// realistically tradeable signal, so it's dropped rather than counted as a
// (misleadingly cheap) loss or win.
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

/**
 * @param {Array<{distance:number, rMultiple:number}>} trades - raw, pre-cost
 * @param {string} symbol
 * @param {number|null} [spreadOverride] - price-unit spread to use instead of
 *   DEFAULT_SPREADS[symbol] (imported datasets carry their own; 0 is honoured
 *   as "no cost", not silently replaced by the table's value)
 * @returns {Array} trades with realistic spread cost applied, unviable ones dropped
 */
export function applyTransactionCosts(trades, symbol, spreadOverride = null) {
  const spread = spreadOverride ?? DEFAULT_SPREADS[symbol] ?? 0;
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
export function runLabBacktestTrainTest(strategyId, candles, symbol, { spread = null, cutoff = TRAIN_TEST_CUTOFF } = {}) {
  const trainCandles = candles.filter((c) => c.time < cutoff);
  const testCandles = candles.filter((c) => c.time >= cutoff);
  const train = runLabBacktest(strategyId, trainCandles, symbol, spread);
  const test = runLabBacktest(strategyId, testCandles, symbol, spread);
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
 * @param {number|null} [spreadOverride] - see applyTransactionCosts
 */
export function runLabBacktest(strategyId, candles, symbol, spreadOverride = null) {
  const strategy = LAB_STRATEGIES[strategyId];
  if (!strategy) throw new Error(`Unknown lab strategy "${strategyId}"`);
  const rawTrades = strategy.run(candles);
  const trades = applyTransactionCosts(rawTrades, symbol, spreadOverride);
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
    // Same expectancy with its 95 % interval, so a table can say "holds, but
    // statistically indistinguishable from zero" instead of just "holds".
    testExpectancy: expectancyStats(trainTest.test.trades),
    verdict: trainTest.verdict,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TRAIN_MS = 2 * 365 * DAY_MS;
const MIN_TEST_MS = 180 * DAY_MS;

/**
 * Where to split an IMPORTED dataset into train/test. The project-wide
 * 2024-01-01 cutoff is only meaningful when the data has real history on
 * both sides of it (>= 2 years before, >= 6 months after) - a dataset that
 * stops in 2019 would otherwise get an EMPTY test period and a verdict
 * built on nothing. When it does not, fall back to the first 70 % of the
 * time range as train / last 30 % as test (rounded to a UTC day), and say
 * so via `kind` so the UI can tell the user which rule was applied.
 * @returns {{cutoff:number, kind:'standard'|'proportional'}}
 */
export function chooseTrainTestCutoff(candles, standardCutoff = TRAIN_TEST_CUTOFF) {
  if (!candles || candles.length === 0) return { cutoff: standardCutoff, kind: 'standard' };
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (standardCutoff - first >= MIN_TRAIN_MS && last - standardCutoff >= MIN_TEST_MS) {
    return { cutoff: standardCutoff, kind: 'standard' };
  }
  const raw = first + 0.7 * (last - first);
  return { cutoff: Math.floor(raw / DAY_MS) * DAY_MS, kind: 'proportional' };
}
