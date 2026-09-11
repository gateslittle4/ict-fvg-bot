import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRsiMomentumBacktest } from '../src/backtest/rsiMomentum.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}
const DAY = 24 * 60 * 60 * 1000;

const OPTS = { emaTrendPeriod: 5, rsiPeriod: 2, atrPeriod: 3, maxHoldingDays: 20, stopAtrMultiple: 2, rrMultiple: 3 };

// Warm-up oscillates gently (net uptrend, but RSI(2) stays moderate ~62,
// well below the 95 overbought threshold - a monotonic rise would push
// RSI(2) to 100 almost immediately, since it's only a 2-period window and
// would trigger far too early for a controlled fixture) then two strong up
// days push RSI(2) to 100 while still in an uptrend -> should trigger a
// BULLISH momentum entry (buy strength), the opposite of what Connors'
// mean-reversion version would do at this exact point (which requires
// OVERSOLD, not overbought).
const WARMUP_CLOSES = [100, 100.5, 100.2, 100.7, 100.4, 100.9, 100.6, 101.1, 100.8, 101.3];
function buildFixture({ resolveHigh, resolveLow } = {}) {
  const closes = [...WARMUP_CLOSES, 104.3, 107.3]; // indices 10,11: two strong up days -> RSI(2)=100 at index 10 and 11
  const candles = closes.map((cl, i) => c(i * DAY, cl - 0.1, cl + 0.2, cl - 0.3, cl));
  // signal day = index 10 (rsi[10]=100, uptrend) -> entry fills at index 11's OWN open (next-day convention)
  // day 11 is therefore both the entry candle AND (per the resolve loop's `i > open.entryIndex` guard) not
  // itself checked for resolution - a 12th candle (index 12) is needed to resolve the trade.
  if (resolveHigh !== undefined) candles.push(c(12 * DAY, candles[11].close, resolveHigh, resolveLow, (resolveHigh + resolveLow) / 2));
  return candles;
}

test('runRsiMomentumBacktest: overbought RSI(2) in an uptrend triggers a BULLISH entry (buy strength, not the Connors reversal)', () => {
  const candles = buildFixture({ resolveHigh: 108, resolveLow: 106 }); // neither stop nor target - resolves via timeout instead, just to observe entry fields
  const trades = runRsiMomentumBacktest(candles, { ...OPTS, maxHoldingDays: 1 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 11); // fills at the open of the day AFTER the overbought signal day (index 10)
  assert.equal(t.entryTime, 11 * DAY);
});

test('runRsiMomentumBacktest: no entry while still in the warm-up stretch (RSI never extreme)', () => {
  const candles = WARMUP_CLOSES.map((cl, i) => c(i * DAY, cl - 0.1, cl + 0.2, cl - 0.3, cl));
  const trades = runRsiMomentumBacktest(candles, OPTS);
  assert.equal(trades.length, 0);
});

test('runRsiMomentumBacktest: a bullish momentum trade resolves to a loss on stop', () => {
  const candles = buildFixture({ resolveHigh: 107.3 + 1, resolveLow: 107.3 - 100 }); // low far below entry - clears any computed stop
  const trades = runRsiMomentumBacktest(candles, OPTS);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
});

test('runRsiMomentumBacktest: a bullish momentum trade resolves to a win at the fixed 1:3 target', () => {
  const candles = buildFixture({ resolveHigh: 107.3 + 1000, resolveLow: 107.3 - 1 }); // huge rally clears any computed target
  const trades = runRsiMomentumBacktest(candles, OPTS);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 3);
});

test('runRsiMomentumBacktest: oversold RSI(2) in a DOWNTREND triggers the mirror BEARISH entry', () => {
  const downCloses = WARMUP_CLOSES.map((v) => 200 - (v - 100)); // mirror image around 200, net downtrend
  const closes = [...downCloses, 200 - 4.3, 200 - 7.3]; // two strong DOWN days -> RSI(2) near 0
  const candles = closes.map((cl, i) => c(i * DAY, cl + 0.1, cl + 0.3, cl - 0.2, cl));
  candles.push(c(12 * DAY, candles[11].close, candles[11].close + 1, candles[11].close - 1000, candles[11].close - 900)); // huge decline -> target hit
  const trades = runRsiMomentumBacktest(candles, OPTS);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, 'bearish');
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 3);
});
