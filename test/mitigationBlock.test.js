import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMitigationBlocks, runMitigationBlockBacktest } from '../src/backtest/mitigationBlock.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

// A swing high pivot at 110, then (well after it) a clear DOWN candle, then a
// rally to a SECOND swing high pivot at 107 - LOWER than 110, i.e. a failure
// swing. The mitigation block should be that DOWN candle (the origin of the
// failed rally), and the implied trade direction is bearish (the reversal
// the failure points to). Verified against the actual function output
// before hardcoding (same discipline as this project's other structure-
// based modules) - the swing-confirmation lag and the backward zone search
// aren't simple enough to hand-verify without running it first.
function bearishSetup() {
  let t = 0;
  const candles = [];
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // swing high #1 = 110
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 103, 103.5, 101, 101.5)); t += M15; // origin DOWN candle: zone [101, 103.5]
  for (let i = 0; i < 4; i++) { candles.push(c(t, 102 + i, 102.5 + i, 101.5 + i, 102 + i)); t += M15; }
  candles.push(c(t, 106, 107, 105.5, 106.5)); t += M15; // failure swing high pivot = 107 (< 110)
  const pivotIndex = candles.length - 1;
  for (let i = 0; i < 5; i++) { candles.push(c(t, 106 - i * 0.5, 106.5 - i * 0.5, 105 - i * 0.5, 105.5 - i * 0.5)); t += M15; }
  return { candles, t, pivotIndex };
}

// Mirror: a swing low pivot at 90, a clear UP candle, then a decline to a
// second swing low pivot at 93 - HIGHER than 90 (failure to make a new
// low) -> bullish trade.
function bullishSetup() {
  let t = 0;
  const candles = [];
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 95, 96, 90, 94)); t += M15; // swing low #1 = 90
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 97, 99, 96.5, 98.5)); t += M15; // origin UP candle: zone [96.5, 99]
  for (let i = 0; i < 4; i++) { candles.push(c(t, 98 - i, 98.5 - i, 97.5 - i, 98 - i)); t += M15; }
  candles.push(c(t, 94, 94.5, 93, 93.5)); t += M15; // failure swing low pivot = 93 (> 90)
  const pivotIndex = candles.length - 1;
  for (let i = 0; i < 5; i++) { candles.push(c(t, 94 + i * 0.5, 94.5 + i * 0.5, 93.5 + i * 0.5, 94 + i * 0.5)); t += M15; }
  return { candles, t, pivotIndex };
}

test('detectMitigationBlocks: a lower-high failure swing produces a bearish block, zoned to the last down candle before the pivot', () => {
  const { candles, pivotIndex } = bearishSetup();
  const blocks = detectMitigationBlocks(candles);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].pivotIndex, pivotIndex);
  assert.equal(blocks[0].tradeDirection, 'bearish');
  assert.deepEqual(blocks[0].zone, { low: 101, high: 103.5, mid: 102.25 });
});

test('detectMitigationBlocks: the mirror (higher-low failure swing) produces a bullish block, zoned to the last up candle before the pivot', () => {
  const { candles, pivotIndex } = bullishSetup();
  const blocks = detectMitigationBlocks(candles);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].pivotIndex, pivotIndex);
  assert.equal(blocks[0].tradeDirection, 'bullish');
  assert.deepEqual(blocks[0].zone, { low: 96.5, high: 99, mid: 97.75 });
});

test('detectMitigationBlocks: a swing high that makes a NEW (higher) high is not a failure swing - no block', () => {
  let t = 0;
  const candles = [];
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // swing high #1 = 110
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 6; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 103, 103.5, 101, 101.5)); t += M15;
  for (let i = 0; i < 4; i++) { candles.push(c(t, 102 + i, 102.5 + i, 101.5 + i, 102 + i)); t += M15; }
  candles.push(c(t, 108, 113, 107.5, 112.5)); t += M15; // NEW high = 113 (> 110) - not a failure
  for (let i = 0; i < 5; i++) { candles.push(c(t, 110, 110.5, 109, 109.5)); t += M15; }
  assert.deepEqual(detectMitigationBlocks(candles), []);
});

test('detectMitigationBlocks: a flat/no-signal market produces zero blocks, not a crash', () => {
  const flat = Array.from({ length: 60 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(detectMitigationBlocks(flat), []);
});

test('detectMitigationBlocks: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectMitigationBlocks([]), []);
});

test('runMitigationBlockBacktest: an unresolved position at the end of the data is dropped, not fabricated', () => {
  const { candles } = bearishSetup();
  assert.deepEqual(runMitigationBlockBacktest(candles), []);
});

test('runMitigationBlockBacktest: entry fills at the NEXT candle open after a retest of the block, stop beyond its far edge, and a sustained move hits the fixed 1:3 target', () => {
  const { candles, t: t0 } = bearishSetup();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 100, 101.5, 99.5, 100)); t += M15; // retest: high 101.5 >= zone.low 101
  withEntry.push(c(t, 100, 100.2, 95, 96)); t += M15; // entry candle, open=100
  withEntry.push(c(t, 96, 97, 60, 65)); t += M15; // sustained drop, hits the bearish target

  const trades = runMitigationBlockBacktest(withEntry);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bearish');
  assert.equal(trade.entryPrice, 100);
  assert.equal(trade.stopPrice, 103.5); // zone.high
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runMitigationBlockBacktest: the bullish mirror also resolves correctly, hitting its 1:3 target', () => {
  const { candles, t: t0 } = bullishSetup();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 97, 98, 96.3, 97)); t += M15; // retest: low 96.3 <= zone.high 99
  withEntry.push(c(t, 98, 99, 97.5, 98.5)); t += M15; // entry candle, open=98
  withEntry.push(c(t, 98.5, 140, 98, 138)); t += M15; // sustained rally, hits the bullish target

  const trades = runMitigationBlockBacktest(withEntry);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.entryPrice, 98);
  assert.equal(trade.stopPrice, 96.5); // zone.low
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runMitigationBlockBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const { candles, t: t0 } = bearishSetup();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 100, 101.5, 99.5, 100)); t += M15; // retest
  withEntry.push(c(t, 100, 100.2, 95, 96)); t += M15; // entry candle
  withEntry.push(c(t, 96, 105, 95, 104)); t += M15; // reverses hard, dips through the stop (103.5)

  const trades = runMitigationBlockBacktest(withEntry);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runMitigationBlockBacktest: a position that resolves at neither stop nor target within the timeout exits at the timeout close', () => {
  const { candles, t: t0 } = bearishSetup();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 100, 101.5, 99.5, 100)); t += M15; // retest
  withEntry.push(c(t, 100, 100.2, 95, 96)); t += M15; // entry candle
  for (let i = 0; i < 481; i++) {
    const price = withEntry[withEntry.length - 1].close + (i % 2 === 0 ? 0.01 : -0.01);
    withEntry.push(c(t, price, price + 0.02, price - 0.02, price));
    t += M15;
  }
  const trades = runMitigationBlockBacktest(withEntry);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  assert.equal(trades[0].exitIndex - trades[0].entryIndex, 480);
});

test('runMitigationBlockBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = Array.from({ length: 100 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(runMitigationBlockBacktest(flat), []);
});

test('runMitigationBlockBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runMitigationBlockBacktest([]), []);
});
