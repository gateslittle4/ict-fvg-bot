// powerOfThree.js
// ICT "Power of Three" / AMD as its full, genuinely 3-SESSION model —
// distinct from the already-tested Asian Range Fade (asianRangeFade.js),
// which conflates Manipulation and Distribution into a single continuous
// 00:00-05:00 window and enters immediately on the candle right after the
// sweep, wherever that happens to fall. ICT's own published AMD teaching
// (fxopen.com, tradingfinder.com, fluxcharts.com, innercircletrader.net,
// tradingstrategyguides.com) describes three SEPARATE sessions, each with
// its own role:
//   - Accumulation: the Asian killzone range (20:00-00:00 NY) - the
//     consolidation the rest of the day reacts to.
//   - Manipulation: the London killzone (02:00-05:00 NY - ICT's own
//     published London killzone, the SAME constant already used by
//     judasSwing.js, imported directly rather than redefined) - a false
//     break of the Asian range to run stops.
//   - Distribution: the NY AM killzone (08:00-11:00 NY - ICT's own
//     published New York AM session, a DIFFERENT window from the already-
//     used Silver Bullet 10:00-11:00 sub-window and the London-NY overlap
//     07:00-10:00 window, chosen here as the commonly-cited broader NY AM
//     killzone, fixed before running anything) - where the REAL move of
//     the day is expected to happen.
// The genuinely new element under test: the trade is NOT entered right
// after the manipulation sweep (as Asian Range Fade does) - it is deferred
// until the SEPARATE Distribution session actually begins, testing whether
// the 3-phase structure itself (wait for the right session, not just any
// reclaim) is what carries the edge.
//
// Method (gaps filled with this project's existing conventions - nothing
// new invented beyond the window split described above):
//   1. Accumulation range: computeAsianRanges() from asianRangeBreakout.js,
//      reused verbatim.
//   2. Manipulation: within the London killzone, the same same-candle
//      wick-then-reclaim sweep of the PRIOR day's Asian range already used
//      by asianRangeFade.js/Judas Swing (a wick pierces one side of the
//      range, the close reclaims back inside) - at most one signal per
//      direction per day.
//   3. Distribution/entry: at the OPEN of the FIRST candle of the SAME
//      calendar day that falls inside the NY AM killzone, provided a
//      same-day manipulation event already fired (no trade if the NY
//      window arrives with no manipulation behind it). This is the delay
//      genuinely under test - not a new invented trigger, just gating the
//      already-existing next-candle-open convention to the correct later
//      session instead of the very next candle.
//   4. Stop beyond the manipulation sweep's own extreme (same convention
//      as Judas Swing/Asian Range Fade). Fixed 1:3 R:R, 480 M15-candle
//      timeout (same conventions as everywhere else).
//   5. Same guard learned from smtDivergence.js: a signal whose resulting
//      stop would land on the wrong side of entry is discarded.
//
// Tested on all available instruments, same as Asian Range Breakout/Fade.

import { isInNySessionWindow } from './nySession.js';
import { computeAsianRanges, ASIAN_KILLZONE_WINDOW } from './asianRangeBreakout.js';
import { LONDON_KILLZONE_WINDOW } from './judasSwing.js';

export const MANIPULATION_WINDOW = LONDON_KILLZONE_WINDOW; // 02:00-05:00 NY - reused verbatim, not redefined
export const DISTRIBUTION_WINDOW = { startHour: 8, endHour: 11 }; // NY AM killzone - ICT's own published session, fixed before any result
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{manipulationIndex:number, entryIndex:number, direction:'bullish'|'bearish', sweepExtreme:number}>}
 *   one entry per day/direction where BOTH a manipulation sweep AND a later
 *   same-day distribution-window candle were found, chronological.
 */
export function detectPowerOfThreeEvents(candles, opts = {}) {
  const {
    accumulationWindow = ASIAN_KILLZONE_WINDOW,
    manipulationWindow = MANIPULATION_WINDOW,
    distributionWindow = DISTRIBUTION_WINDOW,
  } = opts;
  const ranges = computeAsianRanges(candles, { sessionWindow: accumulationWindow });

  const pendingByDay = new Map(); // dayKey -> { bullish?: {index,sweepExtreme}, bearish?: {...} }
  const events = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const dayKey = Math.floor(candle.time / DAY_MS);

    if (isInNySessionWindow(candle.time, manipulationWindow.startHour, manipulationWindow.endHour)) {
      const range = ranges.get(dayKey - 1);
      if (range) {
        if (!pendingByDay.has(dayKey)) pendingByDay.set(dayKey, {});
        const pending = pendingByDay.get(dayKey);
        if (!pending.bearish && candle.high > range.high && candle.close < range.high) {
          pending.bearish = { index: i, sweepExtreme: candle.high };
        }
        if (!pending.bullish && candle.low < range.low && candle.close > range.low) {
          pending.bullish = { index: i, sweepExtreme: candle.low };
        }
      }
    }

    if (isInNySessionWindow(candle.time, distributionWindow.startHour, distributionWindow.endHour)) {
      const pending = pendingByDay.get(dayKey);
      if (pending) {
        for (const direction of ['bullish', 'bearish']) {
          if (pending[direction] && !pending[direction].consumed) {
            events.push({
              manipulationIndex: pending[direction].index,
              entryIndex: i,
              direction,
              sweepExtreme: pending[direction].sweepExtreme,
            });
            pending[direction].consumed = true;
          }
        }
      }
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runPowerOfThreeBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectPowerOfThreeEvents(candles, opts);
  const eventsByEntryIndex = new Map();
  for (const e of events) {
    if (!eventsByEntryIndex.has(e.entryIndex)) eventsByEntryIndex.set(e.entryIndex, []);
    eventsByEntryIndex.get(e.entryIndex).push(e);
  }

  const trades = [];
  let open = null;

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

    // 2) Entry at the open of this candle, if it's the first distribution-window
    //    candle for a manipulation event that fired earlier today.
    if (!open) {
      const todaysEvents = eventsByEntryIndex.get(i);
      if (todaysEvents && todaysEvents.length > 0) {
        const event = todaysEvents[0]; // one open position at a time - first direction wins if both fired
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
  }
  return trades;
}
