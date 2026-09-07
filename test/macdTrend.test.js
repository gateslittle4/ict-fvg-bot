import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMacdSeries, detectMacdCrossoverEvents, runMacdTrendBacktest } from '../src/backtest/macdTrend.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Choppy start (MACD oscillates near zero, crossing the signal line a few
// times — no clean trend yet), then a clean sustained uptrend (higher highs
// and higher lows every day) beginning at index 8 — a textbook setup for the
// MACD line to pull decisively above its signal line as the trend takes
// hold. Small periods (3/6/2 instead of Appel's 12/26/9) keep the fixture
// short while exercising the exact same code path.
function buildFixture() {
  const candles = [];
  let t = 0;
  const day = 86400000;
  const push = (open, high, low, close) => {
    candles.push(c(t, open, high, low, close));
    t += day;
  };
  push(100, 101, 99, 100);
  push(100, 101, 98, 99);
  push(99, 100, 98, 100);
  push(100, 101, 99, 99);
  push(99, 100, 98, 100);
  push(100, 101, 99, 99); // index5 -> MACD line first defined here (slowPeriod=6)
  push(99, 100, 98, 99); // index6 -> signal line first defined here (signalPeriod=2)
  push(99, 100, 97, 98); // index7: still chop
  push(98, 102, 97, 101); // index8: uptrend begins, bullish crossover confirmed on this close
  push(101, 105, 100, 104);
  push(104, 108, 103, 107);
  push(107, 111, 106, 110);
  push(110, 114, 109, 113);
  push(113, 117, 112, 116);
  push(116, 120, 115, 119);
  push(119, 123, 118, 122);
  return candles;
}

const SMALL_OPTS = { fastPeriod: 3, slowPeriod: 6, signalPeriod: 2 };

test('computeMacdSeries: the MACD line pulls decisively above the signal line once the uptrend takes hold', () => {
  const candles = buildFixture();
  const { macdLine, signalLine } = computeMacdSeries(candles, SMALL_OPTS);
  assert.equal(macdLine[0], null); // no warm-up value yet
  assert.equal(macdLine[4], null); // still before slowPeriod-1
  assert.ok(macdLine[5] !== null, 'expected the MACD line to be defined once the slow EMA is');
  assert.equal(signalLine[5], null); // signal needs one more bar than the MACD line itself
  assert.ok(signalLine[6] !== null, 'expected the signal line to be defined the bar after the MACD line');
  assert.ok(macdLine[15] > signalLine[15], 'expected MACD comfortably above signal by the end of the uptrend');
  assert.ok(macdLine[15] > macdLine[8], 'expected the MACD line to keep rising as the uptrend persists');
});

test('detectMacdCrossoverEvents flags the bullish cross where the uptrend begins', () => {
  const candles = buildFixture();
  const { macdLine, signalLine } = computeMacdSeries(candles, SMALL_OPTS);
  const events = detectMacdCrossoverEvents(macdLine, signalLine);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 8);
  assert.equal(events[0].direction, 'bullish');
});

test('detectMacdCrossoverEvents finds a bearish cross when the signal line overtakes the MACD line', () => {
  // Hand-crafted series: MACD starts above signal (10 > 8), then signal overtakes it at index 1 (9 > 8).
  const macdLine = [10, 8, 5, 2];
  const signalLine = [8, 9, 6, 4];
  const events = detectMacdCrossoverEvents(macdLine, signalLine);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].direction, 'bearish');
});

const BACKTEST_OPTS = { ...SMALL_OPTS, atrPeriod: 3, stopAtrMultiple: 2 };

function buildEntryFixture(afterEntry) {
  const candles = buildFixture().slice(0, 9); // through the crossover confirmation day (index 8)
  let t = candles[candles.length - 1].time + 86400000;
  candles.push(c(t, 101, 105, 100, 104)); // index9: entry day, open=101 (next-day-open fill)
  for (const a of afterEntry) {
    t += 86400000;
    candles.push(c(t, a.open, a.high, a.low, a.close));
  }
  return candles;
}

test('runMacdTrendBacktest: enters at next-day open with a 2xATR stop, and exits on the ATR stop', () => {
  const candles = buildEntryFixture([{ open: 104, high: 105, low: 90, close: 91 }]);
  const trades = runMacdTrendBacktest(candles, BACKTEST_OPTS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 9);
  assert.equal(t.entryPrice, 101);
  assert.ok(Math.abs(t.stopPrice - 94.3333333) < 1e-4);
  assert.equal(t.outcome, 'loss');
  assert.ok(Math.abs(t.rMultiple - -1) < 1e-6);
});

test('runMacdTrendBacktest: exits early on an opposite MACD crossover, before the price stop is ever reached', () => {
  const candles = buildEntryFixture([
    { open: 104, high: 104.5, low: 100, close: 101 },
    { open: 101, high: 101.5, low: 96, close: 97 },
    { open: 97, high: 97.5, low: 94, close: 94.5 },
    { open: 94.5, high: 95, low: 93, close: 93.5 },
    { open: 93.5, high: 94, low: 92.5, close: 93 },
  ]);
  const trades = runMacdTrendBacktest(candles, BACKTEST_OPTS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.exitIndex, 11);
  assert.equal(t.exitPrice, 101); // exits at the NEXT day's open after the reversal, not at the stop
  assert.ok(t.exitPrice > t.stopPrice, 'the price stop must never have been reached for this to be a reversal exit');
  assert.equal(t.rMultiple, 0);
});
