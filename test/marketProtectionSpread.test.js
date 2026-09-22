import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustMarketProtectionForSpread, toRelativeProtectionDistance } from '../src/dataSources/cTraderDataSource.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('buy: stop widened and target pulled in by the spread, so fill-anchored distances land on the strategy levels', () => {
  // the real trade of 2026-09-21: entry 1.14744, stop 1.1471, target 1.14846, spread 1.1 pips
  const r = adjustMarketProtectionForSpread({ side: 'buy', entryPrice: 1.14744, stopPrice: 1.1471, targetPrice: 1.14846, spread: 0.00011 });
  near(r.stopPrice, 1.14699); near(r.targetPrice, 1.14835);
  const fill = 1.14744 + 0.00011; // buy fills at the ask
  const stopDist = Math.abs(1.14744 - r.stopPrice), targetDist = Math.abs(r.targetPrice - 1.14744);
  near(fill - stopDist, 1.1471); near(fill + targetDist, 1.14846); // absolute levels the strategy tested (bid candles)
});

test('sell: symmetric (stop above, target below), fill at the bid', () => {
  const r = adjustMarketProtectionForSpread({ side: 'sell', entryPrice: 1.14744, stopPrice: 1.14778, targetPrice: 1.14642, spread: 0.00011 });
  near(r.stopPrice, 1.14789); near(r.targetPrice, 1.14653);
  // triggers on the ask (bid + spread): stop 1.14744 + 0.00045 = 1.14789 -> bid level 1.14778 ; target 1.14744 - 0.00091 = 1.14653 -> bid 1.14642
  near(r.stopPrice - 0.00011, 1.14778); near(r.targetPrice - 0.00011, 1.14642);
});

test('the widened stop is the one used for sizing: the worst loss stays the planned distance plus the spread only', () => {
  const r = adjustMarketProtectionForSpread({ side: 'buy', entryPrice: 100, stopPrice: 99, targetPrice: 103, spread: 0.1 });
  near(Math.abs(100 - r.stopPrice), 1.1);
});

test('no spread, an absurd spread or a target that would invert: untouched (previous behaviour)', () => {
  const base = { side: 'buy', entryPrice: 100, stopPrice: 99, targetPrice: 103 };
  for (const spread of [undefined, null, 0, -1, NaN, 0.6, 5]) {
    const r = adjustMarketProtectionForSpread({ ...base, spread });
    assert.equal(r.stopPrice, 99); assert.equal(r.targetPrice, 103); assert.equal(r.spreadApplied, 0);
  }
});

test('the relative distances the broker receives are stop = d + s and target = T - s', () => {
  const r = adjustMarketProtectionForSpread({ side: 'buy', entryPrice: 29000, stopPrice: 28990, targetPrice: 29030, spread: 0.6 });
  assert.equal(toRelativeProtectionDistance(29000, r.stopPrice, 2), 1060000); // 10.6 points in 1/100000 units
  assert.equal(toRelativeProtectionDistance(29000, r.targetPrice, 2), 2940000); // 29.4 points
});

test('no target (signal-based exit, e.g. RSI(2)/US500 daily): only the stop is widened, target stays null', () => {
  const r = adjustMarketProtectionForSpread({ side: 'buy', entryPrice: 100, stopPrice: 97, targetPrice: null, spread: 0.5 });
  near(r.stopPrice, 96.5); assert.equal(r.targetPrice, null); assert.equal(r.spreadApplied, 0.5);
  const s = adjustMarketProtectionForSpread({ side: 'sell', entryPrice: 100, stopPrice: 103, targetPrice: null, spread: 0.5 });
  near(s.stopPrice, 103.5); assert.equal(s.targetPrice, null);
});

test('no target: still untouched when the spread is absurd relative to the stop distance', () => {
  const r = adjustMarketProtectionForSpread({ side: 'buy', entryPrice: 100, stopPrice: 99, targetPrice: null, spread: 5 });
  assert.equal(r.stopPrice, 99); assert.equal(r.spreadApplied, 0);
});
