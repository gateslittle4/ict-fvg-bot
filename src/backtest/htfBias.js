// htfBias.js
// Higher-timeframe directional bias filter, built on top of (not inside) the
// core FvgEngine so the live/tested M15 detection logic never has to know
// this filter exists.
//
// Pipeline:
//   1. resampleCandles()      - build H1/H4 candles directly from the same
//                                M15 data (no separate export needed, and
//                                guarantees perfect consistency between the
//                                M15 signal and its HTF context).
//   2. computeEMA()           - EMA of HTF closes.
//   3. buildHtfBiasSeries()   - classify each HTF candle as bullish / bearish
//                                / neutral (small band around the EMA).
//   4. makeBiasLookup()       - given a M15 timestamp, return the bias in
//                                effect using only HTF candles that have
//                                ALREADY CLOSED as of that timestamp (no
//                                lookahead).
//   5. BiasFilteredFvgEngine  - wraps a normal FvgEngine; passes through
//                                "watching" events untouched (informational),
//                                but only lets a "validated" event through if
//                                its direction matches the current HTF bias.
//                                Everything else is silently dropped and
//                                counted in `filteredCount`.

export function resampleCandles(m15Candles, bucketMs) {
  const buckets = [];
  let current = null;
  let currentKey = null;

  for (const c of m15Candles) {
    const key = Math.floor(c.time / bucketMs);
    if (key !== currentKey) {
      if (current) buckets.push(current);
      current = { time: key * bucketMs, open: c.open, high: c.high, low: c.low, close: c.close };
      currentKey = key;
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
    }
  }
  if (current) buckets.push(current);
  return buckets;
}

export const TIMEFRAME_MS = {
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
};

export function computeEMA(values, period) {
  const ema = new Array(values.length).fill(null);
  if (values.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

/**
 * @param {Array} m15Candles
 * @param {object} opts
 * @param {number} opts.bucketMs - e.g. TIMEFRAME_MS.H1
 * @param {number} opts.emaPeriod
 * @param {number} [opts.neutralBandPct] - e.g. 0.1 for a 0.1% neutral band around the EMA
 * @returns {Array<{time:number, closeTime:number, bias:'bullish'|'bearish'|'neutral'|'unknown'}>}
 */
export function buildHtfBiasSeries(m15Candles, { bucketMs, emaPeriod, neutralBandPct = 0.1 }) {
  const htf = resampleCandles(m15Candles, bucketMs);
  const closes = htf.map((c) => c.close);
  const ema = computeEMA(closes, emaPeriod);

  return htf.map((c, i) => {
    let bias = 'unknown';
    if (ema[i] !== null) {
      const diffPct = ((c.close - ema[i]) / ema[i]) * 100;
      if (Math.abs(diffPct) < neutralBandPct) bias = 'neutral';
      else bias = diffPct > 0 ? 'bullish' : 'bearish';
    }
    return { time: c.time, closeTime: c.time + bucketMs, bias };
  });
}

/**
 * Returns a stateful lookup function `(t) => bias` that must be called with
 * non-decreasing `t` (exactly how a chronological backtest/live loop works).
 * It only ever reveals the bias from an HTF candle whose closeTime <= t.
 */
export function makeBiasLookup(htfBiasSeries) {
  let idx = -1; // index of the last HTF candle known to have closed
  return function lookup(t) {
    while (idx + 1 < htfBiasSeries.length && htfBiasSeries[idx + 1].closeTime <= t) {
      idx++;
    }
    return idx === -1 ? 'unknown' : htfBiasSeries[idx].bias;
  };
}

const DIRECTION_TO_BIAS = { bullish: 'bullish', bearish: 'bearish' };

export class BiasFilteredFvgEngine {
  /**
   * @param {object} innerEngine - a normal FvgEngine instance
   * @param {(t:number) => string} biasLookup - from makeBiasLookup()
   */
  constructor(innerEngine, biasLookup) {
    this.inner = innerEngine;
    this.biasLookup = biasLookup;
    this.filteredCount = 0;
    this.passedCount = 0;
  }

  processCandle(candle) {
    const events = this.inner.processCandle(candle);
    const out = [];
    for (const e of events) {
      if (e.type !== 'validated') {
        out.push(e);
        continue;
      }
      const bias = this.biasLookup(candle.time);
      if (bias === DIRECTION_TO_BIAS[e.direction]) {
        this.passedCount++;
        out.push(e);
      } else {
        this.filteredCount++;
        // dropped: HTF bias disagrees (or is neutral/unknown) - not forwarded as 'validated'
      }
    }
    return out;
  }

  getActiveFvgs() {
    return this.inner.getActiveFvgs();
  }
}
