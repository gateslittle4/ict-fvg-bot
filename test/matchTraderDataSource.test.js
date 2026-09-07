import test from 'node:test';
import assert from 'node:assert/strict';
import { M15CandleBuilder } from '../src/dataSources/matchTraderDataSource.js';

// Only M15CandleBuilder is unit-tested here, deliberately - everything else
// in matchTraderDataSource.js is network I/O against an unverified live API
// (see the file's header), the same convention already used for
// cTraderDataSource.js (which has zero tests: nothing there is pure logic
// safe to exercise without a real/mocked broker connection).

const M15_MS = 15 * 60 * 1000;
const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms, not aligned to a bucket boundary on purpose below
const BUCKET0 = Math.floor(T0 / M15_MS) * M15_MS;

test('M15CandleBuilder: first sample opens a bucket and returns null (nothing closed yet)', () => {
  const b = new M15CandleBuilder();
  const closed = b.addSample({ time: BUCKET0 + 1000, bid: 100, ask: 100.2 });
  assert.equal(closed, null);
});

test('M15CandleBuilder: samples within the same bucket update high/low/close but stay unclosed', () => {
  const b = new M15CandleBuilder();
  b.addSample({ time: BUCKET0 + 1000, bid: 100, ask: 100.2 }); // mid 100.1 -> open
  const closed1 = b.addSample({ time: BUCKET0 + 2000, bid: 101, ask: 101.2 }); // mid 101.1 -> new high
  const closed2 = b.addSample({ time: BUCKET0 + 3000, bid: 99, ask: 99.2 }); // mid 99.1 -> new low
  assert.equal(closed1, null);
  assert.equal(closed2, null);
});

test('M15CandleBuilder: a sample from the NEXT bucket closes the previous one with correct OHLC', () => {
  const b = new M15CandleBuilder();
  b.addSample({ time: BUCKET0 + 1000, bid: 100, ask: 100.2 }); // open/close so far: 100.1
  b.addSample({ time: BUCKET0 + 2000, bid: 101, ask: 101.2 }); // high: 101.1
  b.addSample({ time: BUCKET0 + 3000, bid: 99, ask: 99.2 }); // low: 99.1
  b.addSample({ time: BUCKET0 + 4000, bid: 100.5, ask: 100.7 }); // close: 100.6

  const closed = b.addSample({ time: BUCKET0 + M15_MS + 500, bid: 105, ask: 105.2 });

  assert.ok(closed, 'expected the previous bucket to close');
  assert.equal(closed.time, BUCKET0);
  assert.equal(closed.open, 100.1);
  assert.equal(closed.high, 101.1);
  assert.equal(closed.low, 99.1);
  assert.equal(closed.close, 100.6);
});

test('M15CandleBuilder: never returns the still-forming current bucket (no mid-candle read / no lookahead)', () => {
  const b = new M15CandleBuilder();
  for (let i = 0; i < 10; i++) {
    const closed = b.addSample({ time: BUCKET0 + i * 30_000, bid: 100 + i, ask: 100.2 + i });
    assert.equal(closed, null, `sample ${i} should not close a bucket yet`);
  }
});

test('M15CandleBuilder: an out-of-order (late) sample is dropped, not applied to the current bucket', () => {
  const b = new M15CandleBuilder();
  b.addSample({ time: BUCKET0 + 5000, bid: 100, ask: 100.2 }); // opens bucket at BUCKET0
  b.addSample({ time: BUCKET0 + M15_MS + 1000, bid: 200, ask: 200.2 }); // closes BUCKET0, opens BUCKET0+M15
  // A stale sample claiming to belong to BUCKET0 (already closed) arrives late - must not corrupt the NEW current bucket.
  const closed = b.addSample({ time: BUCKET0 + 6000, bid: 999, ask: 999.2 });
  assert.equal(closed, null);

  // Confirm the current bucket (BUCKET0+M15) is unaffected by the stale sample: closing it should show only the 200/200.2 mid.
  const nextClosed = b.addSample({ time: BUCKET0 + 2 * M15_MS + 500, bid: 300, ask: 300.2 });
  assert.equal(nextClosed.open, 200.1);
  assert.equal(nextClosed.high, 200.1);
  assert.equal(nextClosed.low, 200.1);
  assert.equal(nextClosed.close, 200.1);
});

test('M15CandleBuilder: consecutive buckets each close with their own OHLC, in sequence', () => {
  const b = new M15CandleBuilder();
  b.addSample({ time: BUCKET0 + 1000, bid: 10, ask: 10 }); // bucket 0: mid 10
  const c1 = b.addSample({ time: BUCKET0 + M15_MS + 1000, bid: 20, ask: 20 }); // closes bucket 0, opens bucket 1
  const c2 = b.addSample({ time: BUCKET0 + 2 * M15_MS + 1000, bid: 30, ask: 30 }); // closes bucket 1, opens bucket 2

  assert.equal(c1.time, BUCKET0);
  assert.deepEqual([c1.open, c1.high, c1.low, c1.close], [10, 10, 10, 10]);

  assert.equal(c2.time, BUCKET0 + M15_MS);
  assert.deepEqual([c2.open, c2.high, c2.low, c2.close], [20, 20, 20, 20]);
});
