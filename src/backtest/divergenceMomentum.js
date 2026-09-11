// divergenceMomentum.js
// The OPPOSITE bet from the production Divergence strategy (see
// scripts/runFtmo1StepAccountImpact.js's computeDivergenceCandidates() /
// src/liveStrategyEngine.js's _computeDivergenceCandidates() — "Divergence
// is always long the laggard", betting the log-price spread between
// US100/US500 CONVERGES). This bets the spread WIDENS instead: when the
// z-score of the log-ratio extends past the threshold, buy the LEADER (the
// symbol that just pulled ahead) rather than the laggard, betting its
// outperformance continues (momentum) rather than reverts (mean
// reversion). Same trigger, same entry timing, same ATR-based stop, same
// R:R/timeout conventions as production Divergence - the ONLY thing that
// changes is WHICH of the two symbols gets bought.
//
// New, self-contained module - does not modify liveStrategyEngine.js
// (production Divergence is live) or duplicate its full engine, just this
// one candidate-generation function plus a standalone backtest loop, same
// convention already used for gapContinuation.js next to nwog.js/ndog.js.

import { resampleCandles, TIMEFRAME_MS } from './htfBias.js';
import { computeZScoreSeries, alignByTime } from './correlation.js';

export const DIV_LOOKBACK = 100;
export const DIV_Z_THRESHOLD = 2;
export const DIV_ATR_PERIOD = 14;
export const STOP_ATR_MULTIPLE = 1.5;
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_M15_CANDLES = 480;

function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

/**
 * @returns {Array<{symbol:string, entryTime:number, stopDistance:number}>}
 *   candidates keyed by the M15 candle time they'd fill at - same shape as
 *   the production Divergence candidate generator, but naming the LEADER
 *   (not the laggard) as the symbol to trade.
 */
export function computeDivergenceMomentumCandidates(m15A, symA, m15B, symB, opts = {}) {
  const { lookback = DIV_LOOKBACK, zThreshold = DIV_Z_THRESHOLD, atrPeriod = DIV_ATR_PERIOD } = opts;
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  if (n <= lookback + 1) return [];

  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, lookback);
  const atrA = computeAtrSeries(alignedA, atrPeriod);
  const atrB = computeAtrSeries(alignedB, atrPeriod);

  const candidates = [];
  let wasExtended = false;
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= zThreshold;
    if (extended && !wasExtended && i + 1 < n) {
      // z[i] >= threshold -> A's log price pulled ahead of B's -> A is the LEADER.
      // (the production Divergence backtest calls this same condition "laggardIsB" and trades B instead.)
      const leaderIsA = z[i] >= zThreshold;
      const symbol = leaderIsA ? symA : symB;
      const atr = leaderIsA ? atrA[i] : atrB[i];
      const entryCandle = leaderIsA ? alignedA[i + 1] : alignedB[i + 1];
      if (atr && atr > 0) {
        candidates.push({ symbol, entryTime: entryCandle.time, stopDistance: STOP_ATR_MULTIPLE * atr });
      }
    }
    wasExtended = extended;
  }
  return candidates;
}

/**
 * Standalone single-symbol backtest loop (mirrors production Divergence's
 * own resolution logic exactly - always long, entry at candidate entryTime,
 * stop below entry, fixed R:R target, timeout).
 * @returns {Array} raw (pre-cost) trades for ONE symbol's candidates
 */
export function runDivergenceMomentumBacktestForSymbol(m15Candles, candidatesForSymbol, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_M15_CANDLES } = opts;
  const candidateByTime = new Map(candidatesForSymbol.map((c) => [c.entryTime, c]));

  const trades = [];
  let open = null;

  for (let i = 0; i < m15Candles.length; i++) {
    const candle = m15Candles[i];

    if (open && candle.time > open.entryTime) {
      const hitStop = candle.low <= open.stopPrice;
      const hitTarget = candle.high >= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingCandles;
      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice;
        if (hitStop) { outcome = 'loss'; exitPrice = open.stopPrice; }
        else if (hitTarget) { outcome = 'win'; exitPrice = open.targetPrice; }
        else { outcome = 'timeout'; exitPrice = candle.close; }
        const rMultiple = (exitPrice - open.entryPrice) / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    if (!open) {
      const candidate = candidateByTime.get(candle.time);
      if (candidate) {
        const entryPrice = candle.open;
        const distance = candidate.stopDistance;
        if (distance > 0) {
          const stopPrice = entryPrice - distance;
          const targetPrice = entryPrice + rrMultiple * distance;
          open = { direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance };
        }
      }
    }
  }
  return trades;
}
