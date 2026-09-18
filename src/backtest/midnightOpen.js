// midnightOpen.js
// ICT "Midnight Open" / "True Day" retracement — a genuinely new mechanism
// for this project: unlike every existing strategy here (FVG, NWOG, Judas
// Swing, Asian Range Breakout/Fade, ...), which all key off a RANGE (a
// high/low pair) or a GAP, this keys off a single PRICE LEVEL — the open of
// the 00:00 New York candle — and bets on a well-documented tendency for
// price to return and tap that level before the day's real move continues.
//
// Method (published ICT concept — edgeful.com's "midnight open retracement"
// report and ictkillzone.com converge on the same mechanical description;
// gaps filled with this project's own existing conventions, nothing invented
// or tuned on this project's own data):
//   - Midnight open = the OPEN of the first M15 candle whose real New York
//     local time is exactly 00:00 (DST-aware via the existing
//     toRealNyHourMinute(), same helper used by nySession.js/judasSwing.js).
//   - Bias, checked once at the START of the London killzone
//     (LONDON_KILLZONE_WINDOW, 02:00-05:00 NY — reused verbatim from
//     judasSwing.js, not redefined, same as powerOfThree.js already does):
//     if price at that moment is ABOVE the midnight open, the published
//     tendency is a retracement DOWN to tap it (bearish bet); if BELOW, a
//     retracement UP (bullish bet). (The source material also describes an
//     equivalent NY-cash-equity-session variant, 09:30-16:00 NY — skipped
//     here since this project's own ORB test already found that specific
//     NY-cash-open framing weak for 24-hour-quoted CFD indices; the London
//     killzone variant is used instead, consistent with every other
//     killzone-based mechanism already in this project.)
//   - Entry at the open of the candle AFTER the killzone-open candle
//     (one-candle no-lookahead delay, same convention as NWOG/Asian Range
//     Fade/Judas Swing).
//   - Stop beyond the killzone-open candle's OWN extreme (its high for a
//     bearish bet, its low for a bullish one) — the same "the candle that
//     created the setup defines its own risk" convention used everywhere
//     else in this project, since the published rule itself names no stop.
//   - Target = the midnight open level ITSELF, not a synthetic R:R multiple
//     — this is the one mechanism in this project whose reward is a fixed
//     external price level rather than a chosen multiple of risk (matches
//     the published rule literally: "exit at the level"). rMultiple is
//     still computed the normal way (signed move / initial risk distance)
//     so it composes with the existing summarizeTrades()/journal pipeline
//     unchanged — it's just not FORCED to any particular ratio.
//   - At most one signal per NY calendar day (same "one defining move per
//     day" convention as Judas Swing/Asian Range Breakout/Fade).
//   - Same guard learned from smtDivergence.js/NWOG: a signal whose target
//     or stop would land on the wrong side of entry is discarded rather
//     than silently mis-signed.
//
// Tested on all available instruments.

import { toRealNyHourMinute } from './nySession.js';
import { LONDON_KILLZONE_WINDOW } from './judasSwing.js';

export const RETRACEMENT_WINDOW = LONDON_KILLZONE_WINDOW; // 02:00-05:00 NY, reused verbatim
export const MAX_HOLDING_CANDLES = 480; // same M15 timeout convention as every other strategy here

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', stopReference:number, target:number}>}
 *   `index` = the killzone-open candle used to establish the bias (entry happens one candle later).
 */
export function detectMidnightOpenRetracementEvents(candles, { retracementWindow = RETRACEMENT_WINDOW } = {}) {
  const midnightOpenByDay = new Map();
  const firedByDay = new Set();
  const events = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const { hour, minute } = toRealNyHourMinute(candle.time);
    const dayKey = Math.floor(candle.time / DAY_MS);

    if (hour === 0 && minute === 0 && !midnightOpenByDay.has(dayKey)) {
      midnightOpenByDay.set(dayKey, candle.open);
      continue; // the anchor candle itself is never also a signal candle
    }

    const decimalHour = hour + minute / 60;
    if (decimalHour !== retracementWindow.startHour) continue; // only the FIRST candle of the window establishes the bias
    if (firedByDay.has(dayKey)) continue;
    const midnightOpen = midnightOpenByDay.get(dayKey);
    if (midnightOpen === undefined) continue; // no anchor seen today (data gap) - skip rather than guess

    const windowOpenPrice = candle.open;
    if (windowOpenPrice === midnightOpen) continue; // no bias, degenerate distance
    const direction = windowOpenPrice > midnightOpen ? 'bearish' : 'bullish';
    firedByDay.add(dayKey);
    events.push({
      index: i,
      direction,
      stopReference: direction === 'bearish' ? candle.high : candle.low,
      target: midnightOpen,
    });
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades */
export function runMidnightOpenRetracementBacktest(candles, opts = {}) {
  const { maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectMidnightOpenRetracementEvents(candles, opts);
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

    // 2) New entry, one candle after the killzone-open (bias) candle.
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
