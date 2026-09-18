import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthReport } from '../src/healthReport.js';

// A Wednesday 12:00 UTC (07:00 NY, EDT) - market open, inside the week.
const WED_NOON_UTC = Date.parse('2026-09-16T12:00:00Z');
// A Saturday - market closed, the service is asleep BY DESIGN.
const SAT_NOON_UTC = Date.parse('2026-09-19T12:00:00Z');

const account = (liveDataSource, candles) => ({
  liveDataSource,
  lastCandleBySymbol: new Map(Object.entries(candles ?? {})),
});

test('buildHealthReport: no accounts at all - never throws, reports nothing connected', () => {
  const r = buildHealthReport({ accounts: [], now: WED_NOON_UTC, bootedAt: WED_NOON_UTC - 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.accountsConnected, 0);
  assert.equal(r.accountsTotal, 0);
  assert.equal(r.lastCandleAgeSec, null);
  assert.equal(r.uptimeSec, 5);
});

test('buildHealthReport: a configured but disconnected account counts in total, not in connected', () => {
  const r = buildHealthReport({ accounts: [account(null, {})], now: WED_NOON_UTC });
  assert.equal(r.accountsTotal, 1);
  assert.equal(r.accountsConnected, 0);
});

test('buildHealthReport: candle age is measured off the NEWEST candle, not the oldest', () => {
  // The regression that matters: index CFDs close overnight while forex keeps
  // ticking. Taking the oldest candle would report ~7h of staleness here and
  // page every single night for a feed that is perfectly alive.
  const r = buildHealthReport({
    accounts: [
      account(
        {},
        {
          US100: { time: WED_NOON_UTC - 7 * 3600 * 1000 }, // index closed hours ago
          EURUSD: { time: WED_NOON_UTC - 60 * 1000 }, // forex still ticking
        }
      ),
    ],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastCandleAgeSec, 60);
});

test('buildHealthReport: a genuinely silent feed does report its real age', () => {
  const r = buildHealthReport({
    accounts: [account({}, { US100: { time: WED_NOON_UTC - 3600 * 1000 }, EURUSD: { time: WED_NOON_UTC - 2 * 3600 * 1000 } })],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastCandleAgeSec, 3600);
});

test('buildHealthReport: candle time is read as genuine UTC, with NO engine-time offset applied', () => {
  // Guards against "fixing" this with FIXED_EST_TO_UTC_OFFSET_MS (5h), which
  // would report a 13-minute-old candle as 5 hours in the future. Mirrors the
  // real production reading of 2026-09-18 (raw 12:15:00Z at a 12:27Z clock).
  const now = Date.parse('2026-09-18T12:27:00Z');
  const r = buildHealthReport({ accounts: [account({}, { US100: { time: Date.parse('2026-09-18T12:15:00Z') } })], now });
  assert.equal(r.lastCandleAgeSec, 720); // 12 min, not -17280 and not 18720
});

test('buildHealthReport: only CONNECTED accounts contribute candles', () => {
  const r = buildHealthReport({
    accounts: [account(null, { US100: { time: WED_NOON_UTC - 1000 } })],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastCandleAgeSec, null);
});

test('buildHealthReport: connected account with an empty candle map reports null, not 0', () => {
  // "Still warming up" must be distinguishable from "a candle just arrived".
  const r = buildHealthReport({ accounts: [account({}, {})], now: WED_NOON_UTC });
  assert.equal(r.accountsConnected, 1);
  assert.equal(r.lastCandleAgeSec, null);
});

test('buildHealthReport: a candle slightly in the future (clock skew) clamps to 0, never negative', () => {
  const r = buildHealthReport({ accounts: [account({}, { US100: { time: WED_NOON_UTC + 2000 } })], now: WED_NOON_UTC });
  assert.equal(r.lastCandleAgeSec, 0);
});

test('buildHealthReport: a malformed candle is skipped rather than poisoning the age', () => {
  const r = buildHealthReport({
    accounts: [account({}, { US100: null, US500: { time: 'nope' }, EURUSD: { time: WED_NOON_UTC - 30_000 } })],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastCandleAgeSec, 30);
});

test('buildHealthReport: an account with no candle Map at all is tolerated', () => {
  const r = buildHealthReport({ accounts: [{ liveDataSource: {} }], now: WED_NOON_UTC });
  assert.equal(r.accountsConnected, 1);
  assert.equal(r.lastCandleAgeSec, null);
});

test('buildHealthReport: marketOpen tracks the real calendar, so a weekend watchdog stays quiet', () => {
  assert.equal(buildHealthReport({ accounts: [], now: WED_NOON_UTC }).marketOpen, true);
  assert.equal(buildHealthReport({ accounts: [], now: SAT_NOON_UTC }).marketOpen, false);
});

test('buildHealthReport: candles are aggregated across several connected accounts', () => {
  const r = buildHealthReport({
    accounts: [
      account({}, { US100: { time: WED_NOON_UTC - 600_000 } }),
      account({}, { EURUSD: { time: WED_NOON_UTC - 45_000 } }),
    ],
    now: WED_NOON_UTC,
  });
  assert.equal(r.accountsConnected, 2);
  assert.equal(r.lastCandleAgeSec, 45);
});

// ---- the 4th signal: execution health ------------------------------------
// Regression cover for the 2026-09-16..18 incident, where levels 1-3 all read
// green while every strategy order came back with brokerOrderId=null.

const connectedWith = (liveDataSource) => ({ liveDataSource, lastCandleBySymbol: new Map() });

test('buildHealthReport: a healthy bot reports no rejection and no unconfirmed streak', () => {
  const r = buildHealthReport({ accounts: [connectedWith({})], now: WED_NOON_UTC });
  assert.equal(r.lastOrderRejectionAgeSec, null);
  assert.equal(r.lastOrderRejectionCode, null);
  assert.equal(r.unconfirmedOrderStreak, 0);
});

test('buildHealthReport: an explicit broker refusal surfaces with its age and reason', () => {
  const r = buildHealthReport({
    accounts: [connectedWith({ lastOrderRejection: { receivedAtMs: WED_NOON_UTC - 120_000, errorCode: 'NOT_ENOUGH_MONEY' } })],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastOrderRejectionAgeSec, 120);
  assert.equal(r.lastOrderRejectionCode, 'NOT_ENOUGH_MONEY');
});

test('buildHealthReport: a silent broker surfaces as an unconfirmed streak, with no rejection', () => {
  // The 2026-09-18 11:00 shape: order sent, nothing came back, no refusal either.
  const r = buildHealthReport({
    accounts: [connectedWith({ _consecutiveOrderConfirmationTimeouts: 1 })],
    now: WED_NOON_UTC,
  });
  assert.equal(r.unconfirmedOrderStreak, 1);
  assert.equal(r.lastOrderRejectionAgeSec, null);
});

test('buildHealthReport: reads nothing from a DISCONNECTED account', () => {
  const r = buildHealthReport({
    accounts: [{ liveDataSource: null, lastCandleBySymbol: new Map() }],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastOrderRejectionAgeSec, null);
  assert.equal(r.unconfirmedOrderStreak, 0);
});

test('buildHealthReport: tolerates a data source predating the rejection field', () => {
  // The sibling branch adding ProtoOAOrderErrorEvent is not merged yet, so in
  // production lastOrderRejection is simply absent. That must read as "no
  // rejection", never throw and never fabricate one.
  const r = buildHealthReport({ accounts: [connectedWith({ someOtherField: 1 })], now: WED_NOON_UTC });
  assert.equal(r.lastOrderRejectionAgeSec, null);
  assert.equal(r.unconfirmedOrderStreak, 0);
});

test('buildHealthReport: a malformed rejection is ignored rather than reported as age NaN', () => {
  const r = buildHealthReport({
    accounts: [connectedWith({ lastOrderRejection: { errorCode: 'X' } })], // no receivedAtMs
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastOrderRejectionAgeSec, null);
});

test('buildHealthReport: across accounts, the NEWEST rejection and the WORST streak win', () => {
  const r = buildHealthReport({
    accounts: [
      connectedWith({ lastOrderRejection: { receivedAtMs: WED_NOON_UTC - 3600_000, errorCode: 'OLD' }, _consecutiveOrderConfirmationTimeouts: 1 }),
      connectedWith({ lastOrderRejection: { receivedAtMs: WED_NOON_UTC - 60_000, errorCode: 'RECENT' }, _consecutiveOrderConfirmationTimeouts: 3 }),
    ],
    now: WED_NOON_UTC,
  });
  assert.equal(r.lastOrderRejectionCode, 'RECENT');
  assert.equal(r.lastOrderRejectionAgeSec, 60);
  assert.equal(r.unconfirmedOrderStreak, 3);
});
