import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAtrSeries,
  computeSma,
  classifyVolatilityRegimeSeries,
  makeVolatilityRegimeLookup,
  DAY_MS,
} from '../src/backtest/volatilityRegime.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('computeAtrSeries: null before the period fills, a real average once it does', () => {
  const candles = [c(0, 10, 11, 9, 10), c(1, 10, 12, 8, 10), c(2, 10, 10.5, 9.5, 10)];
  const atr = computeAtrSeries(candles, 2);
  assert.equal(atr[0], null);
  // TR[0]=high-low=2 (no prevClose), TR[1]=max(4, |12-10|, |8-10|)=4, TR[2]=max(1, 0.5, 0.5)=1
  assert.equal(atr[1], (2 + 4) / 2);
  assert.equal(atr[2], (4 + 1) / 2);
});

test('computeSma: null before the period fills, a real average once it does', () => {
  const sma = computeSma([1, 2, 3, 4, 5], 3);
  assert.deepEqual(sma.slice(0, 2), [null, null]);
  assert.equal(sma[2], (1 + 2 + 3) / 3);
  assert.equal(sma[4], (3 + 4 + 5) / 3);
});

// Builds a long "normal" stretch (constant true range) to fill the SMA(100)
// reference at ~2, then 14 bars of TINY range (a whole ATR(14) window worth,
// so the current ATR actually drops - a single odd bar gets diluted away by
// the other 13 in its own 14-day average and never moves the classification)
// -> 'low' at the end of that stretch, then a return to normal to let both
// ATR(14) and the SMA(100) reference re-settle, then 14 bars of HUGE range
// -> 'high' at the end of that second stretch.
const LOW_STRETCH_START = 150;
const HIGH_STRETCH_START = 250;
function buildDailyFixture() {
  const candles = [];
  let price = 100;
  for (let i = 0; i < 400; i++) {
    let high = price + 1, low = price - 1; // constant TR=2 baseline
    if (i >= LOW_STRETCH_START && i < LOW_STRETCH_START + 14) { high = price + 0.05; low = price - 0.05; } // TR=0.1
    if (i >= HIGH_STRETCH_START && i < HIGH_STRETCH_START + 14) { high = price + 10; low = price - 10; } // TR=20
    candles.push(c(i * DAY_MS, price, high, low, price));
  }
  return candles;
}

test('classifyVolatilityRegimeSeries: a long constant-range stretch classifies as normal, a quiet stretch as low, a wild stretch as high', () => {
  const candles = buildDailyFixture();
  const regime = classifyVolatilityRegimeSeries(candles);
  assert.equal(regime[120], 'normal'); // deep into the constant stretch, well past both warm-up periods
  assert.equal(regime[LOW_STRETCH_START + 13], 'low'); // last bar of the quiet stretch - ATR(14) now fully inside it
  assert.equal(regime[HIGH_STRETCH_START + 13], 'high'); // last bar of the wild stretch
});

test('classifyVolatilityRegimeSeries: null before ATR(14)+SMA(100) warm up', () => {
  const candles = buildDailyFixture();
  const regime = classifyVolatilityRegimeSeries(candles);
  assert.equal(regime[0], null);
  assert.equal(regime[10], null);
});

test('makeVolatilityRegimeLookup: no-lookahead - returns the regime of the last bar strictly BEFORE entryTime, never today\'s', () => {
  const candles = buildDailyFixture();
  const regime = classifyVolatilityRegimeSeries(candles);
  const lookup = makeVolatilityRegimeLookup(candles);
  // ATR(14) doesn't clear a 14-day quiet stretch instantly (its own window keeps
  // seeing part of it for a while after) - find wherever the regime actually
  // flips back, rather than assuming it happens exactly at the stretch's edge.
  const idx = regime.findIndex((r, i) => r === 'low' && regime[i + 1] !== 'low' && i > LOW_STRETCH_START);
  assert.ok(idx > 0, 'fixture must produce at least one low->non-low transition, or this test is vacuous');
  // entryTime exactly at the NEXT bar's own open time -> must resolve to bar `idx`'s regime, not that next bar's own
  assert.equal(lookup(candles[idx + 1].time), regime[idx]);
  // entryTime one full day later still -> now that next bar has itself fully closed
  assert.equal(lookup(candles[idx + 1].time + DAY_MS), regime[idx + 1]);
});

test('makeVolatilityRegimeLookup: returns null for a time before any bar has closed', () => {
  const candles = buildDailyFixture();
  const lookup = makeVolatilityRegimeLookup(candles);
  assert.equal(lookup(0), null);
});
