// dmiTrend.js
// Wilder's Directional Movement System (ADX/+DI/-DI, "New Concepts in
// Technical Trading Systems", 1978) — a genuinely different mechanism from
// everything else in this project: a published TREND-FOLLOWING system
// (like Turtle) rather than a mean-reversion or gap/zone-retracement one,
// and unlike Turtle it doesn't wait for a price-channel breakout, it reacts
// to which side of the market currently has more directional force.
//
// This project already computes ADX(14) Wilder + a 25 threshold for its
// market-regime classification (see data/backtest-input/market-regime-
// analysis.md) — reused here VERBATIM as an actual entry filter, so no new
// tuned threshold is introduced, only a new use of an already-decided
// convention.
//
// Method (published/standard conventions decided BEFORE looking at any
// result):
//   - Daily bars (same convention as RSI-2/Bollinger/RSI-divergence).
//   - +DM/-DM/TR computed the standard Wilder way, then Wilder-smoothed
//     (same smoothing recurrence as RSI's Wilder average) into +DI/-DI;
//     DX = 100*|+DI--DI|/(+DI+-DI); ADX = Wilder-smoothed average of DX.
//   - Entry: a fresh +DI/-DI crossover (edge-triggered) WHERE ADX is above
//     25 at the crossover (Wilder's own published rule: only take a DI
//     signal when ADX confirms a trend is actually underway). Long when
//     +DI crosses above -DI, short when -DI crosses above +DI. Entry at
//     the open of the day after confirmation (no-lookahead, same
//     next-candle convention as everywhere else).
//   - Exit: EITHER the initial stop (2xATR(14), reused exactly from
//     RSI-2/Turtle/RSI-divergence) OR a fresh crossover in the OPPOSITE
//     direction — regardless of ADX level this time, since Wilder's own
//     rule for exiting is "the trend that justified this position is
//     broken", not "a new trend has started" (that's a separate,
//     independently-gated question). If that opposite crossover also
//     clears the ADX threshold, the same event immediately opens a new
//     position in the new direction (Wilder's classic stop-and-reverse
//     behavior) — this falls out of the two rules above, it isn't a
//     separate mechanism.
//   - Deliberately NO fixed R:R target and NO holding-period cap: this is
//     a trend-following system by construction (like Turtle), and forcing
//     an early exit or a fixed profit target would understate exactly the
//     kind of long, large-move edge such a system is supposed to capture.
//     Known project lesson to watch for IF this shows an edge: Turtle
//     System 2's long median holding period (21-25 days) ended up blocking
//     the Divergence strategy through shared netting far more than it
//     contributed itself (see HANDOFF.md) — worth re-checking here before
//     ever combining this with the validated combo, not before judging the
//     signal's own quality first.
//   - One open position at a time (standalone edge-quality test, same
//     convention as every other exploratory script here).

import { computeAtrSeries } from './rsiDivergence.js';

export { computeAtrSeries };

export const DMI_PERIOD = 14;
export const ADX_THRESHOLD = 25; // same convention already used in market-regime-analysis.md
export const ATR_PERIOD = 14;
export const STOP_ATR_MULTIPLE = 2;

/** @returns {{plusDI:Array<number|null>, minusDI:Array<number|null>, adx:Array<number|null>}} */
export function computeDmiSeries(candles, period = DMI_PERIOD) {
  const n = candles.length;
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const adx = new Array(n).fill(null);
  if (n <= period) return { plusDI, minusDI, adx };

  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prevClose), Math.abs(candles[i].low - prevClose));
  }

  function diFrom(sPlus, sMinus, sTR) {
    const p = sTR > 0 ? (100 * sPlus) / sTR : 0;
    const m = sTR > 0 ? (100 * sMinus) / sTR : 0;
    return [p, m];
  }

  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let smoothTR = 0;
  for (let i = 1; i <= period; i++) {
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
    smoothTR += tr[i];
  }

  const dx = new Array(n).fill(null);
  let [p, m] = diFrom(smoothPlusDM, smoothMinusDM, smoothTR);
  plusDI[period] = p;
  minusDI[period] = m;
  dx[period] = p + m > 0 ? (100 * Math.abs(p - m)) / (p + m) : 0;

  for (let i = period + 1; i < n; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + tr[i];
    [p, m] = diFrom(smoothPlusDM, smoothMinusDM, smoothTR);
    plusDI[i] = p;
    minusDI[i] = m;
    dx[i] = p + m > 0 ? (100 * Math.abs(p - m)) / (p + m) : 0;
  }

  // ADX = Wilder-smoothed average of DX. First value = simple average of
  // the first `period` DX readings (indices period..2*period-1).
  const adxFirstIndex = 2 * period - 1;
  if (n > adxFirstIndex) {
    let sumDx = 0;
    for (let i = period; i <= adxFirstIndex; i++) sumDx += dx[i];
    let smoothAdx = sumDx / period;
    adx[adxFirstIndex] = smoothAdx;
    for (let i = adxFirstIndex + 1; i < n; i++) {
      smoothAdx = (smoothAdx * (period - 1) + dx[i]) / period;
      adx[i] = smoothAdx;
    }
  }

  return { plusDI, minusDI, adx };
}

/**
 * Edge-triggered +DI/-DI crossovers. `strong` flags whether ADX cleared
 * ADX_THRESHOLD at the moment of the crossover (used to gate ENTRIES only —
 * an exit fires on any opposite crossover regardless of `strong`).
 * @returns {Array<{index:number, direction:'bullish'|'bearish', strong:boolean}>}
 */
export function detectDmiCrossoverEvents(plusDI, minusDI, adx, adxThreshold = ADX_THRESHOLD) {
  const events = [];
  for (let i = 1; i < plusDI.length; i++) {
    if (plusDI[i] == null || minusDI[i] == null || plusDI[i - 1] == null || minusDI[i - 1] == null) continue;
    const bullishCross = plusDI[i] > minusDI[i] && plusDI[i - 1] <= minusDI[i - 1];
    const bearishCross = minusDI[i] > plusDI[i] && minusDI[i - 1] <= plusDI[i - 1];
    if (bullishCross) events.push({ index: i, direction: 'bullish', strong: adx[i] != null && adx[i] > adxThreshold });
    else if (bearishCross) events.push({ index: i, direction: 'bearish', strong: adx[i] != null && adx[i] > adxThreshold });
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on DAILY candles */
export function runDmiTrendBacktest(candles, opts = {}) {
  const {
    period = DMI_PERIOD,
    adxThreshold = ADX_THRESHOLD,
    atrPeriod = ATR_PERIOD,
    stopAtrMultiple = STOP_ATR_MULTIPLE,
  } = opts;

  const { plusDI, minusDI, adx } = computeDmiSeries(candles, period);
  const atr = computeAtrSeries(candles, atrPeriod);
  const events = detectDmiCrossoverEvents(plusDI, minusDI, adx, adxThreshold);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const day = candles[i];
    const signalIndex = i - 1;
    const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;

    // 1) Resolve an open position: initial stop, or a fresh OPPOSITE
    //    crossover confirmed yesterday (exit at today's open) — regardless
    //    of whether that crossover is "strong" (ADX-confirmed).
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

    // 2) Look for a new (ADX-confirmed) entry signal confirmed yesterday.
    //    Also fires on the same event that just closed an opposite
    //    position above (Wilder's stop-and-reverse) since `open` is now
    //    null and the event is still the same variable.
    if (!open && event && event.strong && atr[signalIndex] != null) {
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
