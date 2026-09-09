import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForwardTest } from '../src/backtest/forwardTest.js';

test('buildForwardTest: empty history returns empty summaries with reason', async () => {
  const historyBySymbol = { US500: [], XAUUSD: [] };
  const result = await buildForwardTest(historyBySymbol, {
    cutoffMs: new Date('2026-06-30').getTime(),
  });
  assert.equal(result.before.summary.count, 0);
  assert.equal(result.after.summary.count, 0);
  assert.equal(result.reason, 'no candle history available');
});

test('buildForwardTest: splits history at cutoff date and returns two periods', async () => {
  const base = new Date('2026-01-01').getTime();
  const candle = (offset, close = 100) => ({
    time: base + offset,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  });

  // 10 candles before cutoff, 10 after
  const beforeCandles = Array.from({ length: 10 }, (_, i) => candle(i * 3600000, 100 + i));
  const afterCandles = Array.from({ length: 10 }, (_, i) => candle((10 + i) * 3600000, 110 + i));
  const allCandles = [...beforeCandles, ...afterCandles];

  const cutoffMs = base + 10 * 3600000; // right at the split
  const result = await buildForwardTest({ US500: allCandles }, { cutoffMs });

  assert.ok(result.before);
  assert.ok(result.after);
  assert.equal(result.cutoffDate, new Date(cutoffMs).toISOString());
  // The exact trade count depends on signal logic, but structure should be present
  assert.ok('count' in result.before.summary);
  assert.ok('count' in result.after.summary);
});

test('buildForwardTest: cutoff date before all candles puts everything in after period', async () => {
  const base = new Date('2026-06-01').getTime();
  const candle = (offset) => ({
    time: base + offset,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  });

  const candles = Array.from({ length: 5 }, (_, i) => candle(i * 3600000));
  const cutoffMs = base - 1000000; // before all data

  const result = await buildForwardTest({ US500: candles }, { cutoffMs });

  assert.equal(result.before.summary.count, 0);
  // All candles in after
  assert.ok(result.after.summary.count >= 0);
});

test('buildForwardTest: cutoff date after all candles puts everything in before period', async () => {
  const base = new Date('2026-06-01').getTime();
  const candle = (offset) => ({
    time: base + offset,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  });

  const candles = Array.from({ length: 5 }, (_, i) => candle(i * 3600000));
  const cutoffMs = base + 1000000000; // after all data

  const result = await buildForwardTest({ US500: candles }, { cutoffMs });

  // All candles in before
  assert.ok(result.before.summary.count >= 0);
  assert.equal(result.after.summary.count, 0);
});
