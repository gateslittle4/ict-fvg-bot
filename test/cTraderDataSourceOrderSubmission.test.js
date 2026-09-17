import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';

// DELIBERATE exception to cTraderDataSource.test.js's own stated convention
// ("only the pure pieces are unit-tested here... everything else is network
// I/O against an unverified live API"). Added 2026-09-17 (Esdras: "comment
// vérifie-t-on que ça marche à 100%") specifically to lock in the fix for
// today's real incident: two real orders (Divergence/US500, Silver
// Bullet/US100) got sent to the broker and NEVER confirmed, on a connection
// that kept ticking prices fine - and the code at the time just assumed
// nothing had happened. That gap is exactly what a mocked WebSocket
// connection CAN reproduce deterministically and safely (no real order, no
// real money) - unlike the rest of this file, which genuinely needs a live
// broker round-trip to mean anything. This is the regression test that
// keeps that exact class of bug from silently coming back.
//
// The mock only implements the two calls _submitOrder/_findRealOrderOrPositionForLabel
// actually use: connection.sendCommand(name, data) (a promise) and
// connection.on(event, handler)/removeEventListener(uuid) (the raw
// ctrader-layer event API, NOT a standard EventEmitter - see
// _waitForOrderIdBySymbol's own comment on that distinction).
function createMockConnection({ sendCommand } = {}) {
  const listeners = new Map();
  let nextUuid = 1;
  return {
    sendCommand: sendCommand || (async () => ({})),
    on(eventName, handler) {
      const uuid = nextUuid++;
      listeners.set(uuid, { eventName, handler });
      return uuid;
    },
    removeEventListener(uuid) {
      listeners.delete(uuid);
    },
    // Test-only helper (not part of the real connection's API) - fires a
    // fake broker push to every listener registered for that event name.
    _emit(eventName, event) {
      for (const { eventName: en, handler } of listeners.values()) {
        if (en === eventName) handler(event);
      }
    },
  };
}

function makeDataSource(connection) {
  const ds = new CTraderDataSource({ account: {}, brokerConfig: {}, symbols: [] });
  ds.connection = connection;
  ds.accountId = 12345;
  return ds;
}

const SYMBOL_SPEC = { rawVolume: true }; // skips lotSize conversion - _submitOrder just uses `lots` as-is

test('_submitOrder: confirmation arrives via ProtoOAExecutionEvent -> resolves the real orderId, resets the failure counter', async () => {
  const connection = createMockConnection();
  const ds = makeDataSource(connection);
  ds._consecutiveOrderConfirmationTimeouts = 1; // pretend the PREVIOUS order also went unconfirmed

  const promise = ds._submitOrder({
    symbolId: 213,
    orderType: 'MARKET',
    tradeSide: 'BUY',
    lots: 1,
    symbolSpec: SYMBOL_SPEC,
    label: 'auto-silverbullet-US100',
  });
  // _waitForOrderIdBySymbol registers its listener synchronously before any
  // await in _submitOrder, so this is already armed by the time we get here.
  connection._emit('ProtoOAExecutionEvent', {
    descriptor: { order: { orderId: 50415794, tradeData: { symbolId: 213 } }, executionType: 'ORDER_ACCEPTED' },
  });

  const orderId = await promise;
  assert.equal(orderId, 50415794);
  assert.equal(ds._consecutiveOrderConfirmationTimeouts, 0, 'a real confirmation must reset the counter, not just leave it alone');
});

test('_submitOrder: no confirmation within timeout -> resolves null and increments the counter (does NOT exit on the first miss)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const exitMock = t.mock.method(process, 'exit', () => {});
  const connection = createMockConnection();
  const ds = makeDataSource(connection);

  const promise = ds._submitOrder({
    symbolId: 213,
    orderType: 'MARKET',
    tradeSide: 'BUY',
    lots: 1,
    symbolSpec: SYMBOL_SPEC,
    label: 'auto-silverbullet-US100',
  });
  // Let the mocked sendCommand's own promise resolve before advancing the
  // fake clock, so the only thing left pending is _waitForOrderIdBySymbol's
  // own 3000ms timer.
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);

  const orderId = await promise;
  assert.equal(orderId, null);
  assert.equal(ds._consecutiveOrderConfirmationTimeouts, 1);
  assert.equal(exitMock.mock.callCount(), 0, 'a single miss is a known one-off (2026-09-14) - must not restart the process');
});

