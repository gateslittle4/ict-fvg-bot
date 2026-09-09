import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAccountOrThrow, foldLiveBidIntoCandle } from '../src/dataSources/cTraderDataSource.js';

// Only the pure pieces are unit-tested here, deliberately - everything else
// in cTraderDataSource.js is network I/O against an unverified live API (see
// the file's header), same convention as matchTraderDataSource.js's
// M15CandleBuilder being the one pure/testable piece there.

test('pickAccountOrThrow: exactly one account -> returns its id', () => {
  const id = pickAccountOrThrow([{ ctidTraderAccountId: 12345 }]);
  assert.equal(id, 12345);
});

test('pickAccountOrThrow: zero accounts -> throws rather than guessing', () => {
  assert.throws(() => pickAccountOrThrow([]), /No cTrader trading accounts found/);
});

test('pickAccountOrThrow: undefined/non-array input -> throws (defensive, e.g. an unexpected response shape)', () => {
  assert.throws(() => pickAccountOrThrow(undefined), /No cTrader trading accounts found/);
});

test('pickAccountOrThrow: multiple accounts -> throws and lists every id found (never silently picks one)', () => {
  assert.throws(
    () => pickAccountOrThrow([{ ctidTraderAccountId: 111 }, { ctidTraderAccountId: 222 }]),
    (err) => err.message.includes('111') && err.message.includes('222') && /2 cTrader trading accounts found/.test(err.message)
  );
});

// --- foldLiveBidIntoCandle (live price between trendbar updates) -----------

test('foldLiveBidIntoCandle: a bid inside the range only moves close', () => {
  const existing = { time: 1, open: 100, high: 105, low: 95, close: 100 };
  const out = foldLiveBidIntoCandle(existing, 101);
  assert.deepEqual(out, { time: 1, open: 100, high: 105, low: 95, close: 101 });
});

test('foldLiveBidIntoCandle: a new-high bid expands high (candle stays valid)', () => {
  const out = foldLiveBidIntoCandle({ time: 1, open: 100, high: 105, low: 95, close: 100 }, 108);
  assert.equal(out.high, 108);
  assert.equal(out.close, 108);
  assert.equal(out.low, 95); // unchanged
});

test('foldLiveBidIntoCandle: a new-low bid expands low', () => {
  const out = foldLiveBidIntoCandle({ time: 1, open: 100, high: 105, low: 95, close: 100 }, 90);
  assert.equal(out.low, 90);
  assert.equal(out.close, 90);
  assert.equal(out.high, 105); // unchanged
});

test('foldLiveBidIntoCandle: no candle yet or a missing/non-finite price is a safe no-op', () => {
  assert.equal(foldLiveBidIntoCandle(null, 100), null);
  assert.equal(foldLiveBidIntoCandle(undefined, 100), null);
  const existing = { time: 1, open: 100, high: 105, low: 95, close: 100 };
  assert.equal(foldLiveBidIntoCandle(existing, null), existing); // unchanged reference -> caller skips the write
  assert.equal(foldLiveBidIntoCandle(existing, NaN), existing);
});

test('foldLiveBidIntoCandle: does not mutate the input candle', () => {
  const existing = { time: 1, open: 100, high: 105, low: 95, close: 100 };
  foldLiveBidIntoCandle(existing, 108);
  assert.deepEqual(existing, { time: 1, open: 100, high: 105, low: 95, close: 100 });
});
