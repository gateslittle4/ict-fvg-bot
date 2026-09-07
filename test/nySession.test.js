import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRealNyHourMinute, isInNySessionWindow, SessionFilteredFvgEngine } from '../src/backtest/nySession.js';

// Candle `.time` uses the fixed-EST-as-UTC convention from convertHistData.js:
// the digits are HistData's EST wall clock, parsed as if they were UTC.
// True UTC = time + 5h. Real NY local time is DST-aware.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}

test('winter (EST, no DST): fixed-EST digits map straight to real NY time', () => {
  // Jan 15 2024, HistData digits "08:30" (fixed EST) -> true UTC 13:30 ->
  // real NY local in January is EST (UTC-5) too, so real NY time = 08:30.
  const t = histDataTime(2024, 1, 15, 8, 30);
  const { hour, minute } = toRealNyHourMinute(t);
  assert.equal(hour, 8);
  assert.equal(minute, 30);
});

test('summer (EDT, DST in effect): fixed-EST digits lag real NY time by 1 hour', () => {
  // Jul 15 2024, HistData digits "08:30" (fixed EST) -> true UTC 13:30 ->
  // real NY local in July is EDT (UTC-4), so real NY time = 09:30.
  const t = histDataTime(2024, 7, 15, 8, 30);
  const { hour, minute } = toRealNyHourMinute(t);
  assert.equal(hour, 9);
  assert.equal(minute, 30);
});

test('isInNySessionWindow correctly shifts the window boundary across the DST transition', () => {
  // Same fixed-EST digit "07:30" should be OUTSIDE [8,12) in winter (real NY 07:30)
  // but INSIDE [8,12) in summer (real NY 08:30, because DST shifts it forward).
  const winterT = histDataTime(2024, 1, 15, 7, 30);
  const summerT = histDataTime(2024, 7, 15, 7, 30);
  assert.equal(isInNySessionWindow(winterT, 8, 12), false);
  assert.equal(isInNySessionWindow(summerT, 8, 12), true);
});

test('isInNySessionWindow: inclusive start, exclusive end', () => {
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 8, 0), 8, 12), true);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 11, 59), 8, 12), true);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 12, 0), 8, 12), false);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 7, 59), 8, 12), false);
});

test('isInNySessionWindow supports fractional (half-hour) boundaries', () => {
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 8, 29), 8.5, 10), false);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 8, 30), 8.5, 10), true);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 9, 59), 8.5, 10), true);
  assert.equal(isInNySessionWindow(histDataTime(2024, 1, 15, 10, 0), 8.5, 10), false);
});

test('SessionFilteredFvgEngine drops validated events outside the session window', () => {
  const innerEvents = [{ type: 'watching' }, { type: 'validated', direction: 'bullish' }];
  const innerEngine = { processCandle: () => innerEvents };
  const engine = new SessionFilteredFvgEngine(innerEngine, { startHour: 8, endHour: 12 });

  const inWindow = engine.processCandle({ time: histDataTime(2024, 1, 15, 9, 0) });
  assert.equal(inWindow.filter((e) => e.type === 'validated').length, 1);

  const outsideWindow = engine.processCandle({ time: histDataTime(2024, 1, 15, 15, 0) });
  assert.equal(outsideWindow.filter((e) => e.type === 'validated').length, 0);

  assert.equal(engine.passedCount, 1);
  assert.equal(engine.filteredCount, 1);
});
