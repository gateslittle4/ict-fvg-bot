// marketStructure.js
// ICT market-structure ("Break of Structure" / BOS) bias filter, built the
// same way as the HTF EMA bias filter in htfBias.js: an independent bias
// series with a forward-only, no-lookahead lookup, wrapped around the core
// FvgEngine (or an already-wrapped engine — filters compose freely).
//
// Method:
//   1. detectSwingPoints() - a swing high/low is a symmetric fractal: the
//      most extreme high/low within `lookback` candles on BOTH sides. A
//      swing point can only be CONFIRMED once `lookback` candles after it
//      have closed — exactly the same no-lookahead discipline used for the
//      HTF bias (you can't know a candle was a swing pivot until you've
//      seen what came after it).
//   2. buildStructureBiasSeries() - bias flips to 'bullish' the first time a
//      candle's CLOSE breaks above the most recently CONFIRMED swing high
//      (classic ICT bullish BOS), and flips to 'bearish' on a close below
//      the most recently confirmed swing low. Starts 'neutral' until the
//      first BOS event.
//   3. makeStructureBiasLookup() / StructureFilteredFvgEngine - same
//      pattern as htfBias.js: only lets a 'validated' FVG signal through if
//      its direction agrees with the current structure bias (take FVGs in
//      the direction of the recently confirmed trend, not counter-trend).

export function detectSwingPoints(candles, lookback = 5) {
  const points = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (isHigh && candles[j].high >= candles[i].high) isHigh = false;
      if (isLow && candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    const confirmedIndex = i + lookback; // earliest index at which this pivot is knowable
    if (isHigh) points.push({ index: i, confirmedIndex, price: candles[i].high, type: 'high' });
    if (isLow) points.push({ index: i, confirmedIndex, price: candles[i].low, type: 'low' });
  }
  return points;
}

/**
 * @param {Array} candles
 * @param {object} opts
 * @param {number} [opts.lookback] - candles on each side required to confirm a swing pivot
 * @returns {Array<{time:number, closeTime:number, bias:'bullish'|'bearish'}>} change-points only
 *   (bias is 'neutral' for any time before the first entry — see makeStructureBiasLookup)
 */
export function buildStructureBiasSeries(candles, { lookback = 5 } = {}) {
  const swingPoints = detectSwingPoints(candles, lookback);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const series = [];
  let bias = 'neutral';
  let lastConfirmedHigh = null;
  let lastConfirmedLow = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') lastConfirmedHigh = p.price;
        else lastConfirmedLow = p.price;
      }
    }

    const close = candles[i].close;
    let flipped = false;
    if (lastConfirmedHigh !== null && close > lastConfirmedHigh && bias !== 'bullish') {
      bias = 'bullish';
      flipped = true;
    } else if (lastConfirmedLow !== null && close < lastConfirmedLow && bias !== 'bearish') {
      bias = 'bearish';
      flipped = true;
    }
    if (flipped) {
      // closeTime === this candle's own time: the BOS is recognized using this
      // candle's own close, the same instant a 'validated' FVG signal on this
      // same candle would be recognized — no extra lag beyond the pivot
      // confirmation lag already baked into `confirmedIndex` above.
      series.push({ time: candles[i].time, closeTime: candles[i].time, bias });
    }
  }
  return series;
}

/**
 * Stateful, forward-only lookup: `(t) => bias`, must be called with
 * non-decreasing `t`. Returns 'neutral' before the first confirmed BOS.
 */
export function makeStructureBiasLookup(structureBiasSeries) {
  let idx = -1;
  return function lookup(t) {
    while (idx + 1 < structureBiasSeries.length && structureBiasSeries[idx + 1].closeTime <= t) {
      idx++;
    }
    return idx === -1 ? 'neutral' : structureBiasSeries[idx].bias;
  };
}

const DIRECTION_TO_BIAS = { bullish: 'bullish', bearish: 'bearish' };

export class StructureFilteredFvgEngine {
  /**
   * @param {object} innerEngine - a FvgEngine, or another filtered wrapper (filters compose)
   * @param {(t:number) => string} biasLookup - from makeStructureBiasLookup()
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
        // dropped: structure bias disagrees (or is still neutral - no BOS yet)
      }
    }
    return out;
  }
}
