import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEqualHighLowSweeps, runEqualHighsLowsBacktest, EQUAL_TOLERANCE_PCT } from '../src/backtest/equalHighsLows.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

// Two nearly-equal swing highs (110 then 110.05, well within the 0.1%
// tolerance), each confirmed by 5 flat candles on both sides (lookback=5),
// followed by a sweep candle that wicks through the more recent (110.05)
// level but closes back below it. Confirmed against the actual function
// output before hardcoding (same discipline as bollingerSqueeze.test.js's
// squeezeThenReleaseFixture) - the swing-confirmation lag and pool-matching
// logic aren't simple enough to hand-verify without running it first.
function equalHighsFixture({ secondHigh = 110.05 } = {}) {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // first swing high = 110
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, secondHigh, 104, 106)); t += M15; // second swing high, near-equal
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  // sweep: wick pierces the more recent level, close reclaims back below it
  candles.push(c(t, 100, secondHigh + 0.25, 99.5, 100)); t += M15;
  return candles;
}

// Mirror fixture for equal lows -> bullish sweep.
function equalLowsFixture({ secondLow = 89.95 } = {}) {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 95, 96, 90, 94)); t += M15; // first swing low = 90
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 95, 96, secondLow, 94)); t += M15; // second swing low, near-equal
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 100, 100.5, secondLow - 0.25, 100)); t += M15; // sweep: wick below, close reclaims above
  return candles;
}

test('detectEqualHighLowSweeps: fires exactly once, at the sweep candle, in the bearish direction, referencing the more recent (second) equal high', () => {
  const candles = equalHighsFixture();
  const events = detectEqualHighLowSweeps(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 30);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].poolLevel, 110.05);
});

test('detectEqualHighLowSweeps: the mirror (equal lows) fires bullish, referencing the more recent equal low', () => {
  const candles = equalLowsFixture();
  const events = detectEqualHighLowSweeps(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].poolLevel, 89.95);
});

test('detectEqualHighLowSweeps: two swing highs right at the tolerance boundary (0.1% apart) still count as equal', () => {
  const candles = equalHighsFixture({ secondHigh: 110 * (1 + EQUAL_TOLERANCE_PCT) });
  const events = detectEqualHighLowSweeps(candles);
  assert.equal(events.length, 1);
});

test('detectEqualHighLowSweeps: two swing highs just past the tolerance boundary do NOT count as equal - no pool, no sweep event', () => {
  const candles = equalHighsFixture({ secondHigh: 110 * (1 + EQUAL_TOLERANCE_PCT) + 0.01 });
  const events = detectEqualHighLowSweeps(candles);
  assert.deepEqual(events, []);
});

test('detectEqualHighLowSweeps: a lone swing high with no matching partner produces no event', () => {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // one swing high, never matched
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 111, 99.5, 100)); t += M15; } // later wicks above it but no pool was ever formed
  assert.deepEqual(detectEqualHighLowSweeps(candles), []);
});

test('detectEqualHighLowSweeps: a wick that pierces the pool but does NOT close back below it is not a sweep', () => {
  const candles = equalHighsFixture();
  // Replace the sweep candle (last one) with a wick-through that closes ABOVE the pool instead of reclaiming.
  candles[candles.length - 1] = c(candles[candles.length - 1].time, 100, 110.4, 99.5, 110.2);
  assert.deepEqual(detectEqualHighLowSweeps(candles), []);
});

test('detectEqualHighLowSweeps: a flat/no-signal market produces zero events, not a crash', () => {
  const flat = Array.from({ length: 50 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(detectEqualHighLowSweeps(flat), []);
});

test('detectEqualHighLowSweeps: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectEqualHighLowSweeps([]), []);
});

test('runEqualHighsLowsBacktest: an unresolved position at the end of the data is dropped, not fabricated', () => {
  const candles = equalHighsFixture();
  assert.deepEqual(runEqualHighsLowsBacktest(candles), []);
});

test('runEqualHighsLowsBacktest: entry fills at the NEXT candle open after the sweep, stop beyond the pool level, and a sustained move hits the fixed 1:3 target', () => {
  const candles = equalHighsFixture();
  let t = candles[candles.length - 1].time + M15;
  candles.push(c(t, 100, 100.5, 95, 96)); t += M15; // entry candle, open=100
  candles.push(c(t, 96, 97, 60, 65)); t += M15; // sustained drop, hits the bearish target

  const trades = runEqualHighsLowsBacktest(candles);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bearish');
  assert.equal(trade.entryIndex, 31); // one candle after the sweep at index 30
  assert.equal(trade.entryPrice, candles[31].open);
  assert.equal(trade.stopPrice, 110.05);
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runEqualHighsLowsBacktest: the bullish mirror also resolves correctly, hitting its 1:3 target', () => {
  const candles = equalLowsFixture();
  let t = candles[candles.length - 1].time + M15;
  candles.push(c(t, 100, 105, 99.5, 104)); t += M15; // entry candle, open=100
  candles.push(c(t, 104, 140, 103, 135)); t += M15; // sustained rally, hits the bullish target

  const trades = runEqualHighsLowsBacktest(candles);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.entryPrice, candles[trade.entryIndex].open);
  assert.equal(trade.stopPrice, 89.95);
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runEqualHighsLowsBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const candles = equalHighsFixture();
  let t = candles[candles.length - 1].time + M15;
  candles.push(c(t, 100, 100.5, 95, 96)); t += M15; // entry candle, open=100
  // Reverse hard immediately after entry - price runs back up through the pool level.
  candles.push(c(t, 96, 111, 95, 110)); t += M15;

  const trades = runEqualHighsLowsBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runEqualHighsLowsBacktest: a position that resolves at neither stop nor target within the timeout exits at the timeout close', () => {
  const candles = equalHighsFixture();
  let t = candles[candles.length - 1].time + M15;
  candles.push(c(t, 100, 100.5, 95, 96)); t += M15; // entry candle, open=100
  // Drift sideways, staying well inside both stop (110.05) and target (69.85),
  // for MAX_HOLDING_CANDLES (480) candles plus one more so the timeout check
  // (i - entryIndex >= 480) has a candle at that index to fire on.
  for (let i = 0; i < 481; i++) {
    const price = candles[candles.length - 1].close + (i % 2 === 0 ? 0.01 : -0.01);
    candles.push(c(t, price, price + 0.02, price - 0.02, price));
    t += M15;
  }
  const trades = runEqualHighsLowsBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  assert.equal(trades[0].exitIndex - trades[0].entryIndex, 480);
});

test('runEqualHighsLowsBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = Array.from({ length: 100 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(runEqualHighsLowsBacktest(flat), []);
});

test('runEqualHighsLowsBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runEqualHighsLowsBacktest([]), []);
});
