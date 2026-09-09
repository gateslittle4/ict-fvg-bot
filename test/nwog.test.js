import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNwogEvents, runNwogBacktest } from '../src/backtest/nwog.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const H = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;

test('detectNwogEvents: a ~50h weekend break with a higher new open is a bearish (fade-the-gap) signal', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100), // Friday's last candle, close=100
    c(50 * H, 108, 109, 107.5, 108.2), // Sunday's open, gapped up to 108
  ];
  const events = detectNwogEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 109); // the gap candle's own high
});

test('detectNwogEvents: the mirror case (gapped down) is bullish', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 92, 93, 91, 92.5), // gapped down to 92
  ];
  const events = detectNwogEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].stopReference, 91); // the gap candle's own low
});

test('detectNwogEvents: a normal 15-minute candle spacing is never a signal', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(M15, 100, 101, 99, 100.5)];
  assert.equal(detectNwogEvents(candles).length, 0);
});

test('detectNwogEvents: a break with no actual price gap (open == prior close) is skipped', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(50 * H, 100, 101, 99, 100.5)];
  assert.equal(detectNwogEvents(candles).length, 0);
});

test('detectNwogEvents: an outlier gap far beyond a normal weekend is excluded (data-quality guard)', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(9000 * H, 108, 109, 107.5, 108.2)];
  assert.equal(detectNwogEvents(candles).length, 0);
});

test('runNwogBacktest: enters at the open of the candle AFTER the gap candle, resolves to a loss on stop', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 108, 109, 107.5, 108.2), // gap candle: bearish signal, stopReference=109
    c(51 * H, 108.2, 108.5, 108, 108.3), // entry candle, open=108.2
    c(52 * H, 108.3, 109.5, 108, 109), // high 109.5 >= stop 109 -> loss
  ];
  const trades = runNwogBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryIndex, 2);
  assert.equal(t.entryPrice, 108.2);
  assert.equal(t.stopPrice, 109);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runNwogBacktest: resolves to a win at the fixed 1:3 target', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 92, 93, 91, 92.5), // bullish signal, stopReference=91 (gap candle's low)
    c(51 * H, 93, 93.5, 92.8, 93.2), // entry candle, open=93, distance=93-91=2, target=93+6=99
    c(52 * H, 93.2, 99.5, 93, 99.4), // high 99.5 >= target 99 -> win
  ];
  const trades = runNwogBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.stopPrice, 91);
  assert.equal(t.targetPrice, 99);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runNwogBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 108, 109, 107.5, 108.2), // bearish signal, stopReference=109 (gap candle's high)
    c(51 * H, 110, 110.5, 109.8, 110.2), // entry candle opens ABOVE the stop (110 > 109) - invalid short
  ];
  const trades = runNwogBacktest(candles);
  assert.equal(trades.length, 0);
});
