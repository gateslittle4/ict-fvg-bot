import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransactionCosts, runLabBacktest, runLabBacktestTrainTest, labVerdict, chooseTrainTestCutoff, TRAIN_TEST_CUTOFF } from '../src/backtest/labRunner.js';
import { LAB_STRATEGIES, listLabStrategies } from '../src/backtest/labRegistry.js';

test('applyTransactionCosts: a symbol with no known spread passes trades through unchanged', () => {
  const trades = [{ distance: 5, rMultiple: 1 }, { distance: 0.001, rMultiple: -1 }];
  const result = applyTransactionCosts(trades, 'NOT_A_REAL_SYMBOL');
  assert.deepEqual(result, trades);
});

test('applyTransactionCosts: drops trades whose stop distance is too close to the spread', () => {
  // EURUSD spread is 0.00011 (transactionCosts.js) - 3x that is 0.00033.
  const trades = [
    { distance: 0.0001, rMultiple: 1 }, // below 3x spread - dropped as unviable
    { distance: 0.01, rMultiple: 1 }, // comfortably viable
  ];
  const result = applyTransactionCosts(trades, 'EURUSD');
  assert.equal(result.length, 1);
  assert.equal(result[0].distance, 0.01);
});

test('applyTransactionCosts: reduces rMultiple by the real spread cost and keeps the gross figure', () => {
  const trades = [{ distance: 0.01, rMultiple: 2 }];
  const result = applyTransactionCosts(trades, 'EURUSD');
  const expectedCostR = 0.00011 / 0.01;
  assert.equal(result[0].grossRMultiple, 2);
  assert.ok(Math.abs(result[0].costR - expectedCostR) < 1e-9);
  assert.ok(Math.abs(result[0].rMultiple - (2 - expectedCostR)) < 1e-9);
});

test('listLabStrategies: every registered strategy has a run function and a label', () => {
  const list = listLabStrategies();
  assert.ok(list.length >= 15, `expected a real catalog, got ${list.length}`);
  for (const { id, label } of list) {
    assert.equal(typeof label, 'string');
    assert.equal(typeof LAB_STRATEGIES[id].run, 'function');
  }
});

test('runLabBacktest: throws a clear error for an unknown strategy id instead of crashing obscurely', () => {
  assert.throws(() => runLabBacktest('does-not-exist', [], 'US100'), /Unknown lab strategy/);
});

// Deliberately generic, not asserting a specific trade count - the point is
// the PIPELINE (raw trades -> costs -> summary -> equityCurve shape), not
// re-verifying any one strategy's own signal logic (already covered by its
// own dedicated test file, where one exists).
test('runLabBacktest: returns a coherent shape end to end for a real strategy on real-shaped candles', () => {
  const candles = [];
  const start = Date.UTC(2024, 0, 1);
  let price = 100;
  for (let i = 0; i < 500; i++) {
    const open = price;
    const move = Math.sin(i / 7) * 2 + (i % 13 === 0 ? 5 : 0);
    const close = open + move;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    candles.push({ time: start + i * 15 * 60 * 1000, open, high, low, close });
    price = close;
  }
  const result = runLabBacktest('macd-trend', candles, 'US100');
  assert.equal(typeof result.summary.totalSignals, 'number');
  assert.equal(result.trades.length, result.summary.totalSignals);
  assert.equal(result.equityCurve.length, result.trades.length);
  for (const point of result.equityCurve) {
    assert.equal(typeof point.cumulativeR, 'number');
  }
  assert.equal(typeof result.droppedAsNonViable, 'number');
});

test('labVerdict: not enough trades on either side is reported honestly, never a false confirmation', () => {
  assert.equal(labVerdict(0.5, 0.5, 5, 50), 'not-enough-trades');
  assert.equal(labVerdict(0.5, 0.5, 50, 5), 'not-enough-trades');
  assert.equal(labVerdict(0.5, null, 50, 50), 'not-enough-trades');
});

test('labVerdict: a non-positive out-of-sample expectancy always fails, regardless of train', () => {
  assert.equal(labVerdict(0.8, 0, 50, 50), 'fails');
  assert.equal(labVerdict(0.8, -0.1, 50, 50), 'fails');
});

test('labVerdict: test expectancy retaining at least 30% of train expectancy holds', () => {
  assert.equal(labVerdict(1.0, 0.3, 50, 50), 'holds');
  assert.equal(labVerdict(1.0, 0.29, 50, 50), 'weakened');
});

