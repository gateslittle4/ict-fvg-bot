// volatilityRegime.js
// Extraction of the volatility-regime classification already researched and
// validated (on the real FVG+Divergence combo) in
// scripts/checkVolatilityRegimeImpactFullCombo.js and
// scripts/runFtmo1StepVolAdaptiveRiskAccountImpact.js - same constants,
// same math, nothing retuned. Pulled into src/backtest/ (rather than left
// duplicated in those exploratory scripts) so it can also be used LIVE, for
// the forward-test observation phase requested explicitly by Esdras before
// any real risk-per-trade change ("forward-test démo d'abord") - see
// accountRuntime.js's pushSignalEvents() and HANDOFF.md.
//
// Classification (daily bars, thresholds fixed BEFORE any result was seen -
// see checkVolatilityRegimeImpactFullCombo.js's own comment):
//   - Daily ATR(14), simple average.
//   - Reference = SMA(100) of that same daily ATR series.
//   - volRatio = ATR14[today] / SMA100(ATR14)[today].
//   - volRatio < 0.8 -> 'low', 0.8-1.5 -> 'normal', > 1.5 -> 'high'.
//
// Finding (see HANDOFF.md "Position sizing dynamique"): 'low' is the weak
// regime on the real combo (train +0.09R, test -0.04R) - the OPPOSITE of
// classic volatility sizing (which reduces size when vol is HIGH). Tested
// scheme: risk cut to half (0.25% instead of 0.5%) specifically in 'low' -
// LOW_REGIME_RISK_SCALE below is that ratio, not a fresh guess.

export const ATR_PERIOD = 14;
export const ATR_REF_SMA_PERIOD = 100;
export const VOL_LOW_THRESHOLD = 0.8;
export const VOL_HIGH_THRESHOLD = 1.5;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const LOW_REGIME_RISK_SCALE = 0.5; // 0.25%/0.5% tested ratio - observational only until a demo forward-test confirms it live

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

export function computeSma(values, period = ATR_REF_SMA_PERIOD) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

/** @param {Array} dailyCandles @returns {Array<'low'|'normal'|'high'|null>} one regime per daily bar */
export function classifyVolatilityRegimeSeries(dailyCandles) {
  const atr = computeAtrSeries(dailyCandles, ATR_PERIOD);
  const atrValues = atr.map((v) => v ?? 0);
  const atrSma = computeSma(atrValues, ATR_REF_SMA_PERIOD);
  const regime = new Array(dailyCandles.length).fill(null);
  for (let i = 0; i < dailyCandles.length; i++) {
    if (atr[i] === null || atrSma[i] === null || atrSma[i] === 0) continue;
    const ratio = atr[i] / atrSma[i];
    regime[i] = ratio < VOL_LOW_THRESHOLD ? 'low' : ratio > VOL_HIGH_THRESHOLD ? 'high' : 'normal';
  }
  return regime;
}

/**
 * @param {Array} dailyCandles
 * @returns {(entryTime:number) => 'low'|'normal'|'high'|null} no-lookahead
 *   lookup - only ever returns the regime of the last FULLY CLOSED daily bar
 *   strictly before `entryTime` (same binary-search pattern as
 *   runMarketRegimeAnalysis.js's makeRegimeLookup).
 */
export function makeVolatilityRegimeLookup(dailyCandles) {
  const regime = classifyVolatilityRegimeSeries(dailyCandles);
  return (entryTime) => {
    let lo = 0, hi = dailyCandles.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dailyCandles[mid].time + DAY_MS <= entryTime) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? regime[ans] : null;
  };
}
