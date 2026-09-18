import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMidnightOpenRetracementEvents, runMidnightOpenRetracementBacktest } from '../src/backtest/midnightOpen.js';

// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) — see test/nySession.test.js.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('detectMidnightOpenRetracementEvents: price above midnight open at London killzone open is a bearish (retrace down) bias', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100), // midnight open = 100
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5), // killzone open, price at 105 (above 100)
  ];
  const events = detectMidnightOpenRetracementEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 106); // the killzone-open candle's own high
  assert.equal(events[0].target, 100); // the midnight open level itself
});

test('detectMidnightOpenRetracementEvents: price below midnight open is the mirror bullish (retrace up) bias', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 95, 96, 94, 95.5), // below 100
  ];
  const events = detectMidnightOpenRetracementEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].stopReference, 94); // the killzone-open candle's own low
  assert.equal(events[0].target, 100);
});

test('detectMidnightOpenRetracementEvents: no midnight-open candle seen that day -> no signal (data gap, never guessed)', () => {
  const candles = [c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5)];
  assert.equal(detectMidnightOpenRetracementEvents(candles).length, 0);
});

test('detectMidnightOpenRetracementEvents: killzone-open price exactly equal to midnight open -> no signal (no bias, zero distance)', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 100, 101, 99, 100.5),
  ];
  assert.equal(detectMidnightOpenRetracementEvents(candles).length, 0);
});

test('detectMidnightOpenRetracementEvents: only the FIRST candle of the killzone window establishes the bias, later candles in the same window are ignored', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5),
    c(histDataTime(2024, 1, 15, 2, 15), 105.5, 107, 105, 106.5), // still inside the window, must NOT re-signal
  ];
  const events = detectMidnightOpenRetracementEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
});

test('detectMidnightOpenRetracementEvents: only one signal per NY calendar day, a second day gets its own independent signal', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5),
    c(histDataTime(2024, 1, 16, 0, 0), 120, 120.5, 119.5, 120), // new day, new anchor = 120
    c(histDataTime(2024, 1, 16, 2, 0), 115, 116, 114, 115.5), // below 120 -> bullish
  ];
  const events = detectMidnightOpenRetracementEvents(candles);
  assert.equal(events.length, 2);
  assert.equal(events[1].direction, 'bullish');
  assert.equal(events[1].target, 120);
});

test('runMidnightOpenRetracementBacktest: enters at the open of the candle AFTER the bias candle, wins by tapping the midnight open level', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100), // midnight open = 100
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5), // bias candle: bearish, stop=106, target=100
    c(histDataTime(2024, 1, 15, 2, 15), 105.5, 105.8, 104.5, 105), // entry candle, open=105.5
    c(histDataTime(2024, 1, 15, 2, 30), 105, 105.2, 99.5, 100), // low 99.5 <= target 100 -> win
  ];
  const trades = runMidnightOpenRetracementBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryPrice, 105.5);
  assert.equal(t.stopPrice, 106);
  assert.equal(t.targetPrice, 100);
  assert.equal(t.outcome, 'win');
  assert.equal(t.exitPrice, 100);
});

test('runMidnightOpenRetracementBacktest: resolves to a loss when the stop is hit before the level is tapped', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5), // stop=106
    c(histDataTime(2024, 1, 15, 2, 15), 105.5, 105.8, 104.5, 105),
    c(histDataTime(2024, 1, 15, 2, 30), 105, 107, 104.5, 106.5), // high 107 >= stop 106 -> loss
  ];
  const trades = runMidnightOpenRetracementBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, 106);
  assert.equal(trades[0].rMultiple, -1);
});

test('runMidnightOpenRetracementBacktest: a bias candle whose target is already on the wrong side of the eventual entry price is discarded, not mis-signed', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100), // target = 100
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5), // bearish bias, stop=106
    c(histDataTime(2024, 1, 15, 2, 15), 99, 99.5, 98.5, 99), // entry candle opens BELOW the target (99 < 100) - invalid for a bearish trade
  ];
  const trades = runMidnightOpenRetracementBacktest(candles);
  assert.equal(trades.length, 0);
});

test('runMidnightOpenRetracementBacktest: times out after MAX_HOLDING_CANDLES if neither stop nor target is hit', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 2, 0), 105, 106, 104, 105.5),
    c(histDataTime(2024, 1, 15, 2, 15), 105.5, 105.6, 105.4, 105.5),
  ];
  for (let i = 0; i < 481; i++) {
    candles.push(c(candles[candles.length - 1].time + 15 * 60 * 1000, 105.5, 105.6, 105.4, 105.5));
  }
  const trades = runMidnightOpenRetracementBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
});
