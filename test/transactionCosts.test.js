import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransactionCosts } from '../src/backtest/transactionCosts.js';

test('subtracts the spread, expressed in R, from every trade', () => {
  const trades = [
    { rMultiple: 2, distance: 0.001 }, // costR = 0.0001/0.001 = 0.1
    { rMultiple: -1, distance: 0.0005 }, // costR = 0.0001/0.0005 = 0.2
  ];
  const withCosts = applyTransactionCosts(trades, 0.0001);
  assert.ok(Math.abs(withCosts[0].rMultiple - 1.9) < 1e-9);
  assert.ok(Math.abs(withCosts[1].rMultiple - -1.2) < 1e-9);
});

test('preserves the original gross rMultiple for comparison', () => {
  const trades = [{ rMultiple: 3, distance: 0.002 }];
  const withCosts = applyTransactionCosts(trades, 0.0002);
  assert.equal(withCosts[0].grossRMultiple, 3);
  assert.ok(withCosts[0].rMultiple < withCosts[0].grossRMultiple);
});

test('a tight stop (small distance) pays proportionally more cost in R than a wide stop', () => {
  const tightTrade = { rMultiple: 1, distance: 0.0002 };
  const wideTrade = { rMultiple: 1, distance: 0.002 };
  const [tight] = applyTransactionCosts([tightTrade], 0.0001);
  const [wide] = applyTransactionCosts([wideTrade], 0.0001);
  assert.ok(tight.costR > wide.costR);
});

test('zero spread leaves rMultiple unchanged', () => {
  const trades = [{ rMultiple: 1.5, distance: 0.001 }];
  const [t] = applyTransactionCosts(trades, 0);
  assert.equal(t.rMultiple, 1.5);
  assert.equal(t.costR, 0);
});