test('runLabBacktestTrainTest: splits candles at the project-wide 2024-01-01 cutoff and verdicts them', () => {
  const before = { time: TRAIN_TEST_CUTOFF - 86400000, open: 100, high: 101, low: 99, close: 100.5 };
  const after = { time: TRAIN_TEST_CUTOFF + 86400000, open: 100, high: 101, low: 99, close: 100.5 };
  const candles = [];
  for (let i = 0; i < 50; i++) candles.push({ ...before, time: before.time - i * 900000 });
  for (let i = 0; i < 50; i++) candles.push({ ...after, time: after.time + i * 900000 });
  candles.sort((a, b) => a.time - b.time);
  const result = runLabBacktestTrainTest('macd-trend', candles, 'US100');
  assert.ok(result.train.trades.every((t) => t.entryTime < TRAIN_TEST_CUTOFF));
  assert.ok(result.test.trades.every((t) => t.entryTime >= TRAIN_TEST_CUTOFF));
  assert.ok(['holds', 'weakened', 'fails', 'not-enough-trades'].includes(result.verdict));
});

test('applyTransactionCosts: an explicit spread override beats the table, and 0 means "no cost" (not "fall back to the table")', () => {
  const trades = [{ distance: 0.01, rMultiple: 2 }];
  // EURUSD's table spread is 0.00011; an override of 0.0005 must win.
  const overridden = applyTransactionCosts(trades, 'EURUSD', 0.0005);
  assert.ok(Math.abs(overridden[0].costR - 0.05) < 1e-9);
  // 0 is honoured: EURUSD would otherwise be charged its table spread.
  assert.deepEqual(applyTransactionCosts(trades, 'EURUSD', 0), trades);
  // A symbol absent from the table gets a real cost once a spread is supplied.
  assert.ok(applyTransactionCosts(trades, 'EURGBP', 0.0002)[0].costR > 0);
});

test('runLabBacktestTrainTest: honours a custom cutoff instead of the project-wide date', () => {
  const start = Date.UTC(2015, 0, 1);
  const candles = [];
  let price = 100;
  for (let i = 0; i < 3000; i++) {
    const open = price;
    const close = open + Math.sin(i / 9) * 1.5 + (i % 17 === 0 ? 3 : 0) - (i % 23 === 0 ? 3 : 0);
    candles.push({ time: start + i * 900000, open, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8, close });
    price = close;
  }
  const cutoff = start + 1500 * 900000;
  const r = runLabBacktestTrainTest('macd-trend', candles, 'US100', { cutoff });
  assert.ok(r.train.trades.length > 0 && r.test.trades.length > 0, 'both sides must have trades for this to prove anything');
  assert.ok(r.train.trades.every((t) => t.entryTime < cutoff));
  assert.ok(r.test.trades.every((t) => t.entryTime >= cutoff));
});

test('chooseTrainTestCutoff: keeps 2024-01-01 when there is real history on both sides of it', () => {
  const candles = [{ time: Date.UTC(2018, 0, 1) }, { time: Date.UTC(2025, 11, 31) }];
  assert.deepEqual(chooseTrainTestCutoff(candles), { cutoff: TRAIN_TEST_CUTOFF, kind: 'standard' });
});

test('chooseTrainTestCutoff: a dataset that stops before 2024 gets a 70/30 split, never an empty test period', () => {
  const candles = [{ time: Date.UTC(2010, 0, 1) }, { time: Date.UTC(2019, 11, 31) }];
  const { cutoff, kind } = chooseTrainTestCutoff(candles);
  assert.equal(kind, 'proportional');
  assert.ok(cutoff > candles[0].time && cutoff < candles[1].time);
  const trainShare = (cutoff - candles[0].time) / (candles[1].time - candles[0].time);
  assert.ok(Math.abs(trainShare - 0.7) < 0.01);
  assert.equal(cutoff % 86400000, 0, 'rounded to a UTC day boundary');
});

test('chooseTrainTestCutoff: 2024 is too recent to leave a meaningful test period -> proportional', () => {
  const candles = [{ time: Date.UTC(2020, 0, 1) }, { time: Date.UTC(2024, 1, 15) }];
  assert.equal(chooseTrainTestCutoff(candles).kind, 'proportional');
});
