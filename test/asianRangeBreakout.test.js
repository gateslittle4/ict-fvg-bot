import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAsianRangeBreakoutEvents, runAsianRangeBreakoutBacktest } from '../src/backtest/asianRangeBreakout.js';

// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) — see test/nySession.test.js.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Asian killzone (Jan 15 2024, 20:00-23:45 NY): range high=110, low=90.
function asianFixture() {
  return [
    c(histDataTime(2024, 1, 15, 20, 0), 100, 101, 99, 100),
    c(histDataTime(2024, 1, 15, 21, 0), 100, 110, 100, 108), // range high 110
    c(histDataTime(2024, 1, 15, 22, 0), 108, 109, 90, 95), // range low 90
    c(histDataTime(2024, 1, 15, 23, 0), 95, 100, 94, 99),
  ];
}

test('detectAsianRangeBreakoutEvents: a candle in the breakout window closing above the Asian range high is a bullish signal', () => {
  const breakout = [
    c(histDataTime(2024, 1, 16, 0, 0), 99, 100, 98, 99), // inside range, before break - must NOT count
    c(histDataTime(2024, 1, 16, 0, 30), 100, 112, 99, 111), // closes above range high 110
  ];
  const events = detectAsianRangeBreakoutEvents([...asianFixture(), ...breakout]);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 5);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].rangeHigh, 110);
  assert.equal(events[0].rangeLow, 90);
});

test('detectAsianRangeBreakoutEvents: the mirror case (close below range low) is a bearish signal', () => {
  const breakout = [c(histDataTime(2024, 1, 16, 0, 30), 92, 93, 85, 88)]; // closes below range low 90
  const events = detectAsianRangeBreakoutEvents([...asianFixture(), ...breakout]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
});

test('detectAsianRangeBreakoutEvents: only one signal per direction per day', () => {
  const breakout = [
    c(histDataTime(2024, 1, 16, 0, 15), 100, 112, 99, 111), // first bullish break
    c(histDataTime(2024, 1, 16, 0, 30), 111, 115, 109, 113), // still above range high - must NOT count again
  ];
  const events = detectAsianRangeBreakoutEvents([...asianFixture(), ...breakout]);
  assert.equal(events.length, 1);
});

test('detectAsianRangeBreakoutEvents: a close beyond the range outside the breakout window does not count', () => {
  const breakout = [c(histDataTime(2024, 1, 16, 12, 0), 100, 112, 99, 111)]; // same shape, but midday - not the breakout window
  const events = detectAsianRangeBreakoutEvents([...asianFixture(), ...breakout]);
  assert.equal(events.length, 0);
});

test('runAsianRangeBreakoutBacktest: enters at next-candle open, stop at the opposite side of the range, exits on the fixed 1:3 target', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 100, 112, 99, 111), // bullish breakout event
    c(histDataTime(2024, 1, 16, 0, 45), 111, 112, 110, 111), // entry candle, open=111
    c(histDataTime(2024, 1, 16, 1, 0), 111, 200, 111, 190), // high 200 >= target 174
  ];
  const trades = runAsianRangeBreakoutBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 5);
  assert.equal(t.entryPrice, 111);
  assert.equal(t.stopPrice, 90); // opposite side of the Asian range
  assert.equal(t.distance, 21);
  assert.equal(t.targetPrice, 174); // entry + 3*distance
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runAsianRangeBreakoutBacktest: exits at a loss when the opposite side of the range is retaken instead', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 100, 112, 99, 111),
    c(histDataTime(2024, 1, 16, 0, 45), 111, 112, 110, 111),
    c(histDataTime(2024, 1, 16, 1, 0), 111, 112, 85, 95), // low 85 <= stop 90
  ];
  const trades = runAsianRangeBreakoutBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, 90);
  assert.equal(trades[0].rMultiple, -1);
});

test('runAsianRangeBreakoutBacktest: bearish case resolves symmetrically', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 92, 93, 85, 88), // bearish breakout event
    c(histDataTime(2024, 1, 16, 0, 45), 88, 89, 87, 88), // entry candle, open=88
    c(histDataTime(2024, 1, 16, 1, 0), 88, 88, 20, 25), // low 20 <= target (88 - 3*(110-88)=88-66=22)
  ];
  const trades = runAsianRangeBreakoutBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryPrice, 88);
  assert.equal(t.stopPrice, 110);
  assert.equal(t.distance, 22);
  assert.equal(t.targetPrice, 22);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});
