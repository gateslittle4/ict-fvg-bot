import test from 'node:test';
import assert from 'node:assert/strict';
import { M15CandleBuilder, MatchTraderDataSource } from '../src/dataSources/matchTraderDataSource.js';
import { FIXED_EST_TO_UTC_OFFSET_MS, toRealNyHourMinute } from '../src/backtest/nySession.js';

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

// ---------------------------------------------------------------------------
// Live-price display contract (fix 2026-09): the dashboard/chart show a
// genuinely live price by reading builder.current every poll, not just the
// closed candle. These guard the shape that fix depends on.
// ---------------------------------------------------------------------------

test('M15CandleBuilder.current tracks the live forming price before the bucket closes', () => {
  const b = new M15CandleBuilder();
  b.addSample({ time: BUCKET0 + 1000, bid: 100, ask: 100.2 }); // mid 100.1 -> open
  b.addSample({ time: BUCKET0 + 2000, bid: 101, ask: 101.2 }); // mid 101.1 -> new high
  b.addSample({ time: BUCKET0 + 3000, bid: 99, ask: 99.2 });   // mid 99.1  -> new low
  b.addSample({ time: BUCKET0 + 4000, bid: 100.5, ask: 100.7 }); // mid 100.6 -> latest close

  // Nothing has closed yet, but the forming bucket already carries a live,
  // up-to-the-latest-sample price for display (store.lastCandleBySymbol).
  assert.equal(b.current.bucketStart, BUCKET0);
  assert.equal(b.current.open, 100.1);
  assert.equal(b.current.high, 101.1);
  assert.equal(b.current.low, 99.1);
  assert.equal(b.current.close, 100.6);
});

// ---------------------------------------------------------------------------
// NY-session time-convention (câblage live, fix 2026-09): the strategy engine
// was validated against HistData's fixed-EST-as-UTC candle times, so the live
// Match-Trader path MUST shift its genuine-UTC candles by
// -FIXED_EST_TO_UTC_OFFSET_MS before ingestCandle - otherwise the Silver
// Bullet / London-NY session windows are evaluated 5h off (the bug that had
// been fixed on the cTrader path but never ported to this, the ACTIVE, one).
// ---------------------------------------------------------------------------

test('MatchTraderDataSource exposes candleTimeOffsetMs so /api/candles can undo the engine shift', () => {
  const src = new MatchTraderDataSource();
  assert.equal(src.candleTimeOffsetMs, FIXED_EST_TO_UTC_OFFSET_MS);
});

test('_toEngineCandle shifts a genuine-UTC candle so the session filter reads the REAL NY wall-clock hour', () => {
  const src = new MatchTraderDataSource();

  // A DST-aware reference formatter for America/New_York, independent of the
  // code under test - the ground truth for "what NY hour is this UTC instant".
  const nyFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  });
  const realNy = (utcMs) => {
    const p = nyFmt.formatToParts(new Date(utcMs));
    return { hour: Number(p.find((x) => x.type === 'hour').value), minute: Number(p.find((x) => x.type === 'minute').value) };
  };

  // One winter instant (EST=UTC-5) and one summer instant (EDT=UTC-4), both
  // genuine UTC, to prove the round-trip is correct across DST - not just for
  // the fixed 5h offset. 2025-01-15 15:30 UTC -> 10:30 NY (winter);
  // 2025-07-15 14:30 UTC -> 10:30 NY (summer, right inside the Silver Bullet window).
  for (const utcMs of [Date.UTC(2025, 0, 15, 15, 30), Date.UTC(2025, 6, 15, 14, 30)]) {
    const engineCandle = src._toEngineCandle({ time: utcMs, open: 1, high: 1, low: 1, close: 1 });
    const viaFilter = toRealNyHourMinute(engineCandle.time); // what SessionFilteredFvgEngine actually computes
    assert.deepEqual(viaFilter, realNy(utcMs), `NY hour mismatch for UTC ${new Date(utcMs).toISOString()}`);
    assert.equal(viaFilter.hour, 10);
    assert.equal(viaFilter.minute, 30);
  }
});

test('feeding genuine UTC straight to the session filter (the pre-fix bug) is 5h off', () => {
  // Documents WHY _toEngineCandle exists: the same instant, WITHOUT the shift,
  // lands 5h later on the NY clock - well outside the killzone it belongs to.
  const utcMs = Date.UTC(2025, 6, 15, 14, 30); // 10:30 NY (summer)
  const unshifted = toRealNyHourMinute(utcMs); // what the buggy path computed
  assert.equal(unshifted.hour, 15); // 10:30 -> 15:30, the 5h error
});
