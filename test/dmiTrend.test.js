import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDmiSeries, detectDmiCrossoverEvents, runDmiTrendBacktest } from '../src/backtest/dmiTrend.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Choppy start (no clear direction), then a clean sustained uptrend (higher
// highs and higher lows every day) — a textbook setup for +DI to pull away
// from -DI and ADX to rise as the trend strengthens.
function buildUptrendFixture() {
  const candles = [];
  let t = 0;
  const day = 86400000;
  const push = (open, high, low, close) => { candles.push(c(t, open, high, low, close)); t += day; };
  push(100, 101, 99, 100);
  push(100, 101, 99, 100);
  push(100, 101, 99, 100);
  push(100, 102, 98, 99);
  push(99, 100, 98, 99);
  push(99, 103, 99, 102); // 5: first up day
  push(102, 106, 101, 105); // 6
  push(105, 109, 104, 108); // 7
  push(108, 112, 107, 111); // 8
  push(111, 115, 110, 114); // 9
  push(114, 118, 113, 117); // 10
  push(117, 121, 116, 120); // 11
  push(120, 124, 119, 123); // 12
  push(123, 127, 122, 126); // 13
  push(126, 130, 125, 129); // 14
  return candles;
}

test('computeDmiSeries: a sustained uptrend pulls +DI above -DI and ADX rises as the trend strengthens', () => {
  const candles = buildUptrendFixture();
  const { plusDI, minusDI, adx } = computeDmiSeries(candles, 3);
  assert.equal(plusDI[0], null); // no warm-up value yet
  assert.ok(plusDI[5] > minusDI[5], 'expected +DI above -DI once the uptrend starts');
  assert.equal(minusDI[10], 0); // no down-days at all in a clean uptrend -> -DI stays at 0
  assert.ok(adx[6] > adx[5], 'expected ADX to keep rising as the uptrend persists');
  assert.ok(adx[14] > 90, `expected a very strong trend reading by the end, got ${adx[14]}`);
});

test('detectDmiCrossoverEvents flags the bullish cross where the uptrend begins, gated by the ADX threshold', () => {
  const candles = buildUptrendFixture();
  const { plusDI, minusDI, adx } = computeDmiSeries(candles, 3);
  const events = detectDmiCrossoverEvents(plusDI, minusDI, adx, 25);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 5);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].strong, true); // ADX(5) = 33.3 > 25
});

test('detectDmiCrossoverEvents marks a crossover as not "strong" when ADX has not cleared the threshold', () => {
  // Hand-crafted series: a crossover occurs at index 2, but ADX stays low there.
  const plusDI = [10, 10, 15, 20];
  const minusDI = [12, 12, 10, 8];
  const adx = [null, 15, 18, 20]; // never above 25
  const events = detectDmiCrossoverEvents(plusDI, minusDI, adx, 25);
  assert.equal(events.length, 1);
  assert.equal(events[0].strong, false);
});

// Shared fixture for the two end-to-end backtest tests: entry at index 6
// (day after the index-5 signal), open 102, stop = 102 - 2*ATR(14)@index5.
function buildEntryFixture(afterEntry) {
  const candles = buildUptrendFixture().slice(0, 7); // through the entry day (index 6)
  let t = candles[candles.length - 1].time + 86400000;
  for (const a of afterEntry) {
    candles.push(c(t, a.open, a.high, a.low, a.close));
    t += 86400000;
  }
  return candles;
}

test('runDmiTrendBacktest: enters at next-day open with a 2xATR stop, and exits on the ATR stop', () => {
  const candles = buildEntryFixture([{ open: 105, high: 106, low: 90, close: 91 }]);
  const trades = runDmiTrendBacktest(candles, { period: 3, atrPeriod: 3 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 6);
  assert.equal(t.entryPrice, 102);
  assert.ok(Math.abs(t.stopPrice - 95.3333333) < 1e-4);
  assert.equal(t.outcome, 'loss');
  assert.ok(Math.abs(t.rMultiple - -1) < 1e-6);
});

test('runDmiTrendBacktest: exits early on an opposite DI crossover, before the price stop is ever reached', () => {
  const candles = buildEntryFixture([
    { open: 105, high: 105, low: 100, close: 101 },
    { open: 101, high: 101, low: 97, close: 98 },
    { open: 98, high: 98.5, low: 96, close: 96.5 },
    { open: 96.5, high: 97, low: 95.5, close: 96 },
    { open: 96, high: 96.5, low: 95.4, close: 95.6 },
  ]);
  const trades = runDmiTrendBacktest(candles, { period: 3, atrPeriod: 3 });
  assert.equal(trades.length, 1); // the reversal that closes this trade also opens a new short (stop-and-reverse), which stays open/unresolved here
  const t = trades[0];
  assert.equal(t.exitPrice, 98); // exits at NEXT day's open after the reversal, not at the stop (95.33 was never touched)
  assert.ok(t.exitPrice > t.stopPrice, 'the price stop must never have been reached for this to be a reversal exit');
  assert.equal(t.outcome, 'loss');
  assert.ok(Math.abs(t.rMultiple - -0.6) < 1e-6);
});
