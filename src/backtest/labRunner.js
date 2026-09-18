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
