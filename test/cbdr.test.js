import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCbdrEvents, runCbdrBacktest } from '../src/backtest/cbdr.js';

// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) — see test/nySession.test.js.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// CBDR (Jan 15 2024, 14:00-19:45 NY): range high=110, low=90, height=20.
// upper 2x projection = 110 + 2*20 = 150. lower 2x projection = 90 - 2*20 = 50.
function cbdrFixture() {
  return [
    c(histDataTime(2024, 1, 15, 14, 0), 100, 101, 99, 100),
    c(histDataTime(2024, 1, 15, 15, 0), 100, 110, 100, 108), // range high 110
    c(histDataTime(2024, 1, 15, 16, 0), 108, 109, 90, 95), // range low 90
    c(histDataTime(2024, 1, 15, 19, 0), 95, 100, 94, 99),
  ];
}

test('detectCbdrEvents: a candle later the SAME day whose high reaches the upside 2x projection is a bearish fade signal', () => {
  const touch = [c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101)]; // high 152 >= 150
  const events = detectCbdrEvents([...cbdrFixture(), ...touch]);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 4);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].sweepExtreme, 152);
});

test('detectCbdrEvents: a candle before the NEXT day\'s own CBDR opens (hour < 14) still resolves against the PREVIOUS completed cycle', () => {
  const touch = [c(histDataTime(2024, 1, 16, 10, 0), 100, 99, 48, 60)]; // low 48 <= 50
  const events = detectCbdrEvents([...cbdrFixture(), ...touch]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].sweepExtreme, 48);
});

test('detectCbdrEvents: a candle inside the CBDR window itself is never a signal, even if its own range extremes are extreme', () => {
  const events = detectCbdrEvents(cbdrFixture());
  assert.equal(events.length, 0);
});

test('detectCbdrEvents: only one signal per direction per CBDR cycle', () => {
  const touch = [
    c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101), // first bearish touch
    c(histDataTime(2024, 1, 15, 20, 15), 101, 155, 100, 102), // still above projection - must NOT count again
  ];
  const events = detectCbdrEvents([...cbdrFixture(), ...touch]);
  assert.equal(events.length, 1);
});

test('detectCbdrEvents: no completed CBDR cycle yet -> no signal', () => {
  const candles = [c(histDataTime(2024, 1, 15, 20, 0), 100, 500, 99, 101)];
  assert.equal(detectCbdrEvents(candles).length, 0);
});

test('runCbdrBacktest: enters at the open of the candle AFTER the touch candle, resolves to a win at the fixed 1:3 target', () => {
  const touch = [
    c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101), // bearish signal, stop=152
    c(histDataTime(2024, 1, 15, 20, 15), 101, 101.5, 100, 100.5), // entry candle, open=101, distance=51
    c(histDataTime(2024, 1, 15, 20, 30), 100.5, 101, -53, -52), // low <= 101 - 3*51 = -52 -> win
  ];
  const trades = runCbdrBacktest([...cbdrFixture(), ...touch]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryPrice, 101);
  assert.equal(t.stopPrice, 152);
  assert.equal(t.outcome, 'win');
});

test('runCbdrBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const touch = [
    c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101), // bearish signal, stop=152
    c(histDataTime(2024, 1, 15, 20, 15), 160, 161, 159, 160), // entry candle opens ABOVE the stop (160 > 152) - invalid
  ];
  const trades = runCbdrBacktest([...cbdrFixture(), ...touch]);
  assert.equal(trades.length, 0);
});
