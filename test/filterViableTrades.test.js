import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterViableTrades } from '../src/backtest/transactionCosts.js';

test('drops trades whose distance is below minMultiple x spread', () => {
  const trades = [
    { distance: 0.0001 }, // 1 pip, spread=0.0001 -> ratio 1 -> below default min (3)
    { distance: 0.00031 }, // just above 3x -> kept (avoids float-equality edge case at exactly 3x)
    { distance: 0.0005 }, // 5x -> kept
  ];
  const kept = filterViableTrades(trades, 0.0001, 3);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept, [trades[1], trades[2]]);
});

test('with no spread configured (0 or falsy), keeps every trade unchanged', () => {
  const trades = [{ distance: 0.00001 }, { distance: 1 }];
  assert.equal(filterViableTrades(trades, 0).length, 2);
  assert.equal(filterViableTrades(trades, null).length, 2);
});

test('respects a custom minMultiple', () => {
  const trades = [{ distance: 0.0002 }, { distance: 0.0006 }];
  const kept = filterViableTrades(trades, 0.0001, 5); // need >= 0.0005
  assert.equal(kept.length, 1);
  assert.equal(kept[0].distance, 0.0006);
});
