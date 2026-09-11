import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNdogEvents, runNdogBacktest } from '../src/backtest/ndog.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const H = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;

test('detectNdogEvents: a ~75min daily pause with a higher new open is a bearish (fade-the-gap) signal', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100), // last candle before the daily pause, close=100
    c(75 * 60 * 1000, 108, 109, 107.5, 108.2), // next day's open, gapped up to 108
  ];
  const events = detectNdogEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 109); // the gap candle's own high
});

test('detectNdogEvents: the mirror case (gapped down) is bullish', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(75 * 60 * 1000, 92, 93, 91, 92.5), // gapped down to 92
  ];
  const events = detectNdogEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].stopReference, 91); // the gap candle's own low
});

test('detectNdogEvents: a normal 15-minute candle spacing is never a signal', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(M15, 100, 101, 99, 100.5)];
  assert.equal(detectNdogEvents(candles).length, 0);
});

test('detectNdogEvents: a break with no actual price gap (open == prior close) is skipped', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(75 * 60 * 1000, 100, 101, 99, 100.5)];
  assert.equal(detectNdogEvents(candles).length, 0);
});

test('detectNdogEvents: a trivial 30-minute break is excluded - too small to be the real daily pause', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(30 * 60 * 1000, 108, 109, 107.5, 108.2)];
  assert.equal(detectNdogEvents(candles).length, 0);
});

test('detectNdogEvents: a weekend-sized (~50h) gap is excluded - that is NWOG\'s event, not NDOG\'s', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(50 * H, 108, 109, 107.5, 108.2)];
  assert.equal(detectNdogEvents(candles).length, 0);
});

test('detectNdogEvents: the 135-minute bucket seen in the real data is still inside bounds', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(135 * 60 * 1000, 108, 109, 107.5, 108.2)];
  assert.equal(detectNdogEvents(candles).length, 1);
});

test('runNdogBacktest: enters at the open of the candle AFTER the gap candle, resolves to a loss on stop', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(75 * 60 * 1000, 108, 109, 107.5, 108.2), // gap candle: bearish signal, stopReference=109
    c(75 * 60 * 1000 + M15, 108.2, 108.5, 108, 108.3), // entry candle, open=108.2
    c(75 * 60 * 1000 + 2 * M15, 108.3, 109.5, 108, 109), // high 109.5 >= stop 109 -> loss
  ];
  const trades = runNdogBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 2);
  assert.equal(t.entryPrice, 108.2);
  assert.equal(t.stopPrice, 109);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runNdogBacktest: resolves to a win at the fixed 1:3 target', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(75 * 60 * 1000, 92, 93, 91, 92.5), // bullish signal, stopReference=91 (gap candle's low)
    c(75 * 60 * 1000 + M15, 93, 93.5, 92.8, 93.2), // entry candle, open=93, distance=93-91=2, target=93+6=99
    c(75 * 60 * 1000 + 2 * M15, 93.2, 99.5, 93, 99.4), // high 99.5 >= target 99 -> win
  ];
  const trades = runNdogBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.stopPrice, 91);
  assert.equal(t.targetPrice, 99);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runNdogBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(75 * 60 * 1000, 108, 109, 107.5, 108.2), // bearish signal, stopReference=109 (gap candle's high)
    c(75 * 60 * 1000 + M15, 110, 110.5, 109.8, 110.2), // entry candle opens ABOVE the stop (110 > 109) - invalid short
  ];
  const trades = runNdogBacktest(candles);
  assert.equal(trades.length, 0);
});
