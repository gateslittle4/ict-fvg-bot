import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBosEventsWithOrigin, runOteBacktest } from '../src/backtest/oteStrategy.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Shared bullish fixture: swing low (0.90) at index 3 confirmed at index 5,
// swing high (1.10) at index 8 confirmed at index 10, bullish BOS at index
// 13 (close 1.15 > 1.10). Lookback = 2 throughout so the fixture stays small.
function buildBullishFixture(afterBos) {
  const candles = [];
  for (let i = 0; i < 13; i++) candles.push(c(i * 1000, 1, 1.02, 0.98, 1));
  candles[3] = c(3000, 1, 1.02, 0.90, 1);
  candles[8] = c(8000, 1, 1.10, 0.98, 1);
  candles[13] = c(13000, 1.05, 1.16, 1.04, 1.15);
  candles.push(...afterBos);
  return candles;
}

test('detectBosEventsWithOrigin reports the bullish BOS with the last confirmed swing low as leg origin', () => {
  const candles = buildBullishFixture([c(14000, 1, 1.16, 1.15, 1.16)]);
  const events = detectBosEventsWithOrigin(candles, 2);
  const bos = events.find((e) => e.direction === 'bullish');
  assert.ok(bos, 'expected a bullish BOS event');
  assert.equal(bos.index, 13);
  assert.equal(bos.originPrice, 0.90);
});

test('runOteBacktest recalculates the zone from the leg extreme as it extends, and hits target for a win', () => {
  const candles = buildBullishFixture([
    c(14000, 1.16, 1.20, 1.10, 1.18), // leg extends to 1.20, no retracement yet (low 1.10 stays above the zone)
    c(15000, 1.18, 1.25, 1.15, 1.20), // leg extends to 1.25
    c(16000, 1.20, 1.21, 1.00, 1.05), // retraces into the (recalculated) zone -> entry
    c(17000, 1.05, 1.45, 1.03, 1.40), // hits the 1:3 target
  ]);
  const trades = runOteBacktest(candles, { lookback: 2 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 16);
  assert.equal(t.stopPrice, 0.90); // beyond the leg origin
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.rMultiple - 3) < 1e-9, `expected +3R, got ${t.rMultiple}`);
});

test('runOteBacktest produces a loss when price returns through the origin after entry', () => {
  const candles = buildBullishFixture([
    c(14000, 1, 1.02, 0.98, 1), // legExtreme stays 1.16, retraces straight into the zone -> entry
    c(15000, 0.95, 0.96, 0.85, 0.87), // falls through the origin (0.90) -> stop
  ]);
  const trades = runOteBacktest(candles, { lookback: 2 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-9, `expected -1R, got ${trades[0].rMultiple}`);
});

test('runOteBacktest opens no trade when the leg never retraces into the zone before the watch expires (bearish case)', () => {
  const candles = [];
  for (let i = 0; i < 13; i++) candles.push(c(i * 1000, 1, 1.02, 0.98, 1));
  candles[3] = c(3000, 1, 1.10, 0.98, 1); // swing high, confirmed at index 5
  candles[8] = c(8000, 1, 1.02, 0.90, 1); // swing low, confirmed at index 10
  candles[13] = c(13000, 0.95, 0.96, 0.80, 0.82); // bearish BOS: close 0.82 < 0.90
  for (let i = 14; i < 25; i++) candles.push(c(i * 1000, 0.82, 0.83, 0.81, 0.82)); // stays well under the zone

  const trades = runOteBacktest(candles, { lookback: 2, maxAgeCandles: 5 });
  assert.equal(trades.length, 0);
});
