// oteStrategy.js
// ICT "Optimal Trade Entry" (OTE) — a genuinely different SIGNAL MECHANISM
// from FVG/Order Block: instead of trading a gap or a mitigation zone, OTE
// trades a Fibonacci retracement of the impulse leg that produced a
// confirmed Break of Structure (BOS). This is one of the most widely
// published ICT concepts and has never been tested in this project.
//
// Published convention used here (decided BEFORE looking at any result,
// same discipline as everywhere else in this project):
//   - OTE zone = 61.8%-79% retracement of the impulse leg (the standard
//     range cited across ICT material — NOT tuned on this project's data).
//   - Leg origin (the Fibonacci "0" point) = the most recently CONFIRMED
//     swing point that preceded the BOS (last confirmed swing LOW before a
//     bullish BOS, last confirmed swing HIGH before a bearish BOS) — reuses
//     this project's existing swing detection (marketStructure.js,
//     lookback 5), same no-lookahead discipline (a swing pivot only
//     becomes usable `lookback` candles after it forms).
//   - Leg extreme (the Fibonacci "1.0" point) is NOT known in advance — it
//     is the running high (bullish) / low (bearish) reached so far since
//     the BOS candle. It is recalculated candle-by-candle using only
//     candles already seen (causal), exactly how a trader redraws the Fib
//     retracement as a fresh leg keeps extending before it pulls back.
//   - Entry = first candle whose wick reaches the shallow edge of the zone
//     (the 61.8% level), filled at min/max(candle.open, zone edge) — same
//     limit-into-zone convention as the Order Block script.
//   - Stop = beyond the leg origin (the swing point that started the leg)
//     — the standard ICT invalidation for an OTE trade (a full round-trip
//     back through the origin invalidates the setup).
//   - Target = fixed 1:3 R:R, timeout after 480 M15 candles — same
//     conventions as FVG/Order Block/Divergence, for comparability.
//   - Watch window capped at 50 candles after the BOS (same convention as
//     FVG's maxAgeCandles / Order Block's OB_MAX_AGE_CANDLES).
//   - One pending watch and one open position tracked at a time (same
//     standalone edge-quality convention as Order Block/Divergence) — a
//     fresh BOS while already watching/in a trade is ignored until the
//     current one resolves.

import { detectSwingPoints } from './marketStructure.js';

export const OTE_ZONE_NEAR = 0.618; // shallow edge (closer to the leg extreme) — published ICT convention
export const OTE_ZONE_FAR = 0.79; // deep edge (closer to the leg origin) — published ICT convention
export const OTE_RR_MULTIPLE = 3;
export const OTE_MAX_AGE_CANDLES = 50;
export const OTE_MAX_HOLDING_CANDLES = 480;

/**
 * Every fresh BOS crossing, in chronological order, together with the leg
 * origin price (the confirmed swing point the leg started from). Events
 * whose origin isn't known yet (no swing confirmed before the very first
 * BOS) are dropped — there is no leg to draw a retracement on.
 * @returns {Array<{index:number, direction:'bullish'|'bearish', originPrice:number}>}
 */
export function detectBosEventsWithOrigin(candles, lookback = 5) {
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
        if (lastConfirmedLow !== null) {
          events.push({ index: i, direction: 'bullish', originPrice: lastConfirmedLow });
        }
      } else if (lastConfirmedLow !== null && close < lastConfirmedLow && prevClose >= lastConfirmedLow) {
        if (lastConfirmedHigh !== null) {
          events.push({ index: i, direction: 'bearish', originPrice: lastConfirmedHigh });
        }
      }
    }
    prevClose = close;
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runOteBacktest(candles, opts = {}) {
  const {
    lookback = 5,
    zoneNear = OTE_ZONE_NEAR,
    // zoneFar (0.79, the "deep" published edge) is documented for the zone's
    // definition but — same convention as this project's Order Block script
    // — not enforced as a reject-if-overshot bound: a touch is any wick that
    // reaches at least the near edge, whether or not it blows straight
    // through the whole zone in one candle.
    rrMultiple = OTE_RR_MULTIPLE,
    maxAgeCandles = OTE_MAX_AGE_CANDLES,
    maxHoldingCandles = OTE_MAX_HOLDING_CANDLES,
  } = opts;

  const bosEvents = detectBosEventsWithOrigin(candles, lookback);
  const bosByIndex = new Map(bosEvents.map((e) => [e.index, e]));

  const trades = [];
  let open = null;
  let watch = null; // { direction, originPrice, legExtreme, bosIndex, expireIndex }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1) Resolve an open position.
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingCandles;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = candle.close; outcome = null; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome: outcome ?? (rMultiple > 0 ? 'win' : 'loss'), rMultiple });
        open = null;
      }
    }

    // 2) If watching a leg (and not already in a trade), update its running
    //    extreme causally, then check for a retracement touch or expiry.
    if (!open && watch) {
      if (i > watch.expireIndex) {
        watch = null;
      } else if (i > watch.bosIndex) {
        if (watch.direction === 'bullish') watch.legExtreme = Math.max(watch.legExtreme, candle.high);
        else watch.legExtreme = Math.min(watch.legExtreme, candle.low);

        const range = watch.direction === 'bullish' ? watch.legExtreme - watch.originPrice : watch.originPrice - watch.legExtreme;
        if (range > 0) {
          const bullish = watch.direction === 'bullish';
          const zoneShallow = bullish ? watch.legExtreme - zoneNear * range : watch.legExtreme + zoneNear * range;
          const touched = bullish ? candle.low <= zoneShallow : candle.high >= zoneShallow;
          if (touched) {
            const entryPrice = bullish ? Math.min(candle.open, zoneShallow) : Math.max(candle.open, zoneShallow);
            const stopPrice = watch.originPrice;
            const distance = bullish ? entryPrice - stopPrice : stopPrice - entryPrice;
            if (distance > 0) {
              const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
              open = { direction: watch.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance };
            }
            watch = null;
          }
        }
      }
    }

    // 3) If flat, check for a fresh BOS -> arm a new watch on its leg.
    if (!open && !watch) {
      const bos = bosByIndex.get(i);
      if (bos) {
        watch = {
          direction: bos.direction,
          originPrice: bos.originPrice,
          legExtreme: bos.direction === 'bullish' ? candle.high : candle.low,
          bosIndex: i,
          expireIndex: i + maxAgeCandles,
        };
      }
    }
  }
  return trades;
}
