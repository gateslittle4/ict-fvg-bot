import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransactionCosts, runLabBacktest } from '../src/backtest/labRunner.js';
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
