// rsiDivergence.js
// Classic technical-analysis "RSI divergence" (Wilder/Welles-style), a
// genuinely different mechanism from everything else already in this
// project:
//   - NOT the same as the already-validated "Divergence" strategy
//     (src/backtest/... via correlation.js) — that one is a PAIR trade
//     between US100/US500 (buy the laggard). This one is a SINGLE-
//     instrument momentum-divergence reversal: price makes a new extreme
//     while the RSI does NOT confirm it.
//   - NOT the same as the already-validated RSI(2) Connors mean-reversion
//     — that one enters on an extreme RSI(2) READING plus an EMA200 trend
//     filter, no divergence involved, no comparison to indicator history.
//
// Method (published/standard conventions decided BEFORE looking at any
// result — reusing this project's own established conventions wherever
// possible instead of inventing new tuned parameters):
//   - Daily bars (resampleCandles, same DAY_MS convention as RSI-2/
//     Bollinger).
//   - RSI(14), Wilder's original smoothing (the standard/default RSI
//     definition — distinct from the simple rolling-average RSI(2) used
//     for the Connors system, which explicitly calls for a SIMPLE average
//     over such a short window).
//   - Swing pivots via this project's existing detectSwingPoints()
//     (marketStructure.js, same no-lookahead discipline: a pivot is only
//     usable `swingLookback` candles after it forms).
//   - Bullish divergence: two consecutive CONFIRMED swing lows where price
//     makes a LOWER low but RSI(14) makes a HIGHER low. Bearish
//     divergence: two consecutive confirmed swing highs where price makes
//     a HIGHER high but RSI(14) makes a LOWER high. Classic textbook
//     definition, applied only once both pivots are confirmed (no
//     lookahead).
//   - Entry at the open of the candle right after the divergence is
//     confirmed (same next-candle-open convention as RSI-2/FVG/etc).
//   - Stop = 2xATR(14) (reused exactly from the RSI-2/Turtle convention
//     already established in this project — same formula, same period,
//     same multiple).
//   - Target = fixed 1:3 R:R (reused from FVG/Order Block/OTE/Divergence —
//     the project's default convention for a directional reversal trade
//     with a defined risk), 10-trading-day timeout (reused from RSI-2/
//     Bollinger/Turtle Soup, all of which cap single-instrument daily
//     mean-reversion/reversal trades at 10 days).
//   - One open position at a time (standalone edge-quality test, same
//     convention as every other exploratory script here).

import { detectSwingPoints } from './marketStructure.js';

export const RSI_PERIOD = 14;
export const ATR_PERIOD = 14;
export const STOP_ATR_MULTIPLE = 2;
export const RR_MULTIPLE = 3;
export const MAX_HOLDING_DAYS = 10;
export const SWING_LOOKBACK = 5;

/** Standard Wilder-smoothed RSI. */
export function computeRsiWilder(closes, period = RSI_PERIOD) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gainSum += change; else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

/** Simple (non-Wilder) average True Range — same formula already used for ATR(14) elsewhere in this project (RSI-2, Turtle). */
export function computeAtrSeries(candles, period = ATR_PERIOD) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

/**
 * @returns {Array<{confirmedIndex:number, direction:'bullish'|'bearish'}>}
 *   sorted by confirmedIndex — the earliest index at which each divergence
 *   is knowable (both pivots confirmed).
 */
export function detectDivergenceEvents(candles, rsiSeries, swingLookback = SWING_LOOKBACK) {
  const points = detectSwingPoints(candles, swingLookback);
  const lows = points.filter((p) => p.type === 'low');
  const highs = points.filter((p) => p.type === 'high');
  const events = [];

  for (let k = 1; k < lows.length; k++) {
    const prev = lows[k - 1];
    const cur = lows[k];
    const rsiPrev = rsiSeries[prev.index];
    const rsiCur = rsiSeries[cur.index];
    if (rsiPrev == null || rsiCur == null) continue;
    if (cur.price < prev.price && rsiCur > rsiPrev) {
      events.push({ confirmedIndex: cur.confirmedIndex, direction: 'bullish' });
    }
  }
  for (let k = 1; k < highs.length; k++) {
    const prev = highs[k - 1];
    const cur = highs[k];
    const rsiPrev = rsiSeries[prev.index];
    const rsiCur = rsiSeries[cur.index];
    if (rsiPrev == null || rsiCur == null) continue;
    if (cur.price > prev.price && rsiCur < rsiPrev) {
      events.push({ confirmedIndex: cur.confirmedIndex, direction: 'bearish' });
    }
  }

  events.sort((a, b) => a.confirmedIndex - b.confirmedIndex);
  return events;
}

/** @returns {Array} raw (pre-cost) trades, on DAILY candles */
export function runRsiDivergenceBacktest(candles, opts = {}) {
  const {
    swingLookback = SWING_LOOKBACK,
    rsiPeriod = RSI_PERIOD,
    atrPeriod = ATR_PERIOD,
    stopAtrMultiple = STOP_ATR_MULTIPLE,
    rrMultiple = RR_MULTIPLE,
    maxHoldingDays = MAX_HOLDING_DAYS,
  } = opts;

  const closes = candles.map((c) => c.close);
  const rsi = computeRsiWilder(closes, rsiPeriod);
  const atr = computeAtrSeries(candles, atrPeriod);
  const events = detectDivergenceEvents(candles, rsi, swingLookback);
  const eventByConfirmedIndex = new Map();
  for (const e of events) {
    if (!eventByConfirmedIndex.has(e.confirmedIndex)) eventByConfirmedIndex.set(e.confirmedIndex, e);
  }

  const trades = [];
  let open = null;

  for (let i = 0; i < candles.length; i++) {
    const day = candles[i];

    // 1) Resolve an open position using today's range (never the entry day itself).
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitTarget = bullish ? day.high >= open.targetPrice : day.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingDays;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = day.close; outcome = null; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome: outcome ?? (rMultiple > 0 ? 'win' : 'loss'), rMultiple });
        open = null;
      }
    }

    // 2) Look for a signal confirmed YESTERDAY - fill at TODAY's open (no lookahead).
    if (!open) {
      const signalIndex = i - 1;
      const event = eventByConfirmedIndex.get(signalIndex);
      if (event && atr[signalIndex] != null) {
        const bullish = event.direction === 'bullish';
        const entryPrice = day.open;
        const distance = stopAtrMultiple * atr[signalIndex];
        if (distance > 0) {
          const stopPrice = bullish ? entryPrice - distance : entryPrice + distance;
          const targetPrice = bullish ? entryPrice + rrMultiple * distance : entryPrice - rrMultiple * distance;
          open = { direction: event.direction, entryIndex: i, entryTime: day.time, entryPrice, stopPrice, targetPrice, distance };
        }
      }
    }
  }
  return trades;
}
