// bollingerSqueeze.js
// Bollinger Band Squeeze breakout — a genuinely new mechanism family for
// this project. Everything tried so far falls into one of: ICT liquidity
// concepts (FVG/Judas Swing/NWOG/Breaker Block), moving-average trend
// crossover (DMI/MACD/Turtle channel — all rejected), or RSI mean-reversion
// (Connors/Bollinger+RSI). This is none of those: it trades a VOLATILITY
// regime change (compression -> expansion), not a price level, a crossover,
// or an oscillator extreme.
//
// Concept (John Bollinger's original "squeeze" observation, standardized
// and popularized as the "TTM Squeeze" by John Carter in "Mastering the
// Trade" — the same two published parameter sets everywhere this concept is
// described, not invented here):
//   1. Bollinger Bands(20, 2): SMA(20) +/- 2 standard deviations.
//   2. Keltner Channels(20, 1.5xATR(20)): EMA(20) +/- 1.5xATR(20).
//   3. "Squeeze ON" when the Bollinger Bands sit ENTIRELY INSIDE the Keltner
//      Channel (volatility compressed below its own recent normal range).
//   4. Signal fires on the bar the squeeze turns OFF (bands expand back
//      outside the channel) — the release. Direction = sign of
//      close - SMA(20) at the release bar (standard simplified squeeze
//      direction rule; the full TTM Squeeze uses a momentum histogram
//      instead, but that adds a discretionary linear-regression choice this
//      project's discipline would rather not introduce for a first test).
//   5. Entry at the NEXT candle's open (no-lookahead, same convention as
//      every other script here). Stop = 1.5xATR(14) from entry — reusing
//      Divergence's EXACT existing stop convention (stopAtrMultiple=1.5,
//      atrPeriod=14) rather than inventing a third ATR period on top of the
//      two the squeeze definition itself already needs (14 for the stop,
//      20 for the channel — both are somebody else's published defaults,
//      not tuned here). Fixed 1:3 R:R target, 480 M15-candle timeout — the
//      same conventions already used by FVG/Judas Swing/NWOG/Weekly Sweep.
//   6. Same guard already learned from smtDivergence.js: a signal whose
//      resulting stop would land on the wrong side of entry is discarded,
//      never silently mis-signed.

import { computeEMA } from './htfBias.js';
import { computeAtrSeries } from './rsiDivergence.js';

const BB_PERIOD = 20;
const BB_STDDEV_MULTIPLE = 2;
const KC_PERIOD = 20;
const KC_ATR_MULTIPLE = 1.5;
const STOP_ATR_PERIOD = 14;
const STOP_ATR_MULTIPLE = 1.5; // same value as Divergence's own stopAtrMultiple - not a coincidence, reused on purpose

export const RR_MULTIPLE = 3;
export const MAX_HOLDING_CANDLES = 480;

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

/** Population standard deviation over a rolling window, against the window's own SMA (standard Bollinger Band definition). */
function computeRollingStdDev(values, period, sma) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    if (sma[i] === null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (values[j] - sma[i]) ** 2;
    out[i] = Math.sqrt(sumSq / period);
  }
  return out;
}

/**
 * @param {Array<{time:number, open:number, high:number, low:number, close:number}>} candles
 * @returns {{bbUpper:(number|null)[], bbLower:(number|null)[], sma20:(number|null)[], kcUpper:(number|null)[], kcLower:(number|null)[]}}
 */
export function computeSqueezeBands(candles) {
  const closes = candles.map((c) => c.close);
  const sma20 = computeSma(closes, BB_PERIOD);
  const stdDev = computeRollingStdDev(closes, BB_PERIOD, sma20);
  const bbUpper = sma20.map((m, i) => (m === null || stdDev[i] === null ? null : m + BB_STDDEV_MULTIPLE * stdDev[i]));
  const bbLower = sma20.map((m, i) => (m === null || stdDev[i] === null ? null : m - BB_STDDEV_MULTIPLE * stdDev[i]));

  const ema20 = computeEMA(closes, KC_PERIOD);
  const atr20 = computeAtrSeries(candles, KC_PERIOD);
  const kcUpper = ema20.map((m, i) => (m === null || atr20[i] == null ? null : m + KC_ATR_MULTIPLE * atr20[i]));
  const kcLower = ema20.map((m, i) => (m === null || atr20[i] == null ? null : m - KC_ATR_MULTIPLE * atr20[i]));

  return { bbUpper, bbLower, sma20, kcUpper, kcLower };
}

/**
 * @returns {Array<{index:number, direction:'bullish'|'bearish'}>} the bar
 *   index of each squeeze RELEASE (bands were inside the channel on the
 *   previous bar, outside on this one), with the direction determined at
 *   that same release bar.
 */
export function detectSqueezeReleases(candles) {
  const { bbUpper, bbLower, sma20, kcUpper, kcLower } = computeSqueezeBands(candles);
  const events = [];
  let wasSqueezed = false;

  for (let i = 0; i < candles.length; i++) {
    if (bbUpper[i] === null || kcUpper[i] === null) {
      wasSqueezed = false;
      continue;
    }
    const isSqueezed = bbUpper[i] < kcUpper[i] && bbLower[i] > kcLower[i];
    if (wasSqueezed && !isSqueezed) {
      const close = candles[i].close;
      if (close > sma20[i]) events.push({ index: i, direction: 'bullish' });
      else if (close < sma20[i]) events.push({ index: i, direction: 'bearish' });
      // exactly equal to the basis: no direction to trade, skip (rare with real price data)
    }
    wasSqueezed = isSqueezed;
  }
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on M15 candles */
export function runBollingerSqueezeBacktest(candles, opts = {}) {
  const { rrMultiple = RR_MULTIPLE, maxHoldingCandles = MAX_HOLDING_CANDLES } = opts;
  const events = detectSqueezeReleases(candles);
  const eventByIndex = new Map(events.map((e) => [e.index, e]));
  const stopAtr = computeAtrSeries(candles, STOP_ATR_PERIOD);

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

    // 2) New entry, one candle after the release.
    if (!open) {
      const signalIndex = i - 1;
      const event = signalIndex >= 0 ? eventByIndex.get(signalIndex) : undefined;
      if (event && stopAtr[signalIndex] != null && stopAtr[signalIndex] > 0) {
        const bullish = event.direction === 'bullish';
        const entryPrice = candle.open;
        const distance = STOP_ATR_MULTIPLE * stopAtr[signalIndex];
        const stopPrice = bullish ? entryPrice - distance : entryPrice + distance;
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
