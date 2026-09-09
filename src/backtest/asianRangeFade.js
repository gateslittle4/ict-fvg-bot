// asianRangeFade.js
// ICT "Power of Three" / AMD (Accumulation-Manipulation-Distribution) — the
// mirror-image hypothesis to the already-tested Asian Range Breakout
// (scripts/runAsianRangeBreakoutStrategyAnalysis.js / asianRangeBreakout.js):
// that script asked "does a clean CLOSE beyond the Asian range keep going
// (continuation)?" and got a weak/mitigated answer; this asks the opposite
// question using the EXACT SAME range definition — "does a FAKE break
// beyond the range (a wick that reclaims) reverse instead (fade)?" — which
// is literally the published AMD model: Accumulation (the Asian range
// itself), Manipulation (a false move beyond it to run stops), Distribution
// (the real move, back the other way). Reusing the identical range-
// detection code keeps this a fair, low-new-parameter complement rather
// than a fresh, differently-tuned strategy.
//
// Method (published ICT concept — fxopen.com, tradingfinder.com,
// fluxcharts.com, innercircletrader.net, tradingstrategyguides.com all
// converge; gaps filled with this project's existing conventions):
//   - Accumulation = the Asian killzone range (20:00-00:00 NY), computed
//     with the SAME computeAsianRanges() used by Asian Range Breakout —
//     not reimplemented, imported directly.
//   - Manipulation = within the same 00:00-05:00 NY breakout window
//     already used by Asian Range Breakout, a candle whose wick pierces
//     one side of the range but whose CLOSE reclaims back inside it (the
//     same same-candle wick-then-reclaim convention already used by
//     liquiditySweep.js / judasSwing.js — not a new sweep definition).
//   - Distribution = the trade, in the direction OPPOSITE the sweep (fade
//     the false move): a sweep above rangeHigh that reclaims -> bearish;
//     a sweep below rangeLow that reclaims -> bullish. At most one signal
//     per direction per day (same convention as Judas Swing/Asian Range
//     Breakout).
//   - Entry at the open of the next candle (no-lookahead). Stop beyond
//     the sweep's own extreme (same convention as Judas Swing). Fixed
//     1:3 R:R target, 480 M15-candle timeout (same conventions as every
//     other strategy here).
//   - Same guard learned from smtDivergence.js: a signal whose resulting
//     stop would land on the wrong side of entry is discarded rather
//     than silently mis-signed (belt-and-suspenders here since entry is
//     always exactly one candle after the sweep candle itself, the same
//     bounded wait already checked safe for Judas Swing/Asian Range
//     Breakout — kept anyway as a permanent, cheap invariant).
//
// Tested on all 5 available instruments, same as Asian Range Breakout.

import { isInNySessionWindow } from './nySession.js';
import { computeAsianRanges, ASIAN_KILLZONE_WINDOW, BREAKOUT_WINDOW } from './asianRangeBreakout.js';

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', sweepExtreme:number}>}
 */
export function detectAsianRangeFadeEvents(candles, opts = {}) {
  const { sessionWindow = ASIAN_KILLZONE_WINDOW, breakoutWindow = BREAKOUT_WINDOW } = opts;
  const ranges = computeAsianRanges(candles, { sessionWindow });
  const firedToday = new Map();

  const events = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!isInNySessionWindow(candle.time, breakoutWindow.startHour, breakoutWindow.endHour)) continue;

    const dayKey = Math.floor(candle.time / DAY_MS);
    const range = ranges.get(dayKey - 1);
    if (!range) continue;

    if (!firedToday.has(dayKey)) firedToday.set(dayKey, new Set());
    const fired = firedToday.get(dayKey);

    // Sweep ABOVE the range that reclaims back inside -> fade DOWN (bearish).
    if (!fired.has('bearish') && candle.high > range.high && candle.close < range.high) {
      events.push({ index: i, direction: 'bearish', sweepExtreme: candle.high });
      fired.add('bearish');
    }
    // Sweep BELOW the range that reclaims back inside -> fade UP (bullish).
    if (!fired.has('bullish') && candle.low < range.low && candle.close > range.low) {
      events.push({ index: i, direction: 'bullish', sweepExtreme: candle.low });
      fired.add('bullish');
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runAsianRangeFadeBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectAsianRangeFadeEvents(candles, opts);
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

    // 2) New entry, one candle after the sweep-and-reclaim candle.
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
