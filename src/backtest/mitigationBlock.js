// mitigationBlock.js
// ICT "Mitigation Block" — a distinct PD array from both the already-tested
// plain Order Block and the already-validated Breaker Block
// (breakerBlock.js), even though all three start from the same "last
// opposite-colored candle" zone definition:
//   - Order Block requires a full, SUCCESSFUL break of structure (BOS) and
//     trades a retracement INTO the block, CONTINUING in the BOS direction.
//   - Breaker Block ALSO requires a successful BOS first, then requires the
//     resulting Order Block to be broken THROUGH entirely (invalidated),
//     then trades the retest from the OTHER side.
//   - Mitigation Block requires NEITHER: it is anchored to a FAILURE to
//     break structure — a "failure swing" (a new confirmed swing high that
//     is LOWER than the previous confirmed swing high, or a new confirmed
//     swing low that is HIGHER than the previous one) — published ICT
//     sources (theforexgeek.com, atas.net, ictflow.com) describe it as
//     "the last opposite-colored candle before the failed push", where
//     traders trapped by the failed breakout get "mitigated" (get their
//     average price back) when price returns to it, continuing the
//     REVERSAL implied by the failure. No prior BOS and no later
//     break-through are required — the signal fires directly off the
//     failure itself.
//
// Method (gaps filled with this project's existing, already-validated
// conventions — nothing new invented):
//   1. Reuse the existing swing-pivot detector (marketStructure.js's
//      detectSwingPoints, lookback=5) — the SAME fractal used by every
//      other structure-based mechanism here.
//   2. A failure swing high (new confirmed high < previous confirmed high)
//      means the just-completed push up FAILED — the block is the last
//      DOWN candle before that pivot, i.e. exactly
//      `findOrderBlock(candles, pivotIndex, 'bullish', searchLookback)`
//      (breakerBlock.js's own helper, reused verbatim: "bullish" here
//      means "the failed push was bullish", which is what selects the
//      opposite/down candle). The trade taken is the OPPOSITE of the
//      failed push - bearish (the reversal the failure implies). Mirror
//      for a failure swing low -> bullish trade.
//   3. Entry trigger = price re-entering the block's own high/low range
//      (same wick-touch definition as fvgEngine.js's enteredZone), at the
//      open of the candle after that retest (no-lookahead).
//   4. Stop beyond the block's own far edge. Fixed 1:3 R:R, 480 M15-candle
//      timeout (same conventions as FVG/Order Block/Breaker Block).
//   5. Only ONE pending watch and ONE open position tracked at a time
//      (same standalone-edge-quality-test convention as breakerBlock.js).
//
// Tested on all available instruments, same as every other exploratory
// script here.

import { detectSwingPoints } from './marketStructure.js';
import { findOrderBlock } from './breakerBlock.js';

export const SWING_LOOKBACK = 5; // matches the project's existing structure-filter default
export const OB_SEARCH_LOOKBACK = 20; // matches the existing Order Block / Breaker Block scripts
export const BLOCK_MAX_AGE_CANDLES = 50; // matches fvgEngine.js's own default staleness window
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/**
 * @returns {Array<{pivotIndex:number, confirmedIndex:number, tradeDirection:'bullish'|'bearish', zone:{low:number,high:number,mid:number}}>}
 *   one entry per failure swing that has a findable origin block, chronological by confirmedIndex.
 */
export function detectMitigationBlocks(candles, { lookback = SWING_LOOKBACK, searchLookback = OB_SEARCH_LOOKBACK } = {}) {
  const swingPoints = detectSwingPoints(candles, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const results = [];
  let prevHigh = null; // { index, price }
  let prevLow = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (!newlyConfirmed) continue;
    for (const p of newlyConfirmed) {
      if (p.type === 'high') {
        if (prevHigh && p.price < prevHigh.price) {
          // Failure swing high: the push up to p.index failed to exceed prevHigh - the
          // failed push was bullish, so the origin block is the last DOWN candle before it.
          const zone = findOrderBlock(candles, p.index, 'bullish', searchLookback);
          if (zone) results.push({ pivotIndex: p.index, confirmedIndex: p.confirmedIndex, tradeDirection: 'bearish', zone });
        }
        prevHigh = { index: p.index, price: p.price };
      } else {
        if (prevLow && p.price > prevLow.price) {
          // Failure swing low: the push down to p.index failed to undercut prevLow - the
          // failed push was bearish, so the origin block is the last UP candle before it.
          const zone = findOrderBlock(candles, p.index, 'bearish', searchLookback);
          if (zone) results.push({ pivotIndex: p.index, confirmedIndex: p.confirmedIndex, tradeDirection: 'bullish', zone });
        }
        prevLow = { index: p.index, price: p.price };
      }
    }
  }
  // Sort by confirmedIndex - the earliest point this project's own no-lookahead discipline
  // allows the block to be acted on (the pivot itself isn't knowable until confirmedIndex).
  results.sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  return results;
}

/** @returns {Array} raw (pre-cost) trades */
export function runMitigationBlockBacktest(candles, opts = {}) {
  const {
    lookback = SWING_LOOKBACK,
    searchLookback = OB_SEARCH_LOOKBACK,
    maxAgeCandles = BLOCK_MAX_AGE_CANDLES,
    rrMultiple = RR_MULTIPLE,
    maxHoldingCandles = MAX_HOLDING_CANDLES,
  } = opts;

  const blocks = detectMitigationBlocks(candles, { lookback, searchLookback });
  const blocksByConfirmedIndex = new Map();
  for (const b of blocks) {
    if (!blocksByConfirmedIndex.has(b.confirmedIndex)) blocksByConfirmedIndex.set(b.confirmedIndex, []);
    blocksByConfirmedIndex.get(b.confirmedIndex).push(b);
  }

  const trades = [];
  let open = null;
  let watch = null; // { direction, zone, expireIndex }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1) Resolve an open position: stop, target, or timeout.
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

    // 2) Check a pending watch for a retest (entry trigger), using this candle's range.
    if (!open && watch) {
      if (i > watch.expireIndex) {
        watch = null;
      } else {
        const bullish = watch.direction === 'bullish';
        const touched = bullish ? candle.low <= watch.zone.high : candle.high >= watch.zone.low;
        if (touched) {
          const nextIndex = i + 1;
          if (nextIndex < candles.length) {
            const next = candles[nextIndex];
            const entryPrice = next.open;
            const stopPrice = bullish ? watch.zone.low : watch.zone.high;
            const distance = Math.abs(entryPrice - stopPrice);
            const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
            if (distance > 0 && validStopSide) {
              const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
              open = {
                direction: watch.direction,
                entryIndex: nextIndex,
                entryTime: next.time,
                entryPrice,
                stopPrice,
                targetPrice,
                distance,
                rrMultiple,
              };
            }
          }
          watch = null;
        }
      }
    }

    // 3) If nothing pending, arm a watch for any block newly knowable as of this candle.
    if (!open && !watch) {
      const newlyKnown = blocksByConfirmedIndex.get(i);
      if (newlyKnown && newlyKnown.length > 0) {
        const b = newlyKnown[newlyKnown.length - 1]; // most recent if several confirm on the same candle
        watch = { direction: b.tradeDirection, zone: b.zone, expireIndex: i + maxAgeCandles };
      }
    }
  }
  return trades;
}
