import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAccountOrThrow } from '../src/dataSources/cTraderDataSource.js';

// Only pickAccountOrThrow is unit-tested here, deliberately - everything
// else in cTraderDataSource.js is network I/O against an unverified live
// API (see the file's header), same convention as matchTraderDataSource.js's
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
