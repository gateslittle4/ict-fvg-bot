import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectJudasSwingEvents, runJudasSwingBacktest } from '../src/backtest/judasSwing.js';

// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) — see test/nySession.test.js.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Day 1 (Jan 15 2024): a few M15 candles spanning the day whose aggregate
// high/low become PDH=110 / PDL=90 for Day 2.
function day1Fixture() {
  return [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 101, 99, 100),
    c(histDataTime(2024, 1, 15, 6, 0), 100, 110, 100, 108), // day high 110
    c(histDataTime(2024, 1, 15, 12, 0), 108, 109, 90, 95), // day low 90
    c(histDataTime(2024, 1, 15, 18, 0), 95, 100, 94, 99),
  ];
}

test('detectJudasSwingEvents: a candle inside the London killzone that wicks above PDH and reclaims below it is a bearish signal', () => {
  const day2 = [
    c(histDataTime(2024, 1, 16, 1, 0), 99, 100, 98, 99), // before the killzone - must NOT count even though it's a valid wick+reclaim shape
    c(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108), // inside killzone: high 112 > PDH 110, close 108 < 110
  ];
  const events = detectJudasSwingEvents([...day1Fixture(), ...day2]);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 5); // the index of the wick+reclaim candle
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].referenceLevel, 110);
  assert.equal(events[0].sweepExtreme, 112);
});

test('detectJudasSwingEvents: the mirror case (wick below PDL, reclaim above it) is a bullish signal', () => {
  const day2 = [c(histDataTime(2024, 1, 16, 2, 30), 92, 93, 85, 91)]; // low 85 < PDL 90, close 91 > 90
  const events = detectJudasSwingEvents([...day1Fixture(), ...day2]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].referenceLevel, 90);
  assert.equal(events[0].sweepExtreme, 85);
});

test('detectJudasSwingEvents: only one signal per direction per day, even if the level is wicked-and-reclaimed again', () => {
  const day2 = [
    c(histDataTime(2024, 1, 16, 2, 15), 100, 112, 99, 108), // first bearish wick+reclaim
    c(histDataTime(2024, 1, 16, 2, 30), 108, 113, 106, 107), // a second one, same day, same direction - must NOT count again
  ];
  const events = detectJudasSwingEvents([...day1Fixture(), ...day2]);
  assert.equal(events.length, 1);
});

test('detectJudasSwingEvents: a wick+reclaim outside the killzone window does not count', () => {
  const day2 = [c(histDataTime(2024, 1, 16, 12, 0), 100, 112, 99, 108)]; // same shape, but midday - not the London killzone
  const events = detectJudasSwingEvents([...day1Fixture(), ...day2]);
  assert.equal(events.length, 0);
});

test('runJudasSwingBacktest: enters at next-candle open with the sweep extreme as stop, exits on the fixed 1:3 target', () => {
  const day2 = [
    c(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108), // bearish event
    c(histDataTime(2024, 1, 16, 2, 45), 108, 109, 107, 108), // entry candle, open=108
    c(histDataTime(2024, 1, 16, 3, 0), 108, 108.5, 80, 81), // low 80 <= target 96
  ];
  const trades = runJudasSwingBacktest([...day1Fixture(), ...day2]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 5);
  assert.equal(t.entryPrice, 108);
  assert.equal(t.stopPrice, 112); // the sweep's own extreme
  assert.equal(t.distance, 4);
  assert.equal(t.targetPrice, 96); // entry - 3*distance
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runJudasSwingBacktest: exits at a loss when the sweep extreme (stop) is retaken instead', () => {
  const day2 = [
    c(histDataTime(2024, 1, 16, 2, 30), 100, 112, 99, 108),
    c(histDataTime(2024, 1, 16, 2, 45), 108, 109, 107, 108),
    c(histDataTime(2024, 1, 16, 3, 0), 108, 113, 107, 110), // high 113 >= stop 112
  ];
  const trades = runJudasSwingBacktest([...day1Fixture(), ...day2]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, 112);
  assert.equal(trades[0].rMultiple, -1);
});

test('runJudasSwingBacktest: bullish case resolves symmetrically', () => {
  const day2 = [
    c(histDataTime(2024, 1, 16, 2, 30), 92, 93, 85, 91), // bullish event
    c(histDataTime(2024, 1, 16, 2, 45), 91, 92, 90.5, 91.5), // entry candle, open=91
    c(histDataTime(2024, 1, 16, 3, 0), 91.5, 110, 91, 105), // high 110 >= target 109
  ];
  const trades = runJudasSwingBacktest([...day1Fixture(), ...day2]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryPrice, 91);
  assert.equal(t.stopPrice, 85);
  assert.equal(t.targetPrice, 109);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});
