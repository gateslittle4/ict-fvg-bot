import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSwingPoints, buildStructureBiasSeries, makeStructureBiasLookup, StructureFilteredFvgEngine } from '../src/backtest/marketStructure.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('detectSwingPoints finds a clean swing high and swing low with a symmetric fractal', () => {
  // Candle index 5 is a clear local high (10), index 10 a clear local low (0.5).
  const candles = [];
  for (let i = 0; i < 16; i++) {
    let high = 1 + Math.abs(5 - i) * -0.3 + 1; // generic filler
    candles.push(c(i * 1000, 1, 1.2, 0.9, 1));
  }
  candles[5] = c(5000, 1, 10, 0.95, 1); // spike high
  candles[10] = c(10000, 1, 1.1, 0.5, 1); // spike low

  const points = detectSwingPoints(candles, 3);
  const highPoint = points.find((p) => p.type === 'high');
  const lowPoint = points.find((p) => p.type === 'low');
  assert.ok(highPoint, 'expected a swing high to be detected');
  assert.equal(highPoint.index, 5);
  assert.equal(highPoint.price, 10);
  assert.ok(lowPoint, 'expected a swing low to be detected');
  assert.equal(lowPoint.index, 10);
  assert.equal(lowPoint.price, 0.5);
});

test('a swing point is only confirmed `lookback` candles after it (no lookahead)', () => {
  const candles = [];
  for (let i = 0; i < 12; i++) candles.push(c(i * 1000, 1, 1.2, 0.9, 1));
  candles[5] = c(5000, 1, 10, 0.95, 1);
  const lookback = 3;
  const points = detectSwingPoints(candles, lookback);
  const highPoint = points.find((p) => p.type === 'high' && p.index === 5);
  assert.equal(highPoint.confirmedIndex, 5 + lookback);
});

test('buildStructureBiasSeries flips to bullish on a close above the last confirmed swing high', () => {
  const candles = [];
  // Flat chop with a swing high at index 5 (price 1.10), then later a strong
  // close breaking above it.
  for (let i = 0; i < 10; i++) candles.push(c(i * 1000, 1, 1.02, 0.98, 1));
  candles[5] = c(5000, 1, 1.10, 0.98, 1.0);
  // Break above 1.10 at index 12
  for (let i = 10; i < 16; i++) candles.push(c(i * 1000, 1, 1.05, 0.98, 1.0));
  candles.push(c(16000, 1.05, 1.20, 1.04, 1.15)); // index 16: close 1.15 > 1.10 swing high

  const series = buildStructureBiasSeries(candles, { lookback: 3 });
  const bullishEntry = series.find((s) => s.bias === 'bullish');
  assert.ok(bullishEntry, 'expected a bullish BOS flip');
  assert.equal(bullishEntry.time, 16000);
});

test('makeStructureBiasLookup returns neutral before any BOS and is forward-only', () => {
  const series = [
    { time: 5000, closeTime: 5000, bias: 'bullish' },
    { time: 9000, closeTime: 9000, bias: 'bearish' },
  ];
  const lookup = makeStructureBiasLookup(series);
  assert.equal(lookup(1000), 'neutral');
  assert.equal(lookup(5000), 'bullish');
  assert.equal(lookup(6000), 'bullish');
  assert.equal(lookup(9000), 'bearish');
  assert.equal(lookup(20000), 'bearish');
});

test('StructureFilteredFvgEngine drops validated events whose direction disagrees with structure bias', () => {
  let bias = 'bullish';
  const biasLookup = () => bias;
  const innerEvents = [
    { type: 'watching', direction: 'bullish' },
    { type: 'validated', direction: 'bullish' },
    { type: 'validated', direction: 'bearish' },
  ];
  const innerEngine = { processCandle: () => innerEvents };
  const engine = new StructureFilteredFvgEngine(innerEngine, biasLookup);
  const out = engine.processCandle({ time: 1000 });
  assert.equal(out.length, 2); // watching passes through + the bullish validated
  assert.equal(out.filter((e) => e.type === 'validated').length, 1);
  assert.equal(engine.passedCount, 1);
  assert.equal(engine.filteredCount, 1);
});
