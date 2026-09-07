import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FvgEngine } from '../src/engines/fvgEngine.js';
import {
  resampleCandles,
  computeEMA,
  buildHtfBiasSeries,
  makeBiasLookup,
  BiasFilteredFvgEngine,
  TIMEFRAME_MS,
} from '../src/backtest/htfBias.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;
const H1 = TIMEFRAME_MS.H1;

test('resampleCandles aggregates 4 M15 candles into 1 correct H1 candle', () => {
  const base = 0; // aligned to an hour boundary
  const m15 = [
    c(base, 100, 102, 99, 101),
    c(base + M15, 101, 103, 100.5, 102.5),
    c(base + 2 * M15, 102.5, 104, 102, 103.8),
    c(base + 3 * M15, 103.8, 104.2, 101, 101.5),
  ];
  const htf = resampleCandles(m15, H1);
  assert.equal(htf.length, 1);
  assert.equal(htf[0].time, base);
  assert.equal(htf[0].open, 100); // first candle's open
  assert.equal(htf[0].close, 101.5); // last candle's close
  assert.equal(htf[0].high, 104.2); // max high
  assert.equal(htf[0].low, 99); // min low
});

test('resampleCandles handles gaps without fabricating missing bars', () => {
  const m15 = [
    c(0, 100, 101, 99, 100.5),
    // big gap: jump 3 hours ahead (e.g. weekend/session gap)
    c(3 * H1, 105, 106, 104, 105.5),
  ];
  const htf = resampleCandles(m15, H1);
  assert.equal(htf.length, 2); // no interpolated bars for the missing hours
  assert.equal(htf[0].time, 0);
  assert.equal(htf[1].time, 3 * H1);
});

test('computeEMA matches a hand-computed series', () => {
  const values = [10, 11, 12, 13, 14, 15];
  const period = 3;
  const ema = computeEMA(values, period);
  assert.equal(ema[0], null);
  assert.equal(ema[1], null);
  assert.equal(ema[2], (10 + 11 + 12) / 3); // seeded with SMA
  const k = 2 / (period + 1);
  const expected3 = 13 * k + ema[2] * (1 - k);
  assert.ok(Math.abs(ema[3] - expected3) < 1e-9);
});

test('buildHtfBiasSeries classifies bullish/bearish/neutral correctly around the EMA', () => {
  // Craft closes so the EMA settles near 100, then test a clearly-above,
  // clearly-below, and within-band close.
  const flat = Array(10).fill(100);
  const closes = [...flat, 100, 110, 99.95]; // last three: neutral-ish, bullish, still near flat
  const m15 = closes.map((close, i) => c(i * H1, close, close + 0.1, close - 0.1, close));
  const series = buildHtfBiasSeries(m15, { bucketMs: H1, emaPeriod: 5, neutralBandPct: 0.5 });

  const last3 = series.slice(-3);
  // close=100 while EMA ~100 -> within 0.5% band -> neutral
  assert.equal(last3[0].bias, 'neutral');
  // close=110 vs EMA still ~100 -> more than 0.5% above -> bullish
  assert.equal(last3[1].bias, 'bullish');
});

test('makeBiasLookup never reveals a bias before its HTF candle has closed (no lookahead)', () => {
  const series = [
    { time: 0, closeTime: H1, bias: 'bullish' },
    { time: H1, closeTime: 2 * H1, bias: 'bearish' },
  ];
  const lookup = makeBiasLookup(series);

  assert.equal(lookup(H1 - 1), 'unknown'); // first candle hasn't closed yet
  assert.equal(lookup(H1), 'bullish'); // exactly at close
  assert.equal(lookup(H1 + 1), 'bullish'); // still in the second candle's lifetime
  assert.equal(lookup(2 * H1), 'bearish'); // second candle just closed
});

test('makeBiasLookup pointer only advances forward (matches chronological backtest usage)', () => {
  const series = [
    { time: 0, closeTime: H1, bias: 'bullish' },
    { time: H1, closeTime: 2 * H1, bias: 'bearish' },
    { time: 2 * H1, closeTime: 3 * H1, bias: 'bullish' },
  ];
  const lookup = makeBiasLookup(series);
  assert.equal(lookup(H1), 'bullish');
  assert.equal(lookup(2.5 * H1), 'bearish');
  assert.equal(lookup(3 * H1), 'bullish');
});

test('BiasFilteredFvgEngine passes through a validated signal that agrees with HTF bias', () => {
  const inner = new FvgEngine({ symbol: 'TEST' });
  const wrapped = new BiasFilteredFvgEngine(inner, () => 'bullish'); // always bullish bias

  wrapped.processCandle(c(1, 100, 101, 99, 100.5));
  wrapped.processCandle(c(2, 100.5, 105, 100.4, 104.8));
  wrapped.processCandle(c(3, 104.8, 106, 103, 105.5)); // forms bullish zone [101,103]
  wrapped.processCandle(c(4, 105.5, 107, 104, 106.5));
  const events = wrapped.processCandle(c(5, 106.5, 106.6, 102.5, 103.2)); // validated bullish

  assert.equal(events.some((e) => e.type === 'validated'), true);
  assert.equal(wrapped.passedCount, 1);
  assert.equal(wrapped.filteredCount, 0);
});

test('BiasFilteredFvgEngine drops a validated signal that disagrees with HTF bias', () => {
  const inner = new FvgEngine({ symbol: 'TEST' });
  const wrapped = new BiasFilteredFvgEngine(inner, () => 'bearish'); // HTF says bearish, signal is bullish

  wrapped.processCandle(c(1, 100, 101, 99, 100.5));
  wrapped.processCandle(c(2, 100.5, 105, 100.4, 104.8));
  wrapped.processCandle(c(3, 104.8, 106, 103, 105.5));
  wrapped.processCandle(c(4, 105.5, 107, 104, 106.5));
  const events = wrapped.processCandle(c(5, 106.5, 106.6, 102.5, 103.2));

  assert.equal(events.some((e) => e.type === 'validated'), false);
  assert.equal(wrapped.filteredCount, 1);
  assert.equal(wrapped.passedCount, 0);
});

test('BiasFilteredFvgEngine still passes through "watching" events regardless of bias (informational only)', () => {
  const inner = new FvgEngine({ symbol: 'TEST' });
  const wrapped = new BiasFilteredFvgEngine(inner, () => 'bearish');

  wrapped.processCandle(c(1, 100, 101, 99, 100.5));
  wrapped.processCandle(c(2, 100.5, 105, 100.4, 104.8));
  const events = wrapped.processCandle(c(3, 104.8, 106, 103, 105.5)); // forms bullish zone -> 'watching'

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'watching');
});

test('BiasFilteredFvgEngine drops signals when bias is neutral or unknown', () => {
  const inner = new FvgEngine({ symbol: 'TEST' });
  const wrapped = new BiasFilteredFvgEngine(inner, () => 'neutral');

  wrapped.processCandle(c(1, 100, 101, 99, 100.5));
  wrapped.processCandle(c(2, 100.5, 105, 100.4, 104.8));
  wrapped.processCandle(c(3, 104.8, 106, 103, 105.5));
  wrapped.processCandle(c(4, 105.5, 107, 104, 106.5));
  const events = wrapped.processCandle(c(5, 106.5, 106.6, 102.5, 103.2));

  assert.equal(events.some((e) => e.type === 'validated'), false);
  assert.equal(wrapped.filteredCount, 1);
});
