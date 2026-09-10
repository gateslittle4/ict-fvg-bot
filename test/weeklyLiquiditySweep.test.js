import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWeekBoundaryIndices, detectWeeklySweepEvents, runWeeklySweepBacktest } from '../src/backtest/weeklyLiquiditySweep.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const H = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;

test('detectWeekBoundaryIndices: a ~50h weekend break is a boundary, normal M15 spacing is not', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(50 * H, 100, 100.5, 99.5, 100), c(50 * H + M15, 100, 100.5, 99.5, 100)];
  assert.deepEqual(detectWeekBoundaryIndices(candles), [1]);
});

test('detectWeekBoundaryIndices: an outlier gap far beyond a normal weekend is excluded (data-quality guard)', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(9000 * H, 100, 100.5, 99.5, 100)];
  assert.deepEqual(detectWeekBoundaryIndices(candles), []);
});

// Week 1 (index 0-2): high=101, low=99. Boundary at index 3 starts week 2.
function twoWeekFixture(week2Candles) {
  return [c(0, 100, 100.5, 99.7, 100), c(M15, 100, 101, 99.5, 100.5), c(2 * M15, 100.5, 100.8, 99, 100), ...week2Candles];
}

test('detectWeeklySweepEvents: a wick above PWH that closes back inside is a bearish signal', () => {
  const candles = twoWeekFixture([
    c(50 * H, 100.2, 102, 100, 100.5), // wick above PWH=101, closes back inside (100.5 < 101)
  ]);
  const events = detectWeeklySweepEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 3);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].sweepExtreme, 102);
});

test('detectWeeklySweepEvents: the mirror case (wick below PWL, closes back inside) is bullish', () => {
  const candles = twoWeekFixture([
    c(50 * H, 99.5, 100, 98, 99.6), // wick below PWL=99, closes back inside (99.6 > 99)
  ]);
  const events = detectWeeklySweepEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].sweepExtreme, 98);
});

test('detectWeeklySweepEvents: a candle that stays inside PWH/PWL fires nothing', () => {
  const candles = twoWeekFixture([c(50 * H, 100.2, 100.8, 99.8, 100.5)]);
  assert.equal(detectWeeklySweepEvents(candles).length, 0);
});

test('detectWeeklySweepEvents: a candle that pierces and closes beyond the level (no reclaim) fires nothing', () => {
  const candles = twoWeekFixture([c(50 * H, 100.2, 102, 100, 101.5)]); // close 101.5 stays above PWH=101, no reclaim
  assert.equal(detectWeeklySweepEvents(candles).length, 0);
});

test('detectWeeklySweepEvents: at most one signal per direction per week', () => {
  const candles = twoWeekFixture([
    c(50 * H, 100.2, 102, 100, 100.5), // bearish fires here
    c(50 * H + M15, 100.5, 103, 100, 100.6), // would also fire bearish, but already fired this week
  ]);
  const events = detectWeeklySweepEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 3);
});

test('detectWeeklySweepEvents: no boundary at all (single week of data) fires nothing', () => {
  const candles = [c(0, 100, 100.5, 99.7, 100), c(M15, 100, 101, 99.5, 100.5)];
  assert.equal(detectWeeklySweepEvents(candles).length, 0);
});

test('runWeeklySweepBacktest: enters at the open of the candle AFTER the sweep+reclaim, resolves to a loss on stop', () => {
  const candles = [
    ...twoWeekFixture([
      c(50 * H, 100.2, 102, 100, 100.5), // bearish signal, sweepExtreme=102
      c(50 * H + M15, 100.5, 100.6, 100.3, 100.4), // entry candle, open=100.5
      c(50 * H + 2 * M15, 100.4, 102.5, 100.2, 102), // high 102.5 >= stop 102 -> loss
    ]),
  ];
  const trades = runWeeklySweepBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bearish');
  assert.equal(t.entryPrice, 100.5);
  assert.equal(t.stopPrice, 102);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runWeeklySweepBacktest: resolves to a win at the fixed 1:3 target', () => {
  const candles = [
    ...twoWeekFixture([
      c(50 * H, 99.5, 100, 98, 99.6), // bullish signal, sweepExtreme=98
      c(50 * H + M15, 99.7, 99.9, 99.5, 99.8), // entry candle, open=99.7, distance=99.7-98=1.7, target=99.7+5.1=104.8
      c(50 * H + 2 * M15, 99.8, 105, 99.6, 104.9), // high 105 >= target 104.8 -> win
    ]),
  ];
  const trades = runWeeklySweepBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.stopPrice, 98);
  assert.ok(Math.abs(t.targetPrice - 104.8) < 1e-9);
  assert.equal(t.outcome, 'win');
  assert.equal(t.rMultiple, 3);
});

test('runWeeklySweepBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const candles = [
    ...twoWeekFixture([
      c(50 * H, 100.2, 102, 100, 100.5), // bearish signal, sweepExtreme=102
      c(50 * H + M15, 103, 103.5, 102.8, 103.2), // entry candle opens ABOVE the stop (103 > 102) - invalid short
    ]),
  ];
  const trades = runWeeklySweepBacktest(candles);
  assert.equal(trades.length, 0);
});
