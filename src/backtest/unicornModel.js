// unicornModel.js
// ICT "Unicorn Model" — a genuinely new concept for this project: entry is
// the OVERLAP between a Breaker Block and a Fair Value Gap, two PD arrays
// this project already detects separately (breakerBlock.js, the FvgEngine
// raw 3-candle imbalance test) but has never required to coincide. Distinct
// from:
//   - the already-tested/rejected plain Breaker Block (breakerBlock.js):
//     that one enters on any retest of the breaker's own 50% level, no FVG
//     requirement at all.
//   - the production FVG (src/engines/fvgEngine.js + the HTF-bias/session/
//     structure filters layered on top in src/config.js): no breaker-block
//     or BOS-driven-invalidation requirement at all.
// Sources (luxalgo.com, quantvps.com, fluxcharts.com, innercircletrader.net,
// icttradingstrategy.com) converge on the same mechanical description:
//   1. A liquidity sweep followed by a Market Structure Shift (MSS) - here,
//      reused as-is from breakerBlock.js's existing BOS detection
//      (marketStructure.js swing points, lookback=5) rather than
//      reinvented, since a BOS IS the MSS confirmation this project already
//      has a tested implementation of.
//   2. The Order Block before that BOS (last opposite-colored candle,
//      OB_SEARCH_LOOKBACK=20, same convention as breakerBlock.js) must
//      later be broken through entirely - it fails and flips into a
//      Breaker (same mechanic, same BREAKER_MAX_AGE_CANDLES=100 window,
//      duplicated here rather than imported so this file has zero
//      dependency on breakerBlock.js's internals - mirrors the convention
//      already used by weeklyLiquiditySweep.js for nwog.js).
//   3. What's NEW: after the breaker is confirmed, a standard 3-candle FVG
//      (same c1/c3 gap test as FvgEngine, same direction as the breaker)
//      must form and OVERLAP the breaker's zone before
//      UNICORN_FVG_WINDOW_CANDLES elapse. The overlap (intersection of the
//      breaker's [zoneLow, zoneHigh] and the FVG's [bottom, top]) is the
//      actual entry zone - not the breaker's own mid, and not the FVG's
//      full range alone.
//   4. Entry = the open of the candle AFTER the first candle whose wick
//      reaches into the overlap zone (no-lookahead, same next-candle
//      convention as everywhere else). Stop beyond the breaker's own far
//      edge (same as breakerBlock.js). Fixed 1:3 R:R, 480 M15-candle
//      timeout (same conventions as FVG/Breaker Block/Judas Swing).
//   5. Same guard learned from smtDivergence.js: a signal whose resulting
//      stop would land on the wrong side of entry is discarded rather than
//      silently mis-signed.
//
// Tested first on US100/US500 (the two instruments with the project's only
// genuinely validated edge, per Esdras's explicit "focus on US100/US500"),
// all 5 original instruments + USDJPY included for the usual full-picture
// comparison.

import { detectSwingPoints } from './marketStructure.js';

export const SWING_LOOKBACK = 5;
export const OB_SEARCH_LOOKBACK = 20;
export const BREAKER_MAX_AGE_CANDLES = 100;
export const UNICORN_FVG_WINDOW_CANDLES = 20; // how long after the breaker confirms to wait for an overlapping FVG
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

/** @returns {Array<{index:number, direction:'bullish'|'bearish'}>} every fresh BOS crossing, chronological */
export function detectBosEvents(candles, { lookback = SWING_LOOKBACK } = {}) {
  const swingPoints = detectSwingPoints(candles, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const events = [];
  let lastConfirmedHigh = null;
  let lastConfirmedLow = null;
  let prevClose = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') lastConfirmedHigh = p.price;
        else lastConfirmedLow = p.price;
      }
    }
    const close = candles[i].close;
    if (prevClose !== null) {
      if (lastConfirmedHigh !== null && close > lastConfirmedHigh && prevClose <= lastConfirmedHigh) {
        events.push({ index: i, direction: 'bullish' });
      } else if (lastConfirmedLow !== null && close < lastConfirmedLow && prevClose >= lastConfirmedLow) {
        events.push({ index: i, direction: 'bearish' });
      }
    }
    prevClose = close;
  }
  return events;
}

function findOrderBlock(candles, bosIndex, direction, searchLookback) {
  const wantBearishCandle = direction === 'bullish';
  const earliest = Math.max(0, bosIndex - searchLookback);
  for (let j = bosIndex - 1; j >= earliest; j--) {
    const c = candles[j];
    const isBearish = c.close < c.open;
    const isBullish = c.close > c.open;
    if (wantBearishCandle && isBearish) return { low: c.low, high: c.high };
    if (!wantBearishCandle && isBullish) return { low: c.low, high: c.high };
  }
  return null;
}

