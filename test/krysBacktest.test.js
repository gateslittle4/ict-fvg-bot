import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backtest, stats } from '../scripts/lib/krysBacktest.js';

test('krysBacktest.stats: totaux, taux de gain et pire série', () => {
  const s = stats([{ r: -1 }, { r: -1 }, { r: 3 }, { r: -1 }]);
  assert.equal(s.n, 4); assert.equal(s.wins, 1); assert.equal(s.totalR, 0); assert.equal(s.maxLossStreak, 2);
});

test('krysBacktest.backtest: sans FVG, aucun trade', () => {
  const T0 = Date.UTC(2019, 10, 12, 11, 0) / 1000;
  const c = Array.from({ length: 50 }, (_, i) => ({ t: T0 + i * 900, o: 100, h: 101, l: 99, c: 100 }));
  assert.equal(backtest(c).trades.length, 0);
});
