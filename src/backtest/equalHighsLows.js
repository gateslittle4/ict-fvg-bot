// equalHighsLows.js
// ICT "Equal Highs / Equal Lows" (EQH/EQL) liquidity sweep — a genuinely
// distinct concept from Judas Swing/Weekly Liquidity Sweep, which both
// sweep the single most extreme prior high/low. ICT teaching specifically
// holds that TWO OR MORE swing points sitting at nearly the same price
// carry MORE resting liquidity than a single extreme (stops from both
// swings stack at the same level), making that level a stronger magnet -
// this trades that specific setup, not a single-point sweep.
//
// Method (published ICT concept — the "equal highs/lows" idea is
// consistent across every ICT source, e.g. road2fundedtrading.com,
// ictflow.com, luxalgo.com's own "Equal Highs/Lows" indicator; the one
// genuinely undecided parameter — HOW close counts as "equal" — is never
// given an exact universal number in ICT's own teaching (originally
// visual/discretionary), so a tolerance is fixed here BEFORE looking at
// any result, the same discipline already used for MIN_GAP_HOURS in
// nwog.js/weeklyLiquiditySweep.js. 0.1% of price is the convention most
// commonly cited by published EQH/EQL scanner tools - not tuned on this
// project's own data.):
//   1. Reuse this project's existing swing-pivot detection
//      (marketStructure.js's detectSwingPoints, lookback=5) - the SAME
//      fractal already used by liquiditySweep.js/structure BOS.
//   2. A NEW confirmed swing high is "equal" to the MOST RECENT still-
//      unswept confirmed swing high if it sits within EQUAL_TOLERANCE_PCT
//      of it - the pair becomes an EQH liquidity pool (mirror for lows).
//   3. Signal fires the first time a candle's wick pierces THROUGH the
//      more recent of the two equal levels but its CLOSE reclaims back
//      inside - the same wick-then-reclaim definition already used by
//      liquiditySweep.js/Judas Swing/Weekly Sweep, not invented here.
//      Once a pool has fired, it's consumed (not tradeable again).
//   4. Entry at the OPEN of the next candle (no-lookahead, same
//      convention as everywhere else). Stop beyond the sweep's own
//      extreme. Fixed 1:3 R:R, 480 M15-candle timeout (same conventions
//      as FVG/Judas Swing/NWOG/Weekly Sweep/Breaker Block).
//   5. Same guard already learned from smtDivergence.js: a signal whose
//      resulting stop would land on the wrong side of entry is discarded,
//      never silently mis-signed.

import { detectSwingPoints } from './marketStructure.js';

export const SWING_LOOKBACK = 5; // matches this project's existing structure-filter default
export const EQUAL_TOLERANCE_PCT = 0.001; // 0.1% of price - published EQH/EQL scanner convention, fixed before any result
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @returns {Array<{index:number, direction:'bullish'|'bearish', poolLevel:number}>}
 *   one event per swept-and-reclaimed equal-highs/lows pool, chronological.
 *   poolLevel is the more recent of the two equal swing points (the level
 *   actually tested by the sweep).
 */
export function detectEqualHighLowSweeps(candles, { lookback = SWING_LOOKBACK, tolerancePct = EQUAL_TOLERANCE_PCT } = {}) {
  const swingPoints = detectSwingPoints(candles, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const events = [];
  // Track ALL still-unswept confirmed highs/lows seen so far, oldest first,
  // so a new pivot can be compared against any of them (not just the very
  // last one) - matches ICT's own description of equal highs sometimes
  // being separated by several swings in between.
  let unsweptHighs = [];
  let unsweptLows = [];
  let pendingHighPool = null; // { level } - the most recent confirmed EQH pool awaiting a sweep
  let pendingLowPool = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') {
          const match = unsweptHighs.find((h) => Math.abs(h.price - p.price) / p.price <= tolerancePct);
          if (match) {
            // The pool references the MORE RECENT of the two - the level
            // actually resting closest to current price action.
            pendingHighPool = { level: p.price };
          }
          unsweptHighs.push({ price: p.price });
        } else {
          const match = unsweptLows.find((l) => Math.abs(l.price - p.price) / p.price <= tolerancePct);
          if (match) {
            pendingLowPool = { level: p.price };
          }
          unsweptLows.push({ price: p.price });
        }
      }
    }

    const candle = candles[i];
    if (pendingHighPool && candle.high > pendingHighPool.level && candle.close < pendingHighPool.level) {
      events.push({ index: i, direction: 'bearish', poolLevel: pendingHighPool.level });
      unsweptHighs = []; // consumed - the pool that fed this sweep is gone
      pendingHighPool = null;
    }
    if (pendingLowPool && candle.low < pendingLowPool.level && candle.close > pendingLowPool.level) {
      events.push({ index: i, direction: 'bullish', poolLevel: pendingLowPool.level });
      unsweptLows = [];
      pendingLowPool = null;
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runEqualHighsLowsBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectEqualHighLowSweeps(candles, opts);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingCandles;
      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice;
        if (hitStop) { outcome = 'loss'; exitPrice = open.stopPrice; }
        else if (hitTarget) { outcome = 'win'; exitPrice = open.targetPrice; }
        else { outcome = 'timeout'; exitPrice = candle.close; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    if (!open) {
      const signalIndex = i - 1;
      const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;
      if (event) {
        const bullish = event.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = event.poolLevel;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide) {
          const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
          open = { direction: event.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple };
        }
      }
    }
  }
  return trades;
}
