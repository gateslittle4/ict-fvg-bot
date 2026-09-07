import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiquiditySweepEvents, makeSweepLookup, LiquiditySweepFilteredFvgEngine } from '../src/backtest/liquiditySweep.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('buildLiquiditySweepEvents detects a bullish sweep (wick below a confirmed swing low, close reclaims above it)', () => {
  const candles = [];
  // Flat chop with a swing low at index 5 (price 0.98).
  for (let i = 0; i < 10; i++) candles.push(c(i * 1000, 1, 1.02, 1.0, 1));
  candles[5] = c(5000, 1, 1.02, 0.98, 1);
  // After confirmation (index 5+3=8), a candle wicks below 0.98 and closes back above it.
  for (let i = 10; i < 16; i++) candles.push(c(i * 1000, 1, 1.02, 1.0, 1));
  candles.push(c(16000, 1.0, 1.01, 0.95, 1.0)); // index 16: low 0.95 < 0.98, close 1.0 > 0.98 -> bullish sweep

  const events = buildLiquiditySweepEvents(candles, { lookback: 3 });
  const bullishEvent = events.find((e) => e.direction === 'bullish');
  assert.ok(bullishEvent, 'expected a bullish sweep event');
  assert.equal(bullishEvent.time, 16000);
});

test('buildLiquiditySweepEvents detects a bearish sweep (wick above a confirmed swing high, close reclaims below it)', () => {
  const candles = [];
  for (let i = 0; i < 10; i++) candles.push(c(i * 1000, 1, 1.0, 0.98, 1));
  candles[5] = c(5000, 1, 1.05, 0.99, 1); // swing high at 1.05
  for (let i = 10; i < 16; i++) candles.push(c(i * 1000, 1, 1.0, 0.98, 1));
  candles.push(c(16000, 1.0, 1.08, 0.99, 1.0)); // high 1.08 > 1.05, close 1.0 < 1.05 -> bearish sweep

  const events = buildLiquiditySweepEvents(candles, { lookback: 3 });
  const bearishEvent = events.find((e) => e.direction === 'bearish');
  assert.ok(bearishEvent, 'expected a bearish sweep event');
  assert.equal(bearishEvent.time, 16000);
});

test('a wick beyond the level WITHOUT reclaiming (close stays beyond) is not counted as a sweep', () => {
  const candles = [];
  for (let i = 0; i < 10; i++) candles.push(c(i * 1000, 1, 1.02, 1.0, 1));
  candles[5] = c(5000, 1, 1.02, 0.98, 1);
  for (let i = 10; i < 16; i++) candles.push(c(i * 1000, 1, 1.02, 1.0, 1));
  candles.push(c(16000, 1.0, 1.01, 0.95, 0.96)); // low 0.95 < 0.98, but CLOSE 0.96 stays below 0.98 -> no reclaim

  const events = buildLiquiditySweepEvents(candles, { lookback: 3 });
  assert.equal(events.filter((e) => e.direction === 'bullish').length, 0);
});

test('makeSweepLookup only reports true within the window and is forward-only', () => {
  const events = [
    { time: 1000, direction: 'bullish' },
    { time: 5000, direction: 'bearish' },
  ];
  const lookup = makeSweepLookup(events, { windowMs: 2000 });
  assert.equal(lookup(500, 'bullish'), false); // before the event
  assert.equal(lookup(1000, 'bullish'), true); // exactly at the event
  assert.equal(lookup(2500, 'bullish'), true); // within window (1500ms after)
  assert.equal(lookup(3500, 'bullish'), false); // window (2000ms) has elapsed
  assert.equal(lookup(5000, 'bearish'), true);
  assert.equal(lookup(6500, 'bearish'), true);
  assert.equal(lookup(7500, 'bearish'), false);
});

test('LiquiditySweepFilteredFvgEngine drops validated events with no recent matching-direction sweep', () => {
  let sweptBullish = true;
  const sweepLookup = (t, direction) => (direction === 'bullish' ? sweptBullish : false);
  const innerEvents = [
    { type: 'watching', direction: 'bullish' },
    { type: 'validated', direction: 'bullish' },
    { type: 'validated', direction: 'bearish' },
  ];
  const innerEngine = { processCandle: () => innerEvents };
  const engine = new LiquiditySweepFilteredFvgEngine(innerEngine, sweepLookup);
  const out = engine.processCandle({ time: 1000 });

  assert.equal(out.length, 2); // watching passes through + the bullish validated (has a recent sweep)
  assert.equal(out.filter((e) => e.type === 'validated').length, 1);
  assert.equal(engine.passedCount, 1);
  assert.equal(engine.filteredCount, 1);
});
