// macdTrend.js
// MACD (Moving Average Convergence/Divergence, Gerald Appel, 1970s) crossover
// trend-following system — a genuinely different mechanism from everything
// else tested in this project. It looks superficially similar to the
// already-tested ADX/DMI trend system (both are "trend-following, entry on
// a crossover") but the signal itself is built from a completely different
// idea: MACD measures the SPREAD between two EMAs of price (momentum of the
// trend itself), while ADX/DMI measures which side (up-moves vs down-moves)
// currently dominates directional movement. Two different published
// mechanisms, not a re-tuning of one already tried.
//
// Method (published/standard conventions decided BEFORE looking at any
// result — Appel's own original defaults, never adjusted on this project's
// data):
//   - Daily bars (same convention as RSI-2/Bollinger/RSI-divergence/DMI).
//   - MACD line = EMA(close,12) - EMA(close,26); signal line = EMA(MACD
//     line, 9). These are Appel's own original parameters — the ones every
//     charting platform ships as the default — not something tuned here.
//   - Entry: a fresh MACD/signal-line crossover (edge-triggered), confirmed
//     by the CLOSE of the crossover day, entry at the OPEN of the next day
//     (no-lookahead, same next-candle convention as everywhere else in this
//     project). Long when MACD crosses above signal, short when signal
//     crosses above MACD. No extra confirmation filter added (e.g. no ADX
//     gate) — the point is to test the plain, standard mechanism as
//     published, not a hybrid.
//   - Exit: EITHER the initial stop (2xATR(14), reused exactly from
//     RSI-2/Turtle/RSI-divergence/DMI) OR a fresh crossover in the OPPOSITE
//     direction (stop-and-reverse, same convention as dmiTrend.js, since
//     this is also a trend-following mechanism with no natural profit
//     target of its own).
//   - Deliberately NO fixed R:R target and NO holding-period cap, for the
//     same reason as DMI: a trend-following system by construction, and
//     either would understate exactly the kind of long move it's meant to
//     capture. Same known project caveat applies IF this shows an edge: its
//     holding-period distribution needs checking before ever combining it
//     with the validated combo (see HANDOFF.md, Turtle System 2 lesson).
//   - One open position at a time (standalone signal-quality test, same
//     convention as every other exploratory script here).
//
// Tested on all 5 available instruments, same as DMI/OTE/RSI-divergence —
// a trend-following signal has no a priori reason to be limited to indices.

import { computeEMA } from './htfBias.js';
import { computeAtrSeries } from './rsiDivergence.js';

export { computeAtrSeries };

export const MACD_FAST_PERIOD = 12;
export const MACD_SLOW_PERIOD = 26;
export const MACD_SIGNAL_PERIOD = 9;
export const ATR_PERIOD = 14;
export const STOP_ATR_MULTIPLE = 2;

/** @returns {{macdLine:Array<number|null>, signalLine:Array<number|null>, histogram:Array<number|null>}} */
export function computeMacdSeries(
  candles,
  { fastPeriod = MACD_FAST_PERIOD, slowPeriod = MACD_SLOW_PERIOD, signalPeriod = MACD_SIGNAL_PERIOD } = {}
) {
  const closes = candles.map((c) => c.close);
  const emaFast = computeEMA(closes, fastPeriod);
  const emaSlow = computeEMA(closes, slowPeriod);
  const n = candles.length;

  const macdLine = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macdLine[i] = emaFast[i] - emaSlow[i];
  }

  const signalLine = new Array(n).fill(null);
  const histogram = new Array(n).fill(null);
  const firstDefined = macdLine.findIndex((v) => v != null);
  if (firstDefined !== -1) {
    // Once emaSlow (the longer of the two) is defined, macdLine has no more
    // gaps — safe to feed the contiguous tail straight into computeEMA().
    const tail = macdLine.slice(firstDefined);
    const signalTail = computeEMA(tail, signalPeriod);
    for (let j = 0; j < signalTail.length; j++) {
      if (signalTail[j] != null) {
        const i = firstDefined + j;
        signalLine[i] = signalTail[j];
        histogram[i] = macdLine[i] - signalTail[j];
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Edge-triggered MACD/signal-line crossovers.
 * @returns {Array<{index:number, direction:'bullish'|'bearish'}>}
 */
export function detectMacdCrossoverEvents(macdLine, signalLine) {
  const events = [];
  for (let i = 1; i < macdLine.length; i++) {
    if (macdLine[i] == null || signalLine[i] == null || macdLine[i - 1] == null || signalLine[i - 1] == null) continue;
    const bullishCross = macdLine[i] > signalLine[i] && macdLine[i - 1] <= signalLine[i - 1];
    const bearishCross = signalLine[i] > macdLine[i] && signalLine[i - 1] <= macdLine[i - 1];
    if (bullishCross) events.push({ index: i, direction: 'bullish' });
    else if (bearishCross) events.push({ index: i, direction: 'bearish' });
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on DAILY candles */
export function runMacdTrendBacktest(candles, opts = {}) {
  const {
    fastPeriod = MACD_FAST_PERIOD,
    slowPeriod = MACD_SLOW_PERIOD,
    signalPeriod = MACD_SIGNAL_PERIOD,
    atrPeriod = ATR_PERIOD,
    stopAtrMultiple = STOP_ATR_MULTIPLE,
  } = opts;

  const { macdLine, signalLine } = computeMacdSeries(candles, { fastPeriod, slowPeriod, signalPeriod });
  const atr = computeAtrSeries(candles, atrPeriod);
  const events = detectMacdCrossoverEvents(macdLine, signalLine);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const day = candles[i];
    const signalIndex = i - 1;
    const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;

    // 1) Resolve an open position: initial stop, or a fresh OPPOSITE
    //    crossover confirmed yesterday (exit at today's open) — same
    //    stop-and-reverse convention as dmiTrend.js.
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const reversalSignal = event && event.direction !== open.direction;
      if (hitStop || reversalSignal) {
        const exitPrice = hitStop ? open.stopPrice : day.open;
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome: rMultiple > 0 ? 'win' : 'loss', rMultiple });
        open = null;
      }
    }

    // 2) Look for a new entry signal confirmed yesterday (also fires on the
    //    same event that just closed an opposite position above).
    if (!open && event && atr[signalIndex] != null) {
      const bullish = event.direction === 'bullish';
      const entryPrice = day.open;
      const distance = stopAtrMultiple * atr[signalIndex];
      if (distance > 0) {
        const stopPrice = bullish ? entryPrice - distance : entryPrice + distance;
        open = { direction: event.direction, entryIndex: i, entryTime: day.time, entryPrice, stopPrice, distance };
      }
    }
  }
  return trades;
}
