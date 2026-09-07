import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRsiWilder,
  detectDivergenceEvents,
  runRsiDivergenceBacktest,
} from '../src/backtest/rsiDivergence.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('computeRsiWilder returns 100 for a strictly increasing series (no losses)', () => {
  const closes = [1, 2, 3, 4, 5, 6, 7];
  const rsi = computeRsiWilder(closes, 3);
  assert.equal(rsi[0], null);
  assert.equal(rsi[1], null);
  assert.equal(rsi[2], null);
  assert.equal(rsi[3], 100); // first computable value: all gains, zero average loss
  assert.equal(rsi[6], 100); // stays 100 as long as there is never a down day
});

test('detectDivergenceEvents flags a bullish divergence: lower price low, higher RSI low', () => {
  // Two swing lows on price (indices 5 and 10, lookback 2): price goes 90 -> 80
  // (lower low), but the hand-crafted RSI series goes 0 -> 50 (higher low).
  const candles = [];
  for (let i = 0; i < 5; i++) candles.push(c(i * 1000, 100, 101, 99, 100));
  candles.push(c(5000, 100, 100, 90, 96)); // index 5: swing low, price 90
  candles.push(c(6000, 96, 101, 95, 100));
  candles.push(c(7000, 100, 102, 99, 101));
  candles.push(c(8000, 101, 103, 100, 102));
  candles.push(c(9000, 102, 103, 101, 102));
  candles.push(c(10000, 102, 103, 80, 101)); // index 10: swing low, price 80 (lower than 90)
  candles.push(c(11000, 101, 104, 100, 103));
  candles.push(c(12000, 103, 106, 102, 105)); // index 12: confirmedIndex for the index-10 pivot

  const rsi = new Array(candles.length).fill(50);
  rsi[5] = 0; // RSI at the first (higher price) low
  rsi[10] = 50; // RSI at the second (lower price) low is HIGHER -> bullish divergence

  const events = detectDivergenceEvents(candles, rsi, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].confirmedIndex, 12);
});

test('detectDivergenceEvents reports nothing when RSI confirms the new low (no divergence)', () => {
  const candles = [];
  for (let i = 0; i < 5; i++) candles.push(c(i * 1000, 100, 101, 99, 100));
  candles.push(c(5000, 100, 100, 90, 96));
  candles.push(c(6000, 96, 101, 95, 100));
  candles.push(c(7000, 100, 102, 99, 101));
  candles.push(c(8000, 101, 103, 100, 102));
  candles.push(c(9000, 102, 103, 101, 102));
  candles.push(c(10000, 102, 103, 80, 101));
  candles.push(c(11000, 101, 104, 100, 103));
  candles.push(c(12000, 103, 106, 102, 105));

  const rsi = new Array(candles.length).fill(50);
  rsi[5] = 40;
  rsi[10] = 20; // RSI ALSO makes a lower low -> confirms the move, no divergence

  const events = detectDivergenceEvents(candles, rsi, 2);
  assert.equal(events.length, 0);
});

// Shared fixture for the two end-to-end backtest tests below: a bullish
// divergence confirmed at index 12 (swing low at index 5, price 90, deep
// RSI dip; swing low at index 10, price 80 — a lower low — but a much
// shallower close dip, so RSI makes a higher low). Entry at index 13's
// open (105). swingLookback=2, rsiPeriod=3, atrPeriod=3 keep the fixture
// small; conventions (2xATR stop, 1:3 target, 10-day timeout) are the
// project defaults either way.
function buildFixture(afterEntry) {
  const candles = [];
  for (let i = 0; i < 5; i++) candles.push(c(i * 1000, 100, 101, 99, 100));
  candles.push(c(5000, 100, 100, 90, 96));
  candles.push(c(6000, 96, 101, 95, 100));
  candles.push(c(7000, 100, 102, 99, 101));
  candles.push(c(8000, 101, 103, 100, 102));
  candles.push(c(9000, 102, 103, 101, 102));
  candles.push(c(10000, 102, 103, 80, 101));
  candles.push(c(11000, 101, 104, 100, 103));
  candles.push(c(12000, 103, 106, 102, 105));
  candles.push(c(13000, 105, 108, 104, 107)); // entry day: open 105
  candles.push(...afterEntry);
  return candles;
}

test('runRsiDivergenceBacktest: entry at next-day open, stop = 2xATR(14), target = fixed 1:3, wins when target is reached', () => {
  const candles = buildFixture([
    c(14000, 107, 115, 106, 113),
    c(15000, 113, 125, 112, 122),
    c(16000, 122, 140, 120, 135),
    c(17000, 135, 155, 133, 148),
    c(18000, 148, 170, 147, 165), // high 170 clears the 167 target
  ]);
  const trades = runRsiDivergenceBacktest(candles, { swingLookback: 2, rsiPeriod: 3, atrPeriod: 3 });
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 13);
  assert.equal(t.entryPrice, 105);
  assert.ok(Math.abs(t.stopPrice - 84.3333333) < 1e-4); // 105 - 2*ATR(14)@index12 (10.333)
  assert.equal(t.targetPrice, 167); // 105 + 3 * (105 - 84.333...)
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.rMultiple - 3) < 1e-9);
});

test('runRsiDivergenceBacktest: loses when price returns through the ATR stop after entry', () => {
  const candles = buildFixture([
    c(14000, 107, 108, 84, 86), // low 84 pierces the 84.33 stop
  ]);
  const trades = runRsiDivergenceBacktest(candles, { swingLookback: 2, rsiPeriod: 3, atrPeriod: 3 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});
