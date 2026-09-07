// judasSwing.js
// ICT "Judas Swing" — a specific, well-documented ICT killzone pattern,
// genuinely different from every mechanism already tried in this project
// (including the already-tested Order Block, IFVG, Turtle Soup and the
// liquidity-sweep CONFLUENCE FILTER already wrapped around FVG):
//   - It is anchored to a FIXED reference level — the PREVIOUS COMPLETE
//     day's high/low (PDH/PDL) — not a symmetric-fractal swing pivot like
//     liquiditySweep.js/marketStructure.js use for their filters.
//   - It is scoped to a SPECIFIC killzone (ICT's own published London
//     killzone, 02:00-05:00 NY time — distinct from the Silver Bullet
//     10:00-11:00 and London-NY overlap 07:00-10:00 windows already used
//     for the validated FVG configs), because the Judas Swing is
//     specifically an ICT concept about session-OPEN manipulation, not an
//     any-time-of-day confluence check.
//   - It is tested here as its OWN standalone entry mechanism (sweep +
//     same-candle reclaim triggers the trade directly), not as a filter
//     bolted onto an existing FVG signal.
//
// Method (published/standard ICT concept, made concrete with conventions
// already decided elsewhere in this project — nothing tuned on this
// project's own data):
//   - M15 bars (project's live/production timeframe).
//   - PDH/PDL = the previous COMPLETE calendar day's high/low, computed via
//     the SAME daily resampling already used project-wide for every
//     "daily bar" exploratory script (resampleCandles(candles, DAY_MS)) —
//     no new day-boundary convention introduced.
//   - Within the London killzone (02:00-05:00 NY, DST-aware via the
//     existing isInNySessionWindow()), a single candle whose HIGH exceeds
//     PDH but whose CLOSE reclaims back below it is a bearish Judas Swing;
//     the mirror (LOW breaks below PDL, CLOSE reclaims back above it) is
//     bullish. Same same-candle wick-then-reclaim definition already used
//     by liquiditySweep.js's own sweep detector — not a new convention.
//   - At most one signal per direction per day (the Judas Swing is meant to
//     be THE defining manipulation move of the killzone, not every
//     subsequent wick through the level).
//   - Entry at the OPEN of the next candle after the reclaim (no-lookahead,
//     same next-candle convention as everywhere else).
//   - Stop beyond the sweep's own extreme (the wick that broke PDH/PDL) —
//     if that level gets taken out again, the setup is invalidated.
//   - Fixed 1:3 R:R target and the same 480 M15-candle timeout already used
//     for FVG/OTE (reused conventions, not new parameters), rather than
//     ICT's more subjective "target the opposite liquidity pool" idea,
//     which would require a new, undecided-in-advance rule.
//
// Tested on all 5 available instruments, same as every other exploratory
// script here — an ICT session-timing pattern has no a priori reason to be
// limited to the indices/gold.

import { resampleCandles } from './htfBias.js';
import { isInNySessionWindow } from './nySession.js';

export const LONDON_KILLZONE_WINDOW = { startHour: 2, endHour: 5 }; // NY local time — ICT's own published London killzone
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480; // same M15 timeout convention as FVG/OTE

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish', referenceLevel:number, sweepExtreme:number}>}
 */
export function detectJudasSwingEvents(candles, { sessionWindow = LONDON_KILLZONE_WINDOW } = {}) {
  const daily = resampleCandles(candles, DAY_MS);
  const dailyByKey = new Map(daily.map((d) => [Math.floor(d.time / DAY_MS), d]));
  const firedToday = new Map(); // dayKey -> Set of directions already fired this day

  const events = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!isInNySessionWindow(candle.time, sessionWindow.startHour, sessionWindow.endHour)) continue;

    const dayKey = Math.floor(candle.time / DAY_MS);
    const prevDay = dailyByKey.get(dayKey - 1);
    if (!prevDay) continue; // no complete previous day known yet (start of dataset)
    const { high: pdh, low: pdl } = prevDay;

    if (!firedToday.has(dayKey)) firedToday.set(dayKey, new Set());
    const fired = firedToday.get(dayKey);

    if (!fired.has('bearish') && candle.high > pdh && candle.close < pdh) {
      events.push({ index: i, direction: 'bearish', referenceLevel: pdh, sweepExtreme: candle.high });
      fired.add('bearish');
    }
    if (!fired.has('bullish') && candle.low < pdl && candle.close > pdl) {
      events.push({ index: i, direction: 'bullish', referenceLevel: pdl, sweepExtreme: candle.low });
      fired.add('bullish');
    }
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runJudasSwingBacktest(candles, opts = {}) {
  const { sessionWindow = LONDON_KILLZONE_WINDOW, rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectJudasSwingEvents(candles, { sessionWindow });
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

    // 2) Look for a new entry signal confirmed yesterday's candle (one open position at a time).
    if (!open && event) {
      const bullish = event.direction === 'bullish';
      const entryPrice = candle.open;
      const stopPrice = event.sweepExtreme;
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