/** @returns {Array} raw (pre-cost) trades */
export function runUnicornModelBacktest(candles, opts = {}) {
  const {
    lookback = SWING_LOOKBACK,
    searchLookback = OB_SEARCH_LOOKBACK,
    maxAgeCandles = BREAKER_MAX_AGE_CANDLES,
    fvgWindowCandles = UNICORN_FVG_WINDOW_CANDLES,
    rrMultiple = RR_MULTIPLE,
    maxHoldingCandles = MAX_HOLDING_CANDLES,
  } = opts;

  const bosEvents = detectBosEvents(candles, { lookback });
  const bosByIndex = new Map(bosEvents.map((e) => [e.index, e]));

  const trades = [];
  let open = null;
  let watchBreak = null; // { obDirection, zoneLow, zoneHigh, bosIndex, expireIndex }
  let watchOverlap = null; // { direction, breakerLow, breakerHigh, expireIndex } - waiting for an overlapping FVG
  let watchRetest = null; // { direction, overlapLow, overlapHigh, breakerLow, breakerHigh, expireIndex }
  let pendingEntry = null; // { direction, stopPrice, readyAtIndex }
  let fvgHistory = []; // last 3 candles, for the standard c1/c3 gap test

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

    // 2) Enter on a retest (into the overlap zone) confirmed on the PREVIOUS candle.
    if (!open && pendingEntry && pendingEntry.readyAtIndex === i) {
      const bullish = pendingEntry.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = pendingEntry.stopPrice;
      const distance = Math.abs(entryPrice - stopPrice);
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      if (distance > 0 && validStopSide) {
        const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        open = { direction: pendingEntry.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance };
      }
      pendingEntry = null;
    }

    // 3) Waiting for a retest of the confirmed overlap zone.
    if (!open && !pendingEntry && watchRetest) {
      if (i > watchRetest.expireIndex) {
        watchRetest = null;
      } else {
        const bullish = watchRetest.direction === 'bullish';
        const touched = bullish ? candle.low <= watchRetest.overlapHigh : candle.high >= watchRetest.overlapLow;
        if (touched) {
          const stopPrice = bullish ? watchRetest.breakerLow : watchRetest.breakerHigh;
          pendingEntry = { direction: watchRetest.direction, stopPrice, readyAtIndex: i + 1 };
          watchRetest = null;
        }
      }
    }

    // 4) Waiting for a fresh FVG (same direction as the breaker) to form and overlap it.
    fvgHistory.push(candle);
    if (fvgHistory.length > 3) fvgHistory.shift();
    if (!open && !pendingEntry && !watchRetest && watchOverlap) {
      if (i > watchOverlap.expireIndex) {
        watchOverlap = null;
      } else if (fvgHistory.length === 3) {
        const [c1, , c3] = fvgHistory;
        let fvgLow = null, fvgHigh = null, fvgDirection = null;
        if (c1.high < c3.low) { fvgDirection = 'bullish'; fvgLow = c1.high; fvgHigh = c3.low; }
        else if (c1.low > c3.high) { fvgDirection = 'bearish'; fvgLow = c3.high; fvgHigh = c1.low; }

        if (fvgDirection === watchOverlap.direction) {
          const overlapLow = Math.max(fvgLow, watchOverlap.breakerLow);
          const overlapHigh = Math.min(fvgHigh, watchOverlap.breakerHigh);
          if (overlapLow < overlapHigh) {
            watchRetest = {
              direction: watchOverlap.direction,
              overlapLow,
              overlapHigh,
              breakerLow: watchOverlap.breakerLow,
              breakerHigh: watchOverlap.breakerHigh,
              expireIndex: i + maxAgeCandles,
            };
            watchOverlap = null;
          }
        }
      }
    }

    // 5) Waiting for the OB to be broken through entirely (flips it into a breaker, arms the FVG-overlap watch).
    if (!open && !pendingEntry && !watchRetest && !watchOverlap && watchBreak) {
      if (i > watchBreak.expireIndex) {
        watchBreak = null;
      } else if (i > watchBreak.bosIndex) {
        const obBullish = watchBreak.obDirection === 'bullish';
        const brokenThrough = obBullish ? candle.low < watchBreak.zoneLow : candle.high > watchBreak.zoneHigh;
        if (brokenThrough) {
          watchOverlap = {
            direction: obBullish ? 'bearish' : 'bullish', // polarity flips, same as breakerBlock.js
            breakerLow: watchBreak.zoneLow,
            breakerHigh: watchBreak.zoneHigh,
            expireIndex: i + fvgWindowCandles,
          };
          watchBreak = null;
        }
      }
    }

    // 6) If nothing pending, check for a fresh BOS -> arm a new break-watch.
    if (!open && !pendingEntry && !watchRetest && !watchOverlap && !watchBreak) {
      const bos = bosByIndex.get(i);
      if (bos) {
        const zone = findOrderBlock(candles, i, bos.direction, searchLookback);
        if (zone) {
          watchBreak = { obDirection: bos.direction, zoneLow: zone.low, zoneHigh: zone.high, bosIndex: i, expireIndex: i + maxAgeCandles };
        }
      }
    }
  }
  return trades;
}
