// liquiditySweep.js
// ICT "liquidity sweep" (a.k.a. stop hunt / turtle soup) confluence filter.
//
// Classic ICT idea: before a genuine reversal, price often wicks briefly
// beyond a recent swing high/low (grabbing the stop-loss orders resting
// just beyond it - "liquidity") and then closes back on the other side,
// before reversing. Requiring this as confluence for an FVG entry aims to
// filter out FVGs that form without that stop-hunt-and-reclaim precursor,
// keeping only the higher-conviction setups.
//
// Method:
//   1. Reuse the same swing-pivot detection as marketStructure.js (a
//      symmetric fractal, confirmed only `lookback` candles later - no
//      lookahead).
//   2. buildLiquiditySweepEvents() walks the candles and records a
//      'bullish' sweep event whenever a candle's LOW dips below the most
//      recently confirmed swing low but its CLOSE reclaims back above it
//      (support swept then reclaimed - bullish confluence), and a
//      'bearish' event on the mirror condition against the most recent
//      confirmed swing high.
//   3. makeSweepLookup() answers "was there a sweep event of the given
//      direction within the last `windowMs`, as of time t?" — forward-only,
//      no lookahead, O(1) amortized per query.
//   4. LiquiditySweepFilteredFvgEngine only lets a 'validated' FVG signal
//      through if a matching-direction sweep happened recently.

import { detectSwingPoints } from './marketStructure.js';

/**
 * @param {Array} candles
 * @param {object} [opts]
 * @param {number} [opts.lookback] - candles each side required to confirm a swing pivot
 * @returns {Array<{time:number, direction:'bullish'|'bearish'}>}
 */
export function buildLiquiditySweepEvents(candles, { lookback = 5 } = {}) {
  const swingPoints = detectSwingPoints(candles, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const events = [];
  let lastConfirmedHigh = null;
  let lastConfirmedLow = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') lastConfirmedHigh = p.price;
        else lastConfirmedLow = p.price;
      }
    }

    const candle = candles[i];
    if (lastConfirmedLow !== null && candle.low < lastConfirmedLow && candle.close > lastConfirmedLow) {
      events.push({ time: candle.time, direction: 'bullish' });
    }
    if (lastConfirmedHigh !== null && candle.high > lastConfirmedHigh && candle.close < lastConfirmedHigh) {
      events.push({ time: candle.time, direction: 'bearish' });
    }
  }
  return events;
}

/**
 * Stateful, forward-only lookup: `(t, direction) => boolean`, must be called
 * with non-decreasing `t`. True if a sweep event of the given direction
 * occurred in (t - windowMs, t].
 */
export function makeSweepLookup(events, { windowMs }) {
  const bullish = events.filter((e) => e.direction === 'bullish');
  const bearish = events.filter((e) => e.direction === 'bearish');
  let bPtr = -1;
  let brPtr = -1;

  return function lookup(t, direction) {
    if (direction === 'bullish') {
      while (bPtr + 1 < bullish.length && bullish[bPtr + 1].time <= t) bPtr++;
      return bPtr >= 0 && bullish[bPtr].time > t - windowMs;
    }
    while (brPtr + 1 < bearish.length && bearish[brPtr + 1].time <= t) brPtr++;
    return brPtr >= 0 && bearish[brPtr].time > t - windowMs;
  };
}

export class LiquiditySweepFilteredFvgEngine {
  /**
   * @param {object} innerEngine - a FvgEngine, or another filtered wrapper (filters compose)
   * @param {(t:number, direction:string) => boolean} sweepLookup - from makeSweepLookup()
   */
  constructor(innerEngine, sweepLookup) {
    this.inner = innerEngine;
    this.sweepLookup = sweepLookup;
    this.filteredCount = 0;
    this.passedCount = 0;
  }

  processCandle(candle) {
    const events = this.inner.processCandle(candle);
    const out = [];
    for (const e of events) {
      if (e.type !== 'validated') {
        out.push(e);
        continue;
      }
      if (this.sweepLookup(candle.time, e.direction)) {
        this.passedCount++;
        out.push(e);
      } else {
        this.filteredCount++;
        // dropped: no recent matching-direction liquidity sweep - low confluence
      }
    }
    return out;
  }
}
