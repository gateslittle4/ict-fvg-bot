// breakerBlock.js
// ICT "Breaker Block" — a failed Order Block that flips polarity, distinct
// from the already-tested/rejected plain Order Block
// (scripts/runOrderBlockStrategyAnalysis.js): that one trades a
// retracement INTO a fresh block in the SAME direction as the BOS that
// formed it (continuation/mitigation); this one requires the block to be
// BROKEN THROUGH FIRST (invalidated), then trades the RETEST from the
// OTHER side, in the OPPOSITE direction — a genuinely different
// mechanism (reversal after failure, not continuation after formation),
// even though both start from the same "last opposite candle before a
// BOS" zone definition.
//
// Method (published ICT concept — myfxbook.com, atas.net, plisio.net,
// ictflow.com, ictkillzone.com all converge on the same mechanical
// description; gaps filled with this project's existing conventions):
//   1. Reuse this project's existing swing/BOS machinery
//      (marketStructure.js, lookback=5) to find every fresh BOS, exactly
//      as the already-tested Order Block script does.
//   2. For each BOS, the Order Block is the last opposite-colored candle
//      before it (same OB_SEARCH_LOOKBACK convention as the existing
//      Order Block script).
//   3. The block becomes a BREAKER only if price later trades all the way
//      THROUGH it (beyond its far edge) — i.e. the original idea failed.
//      Once broken, its role flips: a bullish OB (support) that gets
//      broken through becomes bearish resistance, and vice versa.
//   4. Entry trigger = a retest of the breaker's OWN 50% body level (the
//      "mean threshold" / highest-density trapped-orders level per
//      road2fundedtrading-style ICT sources) from the new side, at the
//      open of the candle after that retest (no-lookahead, same
//      next-candle convention used everywhere else).
//   5. Stop beyond the breaker block's own far edge (the original OB's
//      opposite edge from the retest side). Fixed 1:3 R:R target, 480
//      M15-candle timeout (same conventions as FVG/Order Block/Judas
//      Swing/Asian Range Breakout).
//   6. Same guard learned from smtDivergence.js: a signal whose resulting
//      stop would land on the wrong side of entry is discarded rather
//      than silently mis-signed.
//
// Only ONE pending watch (for the break-through) and ONE open position
// tracked at a time (same standalone-edge-quality-test convention as the
// existing Order Block/Divergence scripts).

import { detectSwingPoints } from './marketStructure.js';

export const SWING_LOOKBACK = 5; // matches the project's existing structure-filter default
export const OB_SEARCH_LOOKBACK = 20; // matches the existing Order Block script
export const BREAKER_MAX_AGE_CANDLES = 100; // candles allowed for the break-through + retest to happen (OB's own 50 doubled: two things must happen here, not one)
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

/** Scans backward from a BOS index for the last opposite-colored candle - the Order Block. */
function findOrderBlock(candles, bosIndex, direction, searchLookback) {
  const wantBearishCandle = direction === 'bullish'; // bullish BOS -> look for the last DOWN candle
  const earliest = Math.max(0, bosIndex - searchLookback);
  for (let j = bosIndex - 1; j >= earliest; j--) {
    const c = candles[j];
    const isBearish = c.close < c.open;
    const isBullish = c.close > c.open;
    if (wantBearishCandle && isBearish) return { low: c.low, high: c.high, mid: (c.high + c.low) / 2 };
    if (!wantBearishCandle && isBullish) return { low: c.low, high: c.high, mid: (c.high + c.low) / 2 };
  }
  return null;
}

/** @returns {Array} raw (pre-cost) trades */
export function runBreakerBlockBacktest(candles, opts = {}) {
  const {
    lookback = SWING_LOOKBACK,
    searchLookback = OB_SEARCH_LOOKBACK,
    maxAgeCandles = BREAKER_MAX_AGE_CANDLES,
    rrMultiple = RR_MULTIPLE,
    maxHoldingCandles = MAX_HOLDING_CANDLES,
  } = opts;

  const bosEvents = detectBosEvents(candles, { lookback });
  const bosByIndex = new Map(bosEvents.map((e) => [e.index, e]));

  const trades = [];
  let open = null;
  let watchBreak = null; // { obDirection, zoneLow, zoneHigh, mid, bosIndex, expireIndex } - waiting for price to break THROUGH the OB
  let watchRetest = null; // { breakerDirection, zoneLow, zoneHigh, mid, expireIndex } - waiting for a retest of the flipped zone
  let pendingEntry = null; // { direction, stopPrice, readyAtIndex }

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
        if (hitStop) {
          outcome = 'loss';
          exitPrice = open.stopPrice;
        } else if (hitTarget) {
          outcome = 'win';
          exitPrice = open.targetPrice;
        } else {
          outcome = 'timeout';
          exitPrice = candle.close;
        }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    // 2) Enter on a retest confirmed on the PREVIOUS candle.
    if (!open && pendingEntry && pendingEntry.readyAtIndex === i) {
      const bullish = pendingEntry.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = pendingEntry.stopPrice;
      const distance = Math.abs(entryPrice - stopPrice);
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      if (distance > 0 && validStopSide) {
        const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        open = {
          direction: pendingEntry.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
        };
      }
      pendingEntry = null;
    }

    // 3) Waiting for a retest of a confirmed breaker (from the flipped side).
    if (!open && !pendingEntry && watchRetest) {
      if (i > watchRetest.expireIndex) {
        watchRetest = null;
      } else {
        const bullish = watchRetest.breakerDirection === 'bullish';
        // A bullish breaker (originally bearish OB, broken through upward) is now support:
        // retested from ABOVE, price's LOW pulling back down to the mid. A bearish breaker
        // (originally bullish OB, broken through downward) is now resistance: retested from
        // BELOW, price's HIGH pushing back up to the mid.
        const touched = bullish ? candle.low <= watchRetest.mid : candle.high >= watchRetest.mid;
        if (touched) {
          const stopPrice = bullish ? watchRetest.zoneLow : watchRetest.zoneHigh;
          pendingEntry = { direction: watchRetest.breakerDirection, stopPrice, readyAtIndex: i + 1 };
          watchRetest = null;
        }
      }
    }

    // 4) Waiting for the OB to be broken through entirely (flips it into a breaker).
    if (!open && !pendingEntry && !watchRetest && watchBreak) {
      if (i > watchBreak.expireIndex) {
        watchBreak = null;
      } else if (i > watchBreak.bosIndex) {
        const obBullish = watchBreak.obDirection === 'bullish';
        // The OB is broken through when price trades beyond its FAR edge (the side away from where it formed as support/resistance).
        const brokenThrough = obBullish ? candle.low < watchBreak.zoneLow : candle.high > watchBreak.zoneHigh;
        if (brokenThrough) {
          watchRetest = {
            breakerDirection: obBullish ? 'bearish' : 'bullish', // polarity flips
            zoneLow: watchBreak.zoneLow,
            zoneHigh: watchBreak.zoneHigh,
            mid: watchBreak.mid,
            expireIndex: i + maxAgeCandles,
          };
          watchBreak = null;
        }
      }
    }

    // 5) If nothing pending, check for a fresh BOS -> arm a new break-watch.
    if (!open && !pendingEntry && !watchRetest && !watchBreak) {
      const bos = bosByIndex.get(i);
      if (bos) {
        const zone = findOrderBlock(candles, i, bos.direction, searchLookback);
        if (zone) {
          watchBreak = { obDirection: bos.direction, zoneLow: zone.low, zoneHigh: zone.high, mid: zone.mid, bosIndex: i, expireIndex: i + maxAgeCandles };
        }
      }
    }
  }
  return trades;
}
