// anchoredVwap.js
// Session-anchored VWAP mean-reversion — a quantitative (non-ICT) concept,
// genuinely new to this project: a running weighted average anchored to
// each NY calendar day's start, with standard-deviation bands, faded when
// price closes beyond the outer band. Distinct from the already-tested
// Bollinger/RSI mean-reversion (a STATIC lookback band, no session anchor,
// no price-weighting) and from the statistical Divergence mechanism (a
// cross-instrument spread z-score, not a single-instrument band).
//
// IMPORTANT DATA LIMITATION, stated up front rather than glossed over: this
// project's CSV data (see csvLoader.js) has NO volume column at all — these
// are forex/CFD feeds where "volume" is broker-specific tick count, not a
// real consolidated traded volume, and this project has never carried it.
// A textually accurate VWAP cannot be computed. This implementation
// substitutes each candle's OWN range (high - low) as the weight instead of
// volume — a documented range-as-activity proxy (wider-range candles imply
// more participants traded through that interval) — so what this file
// computes is properly a range-weighted anchored average, labelled "VWAP"
// only because that's the published name of the mechanism being tested.
// Results should be read with this substitution in mind.
//
// Method (published quantitative concept — crosstrade.io, luxalgo.com,
// trendspider.com, satotrades.com converge on the same mechanical
// description; gaps filled with this project's own existing conventions):
//   - Anchor resets at the start of every NY calendar day (DST-aware via
//     the existing toRealNyHourMinute()) — a session anchor, the standard
//     choice for intraday use per the source material ("for intraday index
//     futures, anchor VWAP to the session open"). Resets on the calendar
//     day boundary itself (not tied to finding an exact 00:00 candle, so a
//     data gap at the exact anchor minute can't silently carry a stale
//     running average into the new day).
//   - Running weighted mean of each candle's typical price
//     ((high+low+close)/3), and running weighted standard deviation around
//     it, both updated one candle at a time (the same single-pass method
//     real-time VWAP-band indicators use, not an invented two-pass exact
//     variance).
//   - Outer band = VWAP ± 2 standard deviations — the level the source
//     material calls "statistical extension, high-probability mean
//     reversion" (BAND_STDDEV = 2, matching the CBDR file's own use of the
//     "2x" level from ITS source material for the same reason).
//   - Signal = the first candle each day whose CLOSE confirms beyond the
//     outer band (source material: "a confirmed close beyond the outer
//     band" — not a bare wick touch). At most one signal per direction per
//     day (same convention as every other daily mechanism in this
//     project). Requires at least MIN_CANDLES_INTO_DAY candles of same-day
//     history first, so the band is a real distribution rather than a
//     near-zero-variance artifact from only one or two candles.
//   - Entry at the open of the candle AFTER the signal candle (one-candle
//     no-lookahead delay, same convention as NWOG/Asian Range Fade/Midnight
//     Open). Stop beyond the signal candle's OWN extreme (same "the candle
//     that created the setup defines its own risk" convention used
//     everywhere else). Target = the CURRENT VWAP value at signal time —
//     same "target is a specific level, not a synthetic R:R multiple"
//     convention already used by midnightOpen.js, since the published rule
//     itself names the average as the exit, not a chosen ratio.
//   - Same guard learned from smtDivergence.js/NWOG/Midnight Open: a signal
//     whose stop or target would land on the wrong side of entry is
//     discarded rather than silently mis-signed.
//
// Tested on all available instruments.

import { toRealNyHourMinute } from './nySession.js';

export const BAND_STDDEV = 2;
export const MIN_CANDLES_INTO_DAY = 4;
export const MAX_HOLDING_CANDLES = 480;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{vwap:number, stdDev:number, candlesIntoDay:number}|null>}
 *   parallel to `candles` — null before any weight has accumulated for that day.
 */
export function computeAnchoredVwapSeries(candles) {
  let dayKey = null;
  let sumWeight = 0;
  let sumWeightedPrice = 0;
  let sumWeightedSqDiff = 0;
  let candlesIntoDay = 0;
  const series = [];

  for (const candle of candles) {
    const thisDayKey = Math.floor(candle.time / DAY_MS);
    if (thisDayKey !== dayKey) {
      dayKey = thisDayKey;
      sumWeight = 0;
      sumWeightedPrice = 0;
      sumWeightedSqDiff = 0;
      candlesIntoDay = 0;
    }
    candlesIntoDay++;

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const weight = Math.max(candle.high - candle.low, 0);
    if (weight > 0) {
      sumWeight += weight;
      sumWeightedPrice += weight * typicalPrice;
    }

    if (sumWeight > 0) {
      const vwap = sumWeightedPrice / sumWeight;
      if (weight > 0) sumWeightedSqDiff += weight * (typicalPrice - vwap) ** 2;
      const stdDev = Math.sqrt(sumWeightedSqDiff / sumWeight);
      series.push({ vwap, stdDev, candlesIntoDay });
    } else {
      series.push(null);
    }
  }
  return series;
}

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number, target:number}>}
 */
export function detectAnchoredVwapEvents(candles, opts = {}) {
  const { bandStdDev = BAND_STDDEV, minCandlesIntoDay = MIN_CANDLES_INTO_DAY } = opts;
  const series = computeAnchoredVwapSeries(candles);
  const firedByDay = new Map();

  const events = [];
  for (let i = 0; i < candles.length; i++) {
    const point = series[i];
    if (!point || point.candlesIntoDay < minCandlesIntoDay || point.stdDev <= 0) continue;

    const candle = candles[i];
    const dayKey = Math.floor(candle.time / DAY_MS);
    if (!firedByDay.has(dayKey)) firedByDay.set(dayKey, new Set());
    const fired = firedByDay.get(dayKey);

    const upperBand = point.vwap + bandStdDev * point.stdDev;
    const lowerBand = point.vwap - bandStdDev * point.stdDev;

    if (!fired.has('bearish') && candle.close > upperBand) {
      events.push({ index: i, direction: 'bearish', stopReference: candle.high, target: point.vwap });
      fired.add('bearish');
    }
    if (!fired.has('bullish') && candle.close < lowerBand) {
      events.push({ index: i, direction: 'bullish', stopReference: candle.low, target: point.vwap });
      fired.add('bullish');
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runAnchoredVwapBacktest(candles, opts = {}) {
  const { maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectAnchoredVwapEvents(candles, opts);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const signalIndex = i - 1;
    const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;

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

    // 2) New entry, one candle after the signal candle.
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = event.stopReference;
      const targetPrice = event.target;
      const distance = Math.abs(entryPrice - stopPrice);
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      const validTargetSide = bullish ? targetPrice > entryPrice : targetPrice < entryPrice;
      if (distance > 0 && validStopSide && validTargetSide) {
        open = {
          direction: event.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
        };
      }
    }
  }
  return trades;
}
