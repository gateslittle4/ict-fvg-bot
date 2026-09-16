import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAccountOrThrow, foldLiveBidIntoCandle, sortDealsChronologically, parseBrokerMoney } from '../src/dataSources/cTraderDataSource.js';

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

// 2026-09-14 (Esdras, monitoring overnight - real bug found, see the doc
// comment above sortDealsChronologically() itself for the full story):
// ProtoOADealListReq's response order is never guaranteed chronological -
// _loadClosedDeals() replays it into GuardrailEngine.recordTrade(), whose
// day-boundary reset assumes strictly-increasing time. An out-of-order deal
// silently wipes already-recorded same-day trades.
test('sortDealsChronologically: sorts ascending by executionTimestamp', () => {
  const deals = [
    { executionTimestamp: 300, label: 'c' },
    { executionTimestamp: 100, label: 'a' },
    { executionTimestamp: 200, label: 'b' },
  ];
  const sorted = sortDealsChronologically(deals);
  assert.deepEqual(sorted.map((d) => d.label), ['a', 'b', 'c']);
});

test('sortDealsChronologically: executionTimestamp is a STRING on this broker - sorts numerically, not lexicographically', () => {
  // Lexicographic sort would put "2000" before "300" (wrong) - this must not.
  const deals = [
    { executionTimestamp: '2000', label: 'later' },
    { executionTimestamp: '300', label: 'earlier' },
  ];
  const sorted = sortDealsChronologically(deals);
  assert.deepEqual(sorted.map((d) => d.label), ['earlier', 'later']);
});

test('sortDealsChronologically: empty/missing input is a safe no-op, not a throw', () => {
  assert.deepEqual(sortDealsChronologically([]), []);
  assert.deepEqual(sortDealsChronologically(null), []);
  assert.deepEqual(sortDealsChronologically(undefined), []);
});

test('sortDealsChronologically: does not mutate the input array', () => {
  const deals = [{ executionTimestamp: 300 }, { executionTimestamp: 100 }];
  const copy = [...deals];
  sortDealsChronologically(deals);
  assert.deepEqual(deals, copy);
});

// 2026-09-16: real bug found live - Esdras compared the cTrader app
// ($10,942.99) against the bot's dashboard ($9,972.06) and asked why they
// disagreed. Root cause: _loadBalance guarded on `typeof raw === 'number'`,
// but ProtoOATrader.balance is an int64 and THIS BROKER SENDS EVERY int64 AS
// A STRING (the same trap dealPairing.js documents at length). The guard was
// therefore always false, setBalance() was never called even once, and the
// bot kept accountRuntime.js's hardcoded 10000 placeholder as its "real"
// balance - then only nudged it by each close it witnessed. The arithmetic
// that confirmed it: 10000 - 27.94 (the single close that session) =
// 9972.06, exactly what the dashboard showed. Position sizing reads this
// same balance, so it was sizing every real order off a fiction.
// These fixtures are the VERBATIM shapes from that day's Render logs.
test('parseBrokerMoney: the broker\'s real STRING int64 balance scales correctly (the bug that shipped)', () => {
  assert.equal(parseBrokerMoney('1094299', 2), 10942.99); // the exact value the cTrader app was showing
  assert.equal(parseBrokerMoney('1090477', 2), 10904.77);
});

test('parseBrokerMoney: a plain number works too - the fix must not trade one broken shape for another', () => {
  assert.equal(parseBrokerMoney(1094299, 2), 10942.99);
});

test('parseBrokerMoney: moneyDigits drives the scale, it is not hardcoded to /100', () => {
  assert.equal(parseBrokerMoney('1094299', 3), 1094.299);
  assert.equal(parseBrokerMoney('1094299', 0), 1094299);
});

test('parseBrokerMoney: missing moneyDigits falls back to 2, matching the broker\'s observed default', () => {
  assert.equal(parseBrokerMoney('1094299'), 10942.99);
  assert.equal(parseBrokerMoney('1094299', undefined), 10942.99);
});

// The null case specifically: Number(null) is 0 and 0 IS finite, so a naive
// Number.isFinite() guard would read an absent balance as a zeroed-out
// account and wipe the real one - strictly worse than the original bug.
test('parseBrokerMoney: an absent/garbage field returns null, NEVER a silently-wrong 0', () => {
  assert.equal(parseBrokerMoney(null, 2), null);
  assert.equal(parseBrokerMoney(undefined, 2), null);
  assert.equal(parseBrokerMoney('', 2), null);
  assert.equal(parseBrokerMoney('not-a-number', 2), null);
});

test('parseBrokerMoney: a genuine zero balance is a real value, not treated as missing', () => {
  assert.equal(parseBrokerMoney('0', 2), 0);
});
