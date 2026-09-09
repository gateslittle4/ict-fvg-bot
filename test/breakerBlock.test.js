import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBreakerBlockBacktest } from '../src/backtest/breakerBlock.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}
function filler(i, o = 1, h = 1.05, l = 0.95, cl = 1) {
  return c(i * 1000, o, h, l, cl);
}

// Builds: swing high @5 (price 2.0) -> confirmed @7 -> bearish OB candle @8
// -> bullish BOS @10 (finds the @8 OB as its bullish/support zone
// [0.85, 1.02]) -> price breaks THROUGH the zone downward @15 (flips it to
// a bearish breaker) -> price retests the breaker's mid (0.935) from below
// @20 -> entry @21 -> resolves @22.
function buildFixture({ resolveHigh, resolveLow } = {}) {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(filler(i));
  candles.push(c(5000, 1, 2.0, 0.95, 1)); // swing high spike
  candles.push(filler(6));
  candles.push(filler(7));
  candles.push(c(8000, 1.0, 1.02, 0.85, 0.9)); // bearish OB candle
  candles.push(c(9000, 1, 1.05, 0.95, 1.05)); // bullish filler, NOT the OB
  candles.push(c(10000, 1, 2.2, 0.95, 2.1)); // bullish BOS candle
  for (let i = 11; i <= 14; i++) candles.push(filler(i));
  candles.push(c(15000, 1, 1.05, 0.5, 0.6)); // breaks through zoneLow (0.85)
  for (let i = 16; i <= 19; i++) candles.push(c(i * 1000, 0.6, 0.7, 0.55, 0.6));
  candles.push(c(20000, 0.6, 0.94, 0.55, 0.7)); // retests the mid (0.935) from below
  candles.push(c(21000, 0.93, 0.95, 0.9, 0.92)); // entry candle, open=0.93
  candles.push(c(22000, 0.92, resolveHigh, resolveLow, 1.0)); // resolution candle
  return candles;
}

test('runBreakerBlockBacktest: a broken bullish OB flips to a bearish breaker, entry on retest, stop beyond the far edge -> loss', () => {
  const candles = buildFixture({ resolveHigh: 1.03, resolveLow: 0.9 }); // high 1.03 >= stop 1.02
  const trades = runBreakerBlockBacktest(candles, { lookback: 2, searchLookback: 5, maxAgeCandles: 10 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 21);
  assert.equal(t.entryPrice, 0.93);
  assert.equal(t.stopPrice, 1.02); // the OB's far edge (zoneHigh)
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runBreakerBlockBacktest: same setup resolves to a win at the fixed 1:3 target', () => {
  // entry=0.93, stop=1.02, distance=0.09, target=0.93-0.27=0.66
  const candles = buildFixture({ resolveHigh: 0.95, resolveLow: 0.6 }); // low 0.6 <= target 0.66
  const trades = runBreakerBlockBacktest(candles, { lookback: 2, searchLookback: 5, maxAgeCandles: 10 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.targetPrice - 0.66) < 1e-9);
  assert.equal(t.rMultiple, 3);
});

test('runBreakerBlockBacktest: no trade at all if the OB is never broken through (classic mitigation, not a breaker)', () => {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(filler(i));
  candles.push(c(5000, 1, 2.0, 0.95, 1));
  candles.push(filler(6));
  candles.push(filler(7));
  candles.push(c(8000, 1.0, 1.02, 0.85, 0.9));
  candles.push(c(9000, 1, 1.05, 0.95, 1.05));
  candles.push(c(10000, 1, 2.2, 0.95, 2.1));
  // Stays safely inside/above the zone [0.85, 1.02] for a long stretch - never breaks through zoneLow.
  for (let i = 11; i <= 25; i++) candles.push(c(i * 1000, 0.95, 1.0, 0.9, 0.95));
  const trades = runBreakerBlockBacktest(candles, { lookback: 2, searchLookback: 5, maxAgeCandles: 10 });
  assert.equal(trades.length, 0);
});
