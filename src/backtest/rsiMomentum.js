// rsiMomentum.js
// The opposite bet from RSI(2) Connors mean-reversion (scripts/
// runRsiMeanReversionAnalysis.js - the one non-ICT mechanism already
// VALIDATED in this project, on US100/US500): Connors buys OVERSOLD RSI(2)
// in an uptrend, betting on a bounce back toward the mean (SMA5). This
// buys OVERBOUGHT RSI(2) in an uptrend instead - betting the strength
// continues (breakout/momentum) rather than reverts - and mirrors the
// short side (sells OVERSOLD in a downtrend rather than overbought).
//
// Same trend filter (EMA200), same RSI(2), same 2xATR(14) stop, same
// MAX_HOLDING_DAYS=10 (Connors' own safety cap, reused rather than
// re-chosen) as the mean-reversion version - the ONE thing this changes on
// purpose, besides which RSI extreme triggers the entry, is the EXIT
// target: Connors' "close crosses back through SMA(5)" is a MEAN-REVERSION
// target and makes no sense for a momentum/continuation bet, so this uses
// a fixed 1:3 R:R instead - the same convention every other momentum/
// breakout strategy in this project already uses (ORB, Asian Range
// Breakout), not a new number invented for this file.
//
// New, self-contained module - does not modify the mean-reversion script.

import { computeEMA } from './htfBias.js';

export const EMA_TREND_PERIOD = 200;
export const RSI_PERIOD = 2;
export const RSI_OVERSOLD = 5;
export const RSI_OVERBOUGHT = 95;
export const ATR_PERIOD = 14;
export const STOP_ATR_MULTIPLE = 2;
export const MAX_HOLDING_DAYS = 10; // same cap as the mean-reversion version, not re-chosen
export const RR_MULTIPLE = 3; // momentum/breakout convention already used elsewhere (ORB, Asian Range Breakout)

function computeAtrSeries(candles, period) {
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

/** Simple (non-Wilder-smoothed) RSI - same convention as the mean-reversion script. */
function computeRsiSeries(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gainSum = 0, lossSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gainSum += change; else lossSum += -change;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) rsi[i] = avgGain === 0 ? 50 : 100;
    else { const rs = avgGain / avgLoss; rsi[i] = 100 - 100 / (1 + rs); }
  }
  return rsi;
}

/**
 * @param {Array} daily - daily OHLC bars
 * @returns {Array} raw (pre-cost) trades
 */
export function runRsiMomentumBacktest(daily, opts = {}) {
  const {
    emaTrendPeriod = EMA_TREND_PERIOD,
    rsiPeriod = RSI_PERIOD,
    rsiOversold = RSI_OVERSOLD,
    rsiOverbought = RSI_OVERBOUGHT,
    atrPeriod = ATR_PERIOD,
    stopAtrMultiple = STOP_ATR_MULTIPLE,
    maxHoldingDays = MAX_HOLDING_DAYS,
    rrMultiple = RR_MULTIPLE,
  } = opts;

  const closes = daily.map((c) => c.close);
  const ema = computeEMA(closes, emaTrendPeriod);
  const rsi = computeRsiSeries(closes, rsiPeriod);
  const atr = computeAtrSeries(daily, atrPeriod);

  const trades = [];
  let open = null;
  const startIdx = Math.max(emaTrendPeriod, rsiPeriod, atrPeriod) + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];

    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitTarget = bullish ? day.high >= open.targetPrice : day.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= maxHoldingDays;
      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice;
        if (hitStop) { outcome = 'loss'; exitPrice = open.stopPrice; }
        else if (hitTarget) { outcome = 'win'; exitPrice = open.targetPrice; }
        else { outcome = 'timeout'; exitPrice = day.close; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    if (!open) {
      const y = i - 1; // signal day - only ever look at YESTERDAY's fully-known values
      if (ema[y] === null || rsi[y] === null || atr[y] === null) continue;
      const uptrend = closes[y] > ema[y];
      const downtrend = closes[y] < ema[y];
      if (uptrend && rsi[y] > rsiOverbought) {
        const entryPrice = day.open;
        const distance = stopAtrMultiple * atr[y];
        if (distance > 0) {
          open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + rrMultiple * distance, distance };
        }
      } else if (downtrend && rsi[y] < rsiOversold) {
        const entryPrice = day.open;
        const distance = stopAtrMultiple * atr[y];
        if (distance > 0) {
          open = { direction: 'bearish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, targetPrice: entryPrice - rrMultiple * distance, distance };
        }
      }
    }
  }
  return trades;
}
