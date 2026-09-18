// cbdr.js
// ICT "Central Bank Dealer Range" (CBDR) standard-deviation projections —
// a genuinely new mechanism for this project: instead of a range that gets
// broken or swept, this treats a session's range HEIGHT as one "standard
// deviation" and projects multiples of it forward to anticipate where the
// FOLLOWING trading day likely reverses.
//
// Method (published ICT concept — tradingfinder.com, liquidityscan.io,
// innercircletrader.net, writofinance.com all converge on the same
// mechanical description; gaps filled with this project's own existing
// conventions, nothing invented or tuned on this project's own data):
//   - CBDR = the high/low of all M15 candles between 14:00 and 20:00 NY
//     local time (ICT's own published window) for one NY calendar day —
//     computed with the EXISTING computeAsianRanges() helper
//     (asianRangeBreakout.js), just given a different sessionWindow, not
//     reimplemented.
//   - The CBDR's own height (high - low) is treated as "1 standard
//     deviation". Projections: rangeHigh + n*height (upside) and
//     rangeLow - n*height (downside), for n = 1, 2, 3.
//   - Published tendency: most sessions resolve within the 2x-3x band —
//     "the high of the day will not exceed 2 standard deviations... some
//     sessions push to 3 before reversing". This is used here as a FADE
//     (reversal) trigger at the 2x projection (STANDARD_DEVIATIONS = 2,
//     the level the source material calls out as the natural first
//     target/reversal zone), the same "sweep an extreme -> reverse"
//     structure already used by Asian Range Fade/Judas Swing, just against
//     a projected level instead of a session extreme.
//   - The published "ideal CBDR height 20-40 pips" filter is deliberately
//     NOT applied here — "pips" is a forex-specific quoting convention that
//     doesn't translate cleanly to indices (US100/US500/GER40) quoted in
//     whole points, and this project tests broadly rather than pre-filter
//     with an untested, instrument-specific threshold (known limitation,
//     not an oversight).
//   - First candle (after the CBDR session itself closes, looking through
//     the following day's own CBDR open at 14:00 NY) whose HIGH reaches the
//     upside 2x projection is a bearish fade signal; whose LOW reaches the
//     downside 2x projection is a bullish fade signal. At most one signal
//     per direction per CBDR cycle (same "one defining move" convention as
//     Judas Swing/Asian Range Breakout/Fade).
//   - Entry at the open of the candle AFTER the touch candle (one-candle
//     no-lookahead delay, same convention as NWOG/Asian Range Fade).
//   - Stop beyond the touch candle's OWN extreme — same "the candle that
//     created the setup defines its own risk" convention used everywhere
//     else in this project.
//   - Fixed 1:3 R:R target, 480 M15-candle timeout (same conventions as
//     every other strategy here — unlike Midnight Open, the published CBDR
//     rule doesn't name a specific target level, so this reuses the
//     project's default R:R convention rather than inventing a new one).
//   - Same guard learned from smtDivergence.js/NWOG: a signal whose
//     resulting stop would land on the wrong side of entry is discarded
//     rather than silently mis-signed.
//
// Tested on all available instruments.

import { computeAsianRanges } from './asianRangeBreakout.js';
import { toRealNyHourMinute } from './nySession.js';

export const CBDR_WINDOW = { startHour: 14, endHour: 20 }; // NY local time — ICT's own published CBDR window
export const STANDARD_DEVIATIONS = 2; // the published "natural first target/reversal zone"
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', sweepExtreme:number}>}
 */
export function detectCbdrEvents(candles, opts = {}) {
  const { cbdrWindow = CBDR_WINDOW, standardDeviations = STANDARD_DEVIATIONS } = opts;
  const ranges = computeAsianRanges(candles, { sessionWindow: cbdrWindow });
  const firedByCycle = new Map();

  const events = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const { hour } = toRealNyHourMinute(candle.time);
    if (hour >= cbdrWindow.startHour && hour < cbdrWindow.endHour) continue; // inside the CBDR window itself, not the touch phase

    const dayKey = Math.floor(candle.time / DAY_MS);
    // A touch candle before this day's own CBDR opens (hour < 14) belongs to
    // the PREVIOUS calendar day's completed CBDR cycle; one at/after 20:00
    // belongs to THIS calendar day's own just-closed CBDR (same dayKey
    // lookup asianRangeFade.js uses for its Asian-range-spans-midnight case).
    const cycleKey = hour < cbdrWindow.startHour ? dayKey - 1 : dayKey;
    const range = ranges.get(cycleKey);
    if (!range) continue;
    const height = range.high - range.low;
    if (height <= 0) continue;

    if (!firedByCycle.has(cycleKey)) firedByCycle.set(cycleKey, new Set());
    const fired = firedByCycle.get(cycleKey);

    const upperProjection = range.high + standardDeviations * height;
    const lowerProjection = range.low - standardDeviations * height;

    // Touches the upside projection -> fade DOWN (bearish).
    if (!fired.has('bearish') && candle.high >= upperProjection) {
      events.push({ index: i, direction: 'bearish', sweepExtreme: candle.high });
      fired.add('bearish');
    }
    // Touches the downside projection -> fade UP (bullish).
    if (!fired.has('bullish') && candle.low <= lowerProjection) {
      events.push({ index: i, direction: 'bullish', sweepExtreme: candle.low });
      fired.add('bullish');
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runCbdrBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectCbdrEvents(candles, opts);
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

    // 2) New entry, one candle after the touch candle.
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = event.sweepExtreme;
      const distance = Math.abs(entryPrice - stopPrice);
      const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
      if (distance > 0 && validStopSide) {
        const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
        open = {
          direction: event.direction,
          entryIndex: i,
          entryTime: candle.time,
          entryPrice,
          stopPrice,
          targetPrice,
          distance,
          rrMultiple,
        };
      }
    }
  }
  return trades;
}
