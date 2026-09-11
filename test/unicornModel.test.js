import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUnicornModelBacktest } from '../src/backtest/unicornModel.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}
function filler(i, o = 1, h = 1.05, l = 0.95, cl = 1) {
  return c(i * 1000, o, h, l, cl);
}

// Same swing/BOS/OB/break-through setup as breakerBlock.test.js's fixture
// (bearish OB @8 = [0.85, 1.02], bullish BOS @10, breaks through @15 ->
// flips to a bearish breaker), THEN a bearish FVG forms @16-18 (c1=16
// low=1.00, c3=18 high=0.95 -> zone [0.95, 1.00], overlapping the breaker's
// [0.85, 1.02] at [0.95, 1.00]), retested from below @19, entry @20.
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
  candles.push(c(15000, 1, 1.05, 0.5, 0.6)); // breaks through zoneLow (0.85) -> bearish breaker
  candles.push(c(16000, 1.0, 1.02, 1.00, 1.01)); // FVG c1: low=1.00
  candles.push(filler(17));
  candles.push(c(18000, 0.95, 0.95, 0.90, 0.92)); // FVG c3: high=0.95 -> bearish FVG [0.95, 1.00]
  candles.push(c(19000, 0.93, 0.96, 0.90, 0.92)); // retests overlap [0.95,1.00] from below (high 0.96 >= 0.95)
  candles.push(c(20000, 0.93, 0.95, 0.90, 0.92)); // entry candle, open=0.93
  candles.push(c(21000, 0.92, resolveHigh, resolveLow, 1.0)); // resolution candle
  return candles;
}

const OPTS = { lookback: 2, searchLookback: 5, maxAgeCandles: 10, fvgWindowCandles: 10 };

test('runUnicornModelBacktest: breaker + overlapping FVG + retest -> entry, stop beyond the breaker far edge, loss', () => {
  const candles = buildFixture({ resolveHigh: 1.03, resolveLow: 0.9 }); // high 1.03 >= stop 1.02
  const trades = runUnicornModelBacktest(candles, OPTS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 20);
  assert.equal(t.entryPrice, 0.93);
  assert.equal(t.stopPrice, 1.02); // breaker's far edge (zoneHigh)
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runUnicornModelBacktest: same setup resolves to a win at the fixed 1:3 target', () => {
  // entry=0.93, stop=1.02, distance=0.09, target=0.93-0.27=0.66
  const candles = buildFixture({ resolveHigh: 0.95, resolveLow: 0.6 }); // low 0.6 <= target 0.66
  const trades = runUnicornModelBacktest(candles, OPTS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.targetPrice - 0.66) < 1e-9);
  assert.equal(t.rMultiple, 3);
});

test('runUnicornModelBacktest: breaker confirmed but NO overlapping FVG ever forms -> no trade (distinct from plain Breaker Block, which would enter on the raw mid-retest alone)', () => {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(filler(i));
  candles.push(c(5000, 1, 2.0, 0.95, 1));
  candles.push(filler(6));
  candles.push(filler(7));
  candles.push(c(8000, 1.0, 1.02, 0.85, 0.9));
  candles.push(c(9000, 1, 1.05, 0.95, 1.05));
  candles.push(c(10000, 1, 2.2, 0.95, 2.1));
  for (let i = 11; i <= 14; i++) candles.push(filler(i));
  candles.push(c(15000, 1, 1.05, 0.5, 0.6)); // breaks through -> bearish breaker armed
  // Plain filler candles only from here - even a retest of the breaker's own
  // mid (0.935) happens @20, but with NO qualifying FVG ever formed, so the
  // Unicorn Model must stay flat (unlike breakerBlock.js's plain retest rule).
  for (let i = 16; i <= 19; i++) candles.push(c(i * 1000, 0.6, 0.7, 0.55, 0.6));
  candles.push(c(20000, 0.6, 0.94, 0.55, 0.7)); // retests the raw mid from below
  for (let i = 21; i <= 26; i++) candles.push(c(i * 1000, 0.6, 0.7, 0.55, 0.6));
  const trades = runUnicornModelBacktest(candles, OPTS);
  assert.equal(trades.length, 0);
});

test('runUnicornModelBacktest: an FVG that forms but does NOT overlap the breaker zone is ignored', () => {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(filler(i));
  candles.push(c(5000, 1, 2.0, 0.95, 1));
  candles.push(filler(6));
  candles.push(filler(7));
  candles.push(c(8000, 1.0, 1.02, 0.85, 0.9)); // breaker zone will be [0.85, 1.02]
  candles.push(c(9000, 1, 1.05, 0.95, 1.05));
  candles.push(c(10000, 1, 2.2, 0.95, 2.1));
  for (let i = 11; i <= 14; i++) candles.push(filler(i));
  candles.push(c(15000, 1, 1.05, 0.5, 0.6)); // breaks through -> bearish breaker
  // Bearish FVG well BELOW the breaker zone [0.85,1.02] - zone [0.3,0.4], no overlap.
  candles.push(c(16000, 0.4, 0.45, 0.4, 0.42));
  candles.push(filler(17, 0.4, 0.45, 0.35, 0.4));
  candles.push(c(18000, 0.3, 0.3, 0.25, 0.28));
  for (let i = 19; i <= 30; i++) candles.push(c(i * 1000, 0.35, 0.4, 0.3, 0.35));
  const trades = runUnicornModelBacktest(candles, OPTS);
  assert.equal(trades.length, 0);
});

test('runUnicornModelBacktest: no trade at all if the OB is never broken through (classic mitigation, not a breaker)', () => {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(filler(i));
  candles.push(c(5000, 1, 2.0, 0.95, 1));
  candles.push(filler(6));
  candles.push(filler(7));
  candles.push(c(8000, 1.0, 1.02, 0.85, 0.9));
  candles.push(c(9000, 1, 1.05, 0.95, 1.05));
  candles.push(c(10000, 1, 2.2, 0.95, 2.1));
  for (let i = 11; i <= 25; i++) candles.push(c(i * 1000, 0.95, 1.0, 0.9, 0.95));
  const trades = runUnicornModelBacktest(candles, OPTS);
  assert.equal(trades.length, 0);
});