test('_submitOrder: 2 CONSECUTIVE unconfirmed orders -> forces a process restart (the actual 2026-09-17 incident, reproduced)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const exitMock = t.mock.method(process, 'exit', () => {});
  const connection = createMockConnection();
  const ds = makeDataSource(connection);

  async function submitAndTimeOut() {
    const promise = ds._submitOrder({
      symbolId: 213,
      orderType: 'MARKET',
      tradeSide: 'BUY',
      lots: 1,
      symbolSpec: SYMBOL_SPEC,
      label: 'auto-silverbullet-US100',
    });
    await Promise.resolve();
    await Promise.resolve();
    t.mock.timers.tick(3000);
    return promise;
  }

  await submitAndTimeOut(); // 1st miss
  assert.equal(exitMock.mock.callCount(), 0);
  await submitAndTimeOut(); // 2nd consecutive miss
  assert.equal(ds._consecutiveOrderConfirmationTimeouts, 2);

  // process.exit itself is scheduled 2s later (see _submitOrder's own
  // comment: gives the caller's reconcile-verification query and its
  // notification time to finish first) - advance past that too.
  t.mock.timers.tick(2000);
  assert.equal(exitMock.mock.callCount(), 1, 'exactly 2 consecutive unconfirmed orders must force a restart');
  assert.deepEqual(exitMock.mock.calls[0].arguments, [1]);
});

test('_findRealOrderOrPositionForLabel: finds a real still-pending order by label + symbolId', async () => {
  const connection = createMockConnection({
    sendCommand: async () => ({
      order: [{ orderId: 999, tradeData: { label: 'auto-fvg-EURUSD', symbolId: 185, openTimestamp: String(1000000) } }],
      position: [],
    }),
  });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 185, label: 'auto-fvg-EURUSD', submittedAtMs: 1000500 });
  assert.deepEqual(result, { orderId: 999, positionId: null, matched: true });
});

test('_findRealOrderOrPositionForLabel: finds a real already-filled position (order already left the working list)', async () => {
  const connection = createMockConnection({
    sendCommand: async () => ({
      order: [],
      position: [{ positionId: 41661214, tradeData: { label: 'auto-fvg-EURUSD', symbolId: 185, openTimestamp: String(1000000) } }],
    }),
  });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 185, label: 'auto-fvg-EURUSD', submittedAtMs: 1000500 });
  assert.deepEqual(result, { orderId: null, positionId: 41661214, matched: true });
});

test('_findRealOrderOrPositionForLabel: an OLDER position with the same label (outside the slack window) is never adopted by mistake', async () => {
  const submittedAtMs = 2_000_000;
  const connection = createMockConnection({
    sendCommand: async () => ({
      order: [],
      // Same label/symbol, but opened well before (submittedAtMs - 5000) -
      // a stale position from an earlier signal on the same mechanism/symbol,
      // not the one THIS submission is asking about.
      position: [{ positionId: 41111111, tradeData: { label: 'auto-fvg-US100', symbolId: 213, openTimestamp: String(submittedAtMs - 60_000) } }],
    }),
  });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 213, label: 'auto-fvg-US100', submittedAtMs });
  assert.deepEqual(result, { orderId: null, positionId: null, matched: false });
});

test('_findRealOrderOrPositionForLabel: missing/unparseable openTimestamp keeps the match rather than discarding a real one', async () => {
  const connection = createMockConnection({
    sendCommand: async () => ({
      order: [{ orderId: 555, tradeData: { label: 'auto-fvg-US100', symbolId: 213 } }], // no openTimestamp at all
      position: [],
    }),
  });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 213, label: 'auto-fvg-US100', submittedAtMs: 2_000_000 });
  assert.deepEqual(result, { orderId: 555, positionId: null, matched: true });
});

test('_findRealOrderOrPositionForLabel: genuinely nothing at the broker -> matched:false, not a guess', async () => {
  const connection = createMockConnection({ sendCommand: async () => ({ order: [], position: [] }) });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 213, label: 'auto-fvg-US100', submittedAtMs: Date.now() });
  assert.deepEqual(result, { orderId: null, positionId: null, matched: false });
});

test('_findRealOrderOrPositionForLabel: a different symbolId with the same label is not a match (label alone is not enough)', async () => {
  const connection = createMockConnection({
    sendCommand: async () => ({
      order: [{ orderId: 777, tradeData: { label: 'auto-fvg-US100', symbolId: 999 } }], // wrong symbol
      position: [],
    }),
  });
  const ds = makeDataSource(connection);

  const result = await ds._findRealOrderOrPositionForLabel({ symbolId: 213, label: 'auto-fvg-US100', submittedAtMs: Date.now() });
  assert.deepEqual(result, { orderId: null, positionId: null, matched: false });
});
