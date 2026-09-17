import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPowerOfThreeEvents, runPowerOfThreeBacktest } from '../src/backtest/powerOfThree.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

// January 2024: NY is on fixed EST (no DST) that month, so `.time`'s own
// UTC hour-of-day equals the real NY local hour-of-day (see silverBullet.test.js's
// own note on this). Builds: an Asian range [99,101] on Jan 1 (20:00-23:45
// NY), a bullish manipulation sweep in the London killzone on Jan 2 (a wick
// below 99 that reclaims back above it at 02:00), then the first candle of
// the NY AM distribution window (08:00) is where entry should fire - one
// session later, not immediately after the sweep. Verified against the
// actual function output before hardcoding (same discipline as this
// project's other multi-session modules) - the day-keyed range lookup and
// the cross-session deferral aren't simple enough to hand-verify without
// running it first.
function bullishFixture() {
  const candles = [];
  let t = Date.UTC(2024, 0, 1, 0, 0);
  while (new Date(t).getUTCHours() < 20) { candles.push(c(t, 100, 100.1, 99.9, 100)); t += M15; }
  for (let i = 0; i < 16; i++) {
    const isEdge = i === 3;
    candles.push(c(t, 100, isEdge ? 101 : 100.2, isEdge ? 99 : 99.8, 100)); // Asian range [99,101]
    t += M15;
  }
  while (new Date(t).getUTCHours() !== 2 || new Date(t).getUTCDate() !== 2) { candles.push(c(t, 100, 100.1, 99.9, 100)); t += M15; }
  candles.push(c(t, 99.5, 99.6, 98.5, 99.7)); t += M15; // manipulation: low 98.5 < 99, close 99.7 > 99 -> bullish sweep
  const manipulationIndex = candles.length - 1;
  while (new Date(t).getUTCHours() !== 8 || new Date(t).getUTCDate() !== 2) { candles.push(c(t, 99.7, 99.8, 99.6, 99.7)); t += M15; }
  const entryIndex = candles.length;
  candles.push(c(t, 100, 100.5, 99.9, 100.2)); t += M15; // first candle of the NY AM distribution window
  return { candles, t, manipulationIndex, entryIndex };
}

test('detectPowerOfThreeEvents: a London-session sweep-and-reclaim of the Asian range defers its entry to the first NY AM candle, not the candle right after the sweep', () => {
  const { candles, manipulationIndex, entryIndex } = bullishFixture();
  const events = detectPowerOfThreeEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].manipulationIndex, manipulationIndex);
  assert.equal(events[0].entryIndex, entryIndex);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].sweepExtreme, 98.5);
  assert.ok(events[0].entryIndex > events[0].manipulationIndex + 1, 'entry must be deferred, not immediate');
});

test('detectPowerOfThreeEvents: no manipulation sweep that day means no event, even though the NY AM window still occurs', () => {
  const candles = [];
  let t = Date.UTC(2024, 0, 1, 0, 0);
  while (new Date(t).getUTCHours() < 20) { candles.push(c(t, 100, 100.1, 99.9, 100)); t += M15; }
  for (let i = 0; i < 16; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; } // flat Asian range, no edge
  while (new Date(t).getUTCHours() !== 8 || new Date(t).getUTCDate() !== 2) { candles.push(c(t, 100, 100.1, 99.9, 100)); t += M15; } // no sweep in London window
  candles.push(c(t, 100, 100.5, 99.9, 100.2)); t += M15;
  assert.deepEqual(detectPowerOfThreeEvents(candles), []);
});

test('detectPowerOfThreeEvents: a flat/no-signal market produces zero events, not a crash', () => {
  const flat = Array.from({ length: 200 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(detectPowerOfThreeEvents(flat), []);
});

test('detectPowerOfThreeEvents: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectPowerOfThreeEvents([]), []);
});

test('runPowerOfThreeBacktest: an unresolved position at the end of the data is dropped, not fabricated', () => {
  const { candles } = bullishFixture();
  assert.deepEqual(runPowerOfThreeBacktest(candles), []);
});

test('runPowerOfThreeBacktest: entry fills at the NY AM candle open, stop at the sweep extreme, and a clean move hits the fixed 1:3 target', () => {
  const { candles, t: t0 } = bullishFixture();
  let t = t0;
  const withMore = [...candles];
  withMore.push(c(t, 100.2, 105, 99.8, 104)); t += M15; // resolves after entry candle, hits target

  const trades = runPowerOfThreeBacktest(withMore);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.entryPrice, 100);
  assert.equal(trade.stopPrice, 98.5);
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runPowerOfThreeBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const { candles, t: t0 } = bullishFixture();
  let t = t0;
  const withMore = [...candles];
  withMore.push(c(t, 100.2, 100.3, 98, 98.2)); t += M15; // dips through the stop

  const trades = runPowerOfThreeBacktest(withMore);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runPowerOfThreeBacktest: a position that resolves at neither stop nor target within the timeout exits at the timeout close', () => {
  const { candles, t: t0 } = bullishFixture();
  let t = t0;
  const withMore = [...candles];
  for (let i = 0; i < 481; i++) {
    const price = withMore[withMore.length - 1].close + (i % 2 === 0 ? 0.01 : -0.01);
    withMore.push(c(t, price, price + 0.02, price - 0.02, price));
    t += M15;
  }
  const trades = runPowerOfThreeBacktest(withMore);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  assert.equal(trades[0].exitIndex - trades[0].entryIndex, 480);
});

test('runPowerOfThreeBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = Array.from({ length: 200 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(runPowerOfThreeBacktest(flat), []);
});

test('runPowerOfThreeBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runPowerOfThreeBacktest([]), []);
});
