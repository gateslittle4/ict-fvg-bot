import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAsianRangeFadeEvents, runAsianRangeFadeBacktest } from '../src/backtest/asianRangeFade.js';

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

test('detectAsianRangeFadeEvents: a sweep ABOVE the range high that reclaims back inside is a bearish (fade) signal', () => {
  const window = [
    c(histDataTime(2024, 1, 16, 0, 0), 99, 100, 98, 99), // inside range - must NOT count
    c(histDataTime(2024, 1, 16, 0, 30), 100, 115, 99, 105), // wick above 110, close 105 reclaims back inside
  ];
  const events = detectAsianRangeFadeEvents([...asianFixture(), ...window]);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 5);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].sweepExtreme, 115);
});

test('detectAsianRangeFadeEvents: the mirror case (sweep below range low, reclaim above it) is bullish', () => {
  const window = [c(histDataTime(2024, 1, 16, 0, 30), 92, 93, 80, 95)]; // wick below 90, close 95 reclaims above it
  const events = detectAsianRangeFadeEvents([...asianFixture(), ...window]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].sweepExtreme, 80);
});

test('detectAsianRangeFadeEvents: only one signal per direction per day', () => {
  const window = [
    c(histDataTime(2024, 1, 16, 0, 15), 100, 115, 99, 105), // first bearish fade
    c(histDataTime(2024, 1, 16, 0, 30), 105, 116, 104, 106), // still sweeping+reclaiming above - must NOT count again
  ];
  const events = detectAsianRangeFadeEvents([...asianFixture(), ...window]);
  assert.equal(events.length, 1);
});

test('detectAsianRangeFadeEvents: a sweep+reclaim outside the breakout window does not count', () => {
  const window = [c(histDataTime(2024, 1, 16, 12, 0), 100, 115, 99, 105)]; // same shape, but midday
  const events = detectAsianRangeFadeEvents([...asianFixture(), ...window]);
  assert.equal(events.length, 0);
});

test('detectAsianRangeFadeEvents: a clean close beyond the range (no reclaim) is NOT a fade signal', () => {
  const window = [c(histDataTime(2024, 1, 16, 0, 30), 100, 115, 99, 111)]; // closes above 110, no reclaim - this is the Asian Range Breakout case, not fade
  const events = detectAsianRangeFadeEvents([...asianFixture(), ...window]);
  assert.equal(events.length, 0);
});

test('runAsianRangeFadeBacktest: enters at next-candle open, stop beyond the sweep extreme, exits on the fixed 1:3 target', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 100, 115, 99, 105), // bearish fade event, sweepExtreme=115
    c(histDataTime(2024, 1, 16, 0, 45), 105, 106, 104, 105), // entry candle, open=105
    c(histDataTime(2024, 1, 16, 1, 0), 105, 106, 30, 35), // low 30 <= target (105 - 3*10 = 75)
  ];
  const trades = runAsianRangeFadeBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 5);
  assert.equal(t.entryPrice, 105);
  assert.equal(t.stopPrice, 115); // the sweep's own extreme
  assert.equal(t.distance, 10);
  assert.equal(t.targetPrice, 75);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runAsianRangeFadeBacktest: exits at a loss when the sweep extreme (stop) is retaken instead', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 100, 115, 99, 105),
    c(histDataTime(2024, 1, 16, 0, 45), 105, 106, 104, 105),
    c(histDataTime(2024, 1, 16, 1, 0), 105, 116, 104, 110), // high 116 >= stop 115
  ];
  const trades = runAsianRangeFadeBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, 115);
  assert.equal(trades[0].rMultiple, -1);
});

test('runAsianRangeFadeBacktest: bullish case resolves symmetrically', () => {
  const rest = [
    c(histDataTime(2024, 1, 16, 0, 30), 92, 93, 80, 95), // bullish fade event, sweepExtreme=80
    c(histDataTime(2024, 1, 16, 0, 45), 95, 96, 94, 95), // entry candle, open=95
    c(histDataTime(2024, 1, 16, 1, 0), 95, 145, 94, 140), // high 145 >= target (95 + 3*15 = 140)
  ];
  const trades = runAsianRangeFadeBacktest([...asianFixture(), ...rest]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryPrice, 95);
  assert.equal(t.stopPrice, 80);
  assert.equal(t.distance, 15);
  assert.equal(t.targetPrice, 140);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});
