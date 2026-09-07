// asianRangeBreakout.js
// ICT "Asian Range Breakout" — a SECOND genuinely new ICT concept added this
// session, deliberately a BREAKOUT/continuation mechanism rather than a
// reversal, to be methodologically distinct from Judas Swing (see
// judasSwing.js) even though both use a "previous session's range" idea:
//   - Judas Swing: PDH/PDL (previous CALENDAR DAY), a SWEEP-then-RECLAIM
//     (reversal) during the London killzone (02:00-05:00 NY).
//   - This: the ICT Asian killzone range (20:00-00:00 NY, a DIFFERENT
//     ICT-published killzone, not yet used anywhere in this project), a
//     CLOSE beyond that range (continuation, no reclaim) during the
//     Asian-close-to-London-killzone window (00:00-05:00 NY).
// Also distinct from the already-tested ORB (Opening Range Breakout,
// rejected): ORB uses the NY CASH EQUITY open (09:30-10:00 NY) and forces a
// same-day close at 16:00 NY (a true day trade) — this uses the ICT Asian
// session and is allowed to run for the same 480 M15-candle timeout used by
// FVG/OTE/Judas Swing (an overnight/multi-session setup, not a day trade).
//
// Method (published/standard ICT + classic breakout conventions, fixed
// BEFORE looking at any result on this project's data):
//   - M15 bars.
//   - Asian range = high/low of all M15 candles inside the ICT Asian
//     killzone (20:00-00:00 NY time, DST-aware via the existing
//     isInNySessionWindow()) for one NY calendar day.
//   - Breakout window = 00:00-05:00 NY time of the FOLLOWING day (Asian
//     close through the end of the London killzone) — the first candle in
//     this window whose CLOSE is beyond the Asian range high/low is a
//     signal (bullish/bearish respectively). At most one signal per
//     direction per day (same "one defining move" convention as Judas
//     Swing), determined via the previous-day range lookup the same way
//     PDH/PDL is looked up in judasSwing.js.
//   - Entry at the OPEN of the next candle after the signal (no-lookahead).
//   - Stop = the OPPOSITE side of the Asian range itself — the classic ORB
//     stop-placement convention already used in this project
//     (scripts/runOrbStrategyAnalysis.js: "the range defines its own
//     risk"), reused here rather than inventing a new stop rule.
//   - Fixed 1:3 R:R target and the same 480 M15-candle timeout already used
//     for FVG/OTE/Judas Swing (reused conventions, not new parameters).
//
// Tested on all 5 available instruments, same as every other exploratory
// script here.

import { isInNySessionWindow } from './nySession.js';

export const ASIAN_KILLZONE_WINDOW = { startHour: 20, endHour: 24 }; // NY local time — ICT's own published Asian killzone
export const BREAKOUT_WINDOW = { startHour: 0, endHour: 5 }; // Asian close through end of London killzone, NY local time
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480; // same M15 timeout convention as FVG/OTE/Judas Swing

const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns {Map<number, {high:number, low:number}>} dayKey -> Asian range for that NY calendar day */
export function computeAsianRanges(candles, { sessionWindow = ASIAN_KILLZONE_WINDOW } = {}) {
  const ranges = new Map();
  for (const candle of candles) {
    if (!isInNySessionWindow(candle.time, sessionWindow.startHour, sessionWindow.endHour)) continue;
    const dayKey = Math.floor(candle.time / DAY_MS);
    const existing = ranges.get(dayKey);
    if (!existing) {
      ranges.set(dayKey, { high: candle.high, low: candle.low });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
    }
  }
  return ranges;
}

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', rangeHigh:number, rangeLow:number}>}
 */
export function detectAsianRangeBreakoutEvents(candles, opts = {}) {
  const { sessionWindow = ASIAN_KILLZONE_WINDOW, breakoutWindow = BREAKOUT_WINDOW } = opts;
  const ranges = computeAsianRanges(candles, { sessionWindow });
  const firedToday = new Map(); // dayKey -> Set of directions already fired

  const events = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!isInNySessionWindow(candle.time, breakoutWindow.startHour, breakoutWindow.endHour)) continue;

    const dayKey = Math.floor(candle.time / DAY_MS);
    const range = ranges.get(dayKey - 1); // the Asian session that closed just before this breakout window opened
    if (!range) continue;

    if (!firedToday.has(dayKey)) firedToday.set(dayKey, new Set());
    const fired = firedToday.get(dayKey);

    if (!fired.has('bullish') && candle.close > range.high) {
      events.push({ index: i, direction: 'bullish', rangeHigh: range.high, rangeLow: range.low });
      fired.add('bullish');
    }
    if (!fired.has('bearish') && candle.close < range.low) {
      events.push({ index: i, direction: 'bearish', rangeHigh: range.high, rangeLow: range.low });
      fired.add('bearish');
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runAsianRangeBreakoutBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectAsianRangeBreakoutEvents(candles, opts);
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

    // 2) Look for a new entry signal confirmed by yesterday's/last candle's close (one open position at a time).
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = bullish ? event.rangeLow : event.rangeHigh; // opposite side of the Asian range, classic ORB convention
      const distance = Math.abs(entryPrice - stopPrice);
      if (distance > 0) {
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
